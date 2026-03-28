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

const BSP_MIN_ROOM_SIZE = 3;

export const BSP = {
  /** Minimum room dimension in tiles (width or height). Includes walls. */
  MIN_ROOM_SIZE: BSP_MIN_ROOM_SIZE,
  /** Maximum BSP recursion depth. */
  MAX_DEPTH: 4,
  /**
   * Minimum dimension for a partition to be splittable.
   * Must fit two MIN_ROOM_SIZE rooms sharing one wall: 2 * MIN_ROOM_SIZE - 1.
   */
  MIN_SPLIT_SIZE: 2 * BSP_MIN_ROOM_SIZE - 1,
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
// Object placement
// ---------------------------------------------------------------------------

export const OBJECT_PLACEMENT = {
  /** Tiles of clearance to leave around door tiles. */
  DOOR_CLEARANCE: 1,
  /** Reference room area (tiles) for density scaling. baseDensity targets this size. */
  REFERENCE_ROOM_AREA: 25,
  /** Maximum object density (objects per tile). Prevents cluttering. */
  MAX_DENSITY: 0.15,
  /** Minimum room area (tiles) to receive any objects. */
  MIN_ROOM_AREA: 4,
  /** Distance (tiles) from safehouse at which loot value scaling begins. */
  LOOT_DISTANCE_NEAR: 15,
  /** Distance (tiles) from safehouse at which maximum loot value is allowed. */
  LOOT_DISTANCE_FAR: 60,
  /** Max loot value allowed in buildings within LOOT_DISTANCE_NEAR of safehouse. */
  NEAR_MAX_LOOT_VALUE: 3,
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
