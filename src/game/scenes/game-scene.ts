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

// ---------------------------------------------------------------------------
// Test map constants
// ---------------------------------------------------------------------------

/** World dimensions for the temporary test map (pixels). */
const MAP_WIDTH = 2000;
const MAP_HEIGHT = 2000;

/** Floor colour (slightly lighter than the camera background). */
const FLOOR_COLOUR = 0x2a2a3e;

/** Wall colour. */
const WALL_COLOUR = 0x555577;

// ---------------------------------------------------------------------------
// Wall layout — each entry is [x, y, width, height]
// ---------------------------------------------------------------------------

const WALLS: readonly [number, number, number, number][] = [
  // Outer boundary walls
  [MAP_WIDTH / 2, 10, MAP_WIDTH, 20], // top
  [MAP_WIDTH / 2, MAP_HEIGHT - 10, MAP_WIDTH, 20], // bottom
  [10, MAP_HEIGHT / 2, 20, MAP_HEIGHT], // left
  [MAP_WIDTH - 10, MAP_HEIGHT / 2, 20, MAP_HEIGHT], // right
  // Interior obstacles
  [600, 500, 200, 40],
  [1400, 500, 40, 200],
  [1000, 800, 300, 40],
  [500, 1200, 40, 300],
  [1500, 1300, 250, 40],
  [1000, 1600, 40, 250],
];

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

/**
 * Main gameplay scene. Hosts the fixed-timestep game loop that drives
 * all ECS systems at 60 Hz, independent of the browser's render rate.
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
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // --- Test floor ---
    this.add.rectangle(
      MAP_WIDTH / 2,
      MAP_HEIGHT / 2,
      MAP_WIDTH,
      MAP_HEIGHT,
      FLOOR_COLOUR,
    );

    // --- Disable Matter.js auto-stepping (we step manually in PhysicsSyncSystem) ---
    this.matter.world.autoUpdate = false;

    // --- Body registry ---
    const bodyRegistry = new BodyRegistry();

    // --- Build test map walls ---
    for (const [x, y, w, h] of WALLS) {
      const wallBody = this.matter.add.rectangle(x, y, w, h, {
        isStatic: true,
      });
      bodyRegistry.register(wallBody);
      // Visual indicator for the wall
      this.add.rectangle(x, y, w, h, WALL_COLOUR);
    }

    // --- Spawn player ---
    const playerBody = this.matter.add.rectangle(
      MAP_WIDTH / 2,
      MAP_HEIGHT / 2,
      24,
      24,
      {
        friction: 0,
        frictionAir: 0, // We handle deceleration in MovementSystem
        frictionStatic: 0,
        restitution: 0, // No bounce
      },
    );
    // Prevent rotation — set inertia after creation (not in MatterBodyConfig)
    playerBody.inertia = Infinity;
    playerBody.inverseInertia = 0;
    bodyRegistry.register(playerBody);
    createPlayerEntity(MAP_WIDTH / 2, MAP_HEIGHT / 2, playerBody.id);

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
}
