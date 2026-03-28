/**
 * World generation orchestrator.
 *
 * A pure TypeScript generator function that runs the full procgen pipeline
 * in sequence, yielding progress updates between stages. The LoadingScene
 * advances this generator one step per frame to keep the browser responsive.
 *
 * Pipeline order:
 *   1. WFC city layout (macro grid → tile grid → building footprints)
 *   2. BSP building interiors (rooms, doors, windows)
 *   3. Safehouse selection (scoring, entry points to defend)
 *   4. Object placement (loot tables, distance-based value scaling)
 *   5. Navigation grid + spawn zones (pathfinding, enemy spawns)
 *
 * Safehouse selection runs before object placement because
 * `populateBuildings` needs the safehouse center for distance-based
 * loot value scaling. The pathfinding grid runs after object placement
 * because `PathfindingGrid.fromCityLayout` applies object blocking.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import { RNG } from '@/lib/rng';
import type { RunConfig } from '@/types/run';
import { GenerationStage, type WorldData, type GenerationProgress } from '@/types/world';
import { generateCityLayout } from './wfc';
import { generateAllInteriors } from './bsp';
import { selectSafehouse } from './safehouse';
import { getBuildingCenter } from './geometry';
import { populateBuildings } from './object-placement';
import { PathfindingGrid } from './pathfinding-grid';
import { generateSpawnZones } from './spawn-zones';

/**
 * Generate a complete game world from a run configuration.
 *
 * Yields {@link GenerationProgress} updates between stages so the caller
 * can display progress. Returns the assembled {@link WorldData} when done.
 *
 * @example
 * ```ts
 * const gen = generateWorld({ seed: 'abc', difficulty: 2, targetMinutes: 15 });
 * let result = gen.next();
 * while (!result.done) {
 *   updateProgressUI(result.value);
 *   result = gen.next();
 * }
 * const worldData: WorldData = result.value;
 * ```
 */
export function* generateWorld(
  config: RunConfig,
): Generator<GenerationProgress, WorldData, void> {
  const rng = new RNG(config.seed);

  // --- Stage 1: City layout (WFC) ---
  yield {
    stage: GenerationStage.CityLayout,
    message: 'Generating city layout...',
    progress: 0,
  };

  const { layout, buildingClasses } = generateCityLayout(config.seed);

  // --- Stage 2: Building interiors (BSP) ---
  yield {
    stage: GenerationStage.BuildingInteriors,
    message: 'Building interiors...',
    progress: 0.2,
  };

  const bspRng = rng.derive('bsp').raw();
  generateAllInteriors(layout, buildingClasses, bspRng);

  // --- Stage 3: Safehouse selection ---
  yield {
    stage: GenerationStage.SafehouseSelection,
    message: 'Selecting safehouse...',
    progress: 0.4,
  };

  const safehouse = selectSafehouse(layout);
  const safehouseCenter = getBuildingCenter(safehouse.building);

  // --- Stage 4: Object placement ---
  yield {
    stage: GenerationStage.ObjectPlacement,
    message: 'Placing objects...',
    progress: 0.6,
  };

  const objectsRng = rng.derive('objects').raw();
  populateBuildings(layout.buildings, safehouseCenter, objectsRng);

  // --- Stage 5: Navigation grid + spawn zones ---
  yield {
    stage: GenerationStage.NavigationGrid,
    message: 'Preparing navigation...',
    progress: 0.8,
  };

  const pathfinding = PathfindingGrid.fromCityLayout(layout);

  const spawnRng = rng.derive('spawns').raw();
  const spawnZones = generateSpawnZones(
    layout,
    safehouseCenter,
    safehouse.building.id,
    spawnRng,
  );

  // --- Complete ---
  return {
    layout,
    buildingClasses,
    safehouse,
    pathfinding,
    spawnZones,
    config,
  };
}
