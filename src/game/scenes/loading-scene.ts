import Phaser from "phaser";
import { generateSeed } from "@/lib/rng";
import { RUN_DEFAULTS } from "@/types/run";
import { consumeNextRunSeed } from "@/lib/next-run-seed";
import type { WorldData, GenerationProgress } from "@/types/world";
import { generateWorld } from "@/game/procgen/world-generator";

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

/** Background colour (matches the game's dark aesthetic). */
const BG_COLOR = "#0a0a0a";

/** Progress bar dimensions. */
const BAR_WIDTH = 400;
const BAR_HEIGHT = 8;
const BAR_BG_COLOR = 0x333333;
const BAR_FILL_COLOR = 0x3366ff;

/** Text styling. */
const STATUS_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "monospace",
  fontSize: "18px",
  color: "#ffffff",
  align: "center",
};

const SEED_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "monospace",
  fontSize: "14px",
  color: "#666666",
  align: "center",
};

const TITLE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "monospace",
  fontSize: "32px",
  color: "#ffffff",
  align: "center",
  fontStyle: "bold",
};

/**
 * Loading scene — orchestrates world generation and displays progress.
 *
 * Sits between BootScene (asset generation) and GameScene (gameplay).
 * Drives a generator function one step per frame to keep the browser
 * responsive, updating progress text and a minimal progress bar.
 */
export default class LoadingScene extends Phaser.Scene {
  private generator: Generator<GenerationProgress, WorldData, void> | null =
    null;
  private statusText!: Phaser.GameObjects.Text;
  private barGraphics!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: "LoadingScene" });
  }

  create(): void {
    try {
      const { width, height } = this.scale;
      const centerX = width / 2;
      const centerY = height / 2;

      // --- Background ---
      this.cameras.main.setBackgroundColor(BG_COLOR);

      // --- Title ---
      this.add
        .text(centerX, centerY - 80, "DEADBOLT", TITLE_STYLE)
        .setOrigin(0.5);

      // --- Status message ---
      this.statusText = this.add
        .text(centerX, centerY, "Initializing...", STATUS_STYLE)
        .setOrigin(0.5);

      // --- Progress bar ---
      this.barGraphics = this.add.graphics();
      this.drawProgressBar(0);

      // --- Seed (use injected seed from "Try Same Seed", or generate new) ---
      const seed = consumeNextRunSeed() ?? generateSeed();
      this.add
        .text(centerX, centerY + 80, `Seed: ${seed}`, SEED_STYLE)
        .setOrigin(0.5);

      // --- Start generation ---
      this.generator = generateWorld({ ...RUN_DEFAULTS, seed });
    } catch (err) {
      console.error("[LoadingScene] Failed to initialise:", err);
      this.game.events.emit("generation-error", err);
    }
  }

  update(): void {
    if (!this.generator) return;

    try {
      const result = this.generator.next();

      if (!result.done) {
        // Update UI with progress
        const progress = result.value;
        this.statusText.setText(progress.message);
        this.drawProgressBar(progress.progress);
      } else {
        // Generation complete — transition to GameScene with world data
        const worldData = result.value;
        this.generator = null;
        this.drawProgressBar(1);
        this.scene.start("GameScene", worldData);
      }
    } catch (err) {
      this.generator = null;
      console.error("[LoadingScene] World generation failed:", err);
      this.statusText.setText("Generation failed. Refresh to retry.");
      this.drawProgressBar(0);
      this.game.events.emit("generation-error", err);
    }
  }

  // -------------------------------------------------------------------------
  // Progress bar rendering
  // -------------------------------------------------------------------------

  private drawProgressBar(fraction: number): void {
    const { width, height } = this.scale;
    const barX = width / 2 - BAR_WIDTH / 2;
    const barY = height / 2 + 40;

    this.barGraphics.clear();

    // Background track
    this.barGraphics.fillStyle(BAR_BG_COLOR);
    this.barGraphics.fillRect(barX, barY, BAR_WIDTH, BAR_HEIGHT);

    // Fill
    if (fraction > 0) {
      this.barGraphics.fillStyle(BAR_FILL_COLOR);
      this.barGraphics.fillRect(
        barX,
        barY,
        BAR_WIDTH * Math.min(1, fraction),
        BAR_HEIGHT,
      );
    }
  }
}
