/**
 * Safehouse selection algorithm.
 *
 * Scores every candidate building in a CityLayout and selects the one
 * that is most defensible for the player.
 *
 * Scoring factors (all normalised to 0-1 before weighting):
 *   1. Entry points — fewer is better (easier to barricade)
 *   2. Loot proximity — nearby loot objects are valuable
 *   3. Building size — should fall within an ideal range
 *   4. Object density — furniture provides cover
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import type {
  Building,
  CityLayout,
  SafehouseResult,
  SafehouseScoreBreakdown,
} from '@/types/procgen';
import { ObjectCategory } from '@/types/procgen';
import { tileDistance, getBuildingCenter } from './geometry';
import {
  SAFEHOUSE_WEIGHTS,
  IDEAL_SIZE_MIN,
  IDEAL_SIZE_MAX,
  MIN_SAFEHOUSE_AREA,
  LOOT_NORM_CAP,
  OBJECT_NORM_CAP,
  LOOT_SEARCH_RADIUS,
} from './constants';

// Re-export geometry helpers for consumers that imported them from here.
export { tileDistance, getBuildingCenter } from './geometry';

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

/**
 * Count loot objects inside the given building and in neighbouring
 * buildings within a search radius.
 */
export function countNearbyLoot(
  building: Building,
  allBuildings: Building[],
  radius: number,
): number {
  const center = getBuildingCenter(building);
  let count = 0;

  for (const b of allBuildings) {
    const bCenter = getBuildingCenter(b);
    if (b.id !== building.id && tileDistance(center, bCenter) > radius) {
      continue;
    }
    for (const obj of b.objects) {
      if (obj.category === ObjectCategory.Loot) {
        count++;
      }
    }
  }

  return count;
}

/** Count non-loot objects that provide cover (furniture, containers). */
function countCoverObjects(building: Building): number {
  let count = 0;
  for (const obj of building.objects) {
    if (
      obj.category === ObjectCategory.Furniture ||
      obj.category === ObjectCategory.Container
    ) {
      count++;
    }
  }
  return count;
}

/** Compute the building-size fitness score (0-1). */
function sizeFitness(area: number): number {
  if (area >= IDEAL_SIZE_MIN && area <= IDEAL_SIZE_MAX) return 1;

  if (area < IDEAL_SIZE_MIN) {
    // Linear decay below ideal minimum
    return Math.max(0, area / IDEAL_SIZE_MIN);
  }

  // Linear decay above ideal maximum (capped at 2x ideal max → 0)
  const excess = area - IDEAL_SIZE_MAX;
  return Math.max(0, 1 - excess / IDEAL_SIZE_MAX);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Score a single building as a safehouse candidate. */
export function scoreBuilding(
  building: Building,
  cityLayout: CityLayout,
): SafehouseScoreBreakdown {
  const W = SAFEHOUSE_WEIGHTS;
  const entryCount = building.entryPoints.length;

  // Buildings with zero entry points are sealed — not valid safehouse candidates.
  // Return zero score so they are never selected over valid buildings.
  if (entryCount === 0) {
    return {
      entryPointScore: 0,
      lootProximityScore: 0,
      buildingSizeScore: 0,
      objectDensityScore: 0,
      totalScore: 0,
    };
  }

  // 1. Entry-point defensibility — fewer is better
  const entryBase = W.ENTRY_POINTS * (1 / Math.max(1, entryCount));
  const excessPenalty =
    entryCount > W.ENTRY_POINT_PENALTY_THRESHOLD
      ? (entryCount - W.ENTRY_POINT_PENALTY_THRESHOLD) * W.ENTRY_POINT_EXCESS_PENALTY
      : 0;
  const entryPointScore = Math.max(0, entryBase - excessPenalty);

  // 2. Loot proximity
  const lootCount = countNearbyLoot(
    building,
    cityLayout.buildings,
    LOOT_SEARCH_RADIUS,
  );
  const lootProximityScore =
    W.LOOT_PROXIMITY * Math.min(1, lootCount / LOOT_NORM_CAP);

  // 3. Building size fitness
  const area = building.width * building.height;
  const buildingSizeScore = W.BUILDING_SIZE * sizeFitness(area);

  // 4. Object density (cover)
  const coverCount = countCoverObjects(building);
  const objectDensityScore =
    W.OBJECT_DENSITY * Math.min(1, coverCount / OBJECT_NORM_CAP);

  const totalScore =
    entryPointScore + lootProximityScore + buildingSizeScore + objectDensityScore;

  return {
    entryPointScore,
    lootProximityScore,
    buildingSizeScore,
    objectDensityScore,
    totalScore,
  };
}

/**
 * Select the best safehouse from a city layout.
 *
 * Iterates all buildings, scores each, and returns the highest-scoring
 * candidate that meets the minimum area requirement and has at least
 * one entry point.
 *
 * If no building qualifies, the largest building with entry points is
 * selected as a fallback and `usedFallback` is set to true.
 *
 * @throws if the city has no buildings, or if no building has entry points.
 */
export function selectSafehouse(cityLayout: CityLayout): SafehouseResult {
  const { buildings } = cityLayout;

  if (buildings.length === 0) {
    throw new Error('Cannot select safehouse: city has no buildings');
  }

  let bestScore = -Infinity;
  let bestIndex = -1;
  let bestBreakdown: SafehouseScoreBreakdown | null = null;

  let largestAreaWithEntry = -1;
  let largestIndexWithEntry = -1;

  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    const area = building.width * building.height;

    // Track largest building with entry points as fallback
    if (building.entryPoints.length > 0 && area > largestAreaWithEntry) {
      largestAreaWithEntry = area;
      largestIndexWithEntry = i;
    }

    // Skip buildings below minimum area or with no entry points (sealed)
    if (area < MIN_SAFEHOUSE_AREA) continue;
    if (building.entryPoints.length === 0) continue;

    const breakdown = scoreBuilding(building, cityLayout);

    if (breakdown.totalScore > bestScore) {
      bestScore = breakdown.totalScore;
      bestIndex = i;
      bestBreakdown = breakdown;
    }
  }

  // Fallback: no building met minimum area → use largest with entry points
  let usedFallback = false;
  if (bestIndex === -1) {
    if (largestIndexWithEntry === -1) {
      throw new Error(
        'Cannot select safehouse: no building has entry points',
      );
    }
    bestIndex = largestIndexWithEntry;
    bestBreakdown = scoreBuilding(buildings[largestIndexWithEntry], cityLayout);
    usedFallback = true;
  }

  if (bestBreakdown === null) {
    throw new Error('selectSafehouse: internal error — no score breakdown computed');
  }

  const selected = buildings[bestIndex];

  return {
    building: selected,
    buildingIndex: bestIndex,
    scoreBreakdown: bestBreakdown,
    entryPointsToDefend: selected.entryPoints.filter((ep) => !ep.barricaded),
    minimapPosition: getBuildingCenter(selected),
    usedFallback,
  };
}
