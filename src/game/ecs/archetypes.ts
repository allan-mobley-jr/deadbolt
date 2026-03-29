import type { With } from "miniplex";
import { world } from "./world";
import type { Entity } from "./entity";
import type { ObjectCategory } from "@/types/procgen";
import type { ZombieType, ZombieVariant } from "./components";
import { createEmptyInventory } from "@/game/systems/inventory-utils";
import { SHAMBLER_STATS, SHAMBLER_HEALTH } from "@/game/systems/zombie-ai-constants";

// ---------------------------------------------------------------------------
// Sprite key mapping — variant → render key for visual differentiation
// ---------------------------------------------------------------------------

const ZOMBIE_SPRITE_KEYS: Readonly<Record<ZombieVariant, string>> = {
  shambler: "zombie",
  runner: "zombie_runner",
  brute: "zombie_brute",
  horde: "zombie_horde",
};

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
  | "inventory"
  | "combatState"
>;

export type ZombieEntity = With<
  Entity,
  | "position"
  | "velocity"
  | "renderable"
  | "physicsBody"
  | "health"
  | "aiState"
  | "zombieType"
>;

export type BarricadeEntity = With<
  Entity,
  "position" | "renderable" | "physicsBody" | "health" | "barricade"
>;

export type ProjectileEntity = With<
  Entity,
  "position" | "velocity" | "renderable" | "physicsBody"
>;

export type ObjectEntity = With<
  Entity,
  "position" | "renderable" | "physicsBody" | "interactable" | "objectProperties"
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
    inventory: createEmptyInventory(50),
    combatState: {
      attackCooldownRemaining: 0,
      swingTimeRemaining: 0,
      sensorBodyId: null,
      iFramesRemaining: 0,
      previousHealth: 100,
    },
  });
}

/**
 * Spawn a zombie entity at the given position.
 *
 * @param stats — zombie variant stats (defaults to shambler).
 * @param initialTickOffset — randomised tick counter for pathfinding stagger.
 *   Different values for each zombie prevent all zombies from recalculating
 *   paths on the same tick.
 * @param hp — starting health (defaults to SHAMBLER_HEALTH). Pass a different
 *   value for future zombie variants with more or less health.
 */
export function createZombieEntity(
  x: number,
  y: number,
  bodyId: number,
  stats: ZombieType = { ...SHAMBLER_STATS },
  initialTickOffset: number = 0,
  hp: number = SHAMBLER_HEALTH,
): ZombieEntity {
  return world.add({
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    renderable: { spriteKey: ZOMBIE_SPRITE_KEYS[stats.variant] ?? "zombie" },
    physicsBody: { bodyId },
    health: { current: hp, max: hp },
    aiState: {
      state: "idle",
      targetPosition: null,
      path: [],
      pathIndex: 0,
      ticksSinceLastPathCalc: initialTickOffset % stats.pathRecalcInterval,
      attackCooldownRemaining: 0,
      staggerTimeRemaining: 0,
      attackTargetBodyId: null,
      previousHealth: hp,
    },
    zombieType: stats,
  });
}

/** Spawn a barricade entity at the given position with material-derived durability. */
export function createBarricadeEntity(
  x: number,
  y: number,
  bodyId: number,
  sourceObjectType: string,
  entryPointIndex: number,
  constraintIds: number[],
  maxDurability: number,
): BarricadeEntity {
  return world.add({
    position: { x, y },
    renderable: { spriteKey: sourceObjectType },
    physicsBody: { bodyId },
    health: { current: maxDurability, max: maxDurability },
    barricade: {
      constraintIds,
      entryPointIndex,
      sourceObjectType,
      maxDurability,
      currentDurability: maxDurability,
    },
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

/** Spawn a world object entity from an object definition. */
export function createObjectEntity(
  x: number,
  y: number,
  bodyId: number,
  objectType: string,
  category: ObjectCategory,
  immovable: boolean,
  physics: {
    durability: number;
    flammability: number;
    conductivity: number;
  },
  lootValue: number,
): ObjectEntity {
  return world.add({
    position: { x, y },
    renderable: { spriteKey: objectType },
    physicsBody: { bodyId },
    interactable: {
      interactionType: immovable ? "push" : "pickup",
      highlighted: false,
    },
    objectProperties: {
      objectType,
      category,
      durability: physics.durability,
      flammability: physics.flammability,
      conductivity: physics.conductivity,
      lootValue,
      immovable,
    },
  });
}
