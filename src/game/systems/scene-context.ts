import type Phaser from "phaser";
import type { BodyRegistry } from "./body-registry";

/**
 * Snapshot of normalised input state, written by InputSystem each fixed tick
 * and consumed by downstream systems (movement, aiming).
 *
 * All values are unitless or in world-space pixels:
 *   moveX / moveY  — axis inputs normalised to -1..+1 (diagonal-safe)
 *   aimX  / aimY   — mouse position in world coordinates
 */
export interface InputState {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
}

/**
 * Shared context object that system factory functions close over.
 *
 * Keeps the `SystemFn` signature `(dt: number) => void` unchanged while
 * giving every system access to the Phaser scene, the body registry,
 * the normalised input state, and the current interpolation alpha.
 */
export interface SceneContext {
  /** The owning Phaser scene — gives access to matter, input, cameras, add. */
  scene: Phaser.Scene;
  /** Maps ECS PhysicsBody.bodyId to live Matter.js body references. */
  bodyRegistry: BodyRegistry;
  /** Mutable input state written by InputSystem, read by other systems. */
  inputState: InputState;
  /** Returns the GameLoop interpolation alpha [0, 1). */
  getAlpha: () => number;
}

/** Create a zeroed-out input state. */
export function createInputState(): InputState {
  return { moveX: 0, moveY: 0, aimX: 0, aimY: 0 };
}
