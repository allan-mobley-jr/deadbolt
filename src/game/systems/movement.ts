/**
 * Movement system — reads input state and sets entity velocity.
 *
 * The system normalises diagonal movement so the player does not move
 * faster when pressing two directional keys simultaneously.
 *
 * This system only sets the ECS velocity component.  The actual
 * position update happens through Matter.js (velocity is applied to
 * the physics body, which resolves collisions, and the resulting
 * position is synced back to the ECS in the physics-sync system).
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import type { Queries } from '../ecs/world';
import type { InputState } from '../input/input-state';

/** Player movement speed in pixels per second. */
export const PLAYER_SPEED = 150;

const INV_SQRT2 = 1 / Math.sqrt(2);

export type MovementSystem = () => void;

/**
 * Create a movement system that reads from the given input state.
 */
export function createMovementSystem(
  queries: Queries,
  inputState: InputState,
): MovementSystem {
  return () => {
    for (const entity of queries.players) {
      let dx = 0;
      let dy = 0;

      if (inputState.left) dx -= 1;
      if (inputState.right) dx += 1;
      if (inputState.up) dy -= 1;
      if (inputState.down) dy += 1;

      // Normalise diagonal movement.
      const diagonal = dx !== 0 && dy !== 0;
      const scale = diagonal ? INV_SQRT2 : 1;

      entity.velocity.x = dx * scale * PLAYER_SPEED;
      entity.velocity.y = dy * scale * PLAYER_SPEED;
    }
  };
}
