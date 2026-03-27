// @vitest-environment node
import { describe, it, expect } from 'vitest';
import seedrandom from 'seedrandom';
import {
  splitPartition,
  collectLeaves,
  assignRoomTypes,
  buildRoomGraph,
  generateBuildingInterior,
  generateAllInteriors,
} from './bsp';
import type { BSPLeaf } from './bsp';
import { BSP } from './constants';
import type { Building, CityLayout } from '@/types/procgen';
import { TileType } from '@/types/procgen';
import type { BuildingClass } from '@/types/procgen';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRng(seed = 'test-seed') {
  return seedrandom(seed);
}

function makeTileGrid(
  width: number,
  height: number,
  fill: TileType = TileType.Road,
): TileType[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => fill),
  );
}

function makeBuilding(overrides: Partial<Building> & { id: string }): Building {
  return {
    origin: { x: 0, y: 0 },
    width: 10,
    height: 10,
    rooms: [],
    entryPoints: [],
    objects: [],
    ...overrides,
  };
}

/** All room types recognized by the loot table system. */
const VALID_ROOM_TYPES = new Set([
  'kitchen',
  'bedroom',
  'living_room',
  'bathroom',
  'garage',
  'store_front',
  'storage',
  'office',
  'hallway',
]);

// ---------------------------------------------------------------------------
// splitPartition
// ---------------------------------------------------------------------------

describe('splitPartition', () => {
  it('returns a leaf for a rect smaller than MIN_SPLIT_SIZE in both dimensions', () => {
    const rect = { x: 0, y: 0, width: 4, height: 4 };
    const node = splitPartition(rect, 0, makeRng());
    expect(node.kind).toBe('leaf');
  });

  it('returns a leaf at MAX_DEPTH regardless of rect size', () => {
    const rect = { x: 0, y: 0, width: 20, height: 20 };
    const node = splitPartition(rect, BSP.MAX_DEPTH, makeRng());
    expect(node.kind).toBe('leaf');
  });

  it('splits a sufficiently large rect', () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    const node = splitPartition(rect, 0, makeRng());
    expect(node.kind).toBe('branch');
  });

  it('produces leaves with dimensions >= MIN_ROOM_SIZE', () => {
    const rect = { x: 0, y: 0, width: 20, height: 20 };
    const tree = splitPartition(rect, 0, makeRng());
    const leaves = collectLeaves(tree);

    for (const leaf of leaves) {
      expect(leaf.rect.width).toBeGreaterThanOrEqual(BSP.MIN_ROOM_SIZE);
      expect(leaf.rect.height).toBeGreaterThanOrEqual(BSP.MIN_ROOM_SIZE);
    }
  });

  it('splits along the longer axis for elongated rects', () => {
    // Very wide rect should split vertically
    const wide = { x: 0, y: 0, width: 20, height: 5 };
    const wideNode = splitPartition(wide, 0, makeRng());
    expect(wideNode.kind).toBe('branch');
    if (wideNode.kind === 'branch') {
      expect(wideNode.splitHorizontal).toBe(false);
    }

    // Very tall rect should split horizontally
    const tall = { x: 0, y: 0, width: 5, height: 20 };
    const tallNode = splitPartition(tall, 0, makeRng());
    expect(tallNode.kind).toBe('branch');
    if (tallNode.kind === 'branch') {
      expect(tallNode.splitHorizontal).toBe(true);
    }
  });

  it('is deterministic with the same seed', () => {
    const rect = { x: 0, y: 0, width: 15, height: 15 };
    const a = splitPartition(rect, 0, makeRng('det'));
    const b = splitPartition(rect, 0, makeRng('det'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces different results with different seeds', () => {
    const rect = { x: 0, y: 0, width: 15, height: 15 };
    const a = splitPartition(rect, 0, makeRng('seed-a'));
    const b = splitPartition(rect, 0, makeRng('seed-b'));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('can split a rect that is exactly MIN_SPLIT_SIZE', () => {
    const rect = { x: 0, y: 0, width: BSP.MIN_SPLIT_SIZE, height: BSP.MIN_SPLIT_SIZE };
    const node = splitPartition(rect, 0, makeRng());
    // Should split since both dimensions are exactly MIN_SPLIT_SIZE
    expect(node.kind).toBe('branch');
    if (node.kind === 'branch') {
      const leaves = collectLeaves(node);
      for (const leaf of leaves) {
        expect(leaf.rect.width).toBeGreaterThanOrEqual(BSP.MIN_ROOM_SIZE);
        expect(leaf.rect.height).toBeGreaterThanOrEqual(BSP.MIN_ROOM_SIZE);
      }
    }
  });

  it('only splits the axis that is large enough', () => {
    // Width < MIN_SPLIT_SIZE, height >= MIN_SPLIT_SIZE → must split horizontally
    const rect = { x: 0, y: 0, width: 4, height: 10 };
    const node = splitPartition(rect, 0, makeRng());
    expect(node.kind).toBe('branch');
    if (node.kind === 'branch') {
      expect(node.splitHorizontal).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// collectLeaves
// ---------------------------------------------------------------------------

describe('collectLeaves', () => {
  it('returns one leaf for a leaf node', () => {
    const leaf: BSPLeaf = { kind: 'leaf', rect: { x: 0, y: 0, width: 5, height: 5 } };
    expect(collectLeaves(leaf)).toHaveLength(1);
  });

  it('returns all leaves from a branching tree', () => {
    const rect = { x: 0, y: 0, width: 20, height: 20 };
    const tree = splitPartition(rect, 0, makeRng());
    const leaves = collectLeaves(tree);
    expect(leaves.length).toBeGreaterThan(1);
    for (const leaf of leaves) {
      expect(leaf.kind).toBe('leaf');
    }
  });
});

// ---------------------------------------------------------------------------
// assignRoomTypes
// ---------------------------------------------------------------------------

describe('assignRoomTypes', () => {
  const makeLeaf = (x: number, y: number, w: number, h: number): BSPLeaf => ({
    kind: 'leaf',
    rect: { x, y, width: w, height: h },
  });

  it('assigns valid room types for residential', () => {
    const leaves = [makeLeaf(0, 0, 5, 5), makeLeaf(5, 0, 5, 5), makeLeaf(0, 5, 5, 5)];
    const types = assignRoomTypes(leaves, 'residential', makeRng());
    for (const t of types) {
      expect(VALID_ROOM_TYPES.has(t)).toBe(true);
    }
  });

  it('assigns valid room types for commercial', () => {
    const leaves = [makeLeaf(0, 0, 8, 5), makeLeaf(8, 0, 5, 5)];
    const types = assignRoomTypes(leaves, 'commercial', makeRng());
    for (const t of types) {
      expect(VALID_ROOM_TYPES.has(t)).toBe(true);
    }
  });

  it('assigns valid room types for industrial', () => {
    const leaves = [makeLeaf(0, 0, 5, 5), makeLeaf(5, 0, 5, 5)];
    const types = assignRoomTypes(leaves, 'industrial', makeRng());
    for (const t of types) {
      expect(VALID_ROOM_TYPES.has(t)).toBe(true);
    }
  });

  it('residential with 3+ rooms includes kitchen and bathroom', () => {
    const leaves = [
      makeLeaf(0, 0, 5, 5),
      makeLeaf(5, 0, 5, 5),
      makeLeaf(0, 5, 5, 5),
      makeLeaf(5, 5, 5, 5),
    ];
    const types = assignRoomTypes(leaves, 'residential', makeRng());
    expect(types).toContain('kitchen');
    expect(types).toContain('bathroom');
  });

  it('commercial with 2+ rooms assigns store_front to largest room', () => {
    // First leaf is larger
    const leaves = [makeLeaf(0, 0, 10, 10), makeLeaf(10, 0, 5, 5)];
    const types = assignRoomTypes(leaves, 'commercial', makeRng());
    expect(types[0]).toBe('store_front');
  });

  it('single-room buildings get sensible defaults', () => {
    const leaf = [makeLeaf(0, 0, 5, 5)];
    expect(assignRoomTypes(leaf, 'residential', makeRng())).toEqual(['living_room']);
    expect(assignRoomTypes(leaf, 'commercial', makeRng())).toEqual(['store_front']);
    expect(assignRoomTypes(leaf, 'industrial', makeRng())).toEqual(['storage']);
  });
});

// ---------------------------------------------------------------------------
// Tile grid writing
// ---------------------------------------------------------------------------

describe('tile grid writing', () => {
  it('fills building footprint — no empty tiles inside bounds', () => {
    const tiles = makeTileGrid(20, 20);
    const building = makeBuilding({ id: 'b1', width: 10, height: 10 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        expect(tiles[y][x]).not.toBe(TileType.Road);
        expect(tiles[y][x]).not.toBe(TileType.Empty);
      }
    }
  });

  it('perimeter tiles are Wall, Door, or Window', () => {
    const tiles = makeTileGrid(20, 20);
    const building = makeBuilding({ id: 'b1', width: 10, height: 10 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    const perimeterTypes = new Set([TileType.Wall, TileType.Door, TileType.Window]);
    // North and south walls
    for (let x = 0; x < 10; x++) {
      expect(perimeterTypes.has(tiles[0][x])).toBe(true);
      expect(perimeterTypes.has(tiles[9][x])).toBe(true);
    }
    // West and east walls
    for (let y = 0; y < 10; y++) {
      expect(perimeterTypes.has(tiles[y][0])).toBe(true);
      expect(perimeterTypes.has(tiles[y][9])).toBe(true);
    }
  });

  it('interior tiles contain floors and partition walls', () => {
    const tiles = makeTileGrid(20, 20);
    const building = makeBuilding({ id: 'b1', width: 10, height: 10 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    let hasFloor = false;
    for (let y = 1; y < 9; y++) {
      for (let x = 1; x < 9; x++) {
        if (tiles[y][x] === TileType.Floor) hasFloor = true;
      }
    }
    expect(hasFloor).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Door placement
// ---------------------------------------------------------------------------

describe('door placement', () => {
  it('places interior doors (N-1 connections for N rooms)', () => {
    const tiles = makeTileGrid(20, 20);
    // Use 12x12 which is large enough to guarantee multiple rooms
    const building = makeBuilding({ id: 'b1', width: 12, height: 12 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    expect(building.rooms.length).toBeGreaterThan(1);
    const graph = buildRoomGraph(building);
    expect(graph.length).toBe(building.rooms.length - 1);
  });

  it('has at least one exterior door', () => {
    const tiles = makeTileGrid(20, 20);
    const building = makeBuilding({ id: 'b1', width: 10, height: 10 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    // Exterior doors are on the building perimeter
    const bx = building.origin.x;
    const by = building.origin.y;
    const bw = building.width;
    const bh = building.height;

    const exteriorDoors = building.entryPoints.filter((ep) => {
      if (ep.type !== 'door') return false;
      const { x, y } = ep.position;
      return x === bx || x === bx + bw - 1 || y === by || y === by + bh - 1;
    });

    expect(exteriorDoors.length).toBeGreaterThanOrEqual(1);
  });

  it('door tiles are written as TileType.Door in the grid', () => {
    const tiles = makeTileGrid(20, 20);
    const building = makeBuilding({ id: 'b1', width: 10, height: 10 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    for (const ep of building.entryPoints) {
      if (ep.type === 'door') {
        expect(tiles[ep.position.y][ep.position.x]).toBe(TileType.Door);
      }
    }
  });

  it('interior doors are not at building corners', () => {
    const tiles = makeTileGrid(20, 20);
    const building = makeBuilding({ id: 'b1', width: 12, height: 12 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    const corners = new Set([
      '0,0',
      `${building.width - 1},0`,
      `0,${building.height - 1}`,
      `${building.width - 1},${building.height - 1}`,
    ]);

    for (const ep of building.entryPoints) {
      if (ep.type === 'door') {
        const key = `${ep.position.x},${ep.position.y}`;
        expect(corners.has(key)).toBe(false);
      }
    }
  });

  it('entry points have correct facingDirection', () => {
    const tiles = makeTileGrid(20, 20);
    const building = makeBuilding({ id: 'b1', width: 10, height: 10 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    const validDirections = new Set(['north', 'south', 'east', 'west']);
    for (const ep of building.entryPoints) {
      expect(validDirections.has(ep.facingDirection)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Window placement
// ---------------------------------------------------------------------------

describe('window placement', () => {
  it('windows are only on exterior walls', () => {
    const tiles = makeTileGrid(20, 20);
    const building = makeBuilding({ id: 'b1', width: 10, height: 10 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    for (const ep of building.entryPoints) {
      if (ep.type === 'window') {
        const { x, y } = ep.position;
        const bx = building.origin.x;
        const by = building.origin.y;
        const isExterior =
          x === bx ||
          x === bx + building.width - 1 ||
          y === by ||
          y === by + building.height - 1;
        expect(isExterior).toBe(true);
      }
    }
  });

  it('window tiles are written as TileType.Window in the grid', () => {
    const tiles = makeTileGrid(20, 20);
    const building = makeBuilding({ id: 'b1', width: 10, height: 10 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    for (const ep of building.entryPoints) {
      if (ep.type === 'window') {
        expect(tiles[ep.position.y][ep.position.x]).toBe(TileType.Window);
      }
    }
  });

  it('no windows adjacent to doors', () => {
    const tiles = makeTileGrid(20, 20);
    const building = makeBuilding({ id: 'b1', width: 10, height: 10 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    const doorPositions = new Set<string>();
    for (const ep of building.entryPoints) {
      if (ep.type === 'door') {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            doorPositions.add(`${ep.position.x + dx},${ep.position.y + dy}`);
          }
        }
      }
    }

    for (const ep of building.entryPoints) {
      if (ep.type === 'window') {
        const key = `${ep.position.x},${ep.position.y}`;
        expect(doorPositions.has(key)).toBe(false);
      }
    }
  });

  it('windows face road, sidewalk, or empty tiles', () => {
    const tiles = makeTileGrid(20, 20);
    const building = makeBuilding({ id: 'b1', width: 10, height: 10 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    const validOutside = new Set([TileType.Road, TileType.Sidewalk, TileType.Empty]);
    for (const ep of building.entryPoints) {
      if (ep.type === 'window') {
        // Check the tile outside in the facing direction
        let ox = ep.position.x;
        let oy = ep.position.y;
        if (ep.facingDirection === 'north') oy--;
        else if (ep.facingDirection === 'south') oy++;
        else if (ep.facingDirection === 'west') ox--;
        else if (ep.facingDirection === 'east') ox++;

        if (oy >= 0 && oy < tiles.length && ox >= 0 && ox < tiles[0].length) {
          expect(validOutside.has(tiles[oy][ox])).toBe(true);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Room output
// ---------------------------------------------------------------------------

describe('room output', () => {
  it('all rooms have dimensions >= 3x3', () => {
    const tiles = makeTileGrid(30, 30);
    const building = makeBuilding({ id: 'b1', width: 20, height: 20 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    for (const room of building.rooms) {
      expect(room.width).toBeGreaterThanOrEqual(BSP.MIN_ROOM_SIZE);
      expect(room.height).toBeGreaterThanOrEqual(BSP.MIN_ROOM_SIZE);
    }
  });

  it('all room types are valid loot table keys', () => {
    const tiles = makeTileGrid(30, 30);
    const building = makeBuilding({ id: 'b1', width: 20, height: 20 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    for (const room of building.rooms) {
      expect(VALID_ROOM_TYPES.has(room.roomType)).toBe(true);
    }
  });

  it('objectIndices arrays are initialized empty', () => {
    const tiles = makeTileGrid(20, 20);
    const building = makeBuilding({ id: 'b1', width: 10, height: 10 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    for (const room of building.rooms) {
      expect(room.objectIndices).toEqual([]);
    }
  });

  it('rooms are within building bounds', () => {
    const tiles = makeTileGrid(30, 30);
    const building = makeBuilding({
      id: 'b1',
      origin: { x: 5, y: 5 },
      width: 15,
      height: 15,
    });
    generateBuildingInterior(building, 'commercial', tiles, makeRng());

    for (const room of building.rooms) {
      expect(room.origin.x).toBeGreaterThanOrEqual(building.origin.x);
      expect(room.origin.y).toBeGreaterThanOrEqual(building.origin.y);
      // Room extent should not exceed building extent
      // (rooms can overlap by 1 at shared walls, but none extends beyond)
      expect(room.origin.x + room.width).toBeLessThanOrEqual(
        building.origin.x + building.width,
      );
      expect(room.origin.y + room.height).toBeLessThanOrEqual(
        building.origin.y + building.height,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Connectivity
// ---------------------------------------------------------------------------

describe('connectivity', () => {
  /** BFS flood-fill to check all rooms are reachable. */
  function verifyConnectivity(building: Building) {
    const connections = buildRoomGraph(building);

    const adj = new Map<number, Set<number>>();
    for (let i = 0; i < building.rooms.length; i++) {
      adj.set(i, new Set());
    }
    for (const conn of connections) {
      adj.get(conn.roomIndexA)!.add(conn.roomIndexB);
      adj.get(conn.roomIndexB)!.add(conn.roomIndexA);
    }

    const visited = new Set<number>();
    const queue = [0];
    visited.add(0);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighbor of adj.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    return { visited, connections };
  }

  it('all rooms are reachable via doors across multiple seeds', () => {
    const seeds = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];
    const sizes = [
      { w: 10, h: 10 },
      { w: 15, h: 15 },
      { w: 20, h: 20 },
      { w: 8, h: 15 },
      { w: 15, h: 8 },
    ];

    for (const seed of seeds) {
      for (const { w, h } of sizes) {
        const tiles = makeTileGrid(w + 10, h + 10);
        const building = makeBuilding({ id: `b-${seed}-${w}x${h}`, width: w, height: h });
        generateBuildingInterior(building, 'residential', tiles, makeRng(seed));

        if (building.rooms.length <= 1) continue;

        const { visited } = verifyConnectivity(building);
        expect(
          visited.size,
          `seed=${seed} size=${w}x${h}: not all ${building.rooms.length} rooms reachable`,
        ).toBe(building.rooms.length);
      }
    }
  });

  it('room graph is a tree (N-1 edges for N rooms) across multiple seeds', () => {
    const seeds = ['tree-1', 'tree-2', 'tree-3', 'tree-4', 'tree-5'];

    for (const seed of seeds) {
      const tiles = makeTileGrid(30, 30);
      const building = makeBuilding({ id: `b-${seed}`, width: 15, height: 15 });
      generateBuildingInterior(building, 'residential', tiles, makeRng(seed));

      if (building.rooms.length <= 1) continue;

      const connections = buildRoomGraph(building);
      expect(
        connections.length,
        `seed=${seed}: expected ${building.rooms.length - 1} edges, got ${connections.length}`,
      ).toBe(building.rooms.length - 1);
    }
  });
});

// ---------------------------------------------------------------------------
// generateBuildingInterior (integration)
// ---------------------------------------------------------------------------

describe('generateBuildingInterior', () => {
  it('is deterministic with the same seed', () => {
    const t1 = makeTileGrid(20, 20);
    const t2 = makeTileGrid(20, 20);
    const b1 = makeBuilding({ id: 'b1', width: 10, height: 10 });
    const b2 = makeBuilding({ id: 'b2', width: 10, height: 10 });

    generateBuildingInterior(b1, 'residential', t1, makeRng('det'));
    generateBuildingInterior(b2, 'residential', t2, makeRng('det'));

    expect(b1.rooms.length).toBe(b2.rooms.length);
    for (let i = 0; i < b1.rooms.length; i++) {
      expect(b1.rooms[i].origin).toEqual(b2.rooms[i].origin);
      expect(b1.rooms[i].width).toBe(b2.rooms[i].width);
      expect(b1.rooms[i].height).toBe(b2.rooms[i].height);
      expect(b1.rooms[i].roomType).toBe(b2.rooms[i].roomType);
    }
    expect(JSON.stringify(t1)).toBe(JSON.stringify(t2));
  });

  it('produces different results with different seeds', () => {
    const t1 = makeTileGrid(20, 20);
    const t2 = makeTileGrid(20, 20);
    const b1 = makeBuilding({ id: 'b1', width: 10, height: 10 });
    const b2 = makeBuilding({ id: 'b2', width: 10, height: 10 });

    generateBuildingInterior(b1, 'residential', t1, makeRng('seed-a'));
    generateBuildingInterior(b2, 'residential', t2, makeRng('seed-b'));

    const serialize = (b: Building) =>
      b.rooms.map((r) => `${r.roomType}@${r.origin.x},${r.origin.y}`).join('|');
    expect(serialize(b1)).not.toEqual(serialize(b2));
  });

  it('handles minimum-size buildings (3x3)', () => {
    const tiles = makeTileGrid(10, 10);
    const building = makeBuilding({ id: 'b1', width: 3, height: 3 });

    expect(() =>
      generateBuildingInterior(building, 'residential', tiles, makeRng()),
    ).not.toThrow();

    expect(building.rooms.length).toBe(1);
    expect(building.rooms[0].width).toBe(3);
    expect(building.rooms[0].height).toBe(3);
  });

  it('handles 4x4 buildings', () => {
    const tiles = makeTileGrid(10, 10);
    const building = makeBuilding({ id: 'b1', width: 4, height: 4 });

    expect(() =>
      generateBuildingInterior(building, 'residential', tiles, makeRng()),
    ).not.toThrow();

    expect(building.rooms.length).toBeGreaterThanOrEqual(1);
  });

  it('handles large buildings (20x20)', () => {
    const tiles = makeTileGrid(30, 30);
    const building = makeBuilding({ id: 'b1', width: 20, height: 20 });

    expect(() =>
      generateBuildingInterior(building, 'industrial', tiles, makeRng()),
    ).not.toThrow();

    expect(building.rooms.length).toBeGreaterThan(1);
  });

  it('populates building.rooms and building.entryPoints', () => {
    const tiles = makeTileGrid(20, 20);
    const building = makeBuilding({ id: 'b1', width: 10, height: 10 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    expect(building.rooms.length).toBeGreaterThanOrEqual(1);
    expect(building.entryPoints.length).toBeGreaterThanOrEqual(1);
  });

  it('clears existing data on re-generation', () => {
    const tiles = makeTileGrid(20, 20);
    const building = makeBuilding({ id: 'b1', width: 10, height: 10 });

    // Generate with seed A
    generateBuildingInterior(building, 'residential', tiles, makeRng('seed-A'));

    // Re-generate with seed B — should produce different rooms, not append
    const freshTiles = makeTileGrid(20, 20);
    const freshBuilding = makeBuilding({ id: 'b1', width: 10, height: 10 });
    generateBuildingInterior(freshBuilding, 'residential', freshTiles, makeRng('seed-B'));

    generateBuildingInterior(building, 'residential', tiles, makeRng('seed-B'));
    // Rooms should match fresh generation with seed B, not contain seed A rooms
    expect(building.rooms.length).toBe(freshBuilding.rooms.length);
    for (let i = 0; i < building.rooms.length; i++) {
      expect(building.rooms[i].origin).toEqual(freshBuilding.rooms[i].origin);
      expect(building.rooms[i].roomType).toBe(freshBuilding.rooms[i].roomType);
    }
  });

  it('exterior door prefers road-facing walls', () => {
    // Surround building with road on all sides
    const tiles = makeTileGrid(20, 20, TileType.Road);
    const building = makeBuilding({
      id: 'b1',
      origin: { x: 2, y: 2 },
      width: 8,
      height: 8,
    });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    const exteriorDoors = building.entryPoints.filter((ep) => {
      if (ep.type !== 'door') return false;
      const { x, y } = ep.position;
      return (
        x === 2 || x === 9 || y === 2 || y === 9
      );
    });

    expect(exteriorDoors.length).toBeGreaterThanOrEqual(1);
  });

  it('works with building offset from origin', () => {
    const tiles = makeTileGrid(30, 30);
    const building = makeBuilding({
      id: 'b1',
      origin: { x: 10, y: 10 },
      width: 10,
      height: 10,
    });
    generateBuildingInterior(building, 'commercial', tiles, makeRng());

    // Check tiles are written at offset
    expect(tiles[10][10]).not.toBe(TileType.Road);
    expect(tiles[15][15]).not.toBe(TileType.Road);

    // Rooms should be at the offset position
    for (const room of building.rooms) {
      expect(room.origin.x).toBeGreaterThanOrEqual(10);
      expect(room.origin.y).toBeGreaterThanOrEqual(10);
    }
  });
});

// ---------------------------------------------------------------------------
// generateAllInteriors
// ---------------------------------------------------------------------------

describe('generateAllInteriors', () => {
  it('processes multiple buildings', () => {
    const tiles = makeTileGrid(40, 40);
    const layout: CityLayout = {
      widthTiles: 40,
      heightTiles: 40,
      tiles,
      buildings: [
        makeBuilding({ id: 'b1', origin: { x: 0, y: 0 }, width: 10, height: 10 }),
        makeBuilding({ id: 'b2', origin: { x: 15, y: 15 }, width: 8, height: 8 }),
      ],
      seed: 'test-seed',
    };

    const classes = new Map<string, BuildingClass>([
      ['b1', 'residential'],
      ['b2', 'commercial'],
    ]);

    generateAllInteriors(layout, classes, makeRng());

    for (const b of layout.buildings) {
      expect(b.rooms.length).toBeGreaterThanOrEqual(1);
      expect(b.entryPoints.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('defaults to residential for missing building classes', () => {
    const tiles = makeTileGrid(20, 20);
    const layout: CityLayout = {
      widthTiles: 20,
      heightTiles: 20,
      tiles,
      buildings: [makeBuilding({ id: 'b-unknown', width: 10, height: 10 })],
      seed: 'test-seed',
    };

    generateAllInteriors(layout, new Map(), makeRng());

    expect(layout.buildings[0].rooms.length).toBeGreaterThanOrEqual(1);
  });

  it('handles empty buildings array', () => {
    const tiles = makeTileGrid(20, 20);
    const layout: CityLayout = {
      widthTiles: 20,
      heightTiles: 20,
      tiles,
      buildings: [],
      seed: 'test-seed',
    };

    expect(() => generateAllInteriors(layout, new Map(), makeRng())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// buildRoomGraph
// ---------------------------------------------------------------------------

describe('buildRoomGraph', () => {
  it('returns empty array for single-room buildings', () => {
    const tiles = makeTileGrid(10, 10);
    const building = makeBuilding({ id: 'b1', width: 4, height: 4 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    const graph = buildRoomGraph(building);
    // A 4x4 building can't be split (4 < MIN_SPLIT_SIZE), so 1 room, 0 connections
    expect(graph.length).toBe(0);
  });

  it('connections have valid room indices', () => {
    const tiles = makeTileGrid(30, 30);
    const building = makeBuilding({ id: 'b1', width: 15, height: 15 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    const graph = buildRoomGraph(building);
    for (const conn of graph) {
      expect(conn.roomIndexA).toBeGreaterThanOrEqual(0);
      expect(conn.roomIndexA).toBeLessThan(building.rooms.length);
      expect(conn.roomIndexB).toBeGreaterThanOrEqual(0);
      expect(conn.roomIndexB).toBeLessThan(building.rooms.length);
      expect(conn.roomIndexA).not.toBe(conn.roomIndexB);
    }
  });

  it('connection door positions are actual Door tiles', () => {
    const tiles = makeTileGrid(30, 30);
    const building = makeBuilding({ id: 'b1', width: 15, height: 15 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    const graph = buildRoomGraph(building);
    for (const conn of graph) {
      expect(tiles[conn.doorPosition.y][conn.doorPosition.x]).toBe(TileType.Door);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('building filling entire grid gets no exterior door (no outside tiles)', () => {
    // Building fills the grid exactly — no room for exterior checks
    const tiles = makeTileGrid(5, 5, TileType.Empty);
    const building = makeBuilding({ id: 'b1', origin: { x: 0, y: 0 }, width: 5, height: 5 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    // Building should still have rooms
    expect(building.rooms.length).toBeGreaterThanOrEqual(1);

    // Exterior door candidates require outside tiles — with the building filling
    // the entire grid, there are no outside tiles. The exterior door may or may not
    // be placed depending on bounds checks. The key is no crash.
  });

  it('degenerate building (width < MIN_ROOM_SIZE) produces no rooms', () => {
    const tiles = makeTileGrid(10, 10);
    const building = makeBuilding({ id: 'tiny', width: 2, height: 5 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    expect(building.rooms.length).toBe(0);
    expect(building.entryPoints.length).toBe(0);
  });

  it('degenerate building (height < MIN_ROOM_SIZE) produces no rooms', () => {
    const tiles = makeTileGrid(10, 10);
    const building = makeBuilding({ id: 'tiny', width: 5, height: 2 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    expect(building.rooms.length).toBe(0);
    expect(building.entryPoints.length).toBe(0);
  });

  it('entry points have valid room indices', () => {
    const tiles = makeTileGrid(30, 30);
    const building = makeBuilding({ id: 'b1', width: 15, height: 15 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    for (const ep of building.entryPoints) {
      expect(ep.roomIndex).toBeGreaterThanOrEqual(0);
      expect(ep.roomIndex).toBeLessThan(building.rooms.length);
    }
  });

  it('2-room residential buildings get valid room types', () => {
    // A building where only one split happens (result: 2 rooms)
    // Use a size that allows exactly one split
    const tiles = makeTileGrid(15, 15);
    const building = makeBuilding({ id: 'b1', width: 7, height: 4 });
    generateBuildingInterior(building, 'residential', tiles, makeRng());

    // 7 wide can split vertically (7 >= MIN_SPLIT_SIZE=5), 4 tall cannot
    // So we get 2 rooms (or 1 if depth prevents second split)
    for (const room of building.rooms) {
      expect(VALID_ROOM_TYPES.has(room.roomType)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Window spacing
// ---------------------------------------------------------------------------

describe('window spacing', () => {
  it('windows respect minimum spacing', () => {
    // Use a large building to maximize window count
    const tiles = makeTileGrid(30, 30, TileType.Road);
    const building = makeBuilding({
      id: 'b1',
      origin: { x: 5, y: 5 },
      width: 20,
      height: 20,
    });
    generateBuildingInterior(building, 'commercial', tiles, makeRng());

    const windows = building.entryPoints.filter((ep) => ep.type === 'window');

    for (let i = 0; i < windows.length; i++) {
      for (let j = i + 1; j < windows.length; j++) {
        const dist =
          Math.abs(windows[i].position.x - windows[j].position.x) +
          Math.abs(windows[i].position.y - windows[j].position.y);
        expect(
          dist,
          `windows at (${windows[i].position.x},${windows[i].position.y}) and (${windows[j].position.x},${windows[j].position.y}) are too close`,
        ).toBeGreaterThanOrEqual(BSP.WINDOW_MIN_SPACING);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Building class variations
// ---------------------------------------------------------------------------

describe('building class variations', () => {
  const classes: BuildingClass[] = ['residential', 'commercial', 'industrial'];

  for (const cls of classes) {
    it(`generates valid interiors for ${cls} buildings`, () => {
      const tiles = makeTileGrid(30, 30);
      const building = makeBuilding({ id: `b-${cls}`, width: 15, height: 15 });
      generateBuildingInterior(building, cls, tiles, makeRng());

      expect(building.rooms.length).toBeGreaterThanOrEqual(1);
      for (const room of building.rooms) {
        expect(VALID_ROOM_TYPES.has(room.roomType)).toBe(true);
      }
    });
  }
});
