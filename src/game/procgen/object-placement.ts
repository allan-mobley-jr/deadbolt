/**
 * Object placement system.
 *
 * Populates BSP-generated rooms with objects drawn from loot tables.
 * Placement respects room geometry, door clearance, and distance-based
 * loot value scaling to create a risk/reward gradient from the safehouse.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import type { PRNG } from 'seedrandom';
import type {
  Building,
  Room,
  TileCoord,
  EntryPoint,
} from '@/types/procgen';
import { ObjectCategory } from '@/types/procgen';
import { OBJECT_PLACEMENT } from './constants';
import { tileDistance, getBuildingCenter } from './geometry';
import { getObjectDef } from './object-defs';
import { getLootTable, selectObjectsForRoom } from './loot-tables';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute the maximum loot value allowed for a building based on its
 * distance from the safehouse.
 *
 * Buildings close to the safehouse only get low-value objects. Higher-value
 * loot spawns progressively farther away, creating risk/reward tension.
 */
export function computeMaxLootValue(
  buildingCenter: TileCoord,
  safehouseCenter: TileCoord,
): number {
  const { LOOT_DISTANCE_NEAR, LOOT_DISTANCE_FAR, NEAR_MAX_LOOT_VALUE } =
    OBJECT_PLACEMENT;

  const distance = tileDistance(buildingCenter, safehouseCenter);

  if (distance <= LOOT_DISTANCE_NEAR) return NEAR_MAX_LOOT_VALUE;
  if (distance >= LOOT_DISTANCE_FAR) return 10;

  // Linear interpolation between near and far thresholds.
  const t = (distance - LOOT_DISTANCE_NEAR) / (LOOT_DISTANCE_FAR - LOOT_DISTANCE_NEAR);
  return NEAR_MAX_LOOT_VALUE + (10 - NEAR_MAX_LOOT_VALUE) * t;
}

/**
 * Collect entry-point tile coordinates for a specific room.
 */
function getRoomEntryTiles(
  room: Room,
  roomIndex: number,
  entryPoints: EntryPoint[],
): TileCoord[] {
  return entryPoints
    .filter((ep) => ep.roomIndex === roomIndex)
    .map((ep) => ep.position);
}

/**
 * Get all placeable tiles within a room, excluding door clearance zones
 * and already-occupied tiles.
 *
 * Tiles are sorted with wall-adjacent tiles first for furniture placement.
 */
export function getPlaceableTiles(
  room: Room,
  roomIndex: number,
  entryPoints: EntryPoint[],
  occupiedSet: Set<string>,
): { wallAdjacent: TileCoord[]; interior: TileCoord[] } {
  const { DOOR_CLEARANCE } = OBJECT_PLACEMENT;

  // Collect door tiles and their clearance zones.
  const doorTiles = getRoomEntryTiles(room, roomIndex, entryPoints);
  const blockedKeys = new Set<string>();

  for (const door of doorTiles) {
    // Block the door tile itself and tiles within clearance radius.
    for (let dy = -DOOR_CLEARANCE; dy <= DOOR_CLEARANCE; dy++) {
      for (let dx = -DOOR_CLEARANCE; dx <= DOOR_CLEARANCE; dx++) {
        const nx = door.x + dx;
        const ny = door.y + dy;
        // Only block tiles inside the room bounds.
        if (
          nx >= room.origin.x &&
          nx < room.origin.x + room.width &&
          ny >= room.origin.y &&
          ny < room.origin.y + room.height
        ) {
          blockedKeys.add(`${nx},${ny}`);
        }
      }
    }
  }

  const wallAdjacent: TileCoord[] = [];
  const interior: TileCoord[] = [];

  // Interior tiles only (exclude the perimeter which are walls).
  // Room origin is the top-left corner; walkable floor starts at +1 inset.
  const startX = room.origin.x + 1;
  const startY = room.origin.y + 1;
  const endX = room.origin.x + room.width - 1;
  const endY = room.origin.y + room.height - 1;

  // Pre-compute inner floor bounds for wall-adjacency checks.
  const innerWidth = room.width - 2;
  const innerHeight = room.height - 2;

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const key = `${x},${y}`;
      if (blockedKeys.has(key) || occupiedSet.has(key)) continue;

      if (
        x === startX ||
        x === startX + innerWidth - 1 ||
        y === startY ||
        y === startY + innerHeight - 1
      ) {
        wallAdjacent.push({ x, y });
      } else {
        interior.push({ x, y });
      }
    }
  }

  return { wallAdjacent, interior };
}

/**
 * Pick a random tile from a candidate pool, removing it.
 *
 * Swaps the selected tile with the last element for O(1) removal.
 */
function pickRandomTile(tiles: TileCoord[], rng: PRNG): TileCoord | null {
  if (tiles.length === 0) return null;
  const idx = Math.floor(rng() * tiles.length);
  const picked = tiles[idx];
  // Swap with last and pop for efficient removal.
  tiles[idx] = tiles[tiles.length - 1];
  tiles.pop();
  return picked;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Place objects in a single building based on its room types and distance
 * from the safehouse.
 *
 * Mutates the building's `objects` array and each room's `objectIndices`.
 */
export function placeObjectsInBuilding(
  building: Building,
  safehouseCenter: TileCoord,
  rng: PRNG,
): void {
  const buildingCenter = getBuildingCenter(building);
  const maxLootValue = computeMaxLootValue(buildingCenter, safehouseCenter);

  // Clear existing objects (placement is idempotent).
  building.objects = [];

  for (let roomIdx = 0; roomIdx < building.rooms.length; roomIdx++) {
    const room = building.rooms[roomIdx];
    room.objectIndices = [];

    // Interior floor area (exclude walls on each side).
    const floorWidth = room.width - 2;
    const floorHeight = room.height - 2;
    const floorArea = floorWidth * floorHeight;

    if (floorArea < OBJECT_PLACEMENT.MIN_ROOM_AREA) continue;

    const lootTable = getLootTable(room.roomType);

    const objectTypes = selectObjectsForRoom(
      lootTable,
      floorArea,
      rng,
      maxLootValue,
      (type) => getObjectDef(type)?.lootValue ?? 0,
    );

    if (objectTypes.length === 0) continue;

    // Track occupied positions across this room.
    const occupiedSet = new Set<string>();

    // Sort: furniture/containers first (prefer wall-adjacent), then loot/debris.
    // Skip types with no definition — prevents crashes from data entry errors.
    const furnitureTypes: string[] = [];
    const otherTypes: string[] = [];

    for (const type of objectTypes) {
      const def = getObjectDef(type);
      if (!def) continue;
      if (
        def.category === ObjectCategory.Furniture ||
        def.category === ObjectCategory.Container
      ) {
        furnitureTypes.push(type);
      } else {
        otherTypes.push(type);
      }
    }

    // Get initial placeable tile pools.
    const { wallAdjacent, interior } = getPlaceableTiles(
      room,
      roomIdx,
      building.entryPoints,
      occupiedSet,
    );

    // Copy into mutable arrays for pick-and-remove.
    const wallPool = [...wallAdjacent];
    const interiorPool = [...interior];

    // Place furniture/containers preferring wall-adjacent tiles.
    for (const type of furnitureTypes) {
      const tile = pickRandomTile(wallPool, rng) ?? pickRandomTile(interiorPool, rng);
      if (!tile) break;

      occupiedSet.add(`${tile.x},${tile.y}`);
      const def = getObjectDef(type)!; // Safe: filtered above.

      const objIdx = building.objects.length;
      building.objects.push({
        position: tile,
        category: def.category,
        blocksMovement: def.blocksMovement,
        objectType: type,
      });
      room.objectIndices.push(objIdx);
    }

    // Place loot/debris in any remaining tile.
    for (const type of otherTypes) {
      const tile = pickRandomTile(interiorPool, rng) ?? pickRandomTile(wallPool, rng);
      if (!tile) break;

      occupiedSet.add(`${tile.x},${tile.y}`);
      const def = getObjectDef(type)!; // Safe: filtered above.

      const objIdx = building.objects.length;
      building.objects.push({
        position: tile,
        category: def.category,
        blocksMovement: def.blocksMovement,
        objectType: type,
      });
      room.objectIndices.push(objIdx);
    }
  }
}

/**
 * Populate all buildings in a city with objects.
 *
 * This is the top-level entry point for the object placement pipeline step.
 * Call after BSP interior generation and before safehouse selection.
 */
export function populateBuildings(
  buildings: Building[],
  safehouseCenter: TileCoord,
  rng: PRNG,
): void {
  for (const building of buildings) {
    placeObjectsInBuilding(building, safehouseCenter, rng);
  }
}
