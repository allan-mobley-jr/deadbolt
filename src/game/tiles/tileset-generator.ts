/**
 * Programmatic tileset texture generator.
 *
 * Creates a horizontal tile-strip texture at runtime — one 32x32 coloured
 * square per renderable TileType.  The strip is added to Phaser's texture
 * manager under the key TILESET_KEY so it can be used with addTilesetImage().
 *
 * Tile indices in the strip match (TileType - 1) because TileType.Empty = 0
 * is not rendered (Phaser treats data value 0 as "no tile" when firstgid = 1).
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import {
  TileType,
  TILE_SIZE,
  RENDERABLE_TILE_COUNT,
} from "./tile-types";
import { getTileSpriteDrawFn } from "@/game/rendering/generators/tile-sprites";

/** Texture key used by the tileset in the Phaser texture manager. */
export const TILESET_KEY = "tileset";

/**
 * Generate the tileset texture and register it with the scene's texture
 * manager.  Must be called before any tilemap layer references this tileset.
 */
export function generateTileset(scene: Phaser.Scene): void {
  const width = RENDERABLE_TILE_COUNT * TILE_SIZE;
  const height = TILE_SIZE;

  const canvasTexture = scene.textures.createCanvas(
    TILESET_KEY,
    width,
    height,
  );

  if (!canvasTexture) {
    throw new Error("Failed to create tileset canvas texture");
  }

  const ctx = canvasTexture.getContext();

  // Draw each renderable tile type with texture detail.
  // TileType values 1..N map to strip frames 0..N-1.
  for (const key of Object.values(TileType)) {
    if (typeof key !== "number") continue;     // skip reverse-enum strings
    if (key === TileType.Empty) continue;      // Empty → no tile, not drawn

    const frameIndex = key - 1; // TileType 1 → frame 0, etc.
    const drawFn = getTileSpriteDrawFn(key as TileType);
    if (drawFn) {
      drawFn(ctx, frameIndex * TILE_SIZE);
    }
  }

  canvasTexture.refresh();
}
