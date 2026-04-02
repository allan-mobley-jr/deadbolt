import Phaser from "phaser";
import { GameLoop, FIXED_DT, MAX_STEPS_PER_FRAME } from "@/game/systems/game-loop";
import { SystemRunner, type SystemFn } from "@/game/systems/system-runner";
import { createInputState, createClockState } from "@/game/systems/scene-context";
import type { SceneContext } from "@/game/systems/scene-context";
import { BodyRegistry } from "@/game/systems/body-registry";
import { createInputSystem } from "@/game/systems/input-system";
import { createMovementSystem } from "@/game/systems/movement-system";
import { createPhysicsSyncSystem } from "@/game/systems/physics-sync-system";
import { createRenderSyncSystem } from "@/game/systems/render-sync-system";
import { getSpriteRegistry } from "@/game/rendering/sprite-registry";
import { createDayNightSystem } from "@/game/systems/day-night-system";
import { createLightingSystem } from "@/game/systems/lighting-system";
import { createCommandSystem } from "@/game/systems/command-system";
import { createInteractionSystem } from "@/game/systems/interaction-system";
import { createInventorySystem } from "@/game/systems/inventory-system";
import { createBarricadeSystem } from "@/game/systems/barricade-system";
import { createZombieAISystem, resetZombieKills } from "@/game/systems/zombie-ai-system";
import { createCombatSystem } from "@/game/systems/combat-system";
import { createWaveSystem } from "@/game/systems/wave-system";
import { createStatsSystem, resetRunStats } from "@/game/systems/stats-system";
import { createMaterialSystem, MaterialRegistry } from "@/game/systems/material-system";
import { createFireSystem } from "@/game/systems/fire-system";
import { createElectricitySystem } from "@/game/systems/electricity-system";
import { createExplosionSystem } from "@/game/systems/explosion-system";
import { createMinimapDataSystem } from "@/game/systems/minimap-data-system";
import { createAudioSystem } from "@/game/systems/audio-system";
import { createCameraSystem } from "@/game/systems/camera-system";
import { createParticleSystem } from "@/game/systems/particle-system";
import { createNoiseSystem, NoiseMap } from "@/game/systems/noise-system";
import { ConstraintRegistry } from "@/game/systems/constraint-registry";
import { WallAnchorRegistry } from "@/game/systems/wall-anchor-registry";
import { createPlayerEntity, createObjectEntity } from "@/game/ecs/archetypes";
import { resetWorld } from "@/game/ecs/world";
import { PoolManager, setPoolManager } from "@/game/ecs/pool-manager";
import { createZombiePool } from "@/game/ecs/zombie-pool";
import { SensorBodyPool } from "@/game/ecs/sensor-pool";
import { COMBAT } from "@/game/systems/combat-constants";
import { createGameEventBus, safeEmit } from "@/game/events/event-bus";
import { setActiveBus, setActiveSeed, setActiveMinimapInit } from "@/game/PhaserGame";
import { setBodyInertia } from "@/game/physics/matter-body";
import { RNG } from "@/lib/rng";
import { TILE_SIZE, TileType, TILE_PROPERTIES } from "@/game/tiles/tile-types";
import { TILESET_KEY } from "@/game/tiles/tileset-generator";
import { getObjectDef } from "@/game/procgen/object-defs";
import type { WorldData } from "@/types/world";

/**
 * Main gameplay scene. Builds the tilemap from procedurally generated world
 * data, spawns the player at the safehouse, and hosts the fixed-timestep
 * game loop that drives all ECS systems at 60 Hz, independent of the
 * browser's render rate.
 */
export default class GameScene extends Phaser.Scene {
  private gameLoop!: GameLoop;
  private commandSystem!: SystemFn;
  private renderRunner!: SystemRunner;
  private fpsText!: Phaser.GameObjects.Text;
  private showDebug = false;
  private crashed = false;
  private frozen = false;
  private wasPaused = false;
  private worldData: WorldData | null = null;
  private tileMap: Phaser.Tilemaps.Tilemap | null = null;
  private _clockState: import("@/game/systems/scene-context").ClockState | null = null;

  constructor() {
    super({ key: "GameScene" });
  }

  /**
   * Receive world data from LoadingScene.
   * Phaser calls init(data) before create() when scene.start passes data.
   */
  init(data: WorldData): void {
    this.worldData = data;
  }

  create(): void {
    if (!this.worldData) {
      throw new Error(
        "[GameScene] No world data received. " +
          "GameScene must be started from LoadingScene with WorldData.",
      );
    }

    // --- Allow recovery if a prior cycle crashed (e.g. update before create) ---
    this.crashed = false;
    this.frozen = false;

    // --- Reset ECS world and session counters from any prior run ---
    resetWorld();
    resetZombieKills();
    resetRunStats();

    // --- Camera / background ---
    this.cameras.main.setBackgroundColor("#1a1a2e");

    // --- Build tilemap from generated world ---
    this.buildTilemap();

    // --- Disable Matter.js auto-stepping (we step manually in PhysicsSyncSystem) ---
    this.matter.world.autoUpdate = false;

    // --- Body registry ---
    const bodyRegistry = new BodyRegistry();

    // --- Spawn player at the safehouse center ---
    const spawnTile = this.worldData.safehouse.minimapPosition;
    const px = spawnTile.x * TILE_SIZE + TILE_SIZE / 2;
    const py = spawnTile.y * TILE_SIZE + TILE_SIZE / 2;

    const playerBody = this.matter.add.rectangle(px, py, 24, 24, {
      friction: 0,
      frictionAir: 0,
      frictionStatic: 0,
      restitution: 0,
    });
    // Prevent rotation — set inertia after creation (not in MatterBodyConfig)
    setBodyInertia(playerBody, Infinity);
    bodyRegistry.register(playerBody);
    createPlayerEntity(px, py, playerBody.id);

    // --- Registries for barricade, material, and noise systems ---
    const constraintRegistry = new ConstraintRegistry();
    const wallAnchorRegistry = new WallAnchorRegistry();
    const materialRegistry = new MaterialRegistry();
    const noiseMap = new NoiseMap();

    // --- Entity pools (pre-warm for zero allocation during gameplay) ---
    const poolManager = new PoolManager();
    setPoolManager(poolManager);

    const zombiePool = createZombiePool({
      matterAdd: this.matter.add,
      bodyRegistry,
    });
    poolManager.register("zombie", zombiePool);

    const sensorPool = new SensorBodyPool(
      this.matter.add,
      bodyRegistry,
      COMBAT.SWING_SENSOR_WIDTH,
      COMBAT.SWING_SENSOR_HEIGHT,
      5,
    );

    // --- Seeded PRNG for deterministic randomness in game systems ---
    const rng = new RNG(this.worldData.config.seed);

    // --- Scene context (shared by all system factories) ---
    const ctx: SceneContext = {
      scene: this,
      bodyRegistry,
      inputState: createInputState(),
      getAlpha: () => this.gameLoop.alpha,
      clockState: createClockState(),
      eventBus: createGameEventBus(),
      rng,
      constraintRegistry,
      wallAnchorRegistry,
      materialRegistry,
      noiseMap,
      tileGrid: this.worldData.layout.tiles,
      tilemap: this.tileMap!,
      pathfindingGrid: this.worldData.pathfinding,
      entryPoints: this.worldData.safehouse.entryPointsToDefend,
      safehouseCenter: this.worldData.safehouse.minimapPosition,
      spawnZones: this.worldData.spawnZones,
      zombiePool,
      sensorPool,
      poolManager,
    };

    // Store clock state reference for pause checking in update()
    this._clockState = ctx.clockState;

    // Publish the bus so the React bridge can connect to it.
    setActiveBus(ctx.eventBus);

    // --- Freeze game loop on player death (permadeath) ---
    ctx.eventBus.on("player-died", () => {
      this.frozen = true;
    });

    // --- Store seed for UI access (pull-based, avoids bridge timing race) ---
    setActiveSeed(this.worldData!.config.seed);

    // --- Also emit run-started for any listeners already connected ---
    safeEmit(ctx.eventBus, "run-started", {
      seed: this.worldData!.config.seed,
    });

    // --- Store minimap init data for pull-based access (avoids bridge timing race) ---
    const { widthTiles, heightTiles } = this.worldData!.layout;
    const minimapInitData = {
      mapWidth: widthTiles * TILE_SIZE,
      mapHeight: heightTiles * TILE_SIZE,
      safehouseCenter: {
        x: spawnTile.x * TILE_SIZE + TILE_SIZE / 2,
        y: spawnTile.y * TILE_SIZE + TILE_SIZE / 2,
      },
    };
    setActiveMinimapInit(minimapInitData);

    // Also emit for any listeners already connected
    safeEmit(ctx.eventBus, "minimap-init", minimapInitData);

    // Clear singletons on scene shutdown (restart or stop) so stale
    // references don't persist if GameScene re-enters create().
    this.events.once("shutdown", () => {
      setActiveBus(null);
      setActiveSeed(null);
      setActiveMinimapInit(null);
    });

    // --- Spawn world objects from procedural generation data ---
    this.spawnWorldObjects(bodyRegistry);

    // --- Create wall anchor bodies at entry point frame edges ---
    wallAnchorRegistry.createAnchors(
      this.worldData.safehouse.entryPointsToDefend,
      this.matter.add,
      bodyRegistry,
    );

    // --- Command system runs even when paused (to process resume commands) ---
    this.commandSystem = createCommandSystem(ctx);

    // --- Assemble fixed-tick gameplay systems (60 Hz, skipped when paused) ---
    const systems: SystemFn[] = [
      this.commandSystem,
      createInputSystem(ctx),
      createInventorySystem(ctx),
      createInteractionSystem(ctx),
      createBarricadeSystem(ctx),
      createDayNightSystem(ctx),
      createWaveSystem(ctx),
      createMovementSystem(ctx),
      createNoiseSystem(ctx),
      createZombieAISystem(ctx),
      createCombatSystem(ctx),
      createStatsSystem(ctx),
      createPhysicsSyncSystem(ctx),
      createMaterialSystem(ctx),
      createFireSystem(ctx),
      createExplosionSystem(ctx),
      createElectricitySystem(ctx),
      createMinimapDataSystem(ctx),
      createAudioSystem(ctx),
    ];

    const systemNames = [
      "CommandSystem", "InputSystem", "InventorySystem", "InteractionSystem",
      "BarricadeSystem", "DayNightSystem", "WaveSystem", "MovementSystem",
      "NoiseSystem", "ZombieAISystem", "CombatSystem", "StatsSystem",
      "PhysicsSyncSystem", "MaterialSystem", "FireSystem", "ExplosionSystem",
      "ElectricitySystem", "MinimapDataSystem", "AudioSystem",
    ];

    const errorBudget = 5;

    this.gameLoop = new GameLoop(systems, FIXED_DT, MAX_STEPS_PER_FRAME, {
      names: systemNames,
      errorBudget,
      onError: (index, name, error, errorCount) => {
        safeEmit(ctx.eventBus, "system-error", {
          systemIndex: index,
          systemName: name,
          error,
          errorCount,
          errorBudget,
        });
      },
      onDisabled: (index, name) => {
        safeEmit(ctx.eventBus, "system-disabled", {
          systemIndex: index,
          systemName: name,
          errorCount: errorBudget,
        });
      },
    });

    // --- Render-phase systems (once per frame, after fixed ticks) ---
    // Camera system runs first so downstream render systems read the final
    // camera position (e.g., LightingSystem reads cam.scrollX/scrollY).
    const renderSystems: SystemFn[] = [
      createCameraSystem(ctx),
      createRenderSyncSystem(ctx, getSpriteRegistry()),
      createParticleSystem(ctx),
      createLightingSystem(ctx),
    ];

    const renderNames = [
      "CameraSystem", "RenderSyncSystem", "ParticleSystem", "LightingSystem",
    ];

    this.renderRunner = new SystemRunner(renderSystems, {
      names: renderNames,
      errorBudget,
      onError: (index, name, error, errorCount) => {
        safeEmit(ctx.eventBus, "system-error", {
          systemIndex: index,
          systemName: name,
          error,
          errorCount,
          errorBudget,
        });
      },
      onDisabled: (index, name) => {
        safeEmit(ctx.eventBus, "system-disabled", {
          systemIndex: index,
          systemName: name,
          errorCount: errorBudget,
        });
      },
    });

    // --- Handle settings changes from the UI ---
    // Volume settings are handled by the audio system (createAudioSystem).
    ctx.eventBus.on("cmd:settings-changed", (e) => {
      if (e.key === "showFps" && typeof e.value === "boolean") {
        this.showDebug = e.value;
        this.fpsText?.setVisible(e.value);
      }
    });

    // --- Debug FPS overlay (F3 to toggle) ---
    this.fpsText = this.add
      .text(4, 4, "", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#00000088",
        padding: { x: 4, y: 2 },
      })
      .setScrollFactor(0)
      .setDepth(Number.MAX_SAFE_INTEGER)
      .setVisible(false);

    if (this.input.keyboard) {
      this.input.keyboard.on("keydown-F3", () => {
        this.showDebug = !this.showDebug;
        this.fpsText.setVisible(this.showDebug);
      });
    }
  }

  update(_time: number, delta: number): void {
    if (this.crashed || this.frozen) return;

    try {
      // When paused, only run the command system (to process resume commands)
      // and skip the full game loop (physics, AI, timers all stop).
      if (this.isClockPaused()) {
        // Run command system each frame so resume commands are processed.
        // Wrapped in try-catch so a command error cannot freeze the game
        // and prevent the player from ever resuming.
        try {
          this.commandSystem(FIXED_DT);
        } catch (err) {
          console.error("[GameScene] CommandSystem threw while paused:", err);
        }

        // Track pause state to reset accumulator on resume
        this.wasPaused = true;
        return;
      }

      // If resuming from pause, reset the accumulator to avoid catch-up ticks
      if (this.wasPaused) {
        this.gameLoop.resetAccumulator();
        this.wasPaused = false;
      }

      // Phaser provides delta in milliseconds; GameLoop expects seconds.
      this.gameLoop.tick(delta / 1000);

      // Render-phase systems run once per frame after all fixed ticks.
      // Error-isolated via SystemRunner — a particle crash cannot end the game.
      this.renderRunner.run(delta / 1000);
    } catch (err) {
      this.crashed = true;
      console.error("[GameScene] Game loop crashed:", err);
      const wrapped = err instanceof Error
        ? new Error(`Game loop crashed: ${err.message}`, { cause: err })
        : new Error(`Game loop crashed: ${String(err)}`);
      this.game.events.emit("game-crash", wrapped);
      return;
    }

    if (this.showDebug) {
      const { fps, physicsTicks, alpha } = this.gameLoop.stats;
      this.fpsText.setText(
        `FPS: ${Math.round(fps)}\nPhysics: ${physicsTicks} ticks\nAlpha: ${alpha.toFixed(3)}`,
      );
    }
  }

  /** Check if the game clock is paused (set by command system). */
  private isClockPaused(): boolean {
    // If clockState is null, create() hasn't finished — treat as paused
    // to prevent running gameplay systems without a valid context.
    return this._clockState?.paused ?? true;
  }

  // -----------------------------------------------------------------------
  // Tilemap construction
  // -----------------------------------------------------------------------

  private buildTilemap(): void {
    const { widthTiles, heightTiles, tiles } = this.worldData!.layout;

    // Create tilemap from the generated 2D tile grid and store reference
    // for runtime tile mutations (explosion wall destruction).
    const map = this.make.tilemap({
      data: tiles,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });

    // Add the programmatic tileset. firstgid=1 means data value 1 → frame 0.
    const tileset = map.addTilesetImage(
      TILESET_KEY,
      TILESET_KEY,
      TILE_SIZE,
      TILE_SIZE,
      0,
      0,
    );

    if (!tileset) {
      throw new Error("Failed to add tileset image");
    }

    const layer = map.createLayer(0, tileset, 0, 0);
    if (!layer) {
      throw new Error("Failed to create tilemap layer");
    }

    // Mark colliding tile types.
    const collidingIndices = Object.values(TileType).filter(
      (v): v is TileType =>
        typeof v === "number" && TILE_PROPERTIES[v as TileType].collides,
    );

    map.setCollision(collidingIndices);

    // Convert colliding tiles to Matter.js static bodies.
    this.matter.world.convertTilemapLayer(layer);

    // Store tilemap reference for runtime tile mutations.
    this.tileMap = map;

    // Per-tile brightness variation for visual richness (seeded, deterministic).
    // Uses a separate RNG derived from the seed to avoid perturbing the main
    // RNG sequence. Brightness ±5% applied via Phaser's Tile.tint.
    const tintRng = new RNG(this.worldData!.config.seed + "-tile-tint");
    this.applyTileTints(layer, widthTiles, heightTiles, tintRng);
    this.applyBuildingTints(layer);

    // Camera bounds match map dimensions.
    const mapWidth = widthTiles * TILE_SIZE;
    const mapHeight = heightTiles * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
  }

  /**
   * Apply subtle per-tile brightness variation so adjacent tiles of the
   * same type don't look identical. Range: 90-100% brightness (tint can
   * only darken, not brighten).
   */
  private applyTileTints(
    layer: Phaser.Tilemaps.TilemapLayer,
    width: number,
    height: number,
    rng: RNG,
  ): void {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = layer.getTileAt(x, y);
        if (!tile || tile.index <= 0) continue;

        // 90-100% brightness (tint is multiplicative, can only darken)
        const factor = 0.90 + rng.float() * 0.10;
        const channel = Math.round(factor * 255);
        tile.tint = (channel << 16) | (channel << 8) | channel;
      }
    }
  }

  /** Tint multipliers per building class for visual differentiation. */
  private static readonly BUILDING_CLASS_TINTS: Readonly<Record<string, number>> = {
    residential: 0xfff0e0, // warm amber shift
    commercial: 0xe8f0ff,  // cool blue shift
    industrial: 0xe8e8e8,  // desaturated gray
  };

  /**
   * Apply building-class-based tint shifts to interior floor/door tiles
   * so residential, commercial, and industrial structures are visually
   * distinguishable.
   */
  private applyBuildingTints(
    layer: Phaser.Tilemaps.TilemapLayer,
  ): void {
    const buildings = this.worldData!.layout.buildings;
    const buildingClasses = this.worldData!.buildingClasses;

    for (const building of buildings) {
      const cls = buildingClasses.get(building.id);
      if (!cls) continue;

      const overlay = GameScene.BUILDING_CLASS_TINTS[cls];
      if (!overlay) continue;

      // Tint interior tiles (skip 1px wall border)
      for (let dy = 1; dy < building.height - 1; dy++) {
        for (let dx = 1; dx < building.width - 1; dx++) {
          const tx = building.origin.x + dx;
          const ty = building.origin.y + dy;
          const tile = layer.getTileAt(tx, ty);
          if (!tile || tile.index <= 0) continue;

          // Only tint walkable interior tiles (floors and doors)
          if (tile.index !== TileType.Floor && tile.index !== TileType.Door) continue;

          // Blend building class tint with existing per-tile tint
          tile.tint = GameScene.blendTints(tile.tint, overlay);
        }
      }
    }
  }

  /** Multiply two tint values channel-by-channel. */
  private static blendTints(existing: number, overlay: number): number {
    const er = (existing >> 16) & 0xff;
    const eg = (existing >> 8) & 0xff;
    const eb = existing & 0xff;
    const or_ = (overlay >> 16) & 0xff;
    const og = (overlay >> 8) & 0xff;
    const ob = overlay & 0xff;
    const r = Math.round((er * or_) / 255);
    const g = Math.round((eg * og) / 255);
    const b = Math.round((eb * ob) / 255);
    return (r << 16) | (g << 8) | b;
  }

  // -----------------------------------------------------------------------
  // Object spawning
  // -----------------------------------------------------------------------

  /**
   * Convert PlacedObjects from all buildings into ECS entities with
   * Matter.js physics bodies. Each object gets components based on
   * its ObjectDefinition.
   */
  private spawnWorldObjects(bodyRegistry: BodyRegistry): void {
    const buildings = this.worldData!.layout.buildings;

    for (const building of buildings) {
      for (const placed of building.objects) {
        const def = getObjectDef(placed.objectType);
        if (!def) {
          console.warn(
            `[GameScene] Unknown object type "${placed.objectType}" at tile (${placed.position.x}, ${placed.position.y}) — skipping`,
          );
          continue;
        }

        // Convert tile coords to pixel center
        const px = placed.position.x * TILE_SIZE + TILE_SIZE / 2;
        const py = placed.position.y * TILE_SIZE + TILE_SIZE / 2;

        // Create physics body sized by immovability.
        // Immovable objects use dynamic bodies with high mass and friction
        // so push/drag forces actually move them (isStatic ignores forces).
        const bodySize = def.immovable ? 32 : 16;
        const body = this.matter.add.rectangle(px, py, bodySize, bodySize, {
          isStatic: false,
          friction: def.immovable ? 0.95 : 0.8,
          frictionAir: def.immovable ? 0.3 : 0.1,
          restitution: 0.2,
          mass: def.immovable ? def.physics.mass * 10 : def.physics.mass,
        });
        setBodyInertia(body, Infinity);
        bodyRegistry.register(body);

        createObjectEntity(
          px,
          py,
          body.id,
          def.type,
          def.category,
          def.immovable,
          def.physics,
          def.lootValue,
        );
      }
    }
  }
}
