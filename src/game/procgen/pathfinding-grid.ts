/**
 * Pathfinding grid system — wraps PathFinding.js with a clean API.
 *
 * Constructs a walkability grid from a CityLayout and exposes:
 *   - Path queries (A* with diagonal movement)
 *   - Runtime walkability updates (for barricade placement / destruction)
 *   - Grid export for minimap rendering
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import PF from 'pathfinding';
import type {
  CityLayout,
  TileCoord,
  PathResult,
  Building,
} from '@/types/procgen';
import { TileType } from '@/types/procgen';
import { PATHFINDING } from './constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the given tile type should be walkable.
 *
 * Uses exhaustive matching — adding a new TileType without updating this
 * function will produce a compile-time error.
 */
export function isWalkableTileType(tileType: TileType): boolean {
  switch (tileType) {
    case TileType.Wall:
    case TileType.Empty:
      return false;
    case TileType.Floor:
    case TileType.Door:
    case TileType.Window:
    case TileType.Road:
    case TileType.Sidewalk:
      return true;
  }
  // Exhaustive check: compile error if a new TileType is added without handling.
  const _exhaustive: never = tileType;
  throw new Error(`Unknown TileType: ${_exhaustive}`);
}

/**
 * Convert a CityLayout's tile grid into a 0/1 walkability matrix.
 *
 * 0 = walkable, 1 = blocked (PathFinding.js convention).
 */
export function buildWalkabilityMatrix(cityLayout: CityLayout): number[][] {
  const { widthTiles, heightTiles, tiles } = cityLayout;
  const matrix: number[][] = [];

  for (let y = 0; y < heightTiles; y++) {
    const row: number[] = [];
    for (let x = 0; x < widthTiles; x++) {
      const tileType = tiles[y]?.[x] ?? TileType.Wall;
      row.push(isWalkableTileType(tileType) ? 0 : 1);
    }
    matrix.push(row);
  }

  return matrix;
}

/**
 * Mark tiles occupied by movement-blocking objects as non-walkable.
 *
 * Call this after initial grid construction to layer in object collisions.
 */
export function applyObjectBlocking(
  matrix: number[][],
  buildings: Building[],
): void {
  for (const building of buildings) {
    for (const obj of building.objects) {
      if (obj.blocksMovement) {
        const { x, y } = obj.position;
        if (matrix[y]?.[x] !== undefined) {
          matrix[y][x] = 1;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// PathfindingGrid class
// ---------------------------------------------------------------------------

const NO_PATH: PathResult = { path: [], found: false, length: 0 };

export class PathfindingGrid {
  private grid: PF.Grid;
  private readonly finder: PF.AStarFinder;
  readonly width: number;
  readonly height: number;

  constructor(matrix: number[][]) {
    this.grid = new PF.Grid(matrix);
    this.width = this.grid.width;
    this.height = this.grid.height;
    this.finder = new PF.AStarFinder({
      diagonalMovement: PATHFINDING.DIAGONAL_MOVEMENT,
      weight: PATHFINDING.ASTAR_WEIGHT,
    });
  }

  /**
   * Build a PathfindingGrid from a CityLayout.
   *
   * Validates grid dimensions, constructs the walkability matrix from tiles,
   * then layers in movement-blocking objects.
   *
   * @throws if the city layout has zero or negative dimensions.
   */
  static fromCityLayout(cityLayout: CityLayout): PathfindingGrid {
    if (cityLayout.widthTiles <= 0 || cityLayout.heightTiles <= 0) {
      throw new Error(
        `Cannot create PathfindingGrid from empty CityLayout ` +
        `(${cityLayout.widthTiles}x${cityLayout.heightTiles})`,
      );
    }
    const matrix = buildWalkabilityMatrix(cityLayout);
    applyObjectBlocking(matrix, cityLayout.buildings);
    return new PathfindingGrid(matrix);
  }

  /** Check whether the given tile coordinate is walkable. */
  isWalkable(x: number, y: number): boolean {
    if (!this.isInBounds(x, y)) return false;
    return this.grid.isWalkableAt(x, y);
  }

  /**
   * Update the walkability of a single tile (e.g. barricade placed).
   *
   * @returns true if the update was applied, false if out of bounds.
   */
  setWalkable(x: number, y: number, walkable: boolean): boolean {
    if (!this.isInBounds(x, y)) return false;
    this.grid.setWalkableAt(x, y, walkable);
    return true;
  }

  /** Batch-update walkability for multiple tiles. */
  setWalkableBatch(updates: Array<{ coord: TileCoord; walkable: boolean }>): void {
    for (const { coord, walkable } of updates) {
      this.setWalkable(coord.x, coord.y, walkable);
    }
  }

  /**
   * Find the shortest path between two tile coordinates.
   *
   * The internal grid is cloned before each search because PathFinding.js
   * mutates grid node state during traversal.
   */
  findPath(start: TileCoord, end: TileCoord): PathResult {
    if (!this.canPathBetween(start, end)) return NO_PATH;

    const cloned = this.grid.clone();
    const rawPath = this.finder.findPath(start.x, start.y, end.x, end.y, cloned);

    if (rawPath.length === 0) return NO_PATH;

    const path: TileCoord[] = rawPath.map(([x, y]) => ({ x, y }));
    return { path, found: true, length: path.length };
  }

  /**
   * Find a path and smooth it (fewer waypoints for smoother movement).
   *
   * Two separate grid clones are used: one for the A* search (which
   * mutates node state) and one for smooth-path line-of-sight checks.
   */
  findSmoothedPath(start: TileCoord, end: TileCoord): PathResult {
    if (!this.canPathBetween(start, end)) return NO_PATH;

    const searchClone = this.grid.clone();
    const rawPath = this.finder.findPath(start.x, start.y, end.x, end.y, searchClone);

    if (rawPath.length === 0) return NO_PATH;

    // Fresh clone for smoothing — the search clone has mutated node state.
    const smoothClone = this.grid.clone();
    const smoothed = PF.Util.smoothenPath(smoothClone, rawPath);
    const path: TileCoord[] = smoothed.map(([x, y]) => ({ x, y }));
    return { path, found: true, length: path.length };
  }

  /** Quick existence check — can a path be found? */
  hasPath(start: TileCoord, end: TileCoord): boolean {
    return this.findPath(start, end).found;
  }

  /** Get grid dimensions. */
  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /** Export the current walkability state as a 0/1 matrix (for minimap). */
  toMatrix(): number[][] {
    const matrix: number[][] = [];
    for (let y = 0; y < this.height; y++) {
      const row: number[] = [];
      for (let x = 0; x < this.width; x++) {
        row.push(this.grid.isWalkableAt(x, y) ? 0 : 1);
      }
      matrix.push(row);
    }
    return matrix;
  }

  /** Check whether both endpoints are in-bounds and walkable. */
  private canPathBetween(start: TileCoord, end: TileCoord): boolean {
    return (
      this.isInBounds(start.x, start.y) &&
      this.isInBounds(end.x, end.y) &&
      this.grid.isWalkableAt(start.x, start.y) &&
      this.grid.isWalkableAt(end.x, end.y)
    );
  }

  /** Check if coordinates are within the grid bounds. */
  private isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }
}
