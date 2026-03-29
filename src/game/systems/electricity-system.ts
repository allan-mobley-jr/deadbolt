/**
 * Electricity chain system — BFS chain detection, battery drain, contact damage, and stagger.
 *
 * Runs each fixed tick after FireSystem. Detects car battery entities, traces
 * conductive chains via the MaterialRegistry adjacency graph (BFS), drains
 * battery charge proportionally to chain size, applies contact damage to
 * zombies and the player, and triggers the staggered AI state on zombies.
 *
 * Chain state is tracked in closure-scoped Maps (not ECS components),
 * following the same pattern as the FireSystem's burnState.
 *
 * NO React imports — this is pure TypeScript.
 */

import type { With } from "miniplex";
import type { SceneContext } from "./scene-context";
import type { SystemFn } from "./system-runner";
import type { Entity } from "@/game/ecs/entity";
import {
  batteryEntities,
  zombieEntities,
  combatPlayerEntities,
} from "@/game/ecs/queries";
import { safeEmit } from "@/game/events/event-bus";
import { ELECTRICITY } from "./electricity-constants";
import type { MaterialRegistry } from "./material-system";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** A material entity with position, material, and physics body. */
type PhysicsMaterialEntity = With<Entity, "position" | "material" | "physicsBody">;

/** A battery entity narrowed to required components. */
type BatteryEntity = With<Entity, "position" | "material" | "physicsBody" | "battery">;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Squared Euclidean distance between two 2D points. */
function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
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
 * BFS traversal from a battery entity through the conductive adjacency graph.
 *
 * Walks `getConductiveNeighbors()` from the battery's body, collecting all
 * reachable conductive entities. Non-conductive objects naturally break the
 * chain because they never appear in the conductive neighbor results.
 *
 * Skips entities that are currently burning (fire takes priority and
 * destroys entities — mixing states would be contradictory).
 *
 * @returns Set of all entities in the chain (including the battery itself).
 */
function traceChain(
  battery: BatteryEntity,
  registry: MaterialRegistry,
): Set<PhysicsMaterialEntity> {
  const visited = new Set<number>();
  const chain = new Set<PhysicsMaterialEntity>();
  const queue: number[] = [battery.physicsBody.bodyId];
  visited.add(battery.physicsBody.bodyId);

  // Add the battery itself to the chain
  chain.add(battery as PhysicsMaterialEntity);

  while (queue.length > 0) {
    const bodyId = queue.shift()!;
    const neighbors = registry.getConductiveNeighbors(bodyId);

    for (const neighbor of neighbors) {
      const neighborId = neighbor.physicsBody.bodyId;
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);

      // Guard: entity may have been partially removed by another system
      if (!neighbor.material || !neighbor.position) continue;

      // Skip burning entities — fire takes priority
      if (neighbor.material.state === "burning") continue;

      chain.add(neighbor);
      queue.push(neighborId);
    }
  }

  return chain;
}

// ---------------------------------------------------------------------------
// System factory
// ---------------------------------------------------------------------------

/**
 * Create the electricity chain system.
 *
 * Per-tick responsibilities:
 *   1. Recalculate chains (periodically) — BFS from each battery
 *   2. Update electrified state on chain members
 *   3. Drain battery charge proportionally to chain size
 *   4. Apply contact damage to zombies and the player
 *   5. Trigger stagger on damaged zombies
 *   6. Emit events for all electricity lifecycle phases
 */
export function createElectricitySystem(ctx: SceneContext): SystemFn {
  const registry = ctx.materialRegistry;
  if (!registry) {
    throw new Error("[ElectricitySystem] ctx.materialRegistry is required");
  }

  /**
   * Maps each battery entity to the set of entities in its current chain.
   * Rebuilt every CHAIN_RECALC_INTERVAL ticks.
   */
  const chainMap = new Map<BatteryEntity, Set<PhysicsMaterialEntity>>();

  /**
   * Union set of all currently electrified entities across all chains.
   * Used for efficient damage iteration and for resetting entities that
   * fall out of all chains.
   */
  let allElectrified = new Set<PhysicsMaterialEntity>();

  /** Tick counter for chain recalculation. */
  let chainTickCounter = 0;

  /** Tick counter for damage application. */
  let damageTickCounter = 0;

  /** Tick counter for charge-changed event throttling. */
  let chargeEventTickCounter = 0;

  return (dt: number): void => {
    chainTickCounter++;
    damageTickCounter++;
    chargeEventTickCounter++;

    // -----------------------------------------------------------------
    // 1. Recalculate chains (every CHAIN_RECALC_INTERVAL ticks)
    // -----------------------------------------------------------------

    if (chainTickCounter >= ELECTRICITY.CHAIN_RECALC_INTERVAL) {
      chainTickCounter = 0;

      const previousElectrified = allElectrified;
      const newAllElectrified = new Set<PhysicsMaterialEntity>();
      const staleBatteries: BatteryEntity[] = [];

      // --- Build chains from all batteries ---
      for (const battery of batteryEntities) {
        // Guard: battery may have been removed
        if (!battery.position || !battery.material || !battery.battery) {
          continue;
        }

        if (battery.battery.charge <= 0) {
          // Battery is depleted — mark for cleanup
          if (chainMap.has(battery as BatteryEntity)) {
            staleBatteries.push(battery as BatteryEntity);
          }
          battery.battery.active = false;
          continue;
        }

        // Skip batteries that are burning (fire takes priority)
        if (battery.material.state === "burning") {
          if (chainMap.has(battery as BatteryEntity)) {
            staleBatteries.push(battery as BatteryEntity);
          }
          battery.battery.active = false;
          continue;
        }

        const chain = traceChain(battery as BatteryEntity, registry);

        // Only activate if the chain includes at least one other entity
        if (chain.size > 1) {
          battery.battery.active = true;
          chainMap.set(battery as BatteryEntity, chain);

          for (const entity of chain) {
            newAllElectrified.add(entity);
          }

          // Emit chain-formed event
          safeEmit(ctx.eventBus, "electricity-chain-formed", {
            batteryPosition: { x: battery.position.x, y: battery.position.y },
            chainSize: chain.size,
          });
        } else {
          // Battery alone — not active, no drain
          battery.battery.active = false;
          if (chainMap.has(battery as BatteryEntity)) {
            staleBatteries.push(battery as BatteryEntity);
          }
        }
      }

      // --- Clean up stale batteries ---
      for (const battery of staleBatteries) {
        chainMap.delete(battery);

        // Emit depleted event if battery just ran out
        if (battery.battery.charge <= 0 && battery.position) {
          safeEmit(ctx.eventBus, "electricity-depleted", {
            batteryPosition: { x: battery.position.x, y: battery.position.y },
          });
        }
      }

      // --- Update material state on entities entering/leaving chains ---

      // Entities that were electrified but are no longer in any chain
      for (const entity of previousElectrified) {
        if (!newAllElectrified.has(entity) && entity.material) {
          if (entity.material.state === "electrified") {
            entity.material.state = "inert";

            safeEmit(ctx.eventBus, "material-state-changed", {
              position: { x: entity.position.x, y: entity.position.y },
              objectType: getObjectType(entity),
              previousState: "electrified",
              newState: "inert",
            });
          }
        }
      }

      // Entities that are now in a chain but were not electrified
      for (const entity of newAllElectrified) {
        if (entity.material && entity.material.state !== "electrified") {
          const previousState = entity.material.state;
          entity.material.state = "electrified";

          safeEmit(ctx.eventBus, "material-state-changed", {
            position: { x: entity.position.x, y: entity.position.y },
            objectType: getObjectType(entity),
            previousState,
            newState: "electrified",
          });
        }
      }

      allElectrified = newAllElectrified;
    }

    // -----------------------------------------------------------------
    // 2. Drain battery charge (every tick)
    // -----------------------------------------------------------------

    for (const [battery, chain] of chainMap) {
      if (!battery.battery || !battery.position) continue;
      if (!battery.battery.active) continue;

      // Chain size minus 1 = number of connected objects (excluding the battery)
      const connectedCount = chain.size - 1;
      const drainRate =
        ELECTRICITY.BASE_DRAIN_RATE +
        connectedCount * ELECTRICITY.PER_OBJECT_DRAIN_RATE;

      battery.battery.charge = Math.max(
        0,
        battery.battery.charge - drainRate * dt,
      );

      // Throttled charge-changed event
      if (chargeEventTickCounter >= ELECTRICITY.CHARGE_EVENT_INTERVAL) {
        safeEmit(ctx.eventBus, "electricity-charge-changed", {
          batteryPosition: { x: battery.position.x, y: battery.position.y },
          charge: battery.battery.charge,
          maxCharge: battery.battery.maxCharge,
        });
      }
    }

    if (chargeEventTickCounter >= ELECTRICITY.CHARGE_EVENT_INTERVAL) {
      chargeEventTickCounter = 0;
    }

    // -----------------------------------------------------------------
    // 3. Apply contact damage (every DAMAGE_TICK_INTERVAL ticks)
    // -----------------------------------------------------------------

    if (damageTickCounter >= ELECTRICITY.DAMAGE_TICK_INTERVAL) {
      damageTickCounter = 0;

      const contactRadiusSq =
        ELECTRICITY.CONTACT_RADIUS * ELECTRICITY.CONTACT_RADIUS;
      const damagePerTick =
        ELECTRICITY.BASE_DAMAGE_PER_SECOND *
        (ELECTRICITY.DAMAGE_TICK_INTERVAL / 60);

      for (const entity of allElectrified) {
        if (!entity.position || !entity.material) continue;

        const ex = entity.position.x;
        const ey = entity.position.y;
        const conductivity = entity.material.conductivity;
        const scaledDamage =
          damagePerTick * conductivity * ELECTRICITY.CONDUCTIVITY_DAMAGE_SCALE;

        if (scaledDamage <= 0) continue;

        // --- Damage zombies ---
        for (const zombie of zombieEntities) {
          const d2 = distSq(ex, ey, zombie.position.x, zombie.position.y);
          if (d2 > contactRadiusSq) continue;

          // Apply damage
          zombie.health.current = Math.max(
            0,
            zombie.health.current - scaledDamage,
          );

          // Trigger stagger if not already staggered or dead
          if (
            zombie.aiState.state === "pathing" ||
            zombie.aiState.state === "attacking"
          ) {
            // Use the shorter of electrocution stagger and the zombie's own
            // stagger duration — brutes recover faster from all stagger sources
            const staggerDuration = Math.min(
              ELECTRICITY.ELECTROCUTION_STAGGER_DURATION,
              zombie.zombieType.staggerDuration,
            );
            zombie.aiState.state = "staggered";
            zombie.aiState.staggerTimeRemaining = staggerDuration;
            zombie.velocity.vx = 0;
            zombie.velocity.vy = 0;
          }

          // Sync previousHealth so the ZombieAI system does not
          // re-trigger stagger from the same damage on the next tick
          zombie.aiState.previousHealth = zombie.health.current;

          safeEmit(ctx.eventBus, "electricity-damage", {
            position: { x: zombie.position.x, y: zombie.position.y },
            damage: scaledDamage,
            targetType: "zombie",
          });
        }

        // --- Damage player ---
        const player = combatPlayerEntities.entities[0];
        if (player && player.combatState.iFramesRemaining <= 0) {
          const d2 = distSq(
            ex,
            ey,
            player.position.x,
            player.position.y,
          );
          if (d2 <= contactRadiusSq) {
            player.health.current = Math.max(
              0,
              player.health.current - scaledDamage,
            );

            // Sync combat previousHealth so the combat system does not
            // interpret electricity damage as a zombie hit and grant i-frames
            player.combatState.previousHealth = player.health.current;

            safeEmit(ctx.eventBus, "electricity-damage", {
              position: { x: player.position.x, y: player.position.y },
              damage: scaledDamage,
              targetType: "player",
            });
          }
        }
      }
    }

    // -----------------------------------------------------------------
    // 4. Cleanup stale chain entries (entities removed by other systems)
    // -----------------------------------------------------------------

    for (const [battery, chain] of chainMap) {
      // Battery removed
      if (!battery.position || !battery.material || !battery.battery) {
        chainMap.delete(battery);
        continue;
      }

      // Remove destroyed entities from chains
      for (const entity of chain) {
        if (!entity.position || !entity.material) {
          chain.delete(entity);
          allElectrified.delete(entity);
        }
      }
    }
  };
}
