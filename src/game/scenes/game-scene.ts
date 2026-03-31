import Phaser from "phaser";
import { GameLoop, FIXED_DT } from "@/game/systems/game-loop";
import type { SystemFn } from "@/game/systems/system-runner";
import { createInputState, createClockState } from "@/game/systems/scene-context";
import type { SceneContext } from "@/game/systems/scene-context";
import { BodyRegistry } from "@/game/systems/body-registry";
import { createInputSystem } from "@/game/systems/input-system";
import { createMovementSystem } from "@/game/systems/movement-system";
import { createPhysicsSyncSystem } from "@/game/systems/physics-sync-system";
import { createRenderSyncSystem } from "@/game/systems/render-sync-system";
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
import { createNoiseSystem, NoiseMap } from "@/game/systems/noise-system";
import { ConstraintRegistry } from "@/game/systems/constraint-registry";
import { WallAnchorRegistry } from "@/game/systems/wall-anchor-registry";
import { createPlayerEntity, createObjectEntity } from "@/game/ecs/archetypes";
import { resetWorld } from "@/game/ecs/world";
import { createGameEventBus, safeEmit } from "@/game/events/event-bus";
import { setActiveBus, setActiveSeed, setActiveMinimapInit } from "@/game/PhaserGame";
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
  private renderSystems: SystemFn[] = [];
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
    playerBody.inertia = Infinity;
    playerBody.inverseInertia = 0;
    bodyRegistry.register(playerBody);
    createPlayerEntity(px, py, playerBody.id);

    // --- Registries for barricade, material, and noise systems ---
    const constraintRegistry = new ConstraintRegistry();
    const wallAnchorRegistry = new WallAnchorRegistry();
    const materialRegistry = new MaterialRegistry();
    const noiseMap = new NoiseMap();

    // --- Scene context (shared by all system factories) ---
    const ctx: SceneContext = {
      scene: this,
      bodyRegistry,
      inputState: createInputState(),
      getAlpha: () => this.gameLoop.alpha,
      clockState: createClockState(),
      eventBus: createGameEventBus(),
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
    ];

    this.gameLoop = new GameLoop(systems);

    // --- Render-phase systems (once per frame, after fixed ticks) ---
    this.renderSystems = [
      createRenderSyncSystem(ctx),
      createLightingSystem(ctx),
    ];

    // --- Handle settings changes from the UI ---
    ctx.eventBus.on("cmd:settings-changed", (e) => {
      if (e.key === "masterVolume" && typeof e.value === "number") {
        this.sound.volume = e.value;
      }
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
        // Run command system each frame so resume commands are processed
        this.commandSystem(FIXED_DT);

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
      for (let i = 0; i < this.renderSystems.length; i++) {
        this.renderSystems[i](delta / 1000);
      }
    } catch (err) {
      this.crashed = true;
      console.error("[GameScene] Game loop crashed:", err);
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

    // Camera bounds match map dimensions.
    const mapWidth = widthTiles * TILE_SIZE;
    const mapHeight = heightTiles * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
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
        body.inertia = Infinity;
        body.inverseInertia = 0;
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
