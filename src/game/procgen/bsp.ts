/**
 * BSP building interior generator.
 *
 * Subdivides building footprints into rooms using Binary Space Partitioning,
 * assigns room types based on building class, and places doors and windows.
 *
 * The BSP tree guarantees all rooms are connected via doors (tree-structured
 * connectivity graph with exactly N-1 interior doors for N rooms).
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import type { PRNG } from 'seedrandom';
import type {
  Building,
  BuildingClass,
  CityLayout,
  Direction,
  EntryPoint,
  Room,
  RoomConnection,
  TileCoord,
} from '@/types/procgen';
import { TileType } from '@/types/procgen';
import { BSP } from './constants';

// ---------------------------------------------------------------------------
// Internal BSP tree types
// ---------------------------------------------------------------------------

/** Axis-aligned rectangle in tile space. */
export interface BSPRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Leaf node — becomes a room. */
export interface BSPLeaf {
  kind: 'leaf';
  rect: BSPRect;
}

/** Branch node — represents a partition boundary. */
export interface BSPBranch {
  kind: 'branch';
  rect: BSPRect;
  /** True = horizontal split (top/bottom), false = vertical (left/right). */
  splitHorizontal: boolean;
  /** Tile coordinate of the shared wall row or column. */
  splitPosition: number;
  left: BSPNode;
  right: BSPNode;
}

export type BSPNode = BSPLeaf | BSPBranch;

// ---------------------------------------------------------------------------
// Room type pools per building class
// ---------------------------------------------------------------------------

interface WeightedRoomType {
  type: string;
  weight: number;
}

const ROOM_TYPE_POOLS: Record<BuildingClass, readonly WeightedRoomType[]> = {
  residential: [
    { type: 'bedroom', weight: 3 },
    { type: 'kitchen', weight: 2 },
    { type: 'bathroom', weight: 2 },
    { type: 'living_room', weight: 2 },
    { type: 'hallway', weight: 1 },
    { type: 'garage', weight: 1 },
  ],
  commercial: [
    { type: 'store_front', weight: 3 },
    { type: 'storage', weight: 3 },
    { type: 'office', weight: 2 },
    { type: 'hallway', weight: 1 },
  ],
  industrial: [
    { type: 'storage', weight: 4 },
    { type: 'office', weight: 2 },
    { type: 'hallway', weight: 1 },
  ],
};

const SINGLE_ROOM_DEFAULTS: Record<BuildingClass, string> = {
  residential: 'living_room',
  commercial: 'store_front',
  industrial: 'storage',
};

// ---------------------------------------------------------------------------
// BSP tree construction
// ---------------------------------------------------------------------------

/**
 * Recursively partition a rectangle using BSP.
 *
 * Returns a tree where leaves represent rooms and branches represent
 * partition boundaries (shared walls). Children overlap by one tile row
 * or column at the shared wall.
 */
export function splitPartition(
  rect: BSPRect,
  depth: number,
  rng: PRNG,
): BSPNode {
  if (depth >= BSP.MAX_DEPTH) {
    return { kind: 'leaf', rect };
  }

  const canSplitH = rect.height >= BSP.MIN_SPLIT_SIZE;
  const canSplitV = rect.width >= BSP.MIN_SPLIT_SIZE;

  if (!canSplitH && !canSplitV) {
    return { kind: 'leaf', rect };
  }

  // Choose split orientation — prefer the longer dimension for aspect > 1.5
  let horizontal: boolean;
  if (canSplitH && canSplitV) {
    if (rect.width > rect.height * 1.5) {
      horizontal = false;
    } else if (rect.height > rect.width * 1.5) {
      horizontal = true;
    } else {
      horizontal = rng() < BSP.HORIZONTAL_SPLIT_BIAS;
    }
  } else {
    horizontal = canSplitH;
  }

  // Valid split range: each child must be >= MIN_ROOM_SIZE
  const size = horizontal ? rect.height : rect.width;
  const origin = horizontal ? rect.y : rect.x;

  const minPos = origin + BSP.MIN_ROOM_SIZE - 1;
  const maxPos = origin + size - BSP.MIN_ROOM_SIZE;

  // Pick position within [SPLIT_RATIO_MIN, SPLIT_RATIO_MAX] of the valid range
  const range = maxPos - minPos;
  const ratio =
    BSP.SPLIT_RATIO_MIN + rng() * (BSP.SPLIT_RATIO_MAX - BSP.SPLIT_RATIO_MIN);
  const splitPos = minPos + Math.round(range * ratio);

  // Create children (overlapping by 1 at the shared wall)
  let left: BSPRect;
  let right: BSPRect;
  if (horizontal) {
    left = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: splitPos - rect.y + 1,
    };
    right = {
      x: rect.x,
      y: splitPos,
      width: rect.width,
      height: rect.y + rect.height - splitPos,
    };
  } else {
    left = {
      x: rect.x,
      y: rect.y,
      width: splitPos - rect.x + 1,
      height: rect.height,
    };
    right = {
      x: splitPos,
      y: rect.y,
      width: rect.x + rect.width - splitPos,
      height: rect.height,
    };
  }

  return {
    kind: 'branch',
    rect,
    splitHorizontal: horizontal,
    splitPosition: splitPos,
    left: splitPartition(left, depth + 1, rng),
    right: splitPartition(right, depth + 1, rng),
  };
}

/** Collect all leaf nodes from a BSP tree. */
export function collectLeaves(node: BSPNode): BSPLeaf[] {
  if (node.kind === 'leaf') return [node];
  return [...collectLeaves(node.left), ...collectLeaves(node.right)];
}

// ---------------------------------------------------------------------------
// Room type assignment
// ---------------------------------------------------------------------------

/** Weighted random selection from a pool. */
function weightedSelectRoomType(
  pool: readonly WeightedRoomType[],
  rng: PRNG,
): string {
  let total = 0;
  for (const entry of pool) total += entry.weight;

  let roll = rng() * total;
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) return entry.type;
  }
  return pool[pool.length - 1].type;
}

/**
 * Assign room types to BSP leaves based on building class.
 *
 * Constraints:
 * - Single rooms get a sensible default per class.
 * - Residential with 3+ rooms: at least one kitchen and one bathroom.
 * - Commercial with 2+ rooms: largest room becomes store_front.
 */
export function assignRoomTypes(
  leaves: readonly BSPLeaf[],
  buildingClass: BuildingClass,
  rng: PRNG,
): string[] {
  const count = leaves.length;

  if (count === 1) {
    return [SINGLE_ROOM_DEFAULTS[buildingClass]];
  }

  const pool = ROOM_TYPE_POOLS[buildingClass];
  const types: string[] = new Array(count);

  if (buildingClass === 'residential' && count >= 3) {
    types[0] = 'kitchen';
    types[1] = 'bathroom';
    for (let i = 2; i < count; i++) {
      types[i] = weightedSelectRoomType(pool, rng);
    }
  } else if (buildingClass === 'commercial' && count >= 2) {
    let largestIdx = 0;
    let largestArea = 0;
    for (let i = 0; i < count; i++) {
      const area = leaves[i].rect.width * leaves[i].rect.height;
      if (area > largestArea) {
        largestArea = area;
        largestIdx = i;
      }
    }
    for (let i = 0; i < count; i++) {
      types[i] =
        i === largestIdx
          ? 'store_front'
          : weightedSelectRoomType(pool, rng);
    }
  } else {
    for (let i = 0; i < count; i++) {
      types[i] = weightedSelectRoomType(pool, rng);
    }
  }

  return types;
}

// ---------------------------------------------------------------------------
// Tile grid helpers
// ---------------------------------------------------------------------------

/** Return [height, width] of a 2D tile grid. */
function gridSize(tiles: TileType[][]): [number, number] {
  const h = tiles.length;
  return [h, h > 0 ? tiles[0].length : 0];
}

/**
 * Fill the building footprint with walls, then carve floor interiors.
 */
function writeBuildingTiles(
  building: Building,
  rooms: Room[],
  tiles: TileType[][],
): void {
  const [gridH, gridW] = gridSize(tiles);

  // Fill entire building footprint with walls
  for (let y = building.origin.y; y < building.origin.y + building.height; y++) {
    for (let x = building.origin.x; x < building.origin.x + building.width; x++) {
      if (y >= 0 && y < gridH && x >= 0 && x < gridW) {
        tiles[y][x] = TileType.Wall;
      }
    }
  }

  // Carve floor interiors for each room
  for (const room of rooms) {
    for (let y = room.origin.y + 1; y < room.origin.y + room.height - 1; y++) {
      for (let x = room.origin.x + 1; x < room.origin.x + room.width - 1; x++) {
        if (y >= 0 && y < gridH && x >= 0 && x < gridW) {
          tiles[y][x] = TileType.Floor;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Door placement
// ---------------------------------------------------------------------------

/**
 * Find the room index whose interior contains the given tile.
 * Returns -1 if no room contains it.
 */
function findRoomAtInterior(rooms: Room[], x: number, y: number): number {
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    if (
      x > r.origin.x &&
      x < r.origin.x + r.width - 1 &&
      y > r.origin.y &&
      y < r.origin.y + r.height - 1
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * Place interior doors at partition boundaries.
 *
 * Traverses the BSP tree, placing one door on each shared wall.
 * Checks the tile grid for floor on both sides to find valid positions.
 */
function placeInteriorDoors(
  node: BSPNode,
  rooms: Room[],
  tiles: TileType[][],
  entryPoints: EntryPoint[],
  rng: PRNG,
): void {
  if (node.kind === 'leaf') return;

  // Recurse into children first
  placeInteriorDoors(node.left, rooms, tiles, entryPoints, rng);
  placeInteriorDoors(node.right, rooms, tiles, entryPoints, rng);

  const [gridH, gridW] = gridSize(tiles);
  const candidates: TileCoord[] = [];

  if (node.splitHorizontal) {
    const y = node.splitPosition;
    // Exclude corners by starting +1 and ending -1
    for (let x = node.rect.x + 1; x < node.rect.x + node.rect.width - 1; x++) {
      if (
        y > 0 &&
        y < gridH - 1 &&
        x >= 0 &&
        x < gridW &&
        tiles[y - 1][x] === TileType.Floor &&
        tiles[y + 1][x] === TileType.Floor
      ) {
        candidates.push({ x, y });
      }
    }
  } else {
    const x = node.splitPosition;
    for (let y = node.rect.y + 1; y < node.rect.y + node.rect.height - 1; y++) {
      if (
        x > 0 &&
        x < gridW - 1 &&
        y >= 0 &&
        y < gridH &&
        tiles[y][x - 1] === TileType.Floor &&
        tiles[y][x + 1] === TileType.Floor
      ) {
        candidates.push({ x, y });
      }
    }
  }

  if (candidates.length === 0) return;

  const door = candidates[Math.floor(rng() * candidates.length)];
  tiles[door.y][door.x] = TileType.Door;

  // Create entry points for both adjacent rooms.
  // Each side is checked: the room lookup uses the tile one step into the
  // interior, and the facing direction points toward that room.
  const sides: Array<{ dx: number; dy: number; facing: Direction }> =
    node.splitHorizontal
      ? [
          { dx: 0, dy: -1, facing: 'south' },
          { dx: 0, dy: 1, facing: 'north' },
        ]
      : [
          { dx: -1, dy: 0, facing: 'east' },
          { dx: 1, dy: 0, facing: 'west' },
        ];

  for (const { dx, dy, facing } of sides) {
    const roomIdx = findRoomAtInterior(rooms, door.x + dx, door.y + dy);
    if (roomIdx >= 0) {
      entryPoints.push({
        position: { x: door.x, y: door.y },
        type: 'door',
        facingDirection: facing,
        roomIndex: roomIdx,
        barricaded: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Exterior wall scanning
// ---------------------------------------------------------------------------

/** A candidate tile on a building's exterior wall. */
interface WallCandidate {
  pos: TileCoord;
  dir: Direction;
  interiorX: number;
  interiorY: number;
  outsideTile: TileType;
}

/**
 * Scan all four exterior walls of a building and return candidate tiles.
 *
 * For each non-corner wall tile, the callback receives the wall position,
 * direction, interior neighbor, and outside tile type. A tile is included
 * only when both the inside and outside neighbors are within grid bounds
 * and the inside neighbor is floor.
 *
 * An optional `wallFilter` rejects tiles where the wall tile itself is not
 * the expected type (used by window placement to skip doors).
 */
function collectWallCandidates(
  building: Building,
  tiles: TileType[][],
  wallFilter?: TileType,
): WallCandidate[] {
  const bx = building.origin.x;
  const by = building.origin.y;
  const bw = building.width;
  const bh = building.height;
  const [gridH, gridW] = gridSize(tiles);

  const candidates: WallCandidate[] = [];

  // Each wall is described by: direction, wall coordinate, inside offset,
  // outside offset, and a range of tiles to iterate (horizontal or vertical).
  const walls: Array<{
    dir: Direction;
    horizontal: boolean;
    wallCoord: number;
    insideOffset: number;
    outsideOffset: number;
    rangeStart: number;
    rangeEnd: number;
  }> = [
    {
      dir: 'north',
      horizontal: true,
      wallCoord: by,
      insideOffset: 1,
      outsideOffset: -1,
      rangeStart: bx + 1,
      rangeEnd: bx + bw - 1,
    },
    {
      dir: 'south',
      horizontal: true,
      wallCoord: by + bh - 1,
      insideOffset: -1,
      outsideOffset: 1,
      rangeStart: bx + 1,
      rangeEnd: bx + bw - 1,
    },
    {
      dir: 'west',
      horizontal: false,
      wallCoord: bx,
      insideOffset: 1,
      outsideOffset: -1,
      rangeStart: by + 1,
      rangeEnd: by + bh - 1,
    },
    {
      dir: 'east',
      horizontal: false,
      wallCoord: bx + bw - 1,
      insideOffset: -1,
      outsideOffset: 1,
      rangeStart: by + 1,
      rangeEnd: by + bh - 1,
    },
  ];

  for (const wall of walls) {
    for (let i = wall.rangeStart; i < wall.rangeEnd; i++) {
      // Compute positions depending on whether the wall is horizontal or vertical
      const wallX = wall.horizontal ? i : wall.wallCoord;
      const wallY = wall.horizontal ? wall.wallCoord : i;
      const insideX = wall.horizontal ? i : wall.wallCoord + wall.insideOffset;
      const insideY = wall.horizontal ? wall.wallCoord + wall.insideOffset : i;
      const outsideX = wall.horizontal ? i : wall.wallCoord + wall.outsideOffset;
      const outsideY = wall.horizontal ? wall.wallCoord + wall.outsideOffset : i;

      // Bounds check
      if (
        insideX < 0 || insideX >= gridW ||
        insideY < 0 || insideY >= gridH ||
        outsideX < 0 || outsideX >= gridW ||
        outsideY < 0 || outsideY >= gridH ||
        wallX < 0 || wallX >= gridW ||
        wallY < 0 || wallY >= gridH
      ) {
        continue;
      }

      // Optional wall-tile filter (e.g. windows require the tile to still be Wall)
      if (wallFilter !== undefined && tiles[wallY][wallX] !== wallFilter) {
        continue;
      }

      if (tiles[insideY][insideX] !== TileType.Floor) continue;

      candidates.push({
        pos: { x: wallX, y: wallY },
        dir: wall.dir,
        interiorX: insideX,
        interiorY: insideY,
        outsideTile: tiles[outsideY][outsideX],
      });
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Exterior entrance placement
// ---------------------------------------------------------------------------

/**
 * Place an exterior entrance door on the building perimeter.
 *
 * Prefers walls facing roads or sidewalks. Falls back to any valid wall tile
 * that has floor on the interior side.
 */
function placeExteriorEntrance(
  building: Building,
  rooms: Room[],
  tiles: TileType[][],
  entryPoints: EntryPoint[],
  rng: PRNG,
): void {
  const candidates = collectWallCandidates(building, tiles);
  if (candidates.length === 0) return;

  const facesRoad = (t: TileType) =>
    t === TileType.Road || t === TileType.Sidewalk;

  // Prefer road-facing candidates
  const roadFacing = candidates.filter((c) => facesRoad(c.outsideTile));
  const pool = roadFacing.length > 0 ? roadFacing : candidates;

  const chosen = pool[Math.floor(rng() * pool.length)];
  tiles[chosen.pos.y][chosen.pos.x] = TileType.Door;

  const roomIdx = findRoomAtInterior(
    rooms,
    chosen.interiorX,
    chosen.interiorY,
  );
  if (roomIdx < 0) return;
  entryPoints.push({
    position: chosen.pos,
    type: 'door',
    facingDirection: chosen.dir,
    roomIndex: roomIdx,
    barricaded: false,
  });
}

// ---------------------------------------------------------------------------
// Window placement
// ---------------------------------------------------------------------------

/** Check whether a tile type is eligible for a window to face. */
function isWindowEligible(tileType: TileType): boolean {
  return (
    tileType === TileType.Road ||
    tileType === TileType.Sidewalk ||
    tileType === TileType.Empty
  );
}

/**
 * Place windows on exterior walls facing roads or open spaces.
 *
 * Skips tiles adjacent to doors and enforces minimum spacing between windows.
 */
function placeWindows(
  building: Building,
  rooms: Room[],
  tiles: TileType[][],
  entryPoints: EntryPoint[],
  rng: PRNG,
): void {
  // Only consider tiles that are still Wall (doors already placed)
  const candidates = collectWallCandidates(building, tiles, TileType.Wall)
    .filter((c) => isWindowEligible(c.outsideTile));

  // Build a set of positions adjacent to existing doors
  const doorNeighbors = new Set<string>();
  for (const ep of entryPoints) {
    if (ep.type === 'door') {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          doorNeighbors.add(
            `${ep.position.x + dx},${ep.position.y + dy}`,
          );
        }
      }
    }
  }

  const filtered = candidates.filter(
    (c) => !doorNeighbors.has(`${c.pos.x},${c.pos.y}`),
  );

  // Place windows with spacing enforcement
  const windowPositions: TileCoord[] = [];

  for (const candidate of filtered) {
    const tooClose = windowPositions.some((existing) => {
      const dist =
        Math.abs(candidate.pos.x - existing.x) +
        Math.abs(candidate.pos.y - existing.y);
      return dist < BSP.WINDOW_MIN_SPACING;
    });
    if (tooClose) continue;

    if (rng() < BSP.WINDOW_PROBABILITY) {
      tiles[candidate.pos.y][candidate.pos.x] = TileType.Window;
      windowPositions.push(candidate.pos);

      const roomIdx = findRoomAtInterior(
        rooms,
        candidate.interiorX,
        candidate.interiorY,
      );
      if (roomIdx < 0) continue;
      entryPoints.push({
        position: candidate.pos,
        type: 'window',
        facingDirection: candidate.dir,
        roomIndex: roomIdx,
        barricaded: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Room graph utility
// ---------------------------------------------------------------------------

/**
 * Build a room connectivity graph from a building's entry points.
 *
 * Interior doors create two entry points at the same position with different
 * room indices, forming a connection edge.
 */
export function buildRoomGraph(building: Building): RoomConnection[] {
  const byPosition = new Map<string, EntryPoint[]>();

  for (const ep of building.entryPoints) {
    if (ep.type === 'door') {
      const key = `${ep.position.x},${ep.position.y}`;
      const list = byPosition.get(key) ?? [];
      list.push(ep);
      byPosition.set(key, list);
    }
  }

  const connections: RoomConnection[] = [];
  for (const [, eps] of byPosition) {
    if (eps.length === 2 && eps[0].roomIndex !== eps[1].roomIndex) {
      connections.push({
        roomIndexA: eps[0].roomIndex,
        roomIndexB: eps[1].roomIndex,
        doorPosition: eps[0].position,
      });
    }
  }

  return connections;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Subdivide a building into rooms using BSP.
 *
 * Mutates:
 * - `building.rooms` — populated with Room objects
 * - `building.entryPoints` — populated with doors and windows
 * - `tiles` — Wall, Floor, Door, Window written for the building footprint
 */
export function generateBuildingInterior(
  building: Building,
  buildingClass: BuildingClass,
  tiles: TileType[][],
  rng: PRNG,
): void {
  // Clear any existing data
  building.rooms = [];
  building.entryPoints = [];

  // Skip buildings too small to form a valid room
  if (building.width < BSP.MIN_ROOM_SIZE || building.height < BSP.MIN_ROOM_SIZE) {
    return;
  }

  // Build BSP tree
  const rootRect: BSPRect = {
    x: building.origin.x,
    y: building.origin.y,
    width: building.width,
    height: building.height,
  };
  const tree = splitPartition(rootRect, 0, rng);

  // Collect leaves and assign room types
  const leaves = collectLeaves(tree);
  const roomTypes = assignRoomTypes(leaves, buildingClass, rng);

  // Create Room objects
  const rooms: Room[] = leaves.map((leaf, i) => ({
    origin: { x: leaf.rect.x, y: leaf.rect.y },
    width: leaf.rect.width,
    height: leaf.rect.height,
    roomType: roomTypes[i],
    objectIndices: [],
  }));

  building.rooms = rooms;

  // Write tiles: walls first, then carve floors
  writeBuildingTiles(building, rooms, tiles);

  // Place interior doors at partition boundaries
  placeInteriorDoors(tree, rooms, tiles, building.entryPoints, rng);

  // Place exterior entrance door
  placeExteriorEntrance(building, rooms, tiles, building.entryPoints, rng);

  // Place windows on exterior walls
  placeWindows(building, rooms, tiles, building.entryPoints, rng);
}

/**
 * Generate interiors for all buildings in a city layout.
 *
 * @param cityLayout  The city layout to modify (tiles and buildings mutated).
 * @param buildingClasses  Map of building ID to class. Missing IDs default to 'residential'.
 * @param rng  Seeded PRNG.
 */
export function generateAllInteriors(
  cityLayout: CityLayout,
  buildingClasses: Map<string, BuildingClass>,
  rng: PRNG,
): void {
  for (const building of cityLayout.buildings) {
    const buildingClass = buildingClasses.get(building.id) ?? 'residential';
    generateBuildingInterior(building, buildingClass, cityLayout.tiles, rng);
  }
}
