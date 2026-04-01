/**
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { generateWorld } from './world-generator';
import { GenerationStage } from '@/types/world';
import type { GenerationProgress, WorldData } from '@/types/world';
import type { RunConfig } from '@/types/run';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(seed = 'test-seed-123'): RunConfig {
  return { seed, difficulty: 2, targetMinutes: 15 };
}

/** Exhaust a generator, collecting yields and the return value. */
function exhaust(
  config: RunConfig,
  options?: { gridWidth?: number; gridHeight?: number },
) {
  const gen = generateWorld(config, options);
  const yields: GenerationProgress[] = [];

  let result = gen.next();
  while (!result.done) {
    yields.push(result.value);
    result = gen.next();
  }

  return { yields, worldData: result.value as WorldData };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateWorld', () => {
  it('yields exactly 5 progress updates', () => {
    const { yields } = exhaust(makeConfig());
    expect(yields).toHaveLength(5);
  });

  it('yields all generation stages in order', () => {
    const { yields } = exhaust(makeConfig());
    const stages = yields.map((y) => y.stage);
    expect(stages).toEqual([
      GenerationStage.CityLayout,
      GenerationStage.BuildingInteriors,
      GenerationStage.SafehouseSelection,
      GenerationStage.ObjectPlacement,
      GenerationStage.NavigationGrid,
    ]);
  });

  it('yields monotonically increasing progress values', () => {
    const { yields } = exhaust(makeConfig());
    for (let i = 1; i < yields.length; i++) {
      expect(yields[i].progress).toBeGreaterThan(yields[i - 1].progress);
    }
  });

  it('yields progress starting at 0 and ending below 1', () => {
    const { yields } = exhaust(makeConfig());
    expect(yields[0].progress).toBe(0);
    expect(yields[yields.length - 1].progress).toBeLessThan(1);
  });

  it('yields human-readable messages for each stage', () => {
    const { yields } = exhaust(makeConfig());
    const messages = yields.map((y) => y.message);
    expect(messages).toEqual([
      'Generating city layout...',
      'Building interiors...',
      'Selecting safehouse...',
      'Placing objects...',
      'Preparing navigation...',
    ]);
  });

  it('returns WorldData with all required fields', () => {
    const { worldData } = exhaust(makeConfig());
    expect(worldData.layout).toBeDefined();
    expect(worldData.layout.tiles).toBeDefined();
    expect(worldData.layout.buildings.length).toBeGreaterThan(0);
    expect(worldData.buildingClasses).toBeInstanceOf(Map);
    expect(worldData.safehouse).toBeDefined();
    expect(worldData.safehouse.building).toBeDefined();
    expect(worldData.pathfinding).toBeDefined();
    expect(worldData.spawnZones).toBeDefined();
    expect(worldData.config).toBeDefined();
  });

  it('preserves the run config in the returned WorldData', () => {
    const config = makeConfig('my-seed');
    const { worldData } = exhaust(config);
    expect(worldData.config).toEqual(config);
  });

  it('produces a city layout with expected dimensions', () => {
    const { worldData } = exhaust(makeConfig());
    // Default WFC grid is 32x32 macro tiles, 8 tiles each → 256×256
    expect(worldData.layout.widthTiles).toBe(256);
    expect(worldData.layout.heightTiles).toBe(256);
    expect(worldData.layout.tiles).toHaveLength(256);
    expect(worldData.layout.tiles[0]).toHaveLength(256);
  });

  it('selects a safehouse with entry points to defend', () => {
    const { worldData } = exhaust(makeConfig());
    expect(worldData.safehouse.entryPointsToDefend.length).toBeGreaterThan(0);
  });

  it('produces the same world for the same seed (determinism)', () => {
    // Use an 8×8 macro grid (64×64 tiles) so running the pipeline twice
    // stays well within CI timeouts. The full 32×32 grid is exercised by
    // the dimension and performance tests — this test only verifies that
    // identical seeds produce identical output.
    const config = makeConfig('determinism-check');
    const gridOptions = { gridWidth: 8, gridHeight: 8 };
    const { worldData: first } = exhaust(config, gridOptions);
    const { worldData: second } = exhaust(config, gridOptions);

    // Same tile grid
    expect(first.layout.tiles).toEqual(second.layout.tiles);
    // Same buildings
    expect(first.layout.buildings).toEqual(second.layout.buildings);
    // Same safehouse selection
    expect(first.safehouse.buildingIndex).toBe(second.safehouse.buildingIndex);
    // Same spawn zones
    expect(first.spawnZones).toEqual(second.spawnZones);
  }, 15_000);

  it('produces different worlds for different seeds', () => {
    const { worldData: a } = exhaust(makeConfig('seed-alpha'));
    const { worldData: b } = exhaust(makeConfig('seed-beta'));

    // Building lists or safehouse choices should differ
    // (tiles will definitely differ due to WFC randomness)
    const aTiles = a.layout.tiles.flat();
    const bTiles = b.layout.tiles.flat();
    const differ = aTiles.some((t, i) => t !== bTiles[i]);
    expect(differ).toBe(true);
  });

  it('generates spawn zones', () => {
    const { worldData } = exhaust(makeConfig());
    expect(worldData.spawnZones.length).toBeGreaterThan(0);
  });

  it('pathfinding grid has dimensions matching the layout', () => {
    const { worldData } = exhaust(makeConfig());
    expect(worldData.pathfinding.width).toBe(worldData.layout.widthTiles);
    expect(worldData.pathfinding.height).toBe(worldData.layout.heightTiles);
  });
});
