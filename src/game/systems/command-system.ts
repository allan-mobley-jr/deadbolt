/**
 * Command system — processes UI→Game command events each fixed tick.
 *
 * Buffers command events received between ticks (via the event bus)
 * and applies them to game state at the start of the next tick.
 * This ensures commands are processed synchronously within the
 * fixed-timestep loop, avoiding race conditions.
 *
 * NO React imports — this is pure game-side TypeScript.
 */

import type { SceneContext } from "./scene-context";
import type { SystemFn } from "./system-runner";

/**
 * Create a command system that listens for UI command events and
 * applies them to the SceneContext each tick.
 */
export function createCommandSystem(ctx: SceneContext): SystemFn {
  // Buffer pause/resume commands received between ticks.
  // Last command wins if multiple arrive in a single frame.
  const pendingPause: boolean[] = [];

  ctx.eventBus.on("cmd:pause", () => {
    pendingPause.push(true);
  });

  ctx.eventBus.on("cmd:resume", () => {
    pendingPause.push(false);
  });

  return (_dt: number): void => {
    // Process pause/resume — last command wins
    if (pendingPause.length > 0) {
      ctx.clockState.paused = pendingPause[pendingPause.length - 1];
      pendingPause.length = 0;
    }
  };
}
