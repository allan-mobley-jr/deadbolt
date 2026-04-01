/**
 * Flow field — a pre-computed grid of direction vectors toward a target.
 *
 * Instead of computing individual A* paths for each zombie, a single BFS
 * from the target outward fills every reachable cell with the direction
 * to move toward the target. Zombies read their direction in O(1).
 *
 * BFS guarantees shortest path on an unweighted grid. It does NOT mutate
 * the PathFinding.js grid (only reads walkability), so no cloning is needed.
 *
 * Memory: width × height bytes (256×256 = 64KB per field).
 *
 * NO React imports — this is pure TypeScript.
 */

import type { PathfindingGrid } from "./pathfinding-grid";

// ---------------------------------------------------------------------------
// Direction encoding
// ---------------------------------------------------------------------------

/**
 * Directions encoded as a single byte per cell.
 *   0 = unreachable (no path to target)
 *   1-8 = N, NE, E, SE, S, SW, W, NW
 *   9 = at target (or adjacent to target)
 */
const DIR_UNREACHABLE = 0;
const DIR_N = 1;
const DIR_NE = 2;
const DIR_E = 3;
const DIR_SE = 4;
const DIR_S = 5;
const DIR_SW = 6;
const DIR_W = 7;
const DIR_NW = 8;
const DIR_AT_TARGET = 9;

/** Direction → (dx, dy) velocity unit vector. */
const DIR_VECTORS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 0, dy: 0 },   // 0: unreachable
  { dx: 0, dy: -1 },  // 1: N
  { dx: 1, dy: -1 },  // 2: NE
  { dx: 1, dy: 0 },   // 3: E
  { dx: 1, dy: 1 },   // 4: SE
  { dx: 0, dy: 1 },   // 5: S
  { dx: -1, dy: 1 },  // 6: SW
  { dx: -1, dy: 0 },  // 7: W
  { dx: -1, dy: -1 }, // 8: NW
  { dx: 0, dy: 0 },   // 9: at target
];

/**
 * Direction lookup: given (dx, dy) offset from neighbor to current cell,
 * return the direction the zombie at the neighbor should move to reach
 * the current cell. The offset IS the movement direction.
 *
 * Encoded as: direction = OFFSET_TO_DIR[(dy+1)*3 + (dx+1)]
 * where dx, dy ∈ {-1, 0, 1}.
 *
 * Index map:
 *   0=(-1,-1)→NW  1=(0,-1)→N   2=(1,-1)→NE
 *   3=(-1, 0)→W   4=(0, 0)→AT  5=(1, 0)→E
 *   6=(-1, 1)→SW  7=(0, 1)→S   8=(1, 1)→SE
 */
const OFFSET_TO_DIR: readonly number[] = [
  DIR_NW, DIR_N, DIR_NE,
  DIR_W, DIR_AT_TARGET, DIR_E,
  DIR_SW, DIR_S, DIR_SE,
];

// ---------------------------------------------------------------------------
// BFS neighbor offsets (8-connected, diagonal only when no obstacles)
// ---------------------------------------------------------------------------

/** Cardinal + diagonal neighbor offsets. */
const NEIGHBORS: ReadonlyArray<{ dx: number; dy: number; diagonal: boolean }> = [
  { dx: 0, dy: -1, diagonal: false }, // N
  { dx: 1, dy: 0, diagonal: false },  // E
  { dx: 0, dy: 1, diagonal: false },  // S
  { dx: -1, dy: 0, diagonal: false }, // W
  { dx: 1, dy: -1, diagonal: true },  // NE
  { dx: 1, dy: 1, diagonal: true },   // SE
  { dx: -1, dy: 1, diagonal: true },  // SW
  { dx: -1, dy: -1, diagonal: true }, // NW
];

// ---------------------------------------------------------------------------
// FlowField class
// ---------------------------------------------------------------------------

export class FlowField {
  /** Flat direction array: directions[y * width + x]. */
  private directions: Uint8Array;
  private _width: number;
  private _height: number;
  /** Topology version at time of last compute. */
  private _computedVersion = -1;
  /** Whether the field has been computed at least once. */
  private _valid = false;

  constructor(width: number, height: number) {
    this._width = width;
    this._height = height;
    this.directions = new Uint8Array(width * height);
  }

  /** Whether the flow field is up-to-date with the current topology. */
  isValid(currentTopologyVersion: number): boolean {
    return this._valid && this._computedVersion === currentTopologyVersion;
  }

  /**
   * Compute the flow field via BFS from the target tile outward.
   *
   * Uses the PathfindingGrid's walkability data directly (no cloning).
   * Diagonal movement follows the same "OnlyWhenNoObstacles" rule as the
   * A* finder: a diagonal move is blocked if either adjacent cardinal
   * neighbor is non-walkable.
   *
   * @param grid — the pathfinding grid to read walkability from.
   * @param targetX — target tile X coordinate.
   * @param targetY — target tile Y coordinate.
   * @param topologyVersion — current topology version for staleness tracking.
   */
  compute(
    grid: PathfindingGrid,
    targetX: number,
    targetY: number,
    topologyVersion: number,
  ): void {
    const w = this._width;
    const h = this._height;

    // Reset all cells to unreachable
    this.directions.fill(DIR_UNREACHABLE);

    // Bail if target is out of bounds or non-walkable
    if (targetX < 0 || targetX >= w || targetY < 0 || targetY >= h) {
      this._valid = false;
      return;
    }
    if (!grid.isWalkable(targetX, targetY)) {
      this._valid = false;
      return;
    }

    // BFS queue (pre-allocated ring buffer for performance)
    // Max queue size = width * height (every cell visited once)
    const queueX = new Int16Array(w * h);
    const queueY = new Int16Array(w * h);
    let head = 0;
    let tail = 0;

    // Seed: target cell
    this.directions[targetY * w + targetX] = DIR_AT_TARGET;
    queueX[tail] = targetX;
    queueY[tail] = targetY;
    tail++;

    while (head < tail) {
      const cx = queueX[head];
      const cy = queueY[head];
      head++;

      // Visit all neighbors
      for (const { dx, dy, diagonal } of NEIGHBORS) {
        const nx = cx + dx;
        const ny = cy + dy;

        // Bounds check
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;

        // Already visited?
        const idx = ny * w + nx;
        if (this.directions[idx] !== DIR_UNREACHABLE) continue;

        // Walkability check
        if (!grid.isWalkable(nx, ny)) continue;

        // Diagonal constraint: both adjacent cardinals must be walkable
        if (diagonal) {
          if (!grid.isWalkable(cx, ny) || !grid.isWalkable(nx, cy)) continue;
        }

        // Direction: neighbor should move toward current cell (cx, cy)
        // Offset from neighbor to current: (cx - nx, cy - ny)
        const odx = cx - nx;
        const ody = cy - ny;
        this.directions[idx] = OFFSET_TO_DIR[(ody + 1) * 3 + (odx + 1)];

        // Enqueue neighbor
        queueX[tail] = nx;
        queueY[tail] = ny;
        tail++;
      }
    }

    this._computedVersion = topologyVersion;
    this._valid = true;
  }

  /**
   * Get the direction vector for a tile.
   *
   * Returns null if the tile is unreachable or out of bounds.
   * Returns {dx: 0, dy: 0} if the zombie is at the target.
   */
  getDirection(x: number, y: number): { dx: number; dy: number } | null {
    if (x < 0 || x >= this._width || y < 0 || y >= this._height) return null;
    const dir = this.directions[y * this._width + x];
    if (dir === DIR_UNREACHABLE) return null;
    return DIR_VECTORS[dir];
  }

  /** Mark the field as invalid (forces recompute on next use). */
  invalidate(): void {
    this._valid = false;
  }

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }
}
