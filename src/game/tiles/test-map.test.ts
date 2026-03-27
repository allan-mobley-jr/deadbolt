import { describe, it, expect } from 'vitest';
import {
  createTestMap,
  TEST_MAP_WIDTH,
  TEST_MAP_HEIGHT,
  PLAYER_SPAWN,
} from './test-map';
import { TileType } from './tile-types';

describe('createTestMap', () => {
  const tiles = createTestMap();

  it('returns the correct dimensions', () => {
    expect(tiles).toHaveLength(TEST_MAP_HEIGHT);
    for (const row of tiles) {
      expect(row).toHaveLength(TEST_MAP_WIDTH);
    }
  });

  it('contains only valid TileType values', () => {
    const validValues = new Set(
      Object.values(TileType).filter((v): v is number => typeof v === 'number'),
    );
    for (let y = 0; y < tiles.length; y++) {
      for (let x = 0; x < tiles[y].length; x++) {
        expect(validValues.has(tiles[y][x])).toBe(true);
      }
    }
  });

  it('contains at least one Wall tile', () => {
    const hasWall = tiles.some((row) => row.includes(TileType.Wall));
    expect(hasWall).toBe(true);
  });

  it('contains at least one Floor tile', () => {
    const hasFloor = tiles.some((row) => row.includes(TileType.Floor));
    expect(hasFloor).toBe(true);
  });

  it('contains at least one Door tile', () => {
    const hasDoor = tiles.some((row) => row.includes(TileType.Door));
    expect(hasDoor).toBe(true);
  });

  it('contains at least one Window tile', () => {
    const hasWindow = tiles.some((row) => row.includes(TileType.Window));
    expect(hasWindow).toBe(true);
  });

  it('contains at least one Road tile', () => {
    const hasRoad = tiles.some((row) => row.includes(TileType.Road));
    expect(hasRoad).toBe(true);
  });

  it('contains at least one Grass tile', () => {
    const hasGrass = tiles.some((row) => row.includes(TileType.Grass));
    expect(hasGrass).toBe(true);
  });

  it('contains at least one Sidewalk tile', () => {
    const hasSidewalk = tiles.some((row) => row.includes(TileType.Sidewalk));
    expect(hasSidewalk).toBe(true);
  });
});

describe('PLAYER_SPAWN', () => {
  const tiles = createTestMap();

  it('is within map bounds', () => {
    expect(PLAYER_SPAWN.x).toBeGreaterThanOrEqual(0);
    expect(PLAYER_SPAWN.x).toBeLessThan(TEST_MAP_WIDTH);
    expect(PLAYER_SPAWN.y).toBeGreaterThanOrEqual(0);
    expect(PLAYER_SPAWN.y).toBeLessThan(TEST_MAP_HEIGHT);
  });

  it('is on a Floor tile', () => {
    expect(tiles[PLAYER_SPAWN.y][PLAYER_SPAWN.x]).toBe(TileType.Floor);
  });
});
