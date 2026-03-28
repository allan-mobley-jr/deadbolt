/**
 * Shared type definitions for all procedural generation systems.
 *
 * These types form the integration boundary between:
 *   - WFC city layout generator (issue #13)
 *   - BSP building interior generator (issue #14)
 *   - Object placement and loot tables (issue #15)
 *   - Safehouse selection and pathfinding grid (issue #16)
 *
 * NO React imports allowed — this is pure TypeScript.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** 2D coordinate in tile space (not pixel space). */
export interface TileCoord {
  x: number;
  y: number;
}

/** Cardinal direction a door or window faces outward. */
export type Direction = 'north' | 'south' | 'east' | 'west';

/** Classification of a building — determines room type distribution in BSP. */
export type BuildingClass = 'residential' | 'commercial' | 'industrial';

// ---------------------------------------------------------------------------
// Tile types
// ---------------------------------------------------------------------------

/** What occupies a single cell in the city tile grid. */
export enum TileType {
  Empty = 0,
  Wall = 1,
  Floor = 2,
  Door = 3,
  Window = 4,
  Road = 5,
  Sidewalk = 6,
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

/** An entry point into a building (door or window). */
export interface EntryPoint {
  position: TileCoord;
  type: 'door' | 'window';
  facingDirection: Direction;
  /** Index into the parent Building.rooms array. */
  roomIndex: number;
  /** Whether this entry point is currently barricaded. */
  barricaded: boolean;
}

/** A room within a building (produced by BSP generator). */
export interface Room {
  /** Top-left corner in tile coords. */
  origin: TileCoord;
  /** Width in tiles (includes wall perimeter). */
  width: number;
  /** Height in tiles (includes wall perimeter). */
  height: number;
  /** Room archetype identifier (e.g. 'bedroom', 'kitchen', 'store_front'). */
  roomType: string;
  /** Indices into the parent Building.objects array. */
  objectIndices: number[];
}

/** Category of a placed object — affects safehouse scoring. */
export enum ObjectCategory {
  Loot = 'loot',
  Furniture = 'furniture',
  Debris = 'debris',
  Container = 'container',
}

/** A placed object within a building (produced by object placement system). */
export interface PlacedObject {
  position: TileCoord;
  category: ObjectCategory;
  /** Whether this object blocks tile walkability. */
  blocksMovement: boolean;
  /** Unique object type identifier (e.g. 'medkit', 'ammo_crate', 'sofa'). */
  objectType: string;
}

/** A building in the city (produced by WFC + BSP). */
export interface Building {
  /** Unique identifier. */
  id: string;
  /** Top-left corner of the bounding box in tile coords. */
  origin: TileCoord;
  /** Width of the bounding box in tiles. */
  width: number;
  /** Height of the bounding box in tiles. */
  height: number;
  /** Rooms subdivided by BSP. */
  rooms: Room[];
  /** All entry points (doors and windows). */
  entryPoints: EntryPoint[];
  /** All placed objects inside the building. */
  objects: PlacedObject[];
}

/** The full city layout — top-level output of map generation. */
export interface CityLayout {
  /** Grid width in tiles. */
  widthTiles: number;
  /** Grid height in tiles. */
  heightTiles: number;
  /** 2D tile grid indexed as tiles[y][x]. */
  tiles: TileType[][];
  /** All buildings in the city. */
  buildings: Building[];
  /** Seed used for generation (for reproducibility logging). */
  seed: string;
}

// ---------------------------------------------------------------------------
// Room connectivity
// ---------------------------------------------------------------------------

/** A connection between two rooms via a door. */
export interface RoomConnection {
  roomIndexA: number;
  roomIndexB: number;
  doorPosition: TileCoord;
}

// ---------------------------------------------------------------------------
// Safehouse & pathfinding results
// ---------------------------------------------------------------------------

/** Score breakdown for a single safehouse candidate. */
export interface SafehouseScoreBreakdown {
  entryPointScore: number;
  lootProximityScore: number;
  buildingSizeScore: number;
  objectDensityScore: number;
  totalScore: number;
}

/** Result of the safehouse selection algorithm. */
export interface SafehouseResult {
  /** The selected building. */
  building: Building;
  /** Index of the building in CityLayout.buildings. */
  buildingIndex: number;
  /** Score breakdown for debugging / tuning. */
  scoreBreakdown: SafehouseScoreBreakdown;
  /** Entry points to defend. */
  entryPointsToDefend: EntryPoint[];
  /** Center position for minimap marker. */
  minimapPosition: TileCoord;
  /** True if no building met the minimum area threshold (fallback used). */
  usedFallback: boolean;
}

/** Result of a pathfinding query. */
export interface PathResult {
  /** Ordered tile coordinates from start to end (empty if no path). */
  path: TileCoord[];
  /** Whether a valid path was found. */
  found: boolean;
  /** Path length in tiles. */
  length: number;
}

/** A zombie spawn zone. */
export interface SpawnZone {
  /** Unique identifier. */
  id: string;
  /** Category of spawn location. */
  type: 'map_edge' | 'far_building';
  /** Center point of the zone. */
  position: TileCoord;
  /** Radius in tiles for random spawn offset. */
  radius: number;
  /** Distance from safehouse center in tiles (Euclidean). */
  distanceToSafehouse: number;
  /** Walkable positions within the zone where zombies can actually appear. */
  spawnPoints: TileCoord[];
}
