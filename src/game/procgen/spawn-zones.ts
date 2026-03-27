/**
 * Zombie spawn zone placement.
 *
 * Generates spawn zones in two categories:
 *   1. Map-edge zones — evenly distributed along the four map edges
 *   2. Far-building zones — buildings far from the safehouse where
 *      zombies emerge from doorways
 *
 * Spawn zone locations are stored for the wave spawner system (M3).
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import type { PRNG } from 'seedrandom';
import type {
  CityLayout,
  TileCoord,
  SpawnZone,
} from '@/types/procgen';
import { TileType } from '@/types/procgen';
import { SPAWN_ZONE } from './constants';
import { tileDistance, getBuildingCenter } from './geometry';

// Re-export for consumers that imported tileDistance from here.
export { tileDistance } from './geometry';

// ---------------------------------------------------------------------------
// Walkable-point scanning
// ---------------------------------------------------------------------------

/**
 * Find walkable tiles within a radius of a center point.
 *
 * Scans a square bounding box and filters to Euclidean distance.
 */
export function findWalkableSpawnPoints(
  cityLayout: CityLayout,
  center: TileCoord,
  radius: number,
): TileCoord[] {
  const points: TileCoord[] = [];
  const minX = Math.max(0, center.x - radius);
  const maxX = Math.min(cityLayout.widthTiles - 1, center.x + radius);
  const minY = Math.max(0, center.y - radius);
  const maxY = Math.min(cityLayout.heightTiles - 1, center.y + radius);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (tileDistance(center, { x, y }) > radius) continue;

      const tile = cityLayout.tiles[y]?.[x];
      if (
        tile !== undefined &&
        tile !== TileType.Wall &&
        tile !== TileType.Empty // spawn on roads/sidewalks/floors, not void
      ) {
        points.push({ x, y });
      }
    }
  }

  return points;
}

// ---------------------------------------------------------------------------
// Edge spawn zones
// ---------------------------------------------------------------------------

/**
 * Generate spawn zones along the four map edges.
 *
 * Each edge is divided into ZONES_PER_EDGE segments. A zone is placed
 * at the center of each segment, inset from the edge by EDGE_INSET tiles.
 * Zones without enough walkable spawn points are discarded.
 */
export function generateEdgeSpawnZones(
  cityLayout: CityLayout,
  safehouseCenter: TileCoord,
  rng: PRNG,
): SpawnZone[] {
  const { widthTiles, heightTiles } = cityLayout;
  const { EDGE_INSET, ZONES_PER_EDGE, ZONE_RADIUS, MIN_SPAWN_POINTS } = SPAWN_ZONE;
  const zones: SpawnZone[] = [];
  let idCounter = 0;

  type EdgeSpec = { x: (seg: number, total: number) => number; y: (seg: number, total: number) => number };

  const edges: EdgeSpec[] = [
    // North edge
    {
      x: (seg, total) => Math.floor(((seg + 0.5) / total) * widthTiles),
      y: () => EDGE_INSET,
    },
    // South edge
    {
      x: (seg, total) => Math.floor(((seg + 0.5) / total) * widthTiles),
      y: () => heightTiles - 1 - EDGE_INSET,
    },
    // West edge
    {
      x: () => EDGE_INSET,
      y: (seg, total) => Math.floor(((seg + 0.5) / total) * heightTiles),
    },
    // East edge
    {
      x: () => widthTiles - 1 - EDGE_INSET,
      y: (seg, total) => Math.floor(((seg + 0.5) / total) * heightTiles),
    },
  ];

  for (const edge of edges) {
    for (let seg = 0; seg < ZONES_PER_EDGE; seg++) {
      const position: TileCoord = {
        x: edge.x(seg, ZONES_PER_EDGE),
        y: edge.y(seg, ZONES_PER_EDGE),
      };

      // Clamp to valid bounds
      position.x = Math.max(0, Math.min(widthTiles - 1, position.x));
      position.y = Math.max(0, Math.min(heightTiles - 1, position.y));

      const spawnPoints = findWalkableSpawnPoints(cityLayout, position, ZONE_RADIUS);

      if (spawnPoints.length < MIN_SPAWN_POINTS) continue;

      zones.push({
        id: `edge-${idCounter++}`,
        type: 'map_edge',
        position,
        radius: ZONE_RADIUS,
        distanceToSafehouse: tileDistance(position, safehouseCenter),
        spawnPoints,
      });
    }
  }

  // Consume one RNG call to keep the stream deterministic even when
  // the number of valid zones varies (future-proofing for shuffling)
  void rng();

  return zones;
}

// ---------------------------------------------------------------------------
// Far-building spawn zones
// ---------------------------------------------------------------------------

/**
 * Generate spawn zones at buildings far from the safehouse.
 *
 * Zombies emerge from doorways of distant buildings. Buildings are
 * filtered by minimum distance, then their entry points are used as
 * the zone center.
 */
export function generateFarBuildingSpawnZones(
  cityLayout: CityLayout,
  safehouseCenter: TileCoord,
  safehouseBuildingId: string,
  rng: PRNG,
): SpawnZone[] {
  const { MIN_DISTANCE_FROM_SAFEHOUSE, ZONE_RADIUS, MIN_SPAWN_POINTS } = SPAWN_ZONE;
  const zones: SpawnZone[] = [];
  let idCounter = 0;

  // Collect candidate buildings
  const candidates = cityLayout.buildings.filter((b) => {
    if (b.id === safehouseBuildingId) return false;
    const center = getBuildingCenter(b);
    return tileDistance(center, safehouseCenter) >= MIN_DISTANCE_FROM_SAFEHOUSE;
  });

  // Shuffle deterministically so zone selection is reproducible
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  for (const building of candidates) {
    // Use the first entry point as the zone center, or building center
    const position: TileCoord =
      building.entryPoints.length > 0
        ? { ...building.entryPoints[0].position }
        : getBuildingCenter(building);

    const spawnPoints = findWalkableSpawnPoints(cityLayout, position, ZONE_RADIUS);

    if (spawnPoints.length < MIN_SPAWN_POINTS) continue;

    zones.push({
      id: `far-${idCounter++}`,
      type: 'far_building',
      position,
      radius: ZONE_RADIUS,
      distanceToSafehouse: tileDistance(position, safehouseCenter),
      spawnPoints,
    });
  }

  return zones;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Generate all spawn zones for a city.
 *
 * Combines edge zones and far-building zones into a single array.
 */
export function generateSpawnZones(
  cityLayout: CityLayout,
  safehouseCenter: TileCoord,
  safehouseBuildingId: string,
  rng: PRNG,
): SpawnZone[] {
  const edgeZones = generateEdgeSpawnZones(cityLayout, safehouseCenter, rng);
  const farZones = generateFarBuildingSpawnZones(
    cityLayout,
    safehouseCenter,
    safehouseBuildingId,
    rng,
  );
  return [...edgeZones, ...farZones];
}
