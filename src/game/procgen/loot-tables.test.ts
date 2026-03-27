// @vitest-environment node
import { describe, it, expect } from 'vitest';
import seedrandom from 'seedrandom';
import {
  getLootTable,
  getAllLootTables,
  selectObjectsForRoom,
} from './loot-tables';
import { getObjectDef } from './object-defs';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRng(seed = 'test-seed') {
  return seedrandom(seed);
}

function lookupLootValue(objectType: string): number {
  return getObjectDef(objectType)?.lootValue ?? 0;
}

// ---------------------------------------------------------------------------
// Loot table definitions
// ---------------------------------------------------------------------------

describe('loot table definitions', () => {
  const EXPECTED_ROOM_TYPES = [
    'kitchen',
    'bedroom',
    'living_room',
    'bathroom',
    'garage',
    'store_front',
    'storage',
    'office',
    'hallway',
  ];

  it.each(EXPECTED_ROOM_TYPES)('has a loot table for room type: %s', (roomType) => {
    const table = getLootTable(roomType);
    expect(table.roomType).toBe(roomType);
  });

  it('falls back to default table for unknown room types', () => {
    const table = getLootTable('unknown_room');
    expect(table.roomType).toBe('default');
  });

  it('every referenced object type exists in object definitions', () => {
    for (const table of getAllLootTables()) {
      for (const entry of table.entries) {
        const def = getObjectDef(entry.objectType);
        expect(def, `${entry.objectType} in ${table.roomType} table`).toBeDefined();
      }
    }
  });

  it('all weights are positive', () => {
    for (const table of getAllLootTables()) {
      for (const entry of table.entries) {
        expect(entry.weight, `${entry.objectType} weight in ${table.roomType}`).toBeGreaterThan(0);
      }
    }
  });

  it('all maxCounts are at least 1', () => {
    for (const table of getAllLootTables()) {
      for (const entry of table.entries) {
        expect(entry.maxCount, `${entry.objectType} maxCount in ${table.roomType}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('all baseDensity values are positive', () => {
    for (const table of getAllLootTables()) {
      expect(table.baseDensity, `${table.roomType} baseDensity`).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// selectObjectsForRoom
// ---------------------------------------------------------------------------

describe('selectObjectsForRoom', () => {
  it('returns objects for a standard room', () => {
    const rng = makeRng();
    const table = getLootTable('kitchen');
    const result = selectObjectsForRoom(table, 25, rng, Infinity, lookupLootValue);

    expect(result.length).toBeGreaterThan(0);
    // All returned types should be from the kitchen table.
    const validTypes = new Set(table.entries.map((e) => e.objectType));
    for (const type of result) {
      expect(validTypes.has(type)).toBe(true);
    }
  });

  it('scales count with room area', () => {
    const table = getLootTable('garage');

    const smallResult = selectObjectsForRoom(table, 10, makeRng(), Infinity, lookupLootValue);
    const largeResult = selectObjectsForRoom(table, 60, makeRng(), Infinity, lookupLootValue);

    expect(largeResult.length).toBeGreaterThanOrEqual(smallResult.length);
  });

  it('is deterministic with the same seed', () => {
    const table = getLootTable('storage');

    const r1 = selectObjectsForRoom(table, 25, makeRng('seed-a'), Infinity, lookupLootValue);
    const r2 = selectObjectsForRoom(table, 25, makeRng('seed-a'), Infinity, lookupLootValue);

    expect(r1).toEqual(r2);
  });

  it('produces different results with different seeds', () => {
    const table = getLootTable('garage');

    const r1 = selectObjectsForRoom(table, 30, makeRng('seed-x'), Infinity, lookupLootValue);
    const r2 = selectObjectsForRoom(table, 30, makeRng('seed-y'), Infinity, lookupLootValue);

    // Very unlikely to be identical with different seeds.
    expect(r1).not.toEqual(r2);
  });

  it('respects maxCount limits', () => {
    const table = getLootTable('kitchen');
    const rng = makeRng();
    // Use a large room to trigger many object attempts.
    const result = selectObjectsForRoom(table, 100, rng, Infinity, lookupLootValue);

    const counts = new Map<string, number>();
    for (const type of result) {
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }

    for (const entry of table.entries) {
      const count = counts.get(entry.objectType) ?? 0;
      expect(count, `${entry.objectType} count`).toBeLessThanOrEqual(entry.maxCount);
    }
  });

  it('returns at least 1 object for any room above minimum area', () => {
    const rng = makeRng();
    const table = getLootTable('hallway');
    const result = selectObjectsForRoom(table, 6, rng, Infinity, lookupLootValue);

    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('filters out objects above maxLootValue', () => {
    const table = getLootTable('garage');
    const rng = makeRng();
    // Only allow loot value <= 2 (excludes gas_can=6, car_battery=7, wire_spool=5, etc.)
    const result = selectObjectsForRoom(table, 30, rng, 2, lookupLootValue);

    for (const type of result) {
      const def = getObjectDef(type);
      expect(def, `${type} should exist`).toBeDefined();
      expect(def!.lootValue, `${type} lootValue`).toBeLessThanOrEqual(2);
    }
  });

  it('returns empty array when all entries exceed maxLootValue', () => {
    const table = getLootTable('garage');
    const rng = makeRng();
    // Set maxLootValue to -1 so nothing qualifies.
    const result = selectObjectsForRoom(table, 30, rng, -1, lookupLootValue);
    expect(result).toEqual([]);
  });
});
