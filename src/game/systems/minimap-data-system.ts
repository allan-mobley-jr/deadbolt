/**
 * Minimap data system — periodically relays entity positions to the UI.
 *
 * Runs as part of the fixed-timestep game loop but only emits events
 * at ~2 Hz (every 30 ticks at 60 Hz) to keep React re-renders minimal.
 * Reads player and zombie positions from ECS queries and emits a
 * "minimap-update" event with the positions.
 */

import type { SceneContext } from "./scene-context";
import type { SystemFn } from "./system-runner";
import { safeEmit } from "@/game/events/event-bus";
import { playerEntities, zombieEntities } from "@/game/ecs/queries";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Emit interval in fixed ticks (~2 Hz at 60 Hz = every 30 ticks). */
const EMIT_INTERVAL_TICKS = 30;

// ---------------------------------------------------------------------------
// System factory
// ---------------------------------------------------------------------------

export function createMinimapDataSystem(ctx: SceneContext): SystemFn {
  let tickCounter = 0;

  // Reusable array for zombie positions — cleared and refilled each emit.
  // The bridge copies it into the store via spread, so reuse is safe.
  const zombieBuffer: Array<{ x: number; y: number }> = [];

  return function minimapDataSystem(_dt: number): void {
    tickCounter++;

    if (tickCounter < EMIT_INTERVAL_TICKS) return;
    tickCounter = 0;

    // --- Read player position ---
    const players = playerEntities.entities;
    if (players.length === 0) return;

    const player = players[0];
    const playerPos = { x: player.position.x, y: player.position.y };

    // --- Read zombie positions ---
    zombieBuffer.length = 0;
    const zombies = zombieEntities.entities;
    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i];
      // Only include living zombies (state !== "dead")
      if (z.aiState.state !== "dead") {
        zombieBuffer.push({ x: z.position.x, y: z.position.y });
      }
    }

    safeEmit(ctx.eventBus, "minimap-update", {
      playerPosition: playerPos,
      zombiePositions: [...zombieBuffer],
    });
  };
}
