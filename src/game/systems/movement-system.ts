import type { SystemFn } from "./system-runner";
import type { SceneContext } from "./scene-context";
import { playerEntities } from "@/game/ecs/queries";

// ---------------------------------------------------------------------------
// Tuning constants (pixels/second unless noted)
// ---------------------------------------------------------------------------

/** Maximum player speed. */
export const PLAYER_SPEED = 200;

/** Rate at which velocity approaches the target when input is active. */
export const ACCELERATION = 1600;

/** Rate at which velocity decays toward zero when input is released. */
export const DECELERATION = 2400;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Move `current` toward `target` by at most `maxDelta` per call.
 * Returns the new value, never overshooting `target`.
 */
function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return target;
}

// ---------------------------------------------------------------------------
// System factory
// ---------------------------------------------------------------------------

/**
 * Factory that returns a MovementSystem.
 *
 * Each tick it reads the normalised input state and applies
 * acceleration / deceleration to every player-controlled entity's velocity.
 */
export function createMovementSystem(ctx: SceneContext): SystemFn {
  return (dt: number): void => {
    const { moveX, moveY } = ctx.inputState;

    for (const entity of playerEntities) {
      if (!entity.playerControlled.active) continue;

      const vel = entity.velocity;

      // Target velocity based on input direction
      const targetVx = moveX * PLAYER_SPEED;
      const targetVy = moveY * PLAYER_SPEED;

      // Choose rate: accelerate when pressing, decelerate when releasing
      const rateX = moveX !== 0 ? ACCELERATION : DECELERATION;
      const rateY = moveY !== 0 ? ACCELERATION : DECELERATION;

      vel.vx = approach(vel.vx, targetVx, rateX * dt);
      vel.vy = approach(vel.vy, targetVy, rateY * dt);
    }
  };
}
