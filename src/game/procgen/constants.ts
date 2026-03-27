/**
 * Tunable constants for procedural generation systems.
 *
 * All scoring weights and thresholds live here so they are easy to find and
 * adjust without touching algorithm logic.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

/** Tile size in pixels. */
export const TILE_SIZE = 32;

// ---------------------------------------------------------------------------
// WFC city layout generator
// ---------------------------------------------------------------------------

export const WFC = {
  /** Default macro grid width (in macro tiles). */
  GRID_WIDTH: 32,
  /** Default macro grid height (in macro tiles). */
  GRID_HEIGHT: 32,
  /** Size of each macro tile in game tiles (8×8 block). */
  MACRO_TILE_SIZE: 8,
  /** Maximum full restarts before falling back to a simple grid layout. */
  MAX_RETRIES: 5,
  /** Minimum fraction of macro cells that must be road tiles. */
  MIN_ROAD_FRACTION: 0.12,
  /** Minimum fraction of macro cells that must be building tiles. */
  MIN_BUILDING_FRACTION: 0.15,
  /** Road spacing interval for fallback grid (every N macro cells). */
  FALLBACK_ROAD_INTERVAL: 4,
} as const;

// ---------------------------------------------------------------------------
// BSP building interior generator
// ---------------------------------------------------------------------------

export const BSP = {
  /** Minimum room dimension in tiles (width or height). Includes walls. */
  MIN_ROOM_SIZE: 3,
  /** Maximum BSP recursion depth. */
  MAX_DEPTH: 4,
  /**
   * Minimum dimension for a partition to be splittable.
   * Must fit two MIN_ROOM_SIZE rooms sharing one wall: 2 * 3 - 1 = 5.
   */
  MIN_SPLIT_SIZE: 5,
  /** Lower bound of split ratio (position within the valid range). */
  SPLIT_RATIO_MIN: 0.35,
  /** Upper bound of split ratio. */
  SPLIT_RATIO_MAX: 0.65,
  /** Probability of choosing horizontal split when both orientations are valid. */
  HORIZONTAL_SPLIT_BIAS: 0.5,
  /** Probability of placing a window on an eligible exterior wall tile. */
  WINDOW_PROBABILITY: 0.3,
  /** Minimum Manhattan distance between windows on the same building. */
  WINDOW_MIN_SPACING: 2,
} as const;
