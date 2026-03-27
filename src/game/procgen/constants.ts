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
