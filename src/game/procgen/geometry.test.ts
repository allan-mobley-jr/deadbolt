// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { tileDistance, getBuildingCenter } from './geometry';
import type { Building } from '@/types/procgen';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeBuilding(
  overrides: Partial<Building> & Pick<Building, 'origin' | 'width' | 'height'>,
): Building {
  return {
    id: 'test',
    rooms: [],
    entryPoints: [],
    objects: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// tileDistance
// ---------------------------------------------------------------------------

describe('tileDistance', () => {
  it('returns 0 for identical points', () => {
    expect(tileDistance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });

  it('returns correct Euclidean distance for 3-4-5 triangle', () => {
    expect(tileDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('handles negative coordinates', () => {
    expect(tileDistance({ x: -3, y: -4 }, { x: 0, y: 0 })).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// getBuildingCenter
// ---------------------------------------------------------------------------

describe('getBuildingCenter', () => {
  it('computes center of even-dimension building', () => {
    const b = makeBuilding({
      origin: { x: 10, y: 20 },
      width: 6,
      height: 4,
    });
    expect(getBuildingCenter(b)).toEqual({ x: 13, y: 22 });
  });

  it('floors fractional centers for odd dimensions', () => {
    const b = makeBuilding({
      origin: { x: 0, y: 0 },
      width: 5,
      height: 5,
    });
    expect(getBuildingCenter(b)).toEqual({ x: 2, y: 2 });
  });

  it('handles zero-origin building', () => {
    const b = makeBuilding({
      origin: { x: 0, y: 0 },
      width: 2,
      height: 2,
    });
    expect(getBuildingCenter(b)).toEqual({ x: 1, y: 1 });
  });
});
