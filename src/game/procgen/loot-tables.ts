/**
 * Loot tables — weighted object pools per room type.
 *
 * Each room archetype (produced by the BSP generator) maps to a loot table
 * that defines which objects can spawn and how likely each one is. The
 * placement system draws from these tables using the seeded PRNG.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import type { PRNG } from 'seedrandom';
import { OBJECT_PLACEMENT } from './constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single entry in a room's weighted object pool. */
export interface LootTableEntry {
  /** Object type key (matches ObjectDefinition.type). */
  objectType: string;
  /** Relative weight for weighted random selection. Higher = more likely. */
  weight: number;
  /** Maximum number of this object that can appear in one room. */
  maxCount: number;
}

/** Loot table for a specific room archetype. */
export interface LootTable {
  /** Room type this table applies to. */
  roomType: string;
  /** Base number of objects to attempt placing (at REFERENCE_ROOM_AREA). */
  baseDensity: number;
  /** Entries in the weighted pool. */
  entries: readonly LootTableEntry[];
}

// ---------------------------------------------------------------------------
// Loot table definitions
// ---------------------------------------------------------------------------

const LOOT_TABLES: readonly LootTable[] = [
  {
    roomType: 'kitchen',
    baseDensity: 4,
    entries: [
      { objectType: 'fridge', weight: 10, maxCount: 1 },
      { objectType: 'table', weight: 8, maxCount: 1 },
      { objectType: 'wooden_chair', weight: 6, maxCount: 2 },
      { objectType: 'trash_can', weight: 4, maxCount: 1 },
      { objectType: 'cardboard_box', weight: 2, maxCount: 1 },
    ],
  },
  {
    roomType: 'bedroom',
    baseDensity: 3,
    entries: [
      { objectType: 'bed', weight: 10, maxCount: 1 },
      { objectType: 'bookshelf', weight: 5, maxCount: 1 },
      { objectType: 'wooden_chair', weight: 4, maxCount: 1 },
      { objectType: 'cardboard_box', weight: 3, maxCount: 2 },
      { objectType: 'table', weight: 2, maxCount: 1 },
    ],
  },
  {
    roomType: 'living_room',
    baseDensity: 4,
    entries: [
      { objectType: 'sofa', weight: 10, maxCount: 1 },
      { objectType: 'table', weight: 8, maxCount: 1 },
      { objectType: 'bookshelf', weight: 5, maxCount: 1 },
      { objectType: 'wooden_chair', weight: 4, maxCount: 2 },
      { objectType: 'cardboard_box', weight: 2, maxCount: 1 },
    ],
  },
  {
    roomType: 'bathroom',
    baseDensity: 2,
    entries: [
      { objectType: 'metal_shelving', weight: 5, maxCount: 1 },
      { objectType: 'trash_can', weight: 4, maxCount: 1 },
      { objectType: 'cardboard_box', weight: 3, maxCount: 1 },
    ],
  },
  {
    roomType: 'garage',
    baseDensity: 5,
    entries: [
      { objectType: 'metal_shelving', weight: 8, maxCount: 2 },
      { objectType: 'tire', weight: 6, maxCount: 3 },
      { objectType: 'gas_can', weight: 4, maxCount: 1 },
      { objectType: 'car_battery', weight: 3, maxCount: 1 },
      { objectType: 'wire_spool', weight: 3, maxCount: 1 },
      { objectType: 'wooden_plank', weight: 5, maxCount: 2 },
      { objectType: 'metal_sheet', weight: 4, maxCount: 2 },
      { objectType: 'cardboard_box', weight: 3, maxCount: 2 },
    ],
  },
  {
    roomType: 'store_front',
    baseDensity: 5,
    entries: [
      { objectType: 'metal_shelving', weight: 10, maxCount: 3 },
      { objectType: 'table', weight: 5, maxCount: 1 },
      { objectType: 'cardboard_box', weight: 8, maxCount: 3 },
      { objectType: 'trash_can', weight: 4, maxCount: 1 },
      { objectType: 'wooden_chair', weight: 3, maxCount: 1 },
    ],
  },
  {
    roomType: 'storage',
    baseDensity: 5,
    entries: [
      { objectType: 'metal_shelving', weight: 10, maxCount: 3 },
      { objectType: 'cardboard_box', weight: 8, maxCount: 4 },
      { objectType: 'wooden_plank', weight: 5, maxCount: 2 },
      { objectType: 'metal_sheet', weight: 4, maxCount: 2 },
      { objectType: 'tire', weight: 3, maxCount: 2 },
      { objectType: 'wire_spool', weight: 2, maxCount: 1 },
    ],
  },
  {
    roomType: 'office',
    baseDensity: 4,
    entries: [
      { objectType: 'table', weight: 10, maxCount: 2 },
      { objectType: 'wooden_chair', weight: 8, maxCount: 3 },
      { objectType: 'bookshelf', weight: 5, maxCount: 1 },
      { objectType: 'trash_can', weight: 4, maxCount: 1 },
      { objectType: 'cardboard_box', weight: 3, maxCount: 1 },
    ],
  },
  {
    roomType: 'hallway',
    baseDensity: 1,
    entries: [
      { objectType: 'trash_can', weight: 3, maxCount: 1 },
      { objectType: 'cardboard_box', weight: 2, maxCount: 1 },
    ],
  },
];

/** Fallback table for unknown room types. */
const DEFAULT_LOOT_TABLE: LootTable = {
  roomType: 'default',
  baseDensity: 2,
  entries: [
    { objectType: 'wooden_chair', weight: 5, maxCount: 2 },
    { objectType: 'trash_can', weight: 4, maxCount: 1 },
    { objectType: 'cardboard_box', weight: 4, maxCount: 2 },
    { objectType: 'table', weight: 3, maxCount: 1 },
  ],
};

// ---------------------------------------------------------------------------
// Lookup map
// ---------------------------------------------------------------------------

const LOOT_TABLE_MAP = new Map<string, LootTable>(
  LOOT_TABLES.map((lt) => [lt.roomType, lt]),
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the loot table for a room type.
 *
 * Falls back to the default table for unknown room types.
 */
export function getLootTable(roomType: string): LootTable {
  return LOOT_TABLE_MAP.get(roomType) ?? DEFAULT_LOOT_TABLE;
}

/** Get all defined loot tables (excluding the default fallback). */
export function getAllLootTables(): readonly LootTable[] {
  return LOOT_TABLES;
}

/**
 * Select object types to place in a room using weighted random selection.
 *
 * The number of objects scales with room area relative to REFERENCE_ROOM_AREA,
 * clamped by MAX_DENSITY. Each entry respects its maxCount limit.
 *
 * @param lootTable  The loot table to draw from.
 * @param roomArea   Room area in tiles (width * height).
 * @param rng        Seeded PRNG for deterministic selection.
 * @param maxLootValue  Maximum loot value allowed (for distance-based filtering).
 *                      Pass Infinity to allow all objects.
 * @param getObjectLootValue  Callback to look up an object type's loot value.
 * @returns Array of object type strings to place.
 */
export function selectObjectsForRoom(
  lootTable: LootTable,
  roomArea: number,
  rng: PRNG,
  maxLootValue: number,
  getObjectLootValue: (objectType: string) => number,
): string[] {
  const { REFERENCE_ROOM_AREA, MAX_DENSITY } = OBJECT_PLACEMENT;

  // Scale object count by room area relative to reference.
  const areaScale = roomArea / REFERENCE_ROOM_AREA;
  const targetCount = Math.round(lootTable.baseDensity * areaScale);
  const maxForArea = Math.floor(roomArea * MAX_DENSITY);
  const count = Math.max(1, Math.min(targetCount, maxForArea));

  // Filter entries by loot value constraint.
  const eligibleEntries = lootTable.entries.filter(
    (entry) => getObjectLootValue(entry.objectType) <= maxLootValue,
  );

  if (eligibleEntries.length === 0) return [];

  // Track how many of each type we've selected.
  const typeCounts = new Map<string, number>();
  const selected: string[] = [];

  for (let i = 0; i < count; i++) {
    const picked = weightedSelect(eligibleEntries, typeCounts, rng);
    if (picked === null) break; // All entries maxed out.
    typeCounts.set(picked, (typeCounts.get(picked) ?? 0) + 1);
    selected.push(picked);
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Weighted random selection from eligible entries, respecting maxCount limits.
 *
 * @returns The selected object type, or null if all entries are at maxCount.
 */
function weightedSelect(
  entries: readonly LootTableEntry[],
  typeCounts: Map<string, number>,
  rng: PRNG,
): string | null {
  // Build pool of entries that haven't reached their maxCount.
  let totalWeight = 0;
  const available: LootTableEntry[] = [];

  for (const entry of entries) {
    const current = typeCounts.get(entry.objectType) ?? 0;
    if (current < entry.maxCount) {
      available.push(entry);
      totalWeight += entry.weight;
    }
  }

  if (available.length === 0 || totalWeight <= 0) return null;

  // Weighted random selection.
  let roll = rng() * totalWeight;
  for (const entry of available) {
    roll -= entry.weight;
    if (roll <= 0) return entry.objectType;
  }

  // Floating-point edge case — return last entry.
  return available[available.length - 1].objectType;
}
