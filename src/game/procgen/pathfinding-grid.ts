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

/** Returns true if the given tile type should be walkable. */
export function isWalkableTileType(tileType: TileType): boolean {
  switch (tileType) {
    case TileType.Wall:
      return false;
    case TileType.Empty:
    case TileType.Floor:
    case TileType.Door:
    case TileType.Window:
    case TileType.Road:
    case TileType.Sidewalk:
      return true;
    default:
      return false;
  }
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
   * Constructs the walkability matrix from tiles, then layers in
   * movement-blocking objects.
   */
  static fromCityLayout(cityLayout: CityLayout): PathfindingGrid {
    const matrix = buildWalkabilityMatrix(cityLayout);
    applyObjectBlocking(matrix, cityLayout.buildings);
    return new PathfindingGrid(matrix);
  }

  /** Check whether the given tile coordinate is walkable. */
  isWalkable(x: number, y: number): boolean {
    if (!this.isInBounds(x, y)) return false;
    return this.grid.isWalkableAt(x, y);
  }

  /** Update the walkability of a single tile (e.g. barricade placed). */
  setWalkable(x: number, y: number, walkable: boolean): void {
    if (!this.isInBounds(x, y)) return;
    this.grid.setWalkableAt(x, y, walkable);
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
    if (!this.isInBounds(start.x, start.y) || !this.isInBounds(end.x, end.y)) {
      return { path: [], found: false, length: 0 };
    }
    if (!this.grid.isWalkableAt(start.x, start.y) || !this.grid.isWalkableAt(end.x, end.y)) {
      return { path: [], found: false, length: 0 };
    }

    const cloned = this.grid.clone();
    const rawPath = this.finder.findPath(start.x, start.y, end.x, end.y, cloned);

    if (rawPath.length === 0) {
      return { path: [], found: false, length: 0 };
    }

    const path: TileCoord[] = rawPath.map(([x, y]) => ({ x, y }));
    return { path, found: true, length: path.length };
  }

  /**
   * Find a path and smooth it (fewer waypoints for smoother movement).
   */
  findSmoothedPath(start: TileCoord, end: TileCoord): PathResult {
    if (!this.isInBounds(start.x, start.y) || !this.isInBounds(end.x, end.y)) {
      return { path: [], found: false, length: 0 };
    }
    if (!this.grid.isWalkableAt(start.x, start.y) || !this.grid.isWalkableAt(end.x, end.y)) {
      return { path: [], found: false, length: 0 };
    }

    const cloned = this.grid.clone();
    const rawPath = this.finder.findPath(start.x, start.y, end.x, end.y, cloned);

    if (rawPath.length === 0) {
      return { path: [], found: false, length: 0 };
    }

    const smoothed = PF.Util.smoothenPath(this.grid.clone(), rawPath);
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

  /** Check if coordinates are within the grid bounds. */
  private isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }
}
