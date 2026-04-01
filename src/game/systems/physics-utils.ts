/**
 * Safe wrappers for Matter.js body and constraint removal.
 *
 * Every system that removes physics bodies or constraints should use these
 * helpers instead of calling world.remove / world.removeConstraint directly.
 * They guarantee that:
 *   1. The registry lookup is null-safe.
 *   2. The Matter.js call is wrapped in try-catch to prevent cascading failures.
 *   3. The registry entry is always cleaned up, even if removal throws.
 *
 * NO React imports — this is pure TypeScript.
 */

import type { BodyRegistry } from "./body-registry";
import type { ConstraintRegistry } from "./constraint-registry";

// ---------------------------------------------------------------------------
// Narrowed interfaces (keep this module testable without full Phaser types)
// ---------------------------------------------------------------------------

/** Minimal Matter world interface for body removal. */
interface MatterWorldRemoveBody {
  remove(body: MatterJS.BodyType): void;
}

/** Minimal Matter world interface for constraint removal. */
interface MatterWorldRemoveConstraint {
  removeConstraint(constraint: MatterJS.ConstraintType): void;
}

// ---------------------------------------------------------------------------
// Body removal
// ---------------------------------------------------------------------------

/**
 * Safely remove a physics body from the Matter.js world and unregister it.
 *
 * @returns `true` if the body was successfully removed, `false` if it was
 *          missing or removal threw.
 */
export function safeRemoveBody(
  world: MatterWorldRemoveBody,
  bodyRegistry: BodyRegistry,
  bodyId: number,
  caller: string,
): boolean {
  const body = bodyRegistry.get(bodyId);
  let success = false;

  if (body) {
    try {
      world.remove(body);
      success = true;
    } catch (err) {
      console.error(
        `[${caller}] Failed to remove physics body ${bodyId}:`,
        err,
      );
    }
  }

  bodyRegistry.unregister(bodyId);
  return success;
}

// ---------------------------------------------------------------------------
// Constraint removal
// ---------------------------------------------------------------------------

/**
 * Safely remove a constraint from the Matter.js world and unregister it.
 *
 * @returns `true` if the constraint was successfully removed, `false` if it
 *          was missing or removal threw.
 */
export function safeRemoveConstraint(
  world: MatterWorldRemoveConstraint,
  constraintRegistry: ConstraintRegistry,
  constraintId: number,
  caller: string,
): boolean {
  const constraint = constraintRegistry.get(constraintId);
  let success = false;

  if (constraint) {
    try {
      world.removeConstraint(constraint);
      success = true;
    } catch (err) {
      console.error(
        `[${caller}] Failed to remove constraint ${constraintId}:`,
        err,
      );
    }
  }

  constraintRegistry.unregister(constraintId);
  return success;
}
