/**
 * Tile type definitions and associated properties.
 *
 * The TileType enum values (Empty=0, Wall=1, ...) are used directly as tile
 * indices in Phaser tilemap data arrays.  When a tileset with firstgid=1 is
 * added, Phaser maps data value 0 → no tile, and data values 1-N to tileset
 * frames 0-(N-1).  This means TileType.Empty renders nothing, and every other
 * type renders the corresponding coloured tile.
 *
 * Integer values must stay compatible with the procgen TileType enum on other
 * branches (Empty=0, Wall=1, Floor=2, Door=3, Window=4, Road=5, Sidewalk=6).
 * Grass=7 is new here and appended at the end.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

// ---------------------------------------------------------------------------
// Tile type enum
// ---------------------------------------------------------------------------

export enum TileType {
  Empty = 0,
  Wall = 1,
  Floor = 2,
  Door = 3,
  Window = 4,
  Road = 5,
  Sidewalk = 6,
  Grass = 7,
}

// ---------------------------------------------------------------------------
// Per-tile-type property lookup
// ---------------------------------------------------------------------------

export interface TileProperties {
  /** Whether this tile blocks movement (creates a Matter.js static body). */
  collides: boolean;
  /** Fill colour for the programmatic tileset (24-bit RGB). */
  color: number;
  /** Human-readable label for debugging. */
  label: string;
}

/**
 * Property table indexed by TileType.
 *
 * Only Wall and Window block movement.  Door is explicitly walkable so
 * players can pass through doorways.
 */
export const TILE_PROPERTIES: Record<TileType, TileProperties> = {
  [TileType.Empty]:    { collides: false, color: 0x000000, label: "empty" },
  [TileType.Wall]:     { collides: true,  color: 0x555555, label: "wall" },
  [TileType.Floor]:    { collides: false, color: 0xc4a882, label: "floor" },
  [TileType.Door]:     { collides: false, color: 0x8b4513, label: "door" },
  [TileType.Window]:   { collides: true,  color: 0x87ceeb, label: "window" },
  [TileType.Road]:     { collides: false, color: 0x333333, label: "road" },
  [TileType.Sidewalk]: { collides: false, color: 0x999999, label: "sidewalk" },
  [TileType.Grass]:    { collides: false, color: 0x4a7c3f, label: "grass" },
};

/** Number of renderable tile types (excludes Empty which maps to "no tile"). */
export const RENDERABLE_TILE_COUNT = Object.keys(TILE_PROPERTIES).length - 1;

/** Tile size in pixels (both width and height). */
export const TILE_SIZE = 32;
