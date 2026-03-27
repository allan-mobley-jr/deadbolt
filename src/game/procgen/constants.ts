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
// Safehouse scoring
// ---------------------------------------------------------------------------

export const SAFEHOUSE_WEIGHTS = {
  /**
   * Weight for the entry-point defensibility score.
   * Fewer entry points → higher score.
   */
  ENTRY_POINTS: 30,

  /** Bonus weight per nearby loot object. */
  LOOT_PROXIMITY: 15,

  /** Weight for building-size fitness (0-1 scaled). */
  BUILDING_SIZE: 20,

  /** Weight for pre-existing object density (furniture = cover). */
  OBJECT_DENSITY: 10,

  /**
   * Entry point count at which excess-penalty kicks in.
   * Buildings with more than this many entry points are penalised.
   */
  ENTRY_POINT_PENALTY_THRESHOLD: 4,

  /** Penalty per entry point beyond the threshold. */
  ENTRY_POINT_EXCESS_PENALTY: 5,
} as const;

/** Ideal building area range in tiles for safehouse selection. */
export const IDEAL_SIZE_MIN = 40;
export const IDEAL_SIZE_MAX = 120;

/** Minimum area (tiles) for a building to be considered a safehouse candidate. */
export const MIN_SAFEHOUSE_AREA = 25;

/** Maximum loot count used for normalisation (score caps at this value). */
export const LOOT_NORM_CAP = 5;

/** Maximum furniture/container count used for normalisation. */
export const OBJECT_NORM_CAP = 8;

/** Radius in tiles around a building to search for loot in neighbouring buildings. */
export const LOOT_SEARCH_RADIUS = 10;

// ---------------------------------------------------------------------------
// Spawn zones
// ---------------------------------------------------------------------------

export const SPAWN_ZONE = {
  /** Distance from map edge for edge spawn zones (in tiles). */
  EDGE_INSET: 2,
  /** Number of spawn zones per map edge. */
  ZONES_PER_EDGE: 3,
  /** Minimum distance from safehouse for "far building" spawn type (tiles). */
  MIN_DISTANCE_FROM_SAFEHOUSE: 30,
  /** Radius of each spawn zone (tiles). */
  ZONE_RADIUS: 4,
  /** Minimum walkable spawn points required for a zone to be valid. */
  MIN_SPAWN_POINTS: 3,
} as const;

// ---------------------------------------------------------------------------
// Pathfinding
// ---------------------------------------------------------------------------

export const PATHFINDING = {
  /** A* weight (>1 trades optimality for speed). */
  ASTAR_WEIGHT: 1.2,
  /**
   * Diagonal movement policy.
   * 4 = OnlyWhenNoObstacles — prevents cutting through diagonal wall corners.
   */
  DIAGONAL_MOVEMENT: 4,
} as const;
