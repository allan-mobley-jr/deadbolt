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
// Tile grid writing
// ---------------------------------------------------------------------------

/**
 * Fill the building footprint with walls, then carve floor interiors.
 */
function writeBuildingTiles(
  building: Building,
  rooms: Room[],
  tiles: TileType[][],
): void {
  const gridH = tiles.length;
  const gridW = gridH > 0 ? tiles[0].length : 0;

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

  const gridH = tiles.length;
  const gridW = gridH > 0 ? tiles[0].length : 0;
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

  // Create entry points for both adjacent rooms
  if (node.splitHorizontal) {
    const topIdx = findRoomAtInterior(rooms, door.x, door.y - 1);
    const bottomIdx = findRoomAtInterior(rooms, door.x, door.y + 1);

    if (topIdx >= 0) {
      entryPoints.push({
        position: { x: door.x, y: door.y },
        type: 'door',
        facingDirection: 'south',
        roomIndex: topIdx,
        barricaded: false,
      });
    }
    if (bottomIdx >= 0) {
      entryPoints.push({
        position: { x: door.x, y: door.y },
        type: 'door',
        facingDirection: 'north',
        roomIndex: bottomIdx,
        barricaded: false,
      });
    }
  } else {
    const leftIdx = findRoomAtInterior(rooms, door.x - 1, door.y);
    const rightIdx = findRoomAtInterior(rooms, door.x + 1, door.y);

    if (leftIdx >= 0) {
      entryPoints.push({
        position: { x: door.x, y: door.y },
        type: 'door',
        facingDirection: 'east',
        roomIndex: leftIdx,
        barricaded: false,
      });
    }
    if (rightIdx >= 0) {
      entryPoints.push({
        position: { x: door.x, y: door.y },
        type: 'door',
        facingDirection: 'west',
        roomIndex: rightIdx,
        barricaded: false,
      });
    }
  }
}

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
  const bx = building.origin.x;
  const by = building.origin.y;
  const bw = building.width;
  const bh = building.height;
  const gridH = tiles.length;
  const gridW = gridH > 0 ? tiles[0].length : 0;

  interface DoorCandidate {
    pos: TileCoord;
    dir: Direction;
    interiorX: number;
    interiorY: number;
    facesRoad: boolean;
  }

  const candidates: DoorCandidate[] = [];

  // North wall
  for (let x = bx + 1; x < bx + bw - 1; x++) {
    const outsideY = by - 1;
    const insideY = by + 1;
    if (outsideY >= 0 && insideY < gridH && x >= 0 && x < gridW) {
      const outside = tiles[outsideY][x];
      if (tiles[insideY][x] === TileType.Floor) {
        candidates.push({
          pos: { x, y: by },
          dir: 'north',
          interiorX: x,
          interiorY: insideY,
          facesRoad: outside === TileType.Road || outside === TileType.Sidewalk,
        });
      }
    }
  }

  // South wall
  for (let x = bx + 1; x < bx + bw - 1; x++) {
    const wy = by + bh - 1;
    const outsideY = wy + 1;
    const insideY = wy - 1;
    if (outsideY < gridH && insideY >= 0 && x >= 0 && x < gridW) {
      const outside = tiles[outsideY][x];
      if (tiles[insideY][x] === TileType.Floor) {
        candidates.push({
          pos: { x, y: wy },
          dir: 'south',
          interiorX: x,
          interiorY: insideY,
          facesRoad: outside === TileType.Road || outside === TileType.Sidewalk,
        });
      }
    }
  }

  // West wall
  for (let y = by + 1; y < by + bh - 1; y++) {
    const outsideX = bx - 1;
    const insideX = bx + 1;
    if (outsideX >= 0 && insideX < gridW && y >= 0 && y < gridH) {
      const outside = tiles[y][outsideX];
      if (tiles[y][insideX] === TileType.Floor) {
        candidates.push({
          pos: { x: bx, y },
          dir: 'west',
          interiorX: insideX,
          interiorY: y,
          facesRoad: outside === TileType.Road || outside === TileType.Sidewalk,
        });
      }
    }
  }

  // East wall
  for (let y = by + 1; y < by + bh - 1; y++) {
    const wx = bx + bw - 1;
    const outsideX = wx + 1;
    const insideX = wx - 1;
    if (outsideX < gridW && insideX >= 0 && y >= 0 && y < gridH) {
      const outside = tiles[y][outsideX];
      if (tiles[y][insideX] === TileType.Floor) {
        candidates.push({
          pos: { x: wx, y },
          dir: 'east',
          interiorX: insideX,
          interiorY: y,
          facesRoad: outside === TileType.Road || outside === TileType.Sidewalk,
        });
      }
    }
  }

  if (candidates.length === 0) return;

  // Prefer road-facing candidates
  const roadFacing = candidates.filter((c) => c.facesRoad);
  const pool = roadFacing.length > 0 ? roadFacing : candidates;

  const chosen = pool[Math.floor(rng() * pool.length)];
  tiles[chosen.pos.y][chosen.pos.x] = TileType.Door;

  const roomIdx = findRoomAtInterior(
    rooms,
    chosen.interiorX,
    chosen.interiorY,
  );
  if (roomIdx < 0) return; // Interior tile not inside any room — skip
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
  const bx = building.origin.x;
  const by = building.origin.y;
  const bw = building.width;
  const bh = building.height;
  const gridH = tiles.length;
  const gridW = gridH > 0 ? tiles[0].length : 0;

  interface WindowCandidate {
    pos: TileCoord;
    dir: Direction;
    interiorX: number;
    interiorY: number;
  }

  const candidates: WindowCandidate[] = [];

  const isWindowEligible = (tileType: TileType) =>
    tileType === TileType.Road ||
    tileType === TileType.Sidewalk ||
    tileType === TileType.Empty;

  // North wall
  for (let x = bx + 1; x < bx + bw - 1; x++) {
    if (by - 1 < 0 || by + 1 >= gridH || x < 0 || x >= gridW) continue;
    if (tiles[by][x] !== TileType.Wall) continue;
    if (
      tiles[by + 1][x] === TileType.Floor &&
      isWindowEligible(tiles[by - 1][x])
    ) {
      candidates.push({
        pos: { x, y: by },
        dir: 'north',
        interiorX: x,
        interiorY: by + 1,
      });
    }
  }

  // South wall
  {
    const wy = by + bh - 1;
    for (let x = bx + 1; x < bx + bw - 1; x++) {
      if (wy + 1 >= gridH || wy - 1 < 0 || x < 0 || x >= gridW) continue;
      if (tiles[wy][x] !== TileType.Wall) continue;
      if (
        tiles[wy - 1][x] === TileType.Floor &&
        isWindowEligible(tiles[wy + 1][x])
      ) {
        candidates.push({
          pos: { x, y: wy },
          dir: 'south',
          interiorX: x,
          interiorY: wy - 1,
        });
      }
    }
  }

  // West wall
  for (let y = by + 1; y < by + bh - 1; y++) {
    if (bx - 1 < 0 || bx + 1 >= gridW || y < 0 || y >= gridH) continue;
    if (tiles[y][bx] !== TileType.Wall) continue;
    if (
      tiles[y][bx + 1] === TileType.Floor &&
      isWindowEligible(tiles[y][bx - 1])
    ) {
      candidates.push({
        pos: { x: bx, y },
        dir: 'west',
        interiorX: bx + 1,
        interiorY: y,
      });
    }
  }

  // East wall
  {
    const wx = bx + bw - 1;
    for (let y = by + 1; y < by + bh - 1; y++) {
      if (wx + 1 >= gridW || wx - 1 < 0 || y < 0 || y >= gridH) continue;
      if (tiles[y][wx] !== TileType.Wall) continue;
      if (
        tiles[y][wx - 1] === TileType.Floor &&
        isWindowEligible(tiles[y][wx + 1])
      ) {
        candidates.push({
          pos: { x: wx, y },
          dir: 'east',
          interiorX: wx - 1,
          interiorY: y,
        });
      }
    }
  }

  // Collect positions of existing doors for adjacency filtering
  const doorPositions = new Set<string>();
  for (const ep of entryPoints) {
    if (ep.type === 'door') {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          doorPositions.add(
            `${ep.position.x + dx},${ep.position.y + dy}`,
          );
        }
      }
    }
  }

  const filtered = candidates.filter(
    (c) => !doorPositions.has(`${c.pos.x},${c.pos.y}`),
  );

  // Place windows with spacing enforcement
  const windowPositions: TileCoord[] = [];

  for (const candidate of filtered) {
    let tooClose = false;
    for (const existing of windowPositions) {
      const dist =
        Math.abs(candidate.pos.x - existing.x) +
        Math.abs(candidate.pos.y - existing.y);
      if (dist < BSP.WINDOW_MIN_SPACING) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    if (rng() < BSP.WINDOW_PROBABILITY) {
      tiles[candidate.pos.y][candidate.pos.x] = TileType.Window;
      windowPositions.push(candidate.pos);

      const roomIdx = findRoomAtInterior(
        rooms,
        candidate.interiorX,
        candidate.interiorY,
      );
      if (roomIdx < 0) continue; // Interior tile not inside any room — skip
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
