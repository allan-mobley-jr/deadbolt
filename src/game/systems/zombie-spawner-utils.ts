/**
 * Zombie spawner utilities — archetype selection and horde cluster spawning.
 *
 * Provides night-based variant selection (with weighted random) and a
 * cluster spawn helper for horde groups. Used by the GameScene spawner
 * and future wave system.
 *
 * NO React imports — this is pure TypeScript.
 */

import type { ZombieVariant } from "@/game/ecs/components";
import {
  ARCHETYPE_UNLOCK_NIGHT,
  ARCHETYPE_SPAWN_WEIGHT,
  VARIANT_STATS,
  VARIANT_HEALTH,
  HORDE_CLUSTER_SIZE,
  HORDE_CLUSTER_SPREAD,
} from "./zombie-ai-constants";
import { createZombieEntity } from "@/game/ecs/archetypes";
import type { ZombieEntity } from "@/game/ecs/archetypes";
import type { BodyRegistry } from "./body-registry";

// ---------------------------------------------------------------------------
// Variant selection
// ---------------------------------------------------------------------------

/** All known zombie variants in definition order. */
const ALL_VARIANTS: readonly ZombieVariant[] = [
  "shambler",
  "runner",
  "brute",
  "horde",
];

/**
 * Return the list of zombie variants available for a given night number.
 * Only includes variants whose unlock night ≤ dayNumber.
 *
 * Invalid dayNumber values (NaN, negative, zero) are clamped to 1
 * with a warning so the spawner always produces at least shamblers.
 */
export function getAvailableVariants(dayNumber: number): ZombieVariant[] {
  if (!Number.isFinite(dayNumber) || dayNumber < 1) {
    console.warn(
      `[zombie-spawner-utils] getAvailableVariants called with invalid dayNumber: ${dayNumber}. Defaulting to 1.`,
    );
    dayNumber = 1;
  }
  return ALL_VARIANTS.filter(
    (v) => dayNumber >= ARCHETYPE_UNLOCK_NIGHT[v],
  );
}

/**
 * Select a zombie variant using weighted random from available variants.
 *
 * @param available — variants to choose from (must be non-empty).
 * @param rng — random number generator returning [0, 1).
 * @returns The selected variant.
 */
export function selectVariant(
  available: ZombieVariant[],
  rng: () => number,
): ZombieVariant {
  if (available.length === 0) {
    console.warn(
      "[zombie-spawner-utils] selectVariant called with empty available list — falling back to shambler.",
    );
    return "shambler";
  }
  if (available.length === 1) return available[0];

  const totalWeight = available.reduce(
    (sum, v) => sum + ARCHETYPE_SPAWN_WEIGHT[v],
    0,
  );
  let roll = rng() * totalWeight;

  for (const v of available) {
    roll -= ARCHETYPE_SPAWN_WEIGHT[v];
    if (roll <= 0) return v;
  }

  // Fallback (should not reach here due to floating-point rounding)
  return available[available.length - 1];
}

// ---------------------------------------------------------------------------
// Spawn helpers
// ---------------------------------------------------------------------------

/**
 * Context required for spawning zombies — provides access to Phaser's
 * Matter.js factory and the body registry without importing Phaser types
 * at module scope.
 */
export interface SpawnContext {
  /** Matter.js factory: `scene.matter.add`. */
  matterAdd: {
    rectangle(
      x: number,
      y: number,
      width: number,
      height: number,
      options?: Record<string, unknown>,
    ): { id: number; inertia: number; inverseInertia: number };
  };
  bodyRegistry: BodyRegistry;
}

/**
 * Create a physics body for a zombie and register it in the body registry.
 *
 * @returns The body ID for the new physics body.
 */
function createZombieBody(
  ctx: SpawnContext,
  x: number,
  y: number,
  size: number,
): number {
  const body = ctx.matterAdd.rectangle(x, y, size, size, {
    friction: 0.1,
    frictionAir: 0.05,
    restitution: 0.1,
  });
  body.inertia = Infinity;
  body.inverseInertia = 0;
  // SAFETY: bodyRegistry.register only reads body.id for the internal map.
  // The real Phaser MatterFactory.rectangle returns a full MatterJS.BodyType,
  // but SpawnContext narrows the interface for testability. If register's
  // contract changes, this cast must be revisited.
  ctx.bodyRegistry.register(body as unknown as MatterJS.BodyType);
  return body.id;
}

/**
 * Spawn a single zombie of the given variant at the specified position.
 *
 * @param tickOffset — stagger offset for pathfinding desynchronisation.
 * @returns The created zombie entity.
 */
export function spawnZombie(
  ctx: SpawnContext,
  variant: ZombieVariant,
  x: number,
  y: number,
  tickOffset: number = 0,
): ZombieEntity {
  const stats = { ...VARIANT_STATS[variant] };
  const hp = VARIANT_HEALTH[variant];
  const bodyId = createZombieBody(ctx, x, y, stats.bodySize);
  return createZombieEntity(x, y, bodyId, stats, tickOffset, hp);
}

/**
 * Spawn a horde cluster — a group of horde zombies at slightly offset
 * positions around a center point.
 *
 * @param rng — random number generator returning [0, 1) for offset variance.
 * @returns Array of created zombie entities.
 */
export function spawnHordeCluster(
  ctx: SpawnContext,
  centerX: number,
  centerY: number,
  rng: () => number,
  tickOffsetBase: number = 0,
): ZombieEntity[] {
  const count =
    HORDE_CLUSTER_SIZE.min +
    Math.floor(rng() * (HORDE_CLUSTER_SIZE.max - HORDE_CLUSTER_SIZE.min + 1));

  const entities: ZombieEntity[] = [];

  for (let i = 0; i < count; i++) {
    // Random offset within cluster spread radius
    const angle = rng() * Math.PI * 2;
    const dist = rng() * HORDE_CLUSTER_SPREAD;
    const ox = Math.cos(angle) * dist;
    const oy = Math.sin(angle) * dist;

    entities.push(
      spawnZombie(ctx, "horde", centerX + ox, centerY + oy, tickOffsetBase + i),
    );
  }

  return entities;
}
