// @vitest-environment node
import { describe, it, expect } from 'vitest';
import seedrandom from 'seedrandom';
import {
  computeMaxLootValue,
  getPlaceableTiles,
  placeObjectsInBuilding,
  populateBuildings,
} from './object-placement';
import { OBJECT_PLACEMENT } from './constants';
import { getObjectDef } from './object-defs';
import { ObjectCategory } from '@/types/procgen';
import type { Building, Room, EntryPoint, TileCoord } from '@/types/procgen';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRng(seed = 'test-seed') {
  return seedrandom(seed);
}

function makeEntryPoint(
  x: number,
  y: number,
  roomIndex: number,
  type: 'door' | 'window' = 'door',
): EntryPoint {
  return {
    position: { x, y },
    type,
    facingDirection: 'north',
    roomIndex,
    barricaded: false,
  };
}

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    origin: { x: 0, y: 0 },
    width: 8,
    height: 8,
    roomType: 'living_room',
    objectIndices: [],
    ...overrides,
  };
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

const DEFAULT_SAFEHOUSE_CENTER: TileCoord = { x: 0, y: 0 };

// ---------------------------------------------------------------------------
// computeMaxLootValue
// ---------------------------------------------------------------------------

describe('computeMaxLootValue', () => {
  it('returns NEAR_MAX_LOOT_VALUE for buildings at safehouse', () => {
    const result = computeMaxLootValue({ x: 0, y: 0 }, { x: 0, y: 0 });
    expect(result).toBe(OBJECT_PLACEMENT.NEAR_MAX_LOOT_VALUE);
  });

  it('returns NEAR_MAX_LOOT_VALUE for buildings within near threshold', () => {
    const distance = OBJECT_PLACEMENT.LOOT_DISTANCE_NEAR - 1;
    const result = computeMaxLootValue({ x: distance, y: 0 }, { x: 0, y: 0 });
    expect(result).toBe(OBJECT_PLACEMENT.NEAR_MAX_LOOT_VALUE);
  });

  it('returns 10 for buildings at or beyond far threshold', () => {
    const distance = OBJECT_PLACEMENT.LOOT_DISTANCE_FAR;
    const result = computeMaxLootValue({ x: distance, y: 0 }, { x: 0, y: 0 });
    expect(result).toBe(10);
  });

  it('returns 10 for very distant buildings', () => {
    const result = computeMaxLootValue({ x: 200, y: 200 }, { x: 0, y: 0 });
    expect(result).toBe(10);
  });

  it('linearly interpolates between near and far thresholds', () => {
    const { LOOT_DISTANCE_NEAR, LOOT_DISTANCE_FAR, NEAR_MAX_LOOT_VALUE } =
      OBJECT_PLACEMENT;
    const midpoint = (LOOT_DISTANCE_NEAR + LOOT_DISTANCE_FAR) / 2;
    const result = computeMaxLootValue({ x: midpoint, y: 0 }, { x: 0, y: 0 });

    // Should be halfway between NEAR_MAX_LOOT_VALUE and 10.
    const expected = NEAR_MAX_LOOT_VALUE + (10 - NEAR_MAX_LOOT_VALUE) * 0.5;
    expect(result).toBeCloseTo(expected, 1);
  });
});

// ---------------------------------------------------------------------------
// getPlaceableTiles
// ---------------------------------------------------------------------------

describe('getPlaceableTiles', () => {
  it('returns tiles inside a room (excluding perimeter walls)', () => {
    const room = makeRoom({ origin: { x: 0, y: 0 }, width: 6, height: 6 });
    const { wallAdjacent, interior } = getPlaceableTiles(room, 0, [], new Set());

    const allTiles = [...wallAdjacent, ...interior];
    // Interior floor is 4x4 = 16 tiles (excluding 1-tile perimeter walls).
    expect(allTiles.length).toBe(16);

    // No tile should be on the room perimeter.
    for (const tile of allTiles) {
      expect(tile.x).toBeGreaterThan(room.origin.x);
      expect(tile.x).toBeLessThan(room.origin.x + room.width - 1);
      expect(tile.y).toBeGreaterThan(room.origin.y);
      expect(tile.y).toBeLessThan(room.origin.y + room.height - 1);
    }
  });

  it('excludes door clearance zones', () => {
    // Door at (3, 0) faces north, roomIndex 0.
    const room = makeRoom({ origin: { x: 0, y: 0 }, width: 8, height: 8 });
    const entry = makeEntryPoint(3, 1, 0); // Inside room near north wall.
    const { wallAdjacent, interior } = getPlaceableTiles(room, 0, [entry], new Set());

    const allKeys = new Set(
      [...wallAdjacent, ...interior].map((t) => `${t.x},${t.y}`),
    );

    // Door tile and adjacent tiles within DOOR_CLEARANCE should be excluded.
    const clearance = OBJECT_PLACEMENT.DOOR_CLEARANCE;
    for (let dy = -clearance; dy <= clearance; dy++) {
      for (let dx = -clearance; dx <= clearance; dx++) {
        const key = `${entry.position.x + dx},${entry.position.y + dy}`;
        // Only check tiles that would be inside the room's interior.
        const nx = entry.position.x + dx;
        const ny = entry.position.y + dy;
        if (nx > 0 && nx < 7 && ny > 0 && ny < 7) {
          expect(allKeys.has(key), `tile ${key} should be blocked`).toBe(false);
        }
      }
    }
  });

  it('excludes already-occupied tiles', () => {
    const room = makeRoom({ origin: { x: 0, y: 0 }, width: 6, height: 6 });
    const occupied = new Set(['2,2', '3,3']);
    const { wallAdjacent, interior } = getPlaceableTiles(room, 0, [], occupied);

    const allKeys = new Set(
      [...wallAdjacent, ...interior].map((t) => `${t.x},${t.y}`),
    );

    expect(allKeys.has('2,2')).toBe(false);
    expect(allKeys.has('3,3')).toBe(false);
  });

  it('separates wall-adjacent from interior tiles', () => {
    // 8x8 room: interior floor is 6x6. Perimeter of 6x6 = 20 wall-adjacent, 16 interior.
    const room = makeRoom({ origin: { x: 0, y: 0 }, width: 8, height: 8 });
    const { wallAdjacent, interior } = getPlaceableTiles(room, 0, [], new Set());

    expect(wallAdjacent.length).toBeGreaterThan(0);
    expect(interior.length).toBeGreaterThan(0);
    expect(wallAdjacent.length + interior.length).toBe(36); // 6x6
  });

  it('returns no tiles for a room too small to have interior', () => {
    // 3x3 room: interior floor is 1x1 = 1 tile.
    const room = makeRoom({ origin: { x: 0, y: 0 }, width: 3, height: 3 });
    const { wallAdjacent, interior } = getPlaceableTiles(room, 0, [], new Set());

    // 1x1 interior — the single tile is wall-adjacent on all sides.
    expect(wallAdjacent.length + interior.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// placeObjectsInBuilding
// ---------------------------------------------------------------------------

describe('placeObjectsInBuilding', () => {
  it('populates objects array on the building', () => {
    const room = makeRoom({
      origin: { x: 0, y: 0 },
      width: 8,
      height: 8,
      roomType: 'kitchen',
    });
    const building = makeBuilding({
      id: 'b1',
      rooms: [room],
      entryPoints: [makeEntryPoint(4, 0, 0)],
    });

    placeObjectsInBuilding(building, DEFAULT_SAFEHOUSE_CENTER, makeRng());

    expect(building.objects.length).toBeGreaterThan(0);
  });

  it('records object indices on each room', () => {
    const room = makeRoom({
      origin: { x: 0, y: 0 },
      width: 8,
      height: 8,
      roomType: 'living_room',
    });
    const building = makeBuilding({
      id: 'b1',
      rooms: [room],
      entryPoints: [],
    });

    placeObjectsInBuilding(building, DEFAULT_SAFEHOUSE_CENTER, makeRng());

    expect(room.objectIndices.length).toBe(building.objects.length);
    // All indices should be valid.
    for (const idx of room.objectIndices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(building.objects.length);
    }
  });

  it('places no objects in rooms below minimum area', () => {
    const tinyRoom = makeRoom({
      origin: { x: 0, y: 0 },
      width: 3, // Interior = 1x1 = 1 tile, below MIN_ROOM_AREA.
      height: 3,
      roomType: 'kitchen',
    });
    const building = makeBuilding({
      id: 'b1',
      rooms: [tinyRoom],
      entryPoints: [],
    });

    placeObjectsInBuilding(building, DEFAULT_SAFEHOUSE_CENTER, makeRng());

    expect(building.objects.length).toBe(0);
  });

  it('places objects only within room bounds', () => {
    const room = makeRoom({
      origin: { x: 5, y: 5 },
      width: 10,
      height: 10,
      roomType: 'garage',
    });
    const building = makeBuilding({
      id: 'b1',
      rooms: [room],
      entryPoints: [],
    });

    placeObjectsInBuilding(building, DEFAULT_SAFEHOUSE_CENTER, makeRng());

    for (const obj of building.objects) {
      // Objects should be inside the interior (1-tile wall inset).
      expect(obj.position.x).toBeGreaterThan(room.origin.x);
      expect(obj.position.x).toBeLessThan(room.origin.x + room.width - 1);
      expect(obj.position.y).toBeGreaterThan(room.origin.y);
      expect(obj.position.y).toBeLessThan(room.origin.y + room.height - 1);
    }
  });

  it('does not place two objects on the same tile', () => {
    const room = makeRoom({
      origin: { x: 0, y: 0 },
      width: 10,
      height: 10,
      roomType: 'storage',
    });
    const building = makeBuilding({
      id: 'b1',
      rooms: [room],
      entryPoints: [],
    });

    placeObjectsInBuilding(building, DEFAULT_SAFEHOUSE_CENTER, makeRng());

    const positions = new Set<string>();
    for (const obj of building.objects) {
      const key = `${obj.position.x},${obj.position.y}`;
      expect(positions.has(key), `duplicate position ${key}`).toBe(false);
      positions.add(key);
    }
  });

  it('is deterministic with the same seed', () => {
    const buildRoom = () =>
      makeRoom({
        origin: { x: 0, y: 0 },
        width: 10,
        height: 10,
        roomType: 'garage',
      });

    const b1 = makeBuilding({ id: 'b1', rooms: [buildRoom()], entryPoints: [] });
    const b2 = makeBuilding({ id: 'b2', rooms: [buildRoom()], entryPoints: [] });

    placeObjectsInBuilding(b1, DEFAULT_SAFEHOUSE_CENTER, makeRng('det-seed'));
    placeObjectsInBuilding(b2, DEFAULT_SAFEHOUSE_CENTER, makeRng('det-seed'));

    expect(b1.objects.length).toBe(b2.objects.length);
    for (let i = 0; i < b1.objects.length; i++) {
      expect(b1.objects[i].objectType).toBe(b2.objects[i].objectType);
      expect(b1.objects[i].position).toEqual(b2.objects[i].position);
    }
  });

  it('produces different results with different seeds', () => {
    const buildRoom = () =>
      makeRoom({
        origin: { x: 0, y: 0 },
        width: 10,
        height: 10,
        roomType: 'garage',
      });

    const b1 = makeBuilding({ id: 'b1', rooms: [buildRoom()], entryPoints: [] });
    const b2 = makeBuilding({ id: 'b2', rooms: [buildRoom()], entryPoints: [] });

    placeObjectsInBuilding(b1, DEFAULT_SAFEHOUSE_CENTER, makeRng('seed-a'));
    placeObjectsInBuilding(b2, DEFAULT_SAFEHOUSE_CENTER, makeRng('seed-b'));

    // At least one object position or type should differ.
    const serialize = (b: Building) =>
      b.objects.map((o) => `${o.objectType}@${o.position.x},${o.position.y}`).join('|');
    expect(serialize(b1)).not.toEqual(serialize(b2));
  });

  it('is idempotent — calling twice resets objects', () => {
    const room = makeRoom({
      origin: { x: 0, y: 0 },
      width: 8,
      height: 8,
      roomType: 'kitchen',
    });
    const building = makeBuilding({
      id: 'b1',
      rooms: [room],
      entryPoints: [],
    });

    placeObjectsInBuilding(building, DEFAULT_SAFEHOUSE_CENTER, makeRng());
    const firstCount = building.objects.length;

    placeObjectsInBuilding(building, DEFAULT_SAFEHOUSE_CENTER, makeRng());
    expect(building.objects.length).toBe(firstCount);
  });

  it('respects MAX_DENSITY limit', () => {
    const room = makeRoom({
      origin: { x: 0, y: 0 },
      width: 8,
      height: 8,
      roomType: 'garage',
    });
    const building = makeBuilding({
      id: 'b1',
      rooms: [room],
      entryPoints: [],
    });

    placeObjectsInBuilding(building, DEFAULT_SAFEHOUSE_CENTER, makeRng());

    const floorArea = (room.width - 2) * (room.height - 2);
    const maxObjects = Math.floor(floorArea * OBJECT_PLACEMENT.MAX_DENSITY);
    expect(building.objects.length).toBeLessThanOrEqual(maxObjects);
  });

  it('all placed objects have valid categories', () => {
    const room = makeRoom({
      origin: { x: 0, y: 0 },
      width: 10,
      height: 10,
      roomType: 'storage',
    });
    const building = makeBuilding({
      id: 'b1',
      rooms: [room],
      entryPoints: [],
    });

    placeObjectsInBuilding(building, DEFAULT_SAFEHOUSE_CENTER, makeRng());

    const validCategories = new Set(Object.values(ObjectCategory));
    for (const obj of building.objects) {
      expect(validCategories.has(obj.category)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Distance-based loot filtering
// ---------------------------------------------------------------------------

describe('distance-based loot filtering', () => {
  it('near-safehouse buildings have no high-value loot', () => {
    const room = makeRoom({
      origin: { x: 0, y: 0 },
      width: 10,
      height: 10,
      roomType: 'garage',
    });
    const building = makeBuilding({
      id: 'b1',
      origin: { x: 0, y: 0 },
      width: 10,
      height: 10,
      rooms: [room],
      entryPoints: [],
    });

    // Safehouse is at the same location — maximum restriction.
    placeObjectsInBuilding(building, { x: 5, y: 5 }, makeRng());

    for (const obj of building.objects) {
      const def = getObjectDef(obj.objectType);
      expect(
        def!.lootValue,
        `${obj.objectType} should not exceed NEAR_MAX_LOOT_VALUE`,
      ).toBeLessThanOrEqual(OBJECT_PLACEMENT.NEAR_MAX_LOOT_VALUE);
    }
  });

  it('distant buildings can have high-value loot', () => {
    const room = makeRoom({
      origin: { x: 0, y: 0 },
      width: 10,
      height: 10,
      roomType: 'garage',
    });
    const building = makeBuilding({
      id: 'b-far',
      origin: { x: 0, y: 0 },
      width: 10,
      height: 10,
      rooms: [room],
      entryPoints: [],
    });

    // Place building very far from safehouse.
    const farCenter: TileCoord = { x: 100, y: 100 };
    placeObjectsInBuilding(building, farCenter, makeRng());

    // At this distance, maxLootValue should be 10, allowing all objects.
    // We just verify the building has objects placed.
    expect(building.objects.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// populateBuildings
// ---------------------------------------------------------------------------

describe('populateBuildings', () => {
  it('populates multiple buildings', () => {
    const buildings = [
      makeBuilding({
        id: 'b1',
        rooms: [makeRoom({ roomType: 'kitchen', width: 8, height: 8 })],
        entryPoints: [],
      }),
      makeBuilding({
        id: 'b2',
        origin: { x: 20, y: 20 },
        rooms: [makeRoom({ origin: { x: 20, y: 20 }, roomType: 'bedroom', width: 8, height: 8 })],
        entryPoints: [],
      }),
    ];

    populateBuildings(buildings, DEFAULT_SAFEHOUSE_CENTER, makeRng());

    for (const building of buildings) {
      expect(building.objects.length).toBeGreaterThan(0);
    }
  });

  it('handles buildings with multiple rooms', () => {
    const building = makeBuilding({
      id: 'b1',
      rooms: [
        makeRoom({ origin: { x: 0, y: 0 }, width: 8, height: 8, roomType: 'kitchen' }),
        makeRoom({ origin: { x: 8, y: 0 }, width: 8, height: 8, roomType: 'bedroom' }),
      ],
      entryPoints: [],
    });

    populateBuildings([building], DEFAULT_SAFEHOUSE_CENTER, makeRng());

    // Both rooms should have contributed objects.
    expect(building.rooms[0].objectIndices.length).toBeGreaterThan(0);
    expect(building.rooms[1].objectIndices.length).toBeGreaterThan(0);
  });

  it('handles empty buildings array', () => {
    expect(() => populateBuildings([], DEFAULT_SAFEHOUSE_CENTER, makeRng())).not.toThrow();
  });
});
