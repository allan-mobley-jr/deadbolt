// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  getBuildingCenter,
  tileDistance,
  countNearbyLoot,
  scoreBuilding,
  selectSafehouse,
} from './safehouse';
import { TileType, ObjectCategory } from '@/types/procgen';
import type { Building, CityLayout, EntryPoint, PlacedObject } from '@/types/procgen';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeEntryPoint(
  x: number,
  y: number,
  type: 'door' | 'window' = 'door',
): EntryPoint {
  return {
    position: { x, y },
    type,
    facingDirection: 'north',
    roomIndex: 0,
    barricaded: false,
  };
}

function makeLoot(x: number, y: number, objectType = 'medkit'): PlacedObject {
  return {
    position: { x, y },
    category: ObjectCategory.Loot,
    blocksMovement: false,
    objectType,
  };
}

function makeFurniture(x: number, y: number, objectType = 'sofa'): PlacedObject {
  return {
    position: { x, y },
    category: ObjectCategory.Furniture,
    blocksMovement: true,
    objectType,
  };
}

function makeBuilding(overrides: Partial<Building> & { id: string }): Building {
  return {
    origin: { x: 0, y: 0 },
    width: 8,
    height: 8,
    rooms: [],
    entryPoints: [],
    objects: [],
    ...overrides,
  };
}

function makeLayout(buildings: Building[]): CityLayout {
  const size = 50;
  const tiles: TileType[][] = Array.from({ length: size }, () =>
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

// ---------------------------------------------------------------------------
// getBuildingCenter
// ---------------------------------------------------------------------------

describe('getBuildingCenter', () => {
  it('computes the center of a building bounding box', () => {
    const b = makeBuilding({ id: 'b1', origin: { x: 10, y: 20 }, width: 6, height: 4 });
    expect(getBuildingCenter(b)).toEqual({ x: 13, y: 22 });
  });

  it('floors fractional centers', () => {
    const b = makeBuilding({ id: 'b1', origin: { x: 0, y: 0 }, width: 5, height: 5 });
    expect(getBuildingCenter(b)).toEqual({ x: 2, y: 2 });
  });
});

// ---------------------------------------------------------------------------
// tileDistance
// ---------------------------------------------------------------------------

describe('tileDistance', () => {
  it('returns 0 for same point', () => {
    expect(tileDistance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });

  it('returns correct Euclidean distance', () => {
    expect(tileDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// countNearbyLoot
// ---------------------------------------------------------------------------

describe('countNearbyLoot', () => {
  it('counts loot in the building itself', () => {
    const b = makeBuilding({
      id: 'b1',
      objects: [makeLoot(1, 1), makeLoot(2, 2), makeFurniture(3, 3)],
    });

    expect(countNearbyLoot(b, [b], 10)).toBe(2);
  });

  it('includes loot from neighbouring buildings within radius', () => {
    const b1 = makeBuilding({
      id: 'b1',
      origin: { x: 0, y: 0 },
      width: 6,
      height: 6,
      objects: [makeLoot(1, 1)],
    });
    const b2 = makeBuilding({
      id: 'b2',
      origin: { x: 5, y: 0 },
      width: 6,
      height: 6,
      objects: [makeLoot(6, 1), makeLoot(7, 2)],
    });

    // b2 center is at (8, 3), b1 center is at (3, 3) → distance ~5 → within radius 10
    expect(countNearbyLoot(b1, [b1, b2], 10)).toBe(3);
  });

  it('excludes loot from distant buildings', () => {
    const b1 = makeBuilding({
      id: 'b1',
      origin: { x: 0, y: 0 },
      objects: [makeLoot(1, 1)],
    });
    const distant = makeBuilding({
      id: 'b-far',
      origin: { x: 100, y: 100 },
      objects: [makeLoot(101, 101), makeLoot(102, 102)],
    });

    expect(countNearbyLoot(b1, [b1, distant], 10)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// scoreBuilding
// ---------------------------------------------------------------------------

describe('scoreBuilding', () => {
  it('gives higher score to buildings with fewer entry points', () => {
    const b1 = makeBuilding({
      id: 'b1',
      entryPoints: [makeEntryPoint(1, 0)],
    });
    const b2 = makeBuilding({
      id: 'b2',
      entryPoints: [
        makeEntryPoint(1, 0),
        makeEntryPoint(2, 0),
        makeEntryPoint(3, 0),
        makeEntryPoint(4, 0),
        makeEntryPoint(5, 0),
        makeEntryPoint(6, 0),
      ],
    });

    const layout = makeLayout([b1, b2]);
    const s1 = scoreBuilding(b1, layout);
    const s2 = scoreBuilding(b2, layout);

    expect(s1.entryPointScore).toBeGreaterThan(s2.entryPointScore);
  });

  it('applies excess penalty for many entry points', () => {
    const b = makeBuilding({
      id: 'b1',
      entryPoints: Array.from({ length: 8 }, (_, i) =>
        makeEntryPoint(i, 0),
      ),
    });

    const layout = makeLayout([b]);
    const score = scoreBuilding(b, layout);

    // With 8 entry points (4 excess), penalty is significant
    // entryBase = 30 * (1/8) = 3.75
    // penalty = 4 * 5 = 20
    // entryPointScore = max(0, 3.75 - 20) = 0
    expect(score.entryPointScore).toBe(0);
  });

  it('gives higher loot proximity score when more loot nearby', () => {
    const b1 = makeBuilding({
      id: 'b1',
      objects: [makeLoot(1, 1), makeLoot(2, 2), makeLoot(3, 3)],
    });
    // Place b2 far away so it doesn't benefit from b1's loot proximity
    const b2 = makeBuilding({
      id: 'b2',
      origin: { x: 40, y: 40 },
      objects: [],
    });

    const layout = makeLayout([b1, b2]);
    const s1 = scoreBuilding(b1, layout);
    const s2 = scoreBuilding(b2, layout);

    expect(s1.lootProximityScore).toBeGreaterThan(s2.lootProximityScore);
  });

  it('gives higher size score to buildings in the ideal range', () => {
    // Ideal range: 40-120 tiles
    const ideal = makeBuilding({ id: 'ideal', width: 10, height: 8 }); // 80 tiles
    const tiny = makeBuilding({ id: 'tiny', width: 3, height: 3 });    // 9 tiles
    const huge = makeBuilding({ id: 'huge', width: 20, height: 20 });  // 400 tiles

    const layout = makeLayout([ideal, tiny, huge]);

    const sIdeal = scoreBuilding(ideal, layout);
    const sTiny = scoreBuilding(tiny, layout);
    const sHuge = scoreBuilding(huge, layout);

    expect(sIdeal.buildingSizeScore).toBeGreaterThan(sTiny.buildingSizeScore);
    expect(sIdeal.buildingSizeScore).toBeGreaterThan(sHuge.buildingSizeScore);
  });

  it('gives higher object density score with more furniture', () => {
    const furnished = makeBuilding({
      id: 'b1',
      objects: Array.from({ length: 5 }, (_, i) =>
        makeFurniture(i, 0),
      ),
    });
    const empty = makeBuilding({ id: 'b2', objects: [] });

    const layout = makeLayout([furnished, empty]);
    const s1 = scoreBuilding(furnished, layout);
    const s2 = scoreBuilding(empty, layout);

    expect(s1.objectDensityScore).toBeGreaterThan(s2.objectDensityScore);
  });

  it('produces a non-negative total score', () => {
    const b = makeBuilding({
      id: 'b1',
      entryPoints: Array.from({ length: 10 }, (_, i) =>
        makeEntryPoint(i, 0),
      ),
    });

    const layout = makeLayout([b]);
    const score = scoreBuilding(b, layout);

    expect(score.totalScore).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// selectSafehouse
// ---------------------------------------------------------------------------

describe('selectSafehouse', () => {
  it('selects the highest-scoring building', () => {
    // b1: 1 entry point, lots of furniture → should win
    const b1 = makeBuilding({
      id: 'best',
      width: 10,
      height: 8,
      entryPoints: [makeEntryPoint(1, 0)],
      objects: [
        makeLoot(1, 1),
        makeLoot(2, 2),
        makeLoot(3, 3),
        makeFurniture(4, 4),
        makeFurniture(5, 5),
      ],
    });

    // b2: many entry points, no objects → should lose
    const b2 = makeBuilding({
      id: 'worst',
      width: 10,
      height: 8,
      origin: { x: 20, y: 20 },
      entryPoints: Array.from({ length: 6 }, (_, i) =>
        makeEntryPoint(20 + i, 20),
      ),
      objects: [],
    });

    const layout = makeLayout([b1, b2]);
    const result = selectSafehouse(layout);

    expect(result.building.id).toBe('best');
    expect(result.buildingIndex).toBe(0);
  });

  it('filters out buildings below MIN_SAFEHOUSE_AREA', () => {
    const tiny = makeBuilding({
      id: 'tiny',
      width: 3,
      height: 3, // 9 tiles < MIN_SAFEHOUSE_AREA (25)
      entryPoints: [makeEntryPoint(1, 0)],
      objects: [makeLoot(1, 1), makeLoot(2, 2), makeLoot(3, 3)],
    });

    const big = makeBuilding({
      id: 'big',
      width: 10,
      height: 8,
      origin: { x: 20, y: 20 },
      entryPoints: Array.from({ length: 4 }, (_, i) =>
        makeEntryPoint(20 + i, 20),
      ),
      objects: [],
    });

    const layout = makeLayout([tiny, big]);
    const result = selectSafehouse(layout);

    // Even though tiny has great stats, it's too small
    expect(result.building.id).toBe('big');
  });

  it('falls back to largest building when none meet minimum area', () => {
    const small1 = makeBuilding({ id: 's1', width: 3, height: 3 });
    const small2 = makeBuilding({
      id: 's2',
      width: 4,
      height: 4,
      origin: { x: 10, y: 10 },
    }); // 16 tiles, still under 25

    const layout = makeLayout([small1, small2]);
    const result = selectSafehouse(layout);

    // s2 is larger (16 > 9)
    expect(result.building.id).toBe('s2');
  });

  it('throws when city has no buildings', () => {
    const layout = makeLayout([]);
    expect(() => selectSafehouse(layout)).toThrow('Cannot select safehouse');
  });

  it('returns all unbarricaded entry points to defend', () => {
    const b = makeBuilding({
      id: 'b1',
      width: 10,
      height: 8,
      entryPoints: [
        { ...makeEntryPoint(1, 0), barricaded: false },
        { ...makeEntryPoint(2, 0), barricaded: true },
        { ...makeEntryPoint(3, 0), barricaded: false },
      ],
    });

    const layout = makeLayout([b]);
    const result = selectSafehouse(layout);

    expect(result.entryPointsToDefend).toHaveLength(2);
    expect(result.entryPointsToDefend.every((ep) => !ep.barricaded)).toBe(true);
  });

  it('provides a minimap position at building center', () => {
    const b = makeBuilding({
      id: 'b1',
      origin: { x: 10, y: 20 },
      width: 6,
      height: 4,
    });

    const layout = makeLayout([b]);
    const result = selectSafehouse(layout);

    expect(result.minimapPosition).toEqual({ x: 13, y: 22 });
  });

  it('is deterministic — same input produces same output', () => {
    const buildings = Array.from({ length: 5 }, (_, i) =>
      makeBuilding({
        id: `b${i}`,
        origin: { x: i * 12, y: i * 12 },
        width: 8 + i,
        height: 7 + i,
        entryPoints: Array.from({ length: i + 1 }, (_, j) =>
          makeEntryPoint(i * 12 + j, i * 12),
        ),
        objects: Array.from({ length: i }, (_, j) =>
          makeLoot(i * 12 + j, i * 12 + 1),
        ),
      }),
    );

    const layout = makeLayout(buildings);
    const r1 = selectSafehouse(layout);
    const r2 = selectSafehouse(layout);

    expect(r1.buildingIndex).toBe(r2.buildingIndex);
    expect(r1.scoreBreakdown.totalScore).toBe(r2.scoreBreakdown.totalScore);
  });
});
