/**
 * Tile sprite drawing functions for the tileset texture strip.
 *
 * Each function draws a 32×32 tile at a given x-offset within the horizontal
 * canvas strip. Unlike entity/object sprites (which draw white for tinting),
 * tile sprites draw in their actual tile colours from TILE_PROPERTIES because
 * the tileset is used directly by Phaser's tilemap renderer. Per-tile colour
 * variation is applied separately via Tile.tint in GameScene.
 *
 * Detail colours are computed relative to the base (±10% brightness) so the
 * texture is subtle background detail, not foreground distraction.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import { TileType, TILE_PROPERTIES, TILE_SIZE } from "@/game/tiles/tile-types";

// ---------------------------------------------------------------------------
// Colour utilities
// ---------------------------------------------------------------------------

/** Convert a 24-bit RGB integer to a CSS hex string. */
function toHex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/** Adjust brightness of a 24-bit RGB colour by a factor. Clamps [0,255]. */
function adjustBrightness(color: number, factor: number): string {
  const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 0xff) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((color >> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((color & 0xff) * factor)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// Tile drawing functions
// ---------------------------------------------------------------------------

/** Wall — dark gray with brick course / mortar lines. */
function drawWallTile(ctx: CanvasRenderingContext2D, x: number): void {
  const base = TILE_PROPERTIES[TileType.Wall].color;
  const s = TILE_SIZE;

  // Base fill
  ctx.fillStyle = toHex(base);
  ctx.fillRect(x, 0, s, s);

  // Horizontal mortar lines (every 8px)
  const mortar = adjustBrightness(base, 1.15);
  ctx.fillStyle = mortar;
  ctx.fillRect(x, 7, s, 1);
  ctx.fillRect(x, 15, s, 1);
  ctx.fillRect(x, 23, s, 1);
  ctx.fillRect(x, 31, s, 1);

  // Vertical mortar lines (staggered between rows)
  // Even rows: x+8, x+16, x+24
  ctx.fillRect(x + 8, 0, 1, 7);
  ctx.fillRect(x + 16, 0, 1, 7);
  ctx.fillRect(x + 24, 0, 1, 7);
  // Odd rows (offset by half-brick): x+4, x+12, x+20, x+28
  ctx.fillRect(x + 4, 8, 1, 7);
  ctx.fillRect(x + 12, 8, 1, 7);
  ctx.fillRect(x + 20, 8, 1, 7);
  ctx.fillRect(x + 28, 8, 1, 7);
  // Even rows
  ctx.fillRect(x + 8, 16, 1, 7);
  ctx.fillRect(x + 16, 16, 1, 7);
  ctx.fillRect(x + 24, 16, 1, 7);
  // Odd rows
  ctx.fillRect(x + 4, 24, 1, 7);
  ctx.fillRect(x + 12, 24, 1, 7);
  ctx.fillRect(x + 20, 24, 1, 7);
  ctx.fillRect(x + 28, 24, 1, 7);
}

/** Floor — tan/beige with directional plank grain. */
function drawFloorTile(ctx: CanvasRenderingContext2D, x: number): void {
  const base = TILE_PROPERTIES[TileType.Floor].color;
  const s = TILE_SIZE;

  // Base fill
  ctx.fillStyle = toHex(base);
  ctx.fillRect(x, 0, s, s);

  // Plank divider lines (horizontal)
  const grain = adjustBrightness(base, 0.88);
  ctx.fillStyle = grain;
  ctx.fillRect(x, 7, s, 1);
  ctx.fillRect(x, 15, s, 1);
  ctx.fillRect(x, 23, s, 1);

  // Wood grain detail (lighter streaks)
  const highlight = adjustBrightness(base, 1.06);
  ctx.fillStyle = highlight;
  ctx.fillRect(x + 3, 2, 10, 1);
  ctx.fillRect(x + 18, 4, 8, 1);
  ctx.fillRect(x + 5, 10, 12, 1);
  ctx.fillRect(x + 20, 12, 7, 1);
  ctx.fillRect(x + 2, 18, 9, 1);
  ctx.fillRect(x + 16, 20, 11, 1);
  ctx.fillRect(x + 8, 26, 14, 1);

  // Nail dots
  const nail = adjustBrightness(base, 0.75);
  ctx.fillStyle = nail;
  ctx.fillRect(x + 6, 3, 1, 1);
  ctx.fillRect(x + 22, 11, 1, 1);
  ctx.fillRect(x + 10, 19, 1, 1);
  ctx.fillRect(x + 26, 27, 1, 1);
}

/** Door — brown with frame border and knob. */
function drawDoorTile(ctx: CanvasRenderingContext2D, x: number): void {
  const base = TILE_PROPERTIES[TileType.Door].color;
  const s = TILE_SIZE;

  // Base fill
  ctx.fillStyle = toHex(base);
  ctx.fillRect(x, 0, s, s);

  // Frame border (2px inset, darker)
  const frame = adjustBrightness(base, 0.78);
  ctx.fillStyle = frame;
  ctx.fillRect(x, 0, s, 2);      // top
  ctx.fillRect(x, 30, s, 2);     // bottom
  ctx.fillRect(x, 0, 2, s);      // left
  ctx.fillRect(x + 30, 0, 2, s); // right

  // Door panel lines
  const panel = adjustBrightness(base, 0.90);
  ctx.fillStyle = panel;
  ctx.fillRect(x + 4, 4, 24, 1);
  ctx.fillRect(x + 4, 16, 24, 1);

  // Knob (lighter)
  const knob = adjustBrightness(base, 1.20);
  ctx.fillStyle = knob;
  ctx.fillRect(x + 22, 14, 3, 3);

  // Knob highlight
  const shine = adjustBrightness(base, 1.35);
  ctx.fillStyle = shine;
  ctx.fillRect(x + 23, 14, 1, 1);
}

/** Window — sky blue with cross-frame divider and lighter panes. */
function drawWindowTile(ctx: CanvasRenderingContext2D, x: number): void {
  const base = TILE_PROPERTIES[TileType.Window].color;
  const s = TILE_SIZE;

  // Base fill
  ctx.fillStyle = toHex(base);
  ctx.fillRect(x, 0, s, s);

  // Lighter pane fill (translucency)
  const pane = adjustBrightness(base, 1.10);
  ctx.fillStyle = pane;
  ctx.fillRect(x + 3, 3, 12, 12);
  ctx.fillRect(x + 17, 3, 12, 12);
  ctx.fillRect(x + 3, 17, 12, 12);
  ctx.fillRect(x + 17, 17, 12, 12);

  // Cross-frame divider (darker)
  const divider = adjustBrightness(base, 0.75);
  ctx.fillStyle = divider;
  ctx.fillRect(x, 15, s, 2);     // horizontal
  ctx.fillRect(x + 15, 0, 2, s); // vertical

  // Window border (outer frame)
  ctx.fillRect(x, 0, s, 2);
  ctx.fillRect(x, 30, s, 2);
  ctx.fillRect(x, 0, 2, s);
  ctx.fillRect(x + 30, 0, 2, s);
}

/** Road — very dark gray with faint centre lane marking. */
function drawRoadTile(ctx: CanvasRenderingContext2D, x: number): void {
  const base = TILE_PROPERTIES[TileType.Road].color;
  const s = TILE_SIZE;

  // Base fill
  ctx.fillStyle = toHex(base);
  ctx.fillRect(x, 0, s, s);

  // Surface texture (very subtle grain)
  const grain = adjustBrightness(base, 1.08);
  ctx.fillStyle = grain;
  ctx.fillRect(x + 5, 4, 2, 1);
  ctx.fillRect(x + 20, 9, 3, 1);
  ctx.fillRect(x + 8, 18, 2, 1);
  ctx.fillRect(x + 25, 25, 2, 1);

  // Centre lane dashes
  const lane = adjustBrightness(base, 1.40);
  ctx.fillStyle = lane;
  ctx.fillRect(x + 15, 2, 2, 5);
  ctx.fillRect(x + 15, 12, 2, 5);
  ctx.fillRect(x + 15, 22, 2, 5);
}

/** Sidewalk — medium gray with hairline crack grid. */
function drawSidewalkTile(ctx: CanvasRenderingContext2D, x: number): void {
  const base = TILE_PROPERTIES[TileType.Sidewalk].color;
  const s = TILE_SIZE;

  // Base fill
  ctx.fillStyle = toHex(base);
  ctx.fillRect(x, 0, s, s);

  // Crack / joint lines (subtle)
  const crack = adjustBrightness(base, 0.88);
  ctx.fillStyle = crack;
  // Horizontal joints
  ctx.fillRect(x, 10, s, 1);
  ctx.fillRect(x, 21, s, 1);
  // Vertical joints
  ctx.fillRect(x + 10, 0, 1, s);
  ctx.fillRect(x + 21, 0, 1, s);

  // Slight wear marks
  const wear = adjustBrightness(base, 0.94);
  ctx.fillStyle = wear;
  ctx.fillRect(x + 4, 5, 3, 1);
  ctx.fillRect(x + 15, 15, 4, 1);
  ctx.fillRect(x + 24, 26, 3, 1);
}

/** Grass — dark green with scattered darker tufts. */
function drawGrassTile(ctx: CanvasRenderingContext2D, x: number): void {
  const base = TILE_PROPERTIES[TileType.Grass].color;
  const s = TILE_SIZE;

  // Base fill
  ctx.fillStyle = toHex(base);
  ctx.fillRect(x, 0, s, s);

  // Dark tuft dots (fixed positions for determinism)
  const dark = adjustBrightness(base, 0.82);
  ctx.fillStyle = dark;
  ctx.fillRect(x + 3, 2, 1, 1);
  ctx.fillRect(x + 14, 5, 1, 1);
  ctx.fillRect(x + 27, 3, 1, 1);
  ctx.fillRect(x + 8, 10, 1, 1);
  ctx.fillRect(x + 21, 12, 1, 1);
  ctx.fillRect(x + 5, 17, 1, 1);
  ctx.fillRect(x + 18, 19, 1, 1);
  ctx.fillRect(x + 29, 16, 1, 1);
  ctx.fillRect(x + 11, 24, 1, 1);
  ctx.fillRect(x + 24, 27, 1, 1);
  ctx.fillRect(x + 2, 28, 1, 1);
  ctx.fillRect(x + 16, 30, 1, 1);

  // Light highlight dots (slightly brighter)
  const light = adjustBrightness(base, 1.12);
  ctx.fillStyle = light;
  ctx.fillRect(x + 7, 4, 1, 1);
  ctx.fillRect(x + 22, 8, 1, 1);
  ctx.fillRect(x + 12, 15, 1, 1);
  ctx.fillRect(x + 26, 22, 1, 1);
  ctx.fillRect(x + 4, 25, 1, 1);
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

const DRAW_FNS: Readonly<Partial<Record<TileType, (ctx: CanvasRenderingContext2D, x: number) => void>>> = {
  [TileType.Wall]: drawWallTile,
  [TileType.Floor]: drawFloorTile,
  [TileType.Door]: drawDoorTile,
  [TileType.Window]: drawWindowTile,
  [TileType.Road]: drawRoadTile,
  [TileType.Sidewalk]: drawSidewalkTile,
  [TileType.Grass]: drawGrassTile,
};

/** Type for tile drawing functions. */
export type TileSpriteDrawFn = (ctx: CanvasRenderingContext2D, x: number) => void;

/**
 * Look up a drawing function for a tile type.
 *
 * Returns `null` for TileType.Empty (which is not rendered).
 */
export function getTileSpriteDrawFn(tileType: TileType): TileSpriteDrawFn | null {
  return DRAW_FNS[tileType] ?? null;
}
