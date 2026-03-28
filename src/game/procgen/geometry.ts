/**
 * Shared tile-space geometry utilities.
 *
 * Used by safehouse selection, spawn zone placement, and other procgen
 * systems that need distance and center calculations.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import type { TileCoord, Building } from '@/types/procgen';

/** Euclidean distance between two tile coordinates. */
export function tileDistance(a: TileCoord, b: TileCoord): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Calculate the center tile of a building's bounding box. */
export function getBuildingCenter(building: Building): TileCoord {
  return {
    x: Math.floor(building.origin.x + building.width / 2),
    y: Math.floor(building.origin.y + building.height / 2),
  };
}
