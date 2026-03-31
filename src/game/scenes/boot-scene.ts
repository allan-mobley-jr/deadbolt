import Phaser from "phaser";
import { generateTileset } from "@/game/tiles/tileset-generator";
import { TILE_SIZE } from "@/game/tiles/tile-types";
import { ALL_SOUND_KEYS } from "@/game/systems/audio-constants";

/** Texture key for the player sprite. */
export const PLAYER_TEXTURE_KEY = "player";

/** Player sprite size in pixels (slightly smaller than a tile). */
export const PLAYER_SIZE = 24;

/**
 * First scene in the lifecycle. Generates programmatic tileset and player
 * textures at runtime so no external image files are required, then
 * transitions to GameScene.
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  create(): void {
    try {
      // Generate the tileset strip texture.
      generateTileset(this);

      // Generate the player texture (a coloured square).
      this.createPlayerTexture();

      // Generate placeholder silent audio assets.
      this.generatePlaceholderAudio();

      // All assets ready — proceed to loading / world generation.
      this.scene.start("LoadingScene");
    } catch (err) {
      console.error("[BootScene] Failed to generate assets:", err);
      this.game.events.emit("boot-error", err);
    }
  }

  /**
   * Generate silent placeholder AudioBuffers for every sound key.
   *
   * This lets the full audio pipeline run end-to-end without real sound
   * files. Actual sound design assets will replace these placeholders.
   * Only works with WebAudioSoundManager (has a `context` property).
   */
  private generatePlaceholderAudio(): void {
    const sm = this.sound;
    // Only WebAudioSoundManager has a `context` property
    if (!sm || !("context" in sm)) return;

    const webSm = sm as Phaser.Sound.WebAudioSoundManager;
    const audioCtx = webSm.context;
    if (!audioCtx) return;

    for (const key of ALL_SOUND_KEYS) {
      // Skip if already loaded (e.g., real assets were loaded first)
      if (this.cache.audio.exists(key)) continue;

      // Create a short silent AudioBuffer (0.1s mono at 22050 Hz)
      const buffer = audioCtx.createBuffer(1, 2205, 22050);
      this.cache.audio.add(key, buffer);
    }
  }

  private createPlayerTexture(): void {
    const canvas = this.textures.createCanvas(
      PLAYER_TEXTURE_KEY,
      TILE_SIZE,
      TILE_SIZE,
    );

    if (!canvas) {
      throw new Error("Failed to create player canvas texture");
    }

    const ctx = canvas.getContext();

    // Draw a centred coloured square with a slight border gap.
    const offset = (TILE_SIZE - PLAYER_SIZE) / 2;
    ctx.fillStyle = "#3366ff";
    ctx.fillRect(offset, offset, PLAYER_SIZE, PLAYER_SIZE);

    canvas.refresh();
  }
}
