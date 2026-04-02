import Phaser from "phaser";
import { generateTileset } from "@/game/tiles/tileset-generator";
import { TILE_SIZE } from "@/game/tiles/tile-types";
import { ALL_SOUND_KEYS } from "@/game/systems/audio-constants";
import { PARTICLE_TEXTURES } from "@/game/systems/particle-constants";
import { initializeSpriteRegistry } from "@/game/rendering/sprite-registry";
import { PARTICLE_GENERATORS } from "@/game/rendering/generators/particle-sprites";

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

      // Generate particle textures (tiny colored shapes).
      this.generateParticleTextures();

      // Generate purpose-shaped particle textures (ember, blood, spark, etc.)
      this.generateShapedParticleTextures();

      // Initialize the sprite registry (generates white canvas textures
      // for all known spriteKeys). Must complete before LoadingScene.
      initializeSpriteRegistry(this);

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

  /**
   * Generate tiny white particle textures (circle and square).
   *
   * Particles are tinted at emit time — white base textures allow
   * any color via Phaser's tint property. Sizes are 4x4 (circle)
   * and 3x3 (square) pixels.
   */
  private generateParticleTextures(): void {
    // 4x4 circle
    if (!this.textures.exists(PARTICLE_TEXTURES.CIRCLE)) {
      const circleCanvas = this.textures.createCanvas(
        PARTICLE_TEXTURES.CIRCLE,
        4,
        4,
      );
      if (circleCanvas) {
        const cCtx = circleCanvas.getContext();
        cCtx.fillStyle = "#ffffff";
        cCtx.beginPath();
        cCtx.arc(2, 2, 2, 0, Math.PI * 2);
        cCtx.fill();
        circleCanvas.refresh();
      }
    }

    // 3x3 square
    if (!this.textures.exists(PARTICLE_TEXTURES.SQUARE)) {
      const squareCanvas = this.textures.createCanvas(
        PARTICLE_TEXTURES.SQUARE,
        3,
        3,
      );
      if (squareCanvas) {
        const sCtx = squareCanvas.getContext();
        sCtx.fillStyle = "#ffffff";
        sCtx.fillRect(0, 0, 3, 3);
        squareCanvas.refresh();
      }
    }
  }

  /**
   * Generate purpose-shaped particle textures (ember, blood, spark, etc.)
   * from the particle-sprites generators. Each texture is a tiny canvas
   * (2-5px) drawn in white for tinting at emission time.
   */
  private generateShapedParticleTextures(): void {
    for (const [key, gen] of Object.entries(PARTICLE_GENERATORS)) {
      if (this.textures.exists(key)) continue;

      const canvas = this.textures.createCanvas(key, gen.width, gen.height);
      if (canvas) {
        const ctx = canvas.getContext();
        gen.draw(ctx);
        canvas.refresh();
      }
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
