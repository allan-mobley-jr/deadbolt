import Phaser from "phaser";
import { GameLoop } from "@/game/systems/game-loop";
import type { SystemFn } from "@/game/systems/system-runner";
import { createInputState } from "@/game/systems/scene-context";
import type { SceneContext } from "@/game/systems/scene-context";
import { BodyRegistry } from "@/game/systems/body-registry";
import { createInputSystem } from "@/game/systems/input-system";
import { createMovementSystem } from "@/game/systems/movement-system";
import { createPhysicsSyncSystem } from "@/game/systems/physics-sync-system";
import { createRenderSyncSystem } from "@/game/systems/render-sync-system";
import { createPlayerEntity } from "@/game/ecs/archetypes";
import { resetWorld } from "@/game/ecs/world";
import {
  createTestMap,
  TEST_MAP_WIDTH,
  TEST_MAP_HEIGHT,
  PLAYER_SPAWN,
} from "@/game/tiles/test-map";
import { TILE_SIZE, TileType, TILE_PROPERTIES } from "@/game/tiles/tile-types";
import { TILESET_KEY } from "@/game/tiles/tileset-generator";

/**
 * Main gameplay scene. Builds the tilemap from test data, spawns the player,
 * and hosts the fixed-timestep game loop that drives all ECS systems at 60 Hz,
 * independent of the browser's render rate.
 */
export default class GameScene extends Phaser.Scene {
  private gameLoop!: GameLoop;
  private renderSystems: SystemFn[] = [];
  private fpsText!: Phaser.GameObjects.Text;
  private showDebug = false;
  private crashed = false;

  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    // --- Allow recovery if a prior cycle crashed (e.g. update before create) ---
    this.crashed = false;

    // --- Reset ECS world from any prior run ---
    resetWorld();

    // --- Camera / background ---
    this.cameras.main.setBackgroundColor("#1a1a2e");

    // --- Build tilemap ---
    this.buildTilemap();

    // --- Disable Matter.js auto-stepping (we step manually in PhysicsSyncSystem) ---
    this.matter.world.autoUpdate = false;

    // --- Body registry ---
    const bodyRegistry = new BodyRegistry();

    // --- Spawn player from tilemap spawn point ---
    const px = PLAYER_SPAWN.x * TILE_SIZE + TILE_SIZE / 2;
    const py = PLAYER_SPAWN.y * TILE_SIZE + TILE_SIZE / 2;

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

    // --- Scene context (shared by all system factories) ---
    const ctx: SceneContext = {
      scene: this,
      bodyRegistry,
      inputState: createInputState(),
      getAlpha: () => this.gameLoop.alpha,
    };

    // --- Assemble fixed-tick systems (60 Hz) ---
    const systems: SystemFn[] = [
      createInputSystem(ctx),
      createMovementSystem(ctx),
      createPhysicsSyncSystem(ctx),
    ];

    this.gameLoop = new GameLoop(systems);

    // --- Render-phase systems (once per frame, after fixed ticks) ---
    this.renderSystems = [createRenderSyncSystem(ctx)];

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
    if (this.crashed) return;

    try {
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

  // -----------------------------------------------------------------------
  // Tilemap construction
  // -----------------------------------------------------------------------

  private buildTilemap(): void {
    const tileData = createTestMap();

    // Create tilemap from the 2D data array.
    const map = this.make.tilemap({
      data: tileData,
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

    // Camera bounds match map dimensions.
    const mapWidth = TEST_MAP_WIDTH * TILE_SIZE;
    const mapHeight = TEST_MAP_HEIGHT * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
  }
}
