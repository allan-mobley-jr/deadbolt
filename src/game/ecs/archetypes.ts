import type { With } from "miniplex";
import { world } from "./world";
import type { Entity } from "./entity";

// ---------------------------------------------------------------------------
// Archetype types — narrowed Entity types with required component sets.
// Systems can use these for precise typing when they know the entity kind.
// ---------------------------------------------------------------------------

export type PlayerEntity = With<
  Entity,
  | "position"
  | "velocity"
  | "renderable"
  | "playerControlled"
  | "physicsBody"
  | "health"
>;

export type ZombieEntity = With<
  Entity,
  "position" | "velocity" | "renderable" | "physicsBody" | "health"
>;

export type BarricadeEntity = With<
  Entity,
  "position" | "renderable" | "physicsBody" | "health"
>;

export type ProjectileEntity = With<
  Entity,
  "position" | "velocity" | "renderable" | "physicsBody"
>;

// ---------------------------------------------------------------------------
// Factory functions — spawn entities with the correct component set.
// Each returns the world-tracked entity so the caller can use it immediately.
// ---------------------------------------------------------------------------

/** Spawn the player entity at the given position. */
export function createPlayerEntity(
  x: number,
  y: number,
  bodyId: number,
): PlayerEntity {
  return world.add({
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    renderable: { spriteKey: "player" },
    playerControlled: { active: true },
    physicsBody: { bodyId },
    health: { current: 100, max: 100 },
  });
}

/** Spawn a zombie entity at the given position. */
export function createZombieEntity(
  x: number,
  y: number,
  bodyId: number,
): ZombieEntity {
  return world.add({
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    renderable: { spriteKey: "zombie" },
    physicsBody: { bodyId },
    health: { current: 50, max: 50 },
  });
}

/** Spawn a barricade entity at the given position. */
export function createBarricadeEntity(
  x: number,
  y: number,
  bodyId: number,
): BarricadeEntity {
  return world.add({
    position: { x, y },
    renderable: { spriteKey: "barricade" },
    physicsBody: { bodyId },
    health: { current: 200, max: 200 },
  });
}

/** Spawn a projectile entity with initial velocity. */
export function createProjectileEntity(
  x: number,
  y: number,
  vx: number,
  vy: number,
  bodyId: number,
): ProjectileEntity {
  return world.add({
    position: { x, y },
    velocity: { vx, vy },
    renderable: { spriteKey: "bullet" },
    physicsBody: { bodyId },
  });
}
