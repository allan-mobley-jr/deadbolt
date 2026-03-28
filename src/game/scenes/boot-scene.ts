import Phaser from "phaser";
import { generateTileset } from "@/game/tiles/tileset-generator";
import { TILE_SIZE } from "@/game/tiles/tile-types";

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

      // All assets ready — start the game.
      this.scene.start("GameScene");
    } catch (err) {
      console.error("[BootScene] Failed to generate assets:", err);
      this.game.events.emit("boot-error", err);
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
