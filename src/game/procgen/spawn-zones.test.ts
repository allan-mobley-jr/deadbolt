// @vitest-environment node
import { describe, it, expect } from 'vitest';
import seedrandom from 'seedrandom';
import {
  tileDistance,
  findWalkableSpawnPoints,
  generateEdgeSpawnZones,
  generateFarBuildingSpawnZones,
  generateSpawnZones,
} from './spawn-zones';
import { TileType } from '@/types/procgen';
import type { Building, CityLayout, EntryPoint, TileCoord } from '@/types/procgen';
import { SPAWN_ZONE } from './constants';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeEntryPoint(x: number, y: number): EntryPoint {
  return {
    position: { x, y },
    type: 'door',
    facingDirection: 'north',
    roomIndex: 0,
    barricaded: false,
  };
}

function makeBuilding(overrides: Partial<Building> & { id: string }): Building {
  return {
    origin: { x: 0, y: 0 },
    width: 6,
    height: 6,
    rooms: [],
    entryPoints: [],
    objects: [],
    ...overrides,
  };
}

/** Create a city layout filled with roads (fully walkable). */
function makeRoadCity(
  size: number,
  buildings: Building[] = [],
): CityLayout {
  const tiles = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => TileType.Road),
  );
  return {
    widthTiles: size,
    heightTiles: size,
    tiles,
    buildings,
    seed: 'test-seed',
  };
}

const safehouseCenter: TileCoord = { x: 25, y: 25 };

// ---------------------------------------------------------------------------
// tileDistance
// ---------------------------------------------------------------------------

describe('tileDistance', () => {
  it('returns 0 for the same point', () => {
    expect(tileDistance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });

  it('returns correct Euclidean distance', () => {
    expect(tileDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// findWalkableSpawnPoints
// ---------------------------------------------------------------------------

describe('findWalkableSpawnPoints', () => {
  it('finds walkable tiles within radius', () => {
    const city = makeRoadCity(20);
    const points = findWalkableSpawnPoints(city, { x: 10, y: 10 }, 2);

    // Should find points in a rough circle of radius 2
    expect(points.length).toBeGreaterThan(0);

    // All points should be within radius 2 of center
    for (const p of points) {
      expect(tileDistance(p, { x: 10, y: 10 })).toBeLessThanOrEqual(2);
    }
  });

  it('excludes Wall tiles', () => {
    const city = makeRoadCity(10);
    // Place a wall at (5, 5)
    city.tiles[5][5] = TileType.Wall;

    const points = findWalkableSpawnPoints(city, { x: 5, y: 5 }, 1);
    const hasWall = points.some((p) => p.x === 5 && p.y === 5);

    expect(hasWall).toBe(false);
  });

  it('excludes Empty tiles (void ground)', () => {
    const city = makeRoadCity(10);
    city.tiles[5][5] = TileType.Empty;

    const points = findWalkableSpawnPoints(city, { x: 5, y: 5 }, 1);
    const hasEmpty = points.some((p) => p.x === 5 && p.y === 5);

    expect(hasEmpty).toBe(false);
  });

  it('clamps to grid bounds', () => {
    const city = makeRoadCity(10);
    // Center at corner — should not go out of bounds
    const points = findWalkableSpawnPoints(city, { x: 0, y: 0 }, 3);

    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(10);
      expect(p.y).toBeLessThan(10);
    }
  });
});

// ---------------------------------------------------------------------------
// generateEdgeSpawnZones
// ---------------------------------------------------------------------------

describe('generateEdgeSpawnZones', () => {
  it('generates zones near all four map edges', () => {
    const city = makeRoadCity(50);
    const rng = seedrandom('edge-test');
    const zones = generateEdgeSpawnZones(city, safehouseCenter, rng);

    expect(zones.length).toBeGreaterThan(0);

    // All zones should be near edges
    for (const zone of zones) {
      const nearEdge =
        zone.position.x <= SPAWN_ZONE.EDGE_INSET + 1 ||
        zone.position.x >= 50 - 1 - SPAWN_ZONE.EDGE_INSET - 1 ||
        zone.position.y <= SPAWN_ZONE.EDGE_INSET + 1 ||
        zone.position.y >= 50 - 1 - SPAWN_ZONE.EDGE_INSET - 1;
      expect(nearEdge).toBe(true);
    }
  });

  it('assigns map_edge type to all zones', () => {
    const city = makeRoadCity(50);
    const rng = seedrandom('edge-type');
    const zones = generateEdgeSpawnZones(city, safehouseCenter, rng);

    for (const zone of zones) {
      expect(zone.type).toBe('map_edge');
    }
  });

  it('computes distance to safehouse', () => {
    const city = makeRoadCity(50);
    const rng = seedrandom('edge-dist');
    const zones = generateEdgeSpawnZones(city, safehouseCenter, rng);

    for (const zone of zones) {
      const expectedDist = tileDistance(zone.position, safehouseCenter);
      expect(zone.distanceToSafehouse).toBeCloseTo(expectedDist);
    }
  });

  it('each zone has at least MIN_SPAWN_POINTS walkable points', () => {
    const city = makeRoadCity(50);
    const rng = seedrandom('edge-min');
    const zones = generateEdgeSpawnZones(city, safehouseCenter, rng);

    for (const zone of zones) {
      expect(zone.spawnPoints.length).toBeGreaterThanOrEqual(
        SPAWN_ZONE.MIN_SPAWN_POINTS,
      );
    }
  });

  it('has unique IDs for each zone', () => {
    const city = makeRoadCity(50);
    const rng = seedrandom('edge-ids');
    const zones = generateEdgeSpawnZones(city, safehouseCenter, rng);

    const ids = zones.map((z) => z.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// generateFarBuildingSpawnZones
// ---------------------------------------------------------------------------

describe('generateFarBuildingSpawnZones', () => {
  it('places zones at buildings far from safehouse', () => {
    const farBuilding = makeBuilding({
      id: 'far',
      origin: { x: 0, y: 0 },
      entryPoints: [makeEntryPoint(3, 0)],
    });

    const city = makeRoadCity(80, [farBuilding]);
    const rng = seedrandom('far-test');
    const zones = generateFarBuildingSpawnZones(
      city,
      safehouseCenter,
      'safehouse-id',
      rng,
    );

    expect(zones.length).toBeGreaterThan(0);
    for (const zone of zones) {
      expect(zone.type).toBe('far_building');
    }
  });

  it('excludes the safehouse building', () => {
    const safehouse = makeBuilding({
      id: 'safehouse',
      origin: { x: 0, y: 0 },
      entryPoints: [makeEntryPoint(3, 0)],
    });

    const city = makeRoadCity(80, [safehouse]);
    const rng = seedrandom('exclude-safe');
    const zones = generateFarBuildingSpawnZones(
      city,
      safehouseCenter,
      'safehouse',
      rng,
    );

    // Safehouse is the only building, so no zones should be generated
    expect(zones.length).toBe(0);
  });

  it('excludes buildings too close to safehouse', () => {
    const nearBuilding = makeBuilding({
      id: 'near',
      origin: { x: 22, y: 22 }, // center at (25, 25) — same as safehouse
      entryPoints: [makeEntryPoint(25, 22)],
    });

    const city = makeRoadCity(80, [nearBuilding]);
    const rng = seedrandom('near-exclude');
    const zones = generateFarBuildingSpawnZones(
      city,
      safehouseCenter,
      'safehouse-id',
      rng,
    );

    expect(zones.length).toBe(0);
  });

  it('assigns far_building type and unique IDs', () => {
    const buildings = Array.from({ length: 3 }, (_, i) =>
      makeBuilding({
        id: `far-${i}`,
        origin: { x: i * 2, y: 0 },
        entryPoints: [makeEntryPoint(i * 2 + 3, 0)],
      }),
    );

    const city = makeRoadCity(80, buildings);
    const rng = seedrandom('far-ids');
    const zones = generateFarBuildingSpawnZones(
      city,
      safehouseCenter,
      'safehouse-id',
      rng,
    );

    for (const zone of zones) {
      expect(zone.type).toBe('far_building');
    }

    const ids = zones.map((z) => z.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// generateSpawnZones (integration)
// ---------------------------------------------------------------------------

describe('generateSpawnZones', () => {
  it('combines edge and far-building zones', () => {
    const farBuilding = makeBuilding({
      id: 'far',
      origin: { x: 0, y: 0 },
      entryPoints: [makeEntryPoint(3, 0)],
    });

    const city = makeRoadCity(80, [farBuilding]);
    const rng = seedrandom('combined');
    const zones = generateSpawnZones(city, safehouseCenter, 'safehouse-id', rng);

    const edgeZones = zones.filter((z) => z.type === 'map_edge');
    const farZones = zones.filter((z) => z.type === 'far_building');

    expect(edgeZones.length).toBeGreaterThan(0);
    expect(farZones.length).toBeGreaterThan(0);
  });

  it('is deterministic with same seed', () => {
    const buildings = [
      makeBuilding({
        id: 'far1',
        origin: { x: 0, y: 0 },
        entryPoints: [makeEntryPoint(3, 0)],
      }),
      makeBuilding({
        id: 'far2',
        origin: { x: 0, y: 10 },
        entryPoints: [makeEntryPoint(3, 10)],
      }),
    ];

    const city = makeRoadCity(80, buildings);

    const rng1 = seedrandom('deterministic');
    const zones1 = generateSpawnZones(city, safehouseCenter, 'safehouse-id', rng1);

    const rng2 = seedrandom('deterministic');
    const zones2 = generateSpawnZones(city, safehouseCenter, 'safehouse-id', rng2);

    expect(zones1.length).toBe(zones2.length);
    for (let i = 0; i < zones1.length; i++) {
      expect(zones1[i].id).toBe(zones2[i].id);
      expect(zones1[i].position).toEqual(zones2[i].position);
    }
  });
});
