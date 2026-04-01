/**
 * Fire propagation system — ignition, spread, AoE damage, burnout, and destruction.
 *
 * Runs each fixed tick after MaterialSystem. Reads burning entities from the
 * MaterialRegistry, manages burn timers, probabilistically spreads fire to
 * nearby flammable objects, applies area-of-effect damage to zombies and the
 * player, and destroys burned-out objects (releasing constraints and updating
 * pathfinding when necessary).
 *
 * Burn timers are tracked in a closure-scoped Map (not an ECS component),
 * following the same pattern as BarricadeSystem's prevHealthMap and
 * CombatSystem's swingHitSet.
 *
 * NO React imports — this is pure TypeScript.
 */

import type { With } from "miniplex";
import type { SceneContext } from "./scene-context";
import type { SystemFn } from "./system-runner";
import type { Entity } from "@/game/ecs/entity";
import { world } from "@/game/ecs/world";
import {
  zombieEntities,
  combatPlayerEntities,
  barricadeEntities,
} from "@/game/ecs/queries";
import { safeEmit } from "@/game/events/event-bus";
import { FIRE } from "./fire-constants";
import { MATERIAL } from "./material-constants";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Per-entity burn state tracked by the fire system. */
interface BurnRecord {
  /** Seconds remaining before the object burns out. */
  burnTimeRemaining: number;
  /** Total burn duration at ignition (for progress calculations). */
  totalBurnDuration: number;
}

/** A material entity narrowed to have position and material. */
type MaterialEntity = With<Entity, "position" | "material">;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Squared Euclidean distance between two 2D points. */
function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Linear interpolation. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Resolve the object type string for an entity.
 * Checks objectProperties, barricade, then falls back to renderable spriteKey.
 */
function getObjectType(entity: Entity): string {
  return (
    entity.objectProperties?.objectType ??
    entity.barricade?.sourceObjectType ??
    entity.renderable?.spriteKey ??
    "unknown"
  );
}

/**
 * Compute the burn duration for an entity based on its material properties.
 * Fuel-category objects use a shorter fixed duration.
 */
function computeBurnDuration(entity: MaterialEntity): number {
  if (entity.material.category === "fuel") {
    return FIRE.FUEL_BURN_DURATION;
  }
  return (
    FIRE.BASE_BURN_DURATION +
    (1 - entity.material.flammability) * FIRE.FLAMMABILITY_DURATION_SCALE
  );
}

// ---------------------------------------------------------------------------
// System factory
// ---------------------------------------------------------------------------

/**
 * Create the fire propagation system.
 *
 * Per-tick responsibilities:
 *   1. Detect newly burning entities and start tracking them
 *   2. Decrement burn timers
 *   3. Periodically spread fire to nearby flammable objects
 *   4. Periodically apply AoE damage to nearby zombies and the player
 *   5. Destroy burned-out objects (release constraints, update pathfinding)
 *   6. Emit events for all fire lifecycle phases
 */
export function createFireSystem(ctx: SceneContext): SystemFn {
  const registry = ctx.materialRegistry;
  if (!registry) {
    throw new Error("[FireSystem] ctx.materialRegistry is required");
  }

  /** Per-entity burn state. */
  const burnState = new Map<Entity, BurnRecord>();

  /** Tick counter for staggered spread checks. */
  let spreadTickCounter = 0;

  /** Tick counter for staggered damage applications. */
  let damageTickCounter = 0;

  return (dt: number): void => {
    // Increment cooldown counters
    spreadTickCounter++;
    damageTickCounter++;

    // -----------------------------------------------------------------
    // 1. Track newly burning entities
    // -----------------------------------------------------------------

    const burningEntities = registry.getBurningEntities();
    for (const entity of burningEntities) {
      if (!burnState.has(entity)) {
        const duration = computeBurnDuration(entity);
        burnState.set(entity, {
          burnTimeRemaining: duration,
          totalBurnDuration: duration,
        });

        // Emit ignition event for the newly tracked entity
        safeEmit(ctx.eventBus, "fire-ignited", {
          position: { x: entity.position.x, y: entity.position.y },
          objectType: getObjectType(entity),
          sourceObjectType: null,
        });
      }
    }

    // -----------------------------------------------------------------
    // 2. Decrement burn timers
    // -----------------------------------------------------------------

    const toDestroy: MaterialEntity[] = [];

    for (const [entity, record] of burnState) {
      // Guard: entity may have been removed by another system
      if (!entity.position || !entity.material) {
        burnState.delete(entity);
        continue;
      }

      record.burnTimeRemaining -= dt;
      if (record.burnTimeRemaining <= 0) {
        toDestroy.push(entity as MaterialEntity);
      }
    }

    // -----------------------------------------------------------------
    // 3. Spread fire to nearby flammable objects
    // -----------------------------------------------------------------

    if (spreadTickCounter >= FIRE.SPREAD_CHECK_INTERVAL) {
      spreadTickCounter = 0;

      for (const [entity] of burnState) {
        if (!entity.position || !entity.material) continue;

        const flammables = registry.getFlammableInRadius(
          entity.position.x,
          entity.position.y,
          FIRE.SPREAD_RADIUS,
        );

        const sourceObjectType = getObjectType(entity);

        for (const result of flammables) {
          const target = result.entity;

          // Skip already burning or non-inert entities
          if (target.material.state !== "inert") continue;

          // Skip self
          if (target === entity) continue;

          // Probability check scaled by target flammability
          const chance =
            FIRE.BASE_IGNITION_CHANCE * target.material.flammability;
          if (Math.random() >= chance) continue;

          // Ignite the target
          target.material.state = "burning";
          const targetObjectType = getObjectType(target);

          safeEmit(ctx.eventBus, "material-state-changed", {
            position: { x: target.position.x, y: target.position.y },
            objectType: targetObjectType,
            previousState: "inert",
            newState: "burning",
          });

          safeEmit(ctx.eventBus, "fire-spread", {
            sourcePosition: { x: entity.position.x, y: entity.position.y },
            targetPosition: { x: target.position.x, y: target.position.y },
            targetObjectType,
          });

          // The newly burning entity will be picked up in step 1 next tick
        }
      }
    }

    // -----------------------------------------------------------------
    // 4. Apply AoE damage to zombies and the player
    // -----------------------------------------------------------------

    if (damageTickCounter >= FIRE.DAMAGE_TICK_INTERVAL) {
      damageTickCounter = 0;

      const damageRadiusSq = FIRE.DAMAGE_RADIUS * FIRE.DAMAGE_RADIUS;
      const damagePerTick =
        FIRE.BASE_DAMAGE_PER_SECOND * (FIRE.DAMAGE_TICK_INTERVAL / 60);

      for (const [entity] of burnState) {
        if (!entity.position || !entity.material) continue;

        const fx = entity.position.x;
        const fy = entity.position.y;
        const fuelMultiplier =
          entity.material.category === "fuel"
            ? FIRE.FUEL_DAMAGE_MULTIPLIER
            : 1.0;

        // Damage zombies
        for (const zombie of zombieEntities) {
          const d2 = distSq(fx, fy, zombie.position.x, zombie.position.y);
          if (d2 > damageRadiusSq) continue;

          const distance = Math.sqrt(d2);
          const falloff = lerp(
            1.0,
            FIRE.DAMAGE_FALLOFF,
            distance / FIRE.DAMAGE_RADIUS,
          );
          const damage = damagePerTick * falloff * fuelMultiplier;

          zombie.health.current = Math.max(
            0,
            zombie.health.current - damage,
          );

          safeEmit(ctx.eventBus, "fire-damage", {
            position: { x: zombie.position.x, y: zombie.position.y },
            damage,
            targetType: "zombie",
          });
        }

        // Damage player
        const player = combatPlayerEntities.entities[0];
        if (player) {
          // Respect i-frames from combat system
          if (player.combatState.iFramesRemaining <= 0) {
            const d2 = distSq(fx, fy, player.position.x, player.position.y);
            if (d2 <= damageRadiusSq) {
              const distance = Math.sqrt(d2);
              const falloff = lerp(
                1.0,
                FIRE.DAMAGE_FALLOFF,
                distance / FIRE.DAMAGE_RADIUS,
              );
              const damage = damagePerTick * falloff * fuelMultiplier;

              player.health.current = Math.max(
                0,
                player.health.current - damage,
              );

              // Sync combat previousHealth so the combat system does not
              // interpret fire damage as a zombie hit and grant i-frames.
              player.combatState.previousHealth = player.health.current;

              safeEmit(ctx.eventBus, "fire-damage", {
                position: { x: player.position.x, y: player.position.y },
                damage,
                targetType: "player",
              });
            }
          }
        }
      }
    }

    // -----------------------------------------------------------------
    // 5. Destroy burned-out objects
    // -----------------------------------------------------------------

    for (const entity of toDestroy) {
      burnState.delete(entity);

      const objectType = getObjectType(entity);
      const positionCopy = { x: entity.position.x, y: entity.position.y };
      const wasBarricade = !!entity.barricade;

      // --- Barricade constraint release ---
      if (entity.barricade && ctx.constraintRegistry) {
        const { constraintIds, entryPointIndex } = entity.barricade;

        for (const constraintId of constraintIds) {
          const constraint = ctx.constraintRegistry.get(constraintId);
          if (constraint) {
            try {
              ctx.scene.matter.world.removeConstraint(constraint);
            } catch (err) {
              console.error(
                `[FireSystem] Failed to remove constraint ${constraintId}:`,
                err,
              );
            }
            ctx.constraintRegistry.unregister(constraintId);
          }
        }

        // Update pathfinding — only unblock if no other barricades at this entry point
        if (ctx.pathfindingGrid) {
          const hasOtherBarricades = barricadeEntities.entities.some(
            (e) =>
              e !== entity &&
              e.barricade.entryPointIndex === entryPointIndex &&
              e.health.current > 0,
          );

          if (!hasOtherBarricades) {
            const ep = ctx.entryPoints?.[entryPointIndex];
            if (ep) {
              // Use entry point tile coordinate, not drifted entity position
              const tileX = ep.position.x;
              const tileY = ep.position.y;
              const updated = ctx.pathfindingGrid.setWalkable(tileX, tileY, true);
              if (!updated) {
                console.warn(
                  `[FireSystem] Failed to unblock pathfinding at tile (${tileX}, ${tileY}) — out of grid bounds`,
                );
              }
              ep.barricaded = false;
            }
          }
        }

        safeEmit(ctx.eventBus, "barricade-broken", {
          position: positionCopy,
        });
      }

      // --- Remove physics body from Matter.js ---
      if (entity.physicsBody) {
        const bodyId = entity.physicsBody.bodyId;
        const body = ctx.bodyRegistry.get(bodyId);
        if (body) {
          try {
            ctx.scene.matter.world.remove(body);
          } catch (err) {
            console.error(
              `[FireSystem] Failed to remove physics body ${bodyId}:`,
              err,
            );
          }
        }
        ctx.bodyRegistry.unregister(bodyId);
      }

      // --- Remove entity from ECS ---
      // Guard: entity may have been removed by event handlers in steps 3-4
      if (entity.position && entity.material) {
        world.remove(entity);
      }

      // --- Emit burnout event ---
      safeEmit(ctx.eventBus, "fire-burnout", {
        position: positionCopy,
        objectType,
        wasBarricade,
      });
    }

    // -----------------------------------------------------------------
    // 6. Cleanup stale entries (entities removed by other systems)
    // -----------------------------------------------------------------

    for (const entity of burnState.keys()) {
      if (!entity.position || !entity.material) {
        burnState.delete(entity);
      }
    }
  };
}

/**
 * Ignite a material entity from an external source.
 *
 * Sets the material state to 'burning' and emits the state change event.
 * The fire system will pick up the newly burning entity on its next tick.
 *
 * @returns true if the entity was ignited, false if it was already burning
 *   or not flammable enough.
 */
export function igniteEntity(
  entity: MaterialEntity,
  ctx: SceneContext,
): boolean {
  if (entity.material.state !== "inert") return false;
  if (entity.material.flammability < MATERIAL.FLAMMABILITY_THRESHOLD) {
    return false;
  }

  entity.material.state = "burning";

  safeEmit(ctx.eventBus, "material-state-changed", {
    position: { x: entity.position.x, y: entity.position.y },
    objectType: getObjectType(entity),
    previousState: "inert",
    newState: "burning",
  });

  return true;
}
