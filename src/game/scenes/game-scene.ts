import Phaser from "phaser";
import { GameLoop } from "@/game/systems/game-loop";
import type { SystemFn } from "@/game/systems/system-runner";

/**
 * Main gameplay scene. Hosts the fixed-timestep game loop that drives
 * all ECS systems at 60 Hz, independent of the browser's render rate.
 */
export default class GameScene extends Phaser.Scene {
  private gameLoop!: GameLoop;
  private fpsText!: Phaser.GameObjects.Text;
  private showDebug = false;

  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#1a1a2e");

    this.add
      .text(this.scale.width / 2, this.scale.height / 2, "Deadbolt", {
        fontFamily: "monospace",
        fontSize: "24px",
        color: "#4ade80",
      })
      .setOrigin(0.5);

    // --- Assemble ECS systems ---
    // Systems execute in this order every fixed tick. The array is
    // empty now; later issues will add: input, movement, AI,
    // physics sync, combat, cleanup, event emit.
    const systems: SystemFn[] = [];

    this.gameLoop = new GameLoop(systems);

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

    this.input.keyboard!.on("keydown-F3", () => {
      this.showDebug = !this.showDebug;
      this.fpsText.setVisible(this.showDebug);
    });
  }

  update(_time: number, delta: number): void {
    // Phaser provides delta in milliseconds; GameLoop expects seconds.
    this.gameLoop.tick(delta / 1000);

    if (this.showDebug) {
      const { fps, physicsTicks, alpha } = this.gameLoop.stats;
      this.fpsText.setText(
        `FPS: ${Math.round(fps)}\nPhysics: ${physicsTicks} ticks\nAlpha: ${alpha.toFixed(3)}`,
      );
    }
  }
}
