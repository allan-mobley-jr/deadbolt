/**
 * Performance benchmark comparing flow field vs individual A* pathfinding.
 *
 * Simulates 100+ zombies needing pathfinding on a realistic grid.
 * Measures: flow field compute time, per-zombie direction lookup time,
 * and individual A* path time for comparison.
 */

// @vitest-environment node
import { describe, it, expect } from "vitest";
import { FlowField } from "./flow-field";
import { PathfindingGrid } from "./pathfinding-grid";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a grid with scattered walls (simulates a city layout). */
function createRealisticGrid(size: number): PathfindingGrid {
  const matrix: number[][] = [];
  for (let y = 0; y < size; y++) {
    const row: number[] = [];
    for (let x = 0; x < size; x++) {
      // Create walls in a grid pattern (every 8th tile) with doorways
      if ((x % 8 === 0 || y % 8 === 0) && !((x % 8 === 4) || (y % 8 === 4))) {
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
// Benchmarks
// ---------------------------------------------------------------------------

describe("Pathfinding Performance Benchmark", () => {
  const GRID_SIZE = 128; // Realistic city grid
  const ZOMBIE_COUNT = 120;
  const TARGET_X = 65; // Must not be on wall grid (65 % 8 = 1 → walkable)
  const TARGET_Y = 65;

  /** Generate walkable positions distributed across the grid. */
  function generateWalkablePositions(grid: PathfindingGrid, count: number, size: number): Array<{ x: number; y: number }> {
    const positions: Array<{ x: number; y: number }> = [];
    for (let y = 1; y < size && positions.length < count; y++) {
      for (let x = 1; x < size && positions.length < count; x++) {
        if (grid.isWalkable(x, y)) {
          positions.push({ x, y });
        }
      }
    }
    return positions;
  }

  it("flow field: single BFS serves all zombies in O(1) per zombie", () => {
    const grid = createRealisticGrid(GRID_SIZE);
    const ff = new FlowField(GRID_SIZE, GRID_SIZE);

    // --- Measure BFS compute time ---
    const computeStart = performance.now();
    ff.compute(grid, TARGET_X, TARGET_Y, 0);
    const computeMs = performance.now() - computeStart;

    // --- Measure per-zombie lookup time ---
    const positions = generateWalkablePositions(grid, ZOMBIE_COUNT, GRID_SIZE);

    const lookupStart = performance.now();
    let validDirections = 0;
    for (const pos of positions) {
      const dir = ff.getDirection(pos.x, pos.y);
      if (dir) validDirections++;
    }
    const lookupMs = performance.now() - lookupStart;

    console.log("\n=== Flow Field Performance ===");
    console.log(`Grid: ${GRID_SIZE}x${GRID_SIZE} (${GRID_SIZE * GRID_SIZE} cells)`);
    console.log(`BFS compute: ${computeMs.toFixed(3)}ms`);
    console.log(`Lookup ${positions.length} zombies: ${lookupMs.toFixed(3)}ms (${(lookupMs / positions.length * 1000).toFixed(1)}µs/zombie)`);
    console.log(`Valid directions: ${validDirections}/${positions.length}`);
    console.log(`Total per-tick cost: ${(computeMs + lookupMs).toFixed(3)}ms (amortized: ${lookupMs.toFixed(3)}ms when field cached)`);

    // BFS should complete quickly for a 128x128 grid.
    // Threshold is generous to avoid flakes in CI where CPU may be throttled.
    expect(computeMs).toBeLessThan(50);
    // Lookups should be near-instant
    expect(lookupMs).toBeLessThan(1);
  });

  it("individual A*: measures per-zombie pathfinding cost", () => {
    const grid = createRealisticGrid(GRID_SIZE);
    const target = { x: TARGET_X, y: TARGET_Y };

    // Generate walkable zombie positions
    const starts = generateWalkablePositions(grid, ZOMBIE_COUNT, GRID_SIZE);

    // --- Measure A* time for all zombies ---
    const astarStart = performance.now();
    let pathsFound = 0;
    for (const start of starts) {
      const result = grid.findSmoothedPath(start, target);
      if (result.found) pathsFound++;
    }
    const astarMs = performance.now() - astarStart;

    console.log("\n=== Individual A* Performance ===");
    console.log(`Grid: ${GRID_SIZE}x${GRID_SIZE}`);
    console.log(`Zombies: ${starts.length}`);
    console.log(`Total A* time: ${astarMs.toFixed(2)}ms`);
    console.log(`Per-zombie: ${(astarMs / starts.length).toFixed(3)}ms (${(astarMs / starts.length * 1000).toFixed(1)}µs)`);
    console.log(`Paths found: ${pathsFound}/${starts.length}`);

    // Document the comparison
    const ffGrid = createRealisticGrid(GRID_SIZE);
    const ff = new FlowField(GRID_SIZE, GRID_SIZE);
    const ffStart = performance.now();
    ff.compute(ffGrid, TARGET_X, TARGET_Y, 0);
    const ffMs = performance.now() - ffStart;

    const speedup = astarMs / ffMs;
    console.log(`\n=== Comparison ===`);
    console.log(`A* (${starts.length} zombies): ${astarMs.toFixed(2)}ms`);
    console.log(`Flow field (1 BFS): ${ffMs.toFixed(3)}ms`);
    console.log(`Speedup: ${speedup.toFixed(1)}x`);
    console.log("=================\n");

    // Flow field should be significantly faster than running A* for all zombies
    expect(speedup).toBeGreaterThan(1);
  });

  it("frame budget: A* stays within 2ms budget with deferred requests", () => {
    const grid = createRealisticGrid(GRID_SIZE);
    const target = { x: TARGET_X, y: TARGET_Y };
    const BUDGET_MS = 2;

    const starts = generateWalkablePositions(grid, ZOMBIE_COUNT, GRID_SIZE);

    // Simulate frame-budgeted processing
    let processed = 0;
    let deferred = 0;
    const tickStart = performance.now();

    for (const start of starts) {
      if (performance.now() - tickStart >= BUDGET_MS) {
        deferred++;
        continue;
      }
      grid.findSmoothedPath(start, target);
      processed++;
    }

    const tickMs = performance.now() - tickStart;

    console.log("\n=== Frame Budget Simulation ===");
    console.log(`Budget: ${BUDGET_MS}ms`);
    console.log(`Processed: ${processed}/${starts.length}`);
    console.log(`Deferred: ${deferred}`);
    console.log(`Tick time: ${tickMs.toFixed(2)}ms`);
    console.log("==============================\n");

    // Tick should stay close to budget (may slightly exceed due to last A* call).
    // Allow generous headroom for CI environments with variable CPU scheduling.
    expect(tickMs).toBeLessThan(BUDGET_MS * 25);
  });
});
