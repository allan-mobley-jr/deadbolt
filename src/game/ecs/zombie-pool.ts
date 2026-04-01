/**
 * Zombie entity pool — specialises the generic EntityPool for zombies.
 *
 * Handles Matter.js body lifecycle alongside ECS entity recycling:
 * - Pre-warmed bodies are created as sleeping statics at (0, 0).
 * - On acquire: body is woken, repositioned, and registered in BodyRegistry.
 * - On release: body is put to sleep, unregistered from BodyRegistry.
 *
 * NO React imports — this is pure TypeScript.
 */

import type { ZombieVariant, ZombieType } from "./components";
import type { Entity } from "./entity";
import type { ZombieEntity } from "./archetypes";
import type { BodyRegistry } from "@/game/systems/body-registry";
import {
  VARIANT_STATS,
  VARIANT_HEALTH,
  SHAMBLER_STATS,
  SHAMBLER_HEALTH,
} from "@/game/systems/zombie-ai-constants";
import { EntityPool } from "./pool";
import {
  setBodyPosition,
  setBodyStatic,
  setBodyInertia,
} from "@/game/physics/matter-body";

// ---------------------------------------------------------------------------
// Sprite key mapping (duplicated from archetypes.ts to avoid circular dep)
// ---------------------------------------------------------------------------

const ZOMBIE_SPRITE_KEYS: Readonly<Record<ZombieVariant, string>> = {
  shambler: "zombie",
  runner: "zombie_runner",
  brute: "zombie_brute",
  horde: "zombie_horde",
};

// ---------------------------------------------------------------------------
// Types for the Phaser / Matter.js integration layer
// ---------------------------------------------------------------------------

/**
 * Minimal interface for Phaser's Matter factory.
 * Narrowed to keep this module testable without full Phaser types.
 */
export interface MatterFactory {
  rectangle(
    x: number,
    y: number,
    width: number,
    height: number,
    options?: Record<string, unknown>,
  ): MatterJS.BodyType;
}

/**
 * Minimal interface for the Phaser Matter world (remove + body sleep APIs).
 */
export interface MatterWorld {
  remove(body: MatterJS.BodyType): void;
}

// ---------------------------------------------------------------------------
// Side map: entity → Matter.js body (bodies live outside the ECS)
// ---------------------------------------------------------------------------

const bodyMap = new Map<Entity, MatterJS.BodyType>();

/** Retrieve the pooled Matter.js body associated with a zombie entity. */
export function getPooledBody(entity: Entity): MatterJS.BodyType | undefined {
  return bodyMap.get(entity);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Default pre-warm size. Covers Night 1-3 typical zombie counts. */
const DEFAULT_INITIAL_SIZE = 60;
/** Hard cap on pool size to prevent unbounded memory growth. */
const DEFAULT_MAX_SIZE = 200;

export interface ZombiePoolDeps {
  matterAdd: MatterFactory;
  bodyRegistry: BodyRegistry;
}

/**
 * Create and pre-warm a zombie entity pool.
 *
 * @param deps — Phaser scene dependencies (matter factory + body registry).
 * @param initialSize — number of entities to pre-allocate.
 */
export function createZombiePool(
  deps: ZombiePoolDeps,
  initialSize: number = DEFAULT_INITIAL_SIZE,
): EntityPool<ZombieEntity> {
  const { matterAdd, bodyRegistry } = deps;

  // -- Factory: create a new zombie entity + Matter.js body (dormant) --
  function factory(): ZombieEntity {
    // Create a sleeping body at origin — it will be repositioned on acquire
    const body = matterAdd.rectangle(0, 0, SHAMBLER_STATS.bodySize, SHAMBLER_STATS.bodySize, {
      friction: 0.1,
      frictionAir: 0.05,
      restitution: 0.1,
      isStatic: true,    // Sleeping: static + sensor
      isSensor: true,
    });
    setBodyInertia(body, Infinity);

    // Build the entity object (NOT added to world — pool handles that)
    const entity: ZombieEntity = {
      position: { x: 0, y: 0 },
      velocity: { vx: 0, vy: 0 },
      renderable: { spriteKey: "zombie" },
      physicsBody: { bodyId: body.id },
      health: { current: SHAMBLER_HEALTH, max: SHAMBLER_HEALTH },
      aiState: {
        state: "idle",
        targetPosition: null,
        path: [],
        pathIndex: 0,
        ticksSinceLastPathCalc: 0,
        attackCooldownRemaining: 0,
        staggerTimeRemaining: 0,
        attackTargetBodyId: null,
        previousHealth: SHAMBLER_HEALTH,
      },
      zombieType: { ...SHAMBLER_STATS },
    } as ZombieEntity;

    bodyMap.set(entity, body);
    return entity;
  }

  // -- Reset: overwrite all component values for the new lifecycle --
  function reset(entity: ZombieEntity): void {
    // NOTE: position, variant, and health are set by configureZombie()
    // after acquire(). This reset sets safe defaults so the entity is
    // never in a partially-stale state if configureZombie() is skipped.
    entity.position.x = 0;
    entity.position.y = 0;
    entity.velocity.vx = 0;
    entity.velocity.vy = 0;
    entity.renderable.spriteKey = "zombie";
    entity.health.current = SHAMBLER_HEALTH;
    entity.health.max = SHAMBLER_HEALTH;

    // Full AI state reset
    entity.aiState.state = "idle";
    entity.aiState.targetPosition = null;
    entity.aiState.path = [];
    entity.aiState.pathIndex = 0;
    entity.aiState.ticksSinceLastPathCalc = 0;
    entity.aiState.attackCooldownRemaining = 0;
    entity.aiState.staggerTimeRemaining = 0;
    entity.aiState.attackTargetBodyId = null;
    entity.aiState.previousHealth = SHAMBLER_HEALTH;

    // Reset zombie type to shambler defaults
    const stats = entity.zombieType;
    Object.assign(stats, SHAMBLER_STATS);

    // Wake the body and register it
    const body = bodyMap.get(entity);
    if (body) {
      setBodyStatic(body, false);
      body.isSensor = false; // No Matter.js API for isSensor
      bodyRegistry.register(body);
    }
  }

  const pool = new EntityPool<ZombieEntity>(
    { name: "zombie", initialSize, maxSize: DEFAULT_MAX_SIZE },
    factory,
    reset,
  );

  pool.prewarm(initialSize);
  return pool;
}

// ---------------------------------------------------------------------------
// Configuration helper (called after acquire)
// ---------------------------------------------------------------------------

/**
 * Configure a pooled zombie entity for a specific variant and position.
 *
 * Call this immediately after `pool.acquire()` to set variant-specific
 * stats, position, and health. The pool's reset function sets safe
 * defaults; this function applies the actual gameplay configuration.
 */
export function configureZombie(
  entity: ZombieEntity,
  variant: ZombieVariant,
  x: number,
  y: number,
  tickOffset: number = 0,
): void {
  const stats = VARIANT_STATS[variant];
  const hp = VARIANT_HEALTH[variant];

  // Position
  entity.position.x = x;
  entity.position.y = y;

  // Renderable
  entity.renderable.spriteKey = ZOMBIE_SPRITE_KEYS[variant] ?? "zombie";

  // Health
  entity.health.current = hp;
  entity.health.max = hp;

  // AI state
  entity.aiState.ticksSinceLastPathCalc = tickOffset % stats.pathRecalcInterval;
  entity.aiState.previousHealth = hp;

  // Variant stats (copy to allow wave multipliers to mutate without affecting shared consts)
  Object.assign(entity.zombieType, stats);

  // Reposition and resize the Matter.js body
  const body = bodyMap.get(entity);
  if (body) {
    setBodyPosition(body, { x, y });
    // Update body bounds for the variant's size (Matter.js vertices aren't
    // easily resizable, but since all variants use similar-sized rectangles
    // and we're using placeholder graphics, the base shambler body works
    // for all variants. When real sprites arrive, separate pools per size
    // category may be needed.)
  }
}

/**
 * Release a zombie entity back to the pool.
 *
 * Deactivates the Matter.js body (sleeping static + sensor) and
 * unregisters it from the BodyRegistry before returning to the pool.
 */
export function releaseZombie(
  pool: EntityPool<ZombieEntity>,
  entity: ZombieEntity,
  bodyRegistry: BodyRegistry,
): void {
  // Deactivate the physics body (sleep it, don't remove from world)
  const body = bodyMap.get(entity);
  if (body) {
    bodyRegistry.unregister(body.id);
    setBodyStatic(body, true);
    body.isSensor = true; // No Matter.js API for isSensor
    // Move off-screen to avoid stale collision
    setBodyPosition(body, { x: -9999, y: -9999 });
  }

  pool.release(entity);
}

/**
 * Clear the body map (called during pool cleanup / world reset).
 */
export function clearZombiePoolBodies(): void {
  bodyMap.clear();
}
