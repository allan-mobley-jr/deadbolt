/**
 * Run statistics tracking system.
 *
 * Accumulates per-run stats (barricades built, distance traveled, objects used)
 * for display on the death screen. Uses the same module-scoped counter pattern
 * as zombie-ai-system's kill tracking.
 *
 * Event-driven stats (barricades, items) subscribe in the factory closure.
 * Distance is computed per-tick from player entity position delta.
 *
 * This module lives in src/game/ and contains ZERO React imports.
 */

import { playerEntities } from "@/game/ecs/queries";
import type { SceneContext } from "./scene-context";
import type { SystemFn } from "./system-runner";

// ---------------------------------------------------------------------------
// Module-scoped run stats
// ---------------------------------------------------------------------------

let barricadesBuilt = 0;
let distanceTraveled = 0;
let objectsUsed = 0;

/** Previous player position for distance delta computation. */
let prevX = 0;
let prevY = 0;
/** True until the first tick reads the player's spawn position. */
let needsInit = true;

// ---------------------------------------------------------------------------
// Public accessors
// ---------------------------------------------------------------------------

/** Snapshot of accumulated run statistics. */
export interface RunStats {
  barricadesBuilt: number;
  /** Total distance traveled in pixels. */
  distanceTraveled: number;
  /** Number of items picked up during the run. */
  objectsUsed: number;
}

/** Read current run stats (called by bridge at death time). */
export function getRunStats(): Readonly<RunStats> {
  return { barricadesBuilt, distanceTraveled, objectsUsed };
}

/** Reset all counters for a new run. Call in GameScene.create(). */
export function resetRunStats(): void {
  barricadesBuilt = 0;
  distanceTraveled = 0;
  objectsUsed = 0;
  prevX = 0;
  prevY = 0;
  needsInit = true;
}

// ---------------------------------------------------------------------------
// System factory
// ---------------------------------------------------------------------------

/**
 * Create the stats tracking system.
 *
 * Subscribes to barricade-placed and item-picked-up events in the closure.
 * Per-tick: computes player movement delta and accumulates distance.
 *
 * Register after CombatSystem and before PhysicsSyncSystem so positions
 * are final for the tick but no side effects are produced.
 */
export function createStatsSystem(ctx: SceneContext): SystemFn {
  // Event-driven counters
  ctx.eventBus.on("barricade-placed", () => {
    barricadesBuilt++;
  });

  ctx.eventBus.on("item-picked-up", () => {
    objectsUsed++;
  });

  return () => {
    const player = playerEntities.entities[0];
    if (!player) return;

    const { x, y } = player.position;

    if (needsInit) {
      // First tick: initialize previous position to spawn point
      // to avoid a large delta from (0, 0).
      prevX = x;
      prevY = y;
      needsInit = false;
      return;
    }

    const dx = x - prevX;
    const dy = y - prevY;

    // Only accumulate if the player actually moved (avoid floating-point noise)
    if (dx !== 0 || dy !== 0) {
      distanceTraveled += Math.sqrt(dx * dx + dy * dy);
      prevX = x;
      prevY = y;
    }
  };
}
