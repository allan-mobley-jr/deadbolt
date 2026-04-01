import { describe, it, expect } from "vitest";
import { FlowField } from "./flow-field";
import { PathfindingGrid } from "./pathfinding-grid";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create an all-walkable grid of given dimensions. */
function allWalkable(w: number, h: number): PathfindingGrid {
  const matrix: number[][] = [];
  for (let y = 0; y < h; y++) {
    matrix.push(new Array(w).fill(0));
  }
  return new PathfindingGrid(matrix);
}

/** Create a grid with a horizontal wall across row y, with a gap at gapX. */
function gridWithWall(w: number, h: number, wallY: number, gapX: number): PathfindingGrid {
  const matrix: number[][] = [];
  for (let y = 0; y < h; y++) {
    const row: number[] = [];
    for (let x = 0; x < w; x++) {
      if (y === wallY && x !== gapX) {
        row.push(1); // wall
      } else {
        row.push(0); // walkable
      }
    }
    matrix.push(row);
  }
  return new PathfindingGrid(matrix);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FlowField", () => {
  it("computes direction vectors toward the target", () => {
    const grid = allWalkable(10, 10);
    const ff = new FlowField(10, 10);

    ff.compute(grid, 5, 5, 0);

    // Cell to the north of target should point south
    const dirN = ff.getDirection(5, 4);
    expect(dirN).toEqual({ dx: 0, dy: 1 }); // south toward (5,5)

    // Cell to the west of target should point east
    const dirW = ff.getDirection(4, 5);
    expect(dirW).toEqual({ dx: 1, dy: 0 }); // east toward (5,5)

    // Cell at target should be (0,0)
    const dirTarget = ff.getDirection(5, 5);
    expect(dirTarget).toEqual({ dx: 0, dy: 0 });
  });

  it("marks unreachable cells as null", () => {
    // Grid with a completely enclosed island
    const matrix: number[][] = [
      [0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0],
      [0, 1, 0, 1, 0], // cell (2,2) is enclosed
      [0, 1, 1, 1, 0],
      [0, 0, 0, 0, 0],
    ];
    const grid = new PathfindingGrid(matrix);
    const ff = new FlowField(5, 5);

    ff.compute(grid, 0, 0, 0);

    // Enclosed cell should be unreachable
    expect(ff.getDirection(2, 2)).toBeNull();

    // Open cell should have a direction
    expect(ff.getDirection(0, 1)).not.toBeNull();
  });

  it("respects diagonal movement constraints (no corner cutting)", () => {
    // Wall configuration that blocks diagonal:
    //   . W .
    //   W . .
    //   . . T  (target at 2,2)
    const matrix: number[][] = [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 0],
    ];
    const grid = new PathfindingGrid(matrix);
    const ff = new FlowField(3, 3);

    ff.compute(grid, 2, 2, 0);

    // Cell (0,0) is not diagonally reachable from (1,1) because
    // both (0,1) and (1,0) are walls — diagonal blocked
    expect(ff.getDirection(0, 0)).toBeNull();
  });

  it("routes around walls through gaps", () => {
    const grid = gridWithWall(10, 10, 5, 5); // wall at y=5, gap at x=5
    const ff = new FlowField(10, 10);

    // Target below the wall
    ff.compute(grid, 5, 8, 0);

    // Cell above the wall should have a direction (path through gap)
    const dir = ff.getDirection(5, 2);
    expect(dir).not.toBeNull();
    // Should be pointing south toward the gap
    expect(dir!.dy).toBeGreaterThanOrEqual(0);
  });

  it("tracks topology version for staleness detection", () => {
    const grid = allWalkable(10, 10);
    const ff = new FlowField(10, 10);

    expect(ff.isValid(0)).toBe(false); // Not yet computed

    ff.compute(grid, 5, 5, 0);
    expect(ff.isValid(0)).toBe(true);
    expect(ff.isValid(1)).toBe(false); // Version mismatch

    ff.compute(grid, 5, 5, 42);
    expect(ff.isValid(42)).toBe(true);
  });

  it("invalidate() forces recompute", () => {
    const grid = allWalkable(10, 10);
    const ff = new FlowField(10, 10);

    ff.compute(grid, 5, 5, 0);
    expect(ff.isValid(0)).toBe(true);

    ff.invalidate();
    expect(ff.isValid(0)).toBe(false);
  });

  it("out-of-bounds getDirection returns null", () => {
    const ff = new FlowField(10, 10);
    expect(ff.getDirection(-1, 0)).toBeNull();
    expect(ff.getDirection(0, -1)).toBeNull();
    expect(ff.getDirection(10, 0)).toBeNull();
    expect(ff.getDirection(0, 10)).toBeNull();
  });

  it("handles non-walkable target gracefully", () => {
    const matrix: number[][] = [
      [0, 0, 0],
      [0, 1, 0], // target (1,1) is blocked
      [0, 0, 0],
    ];
    const grid = new PathfindingGrid(matrix);
    const ff = new FlowField(3, 3);

    ff.compute(grid, 1, 1, 0);

    // Should not be valid when target is non-walkable
    expect(ff.isValid(0)).toBe(false);
  });

  it("BFS covers all reachable cells on a large grid", () => {
    const size = 64;
    const grid = allWalkable(size, size);
    const ff = new FlowField(size, size);

    ff.compute(grid, 32, 32, 0);

    // Every cell should be reachable
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dir = ff.getDirection(x, y);
        expect(dir).not.toBeNull();
      }
    }
  });

  it("computes quickly for a 256x256 grid (benchmark)", () => {
    const size = 256;
    const grid = allWalkable(size, size);
    const ff = new FlowField(size, size);

    const start = performance.now();
    ff.compute(grid, 128, 128, 0);
    const elapsed = performance.now() - start;

    // Should complete in under 50ms (typically <5ms)
    expect(elapsed).toBeLessThan(50);
    expect(ff.isValid(0)).toBe(true);
  });
});
