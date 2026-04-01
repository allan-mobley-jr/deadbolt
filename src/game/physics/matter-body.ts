/**
 * Re-export Matter.Body static methods from Phaser's bundled Matter.js.
 *
 * Use these instead of mutating body properties directly — direct mutation
 * bypasses Matter.js internal bookkeeping (broadphase AABB updates,
 * sleeping state, constraint warmstarting).
 *
 * Centralises the Phaser import so individual systems and pools stay
 * decoupled from the Phaser module.
 *
 * NO React imports — this is pure TypeScript.
 */

import Phaser from "phaser";

// Phaser bundles Matter.js and exposes it at runtime as
// Phaser.Physics.Matter.Matter.  The TypeScript definitions for this
// path vary across Phaser versions, so we access it dynamically and
// lean on the globally-declared MatterJS.Body type for call-site safety.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Body: typeof MatterJS.Body = (Phaser.Physics.Matter as any).Matter.Body;

export function setBodyPosition(
  body: MatterJS.BodyType,
  position: { x: number; y: number },
  updateVelocity?: boolean,
): void {
  Body.setPosition(body, position, updateVelocity);
}

export function setBodyVelocity(
  body: MatterJS.BodyType,
  velocity: { x: number; y: number },
): void {
  Body.setVelocity(body, velocity);
}

export function setBodyAngularVelocity(
  body: MatterJS.BodyType,
  velocity: number,
): void {
  Body.setAngularVelocity(body, velocity);
}

export function setBodyStatic(
  body: MatterJS.BodyType,
  isStatic: boolean,
): void {
  Body.setStatic(body, isStatic);
}

export function setBodyInertia(
  body: MatterJS.BodyType,
  inertia: number,
): void {
  Body.setInertia(body, inertia);
}
