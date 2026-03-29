/**
 * Player combat system — melee attacks, damage, knockback, and i-frames.
 *
 * Runs after ZombieAISystem (so zombie damage to the player has already
 * been applied, enabling i-frame revert) and before PhysicsSyncSystem
 * (so knockback forces take effect in the same tick).
 *
 * Per-tick responsibilities:
 *   1. Tick down cooldowns (attack, swing, i-frames)
 *   2. Clean up expired sensor bodies
 *   3. Trigger new melee swing on attackPressed
 *   4. Check sensor overlap with zombie bodies
 *   5. Apply damage + knockback to hit zombies
 *   6. Detect player damage → apply i-frames + knockback
 *
 * NO React imports — this is pure TypeScript.
 */

import type { SceneContext } from "./scene-context";
import type { SystemFn } from "./system-runner";
import { combatPlayerEntities, zombieEntities } from "@/game/ecs/queries";
import { safeEmit } from "@/game/events/event-bus";
import { getObjectDef } from "@/game/procgen/object-defs";
import { getActiveItem } from "./inventory-utils";
import { COMBAT } from "./combat-constants";

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
 * Compute melee stats from the currently equipped item (or bare hands).
 *
 * Returns effective damage, range, and cooldown based on item mass.
 */
function computeMeleeStats(itemType: string | null): {
  damage: number;
  range: number;
  cooldown: number;
} {
  let mass = 0;
  if (itemType) {
    const def = getObjectDef(itemType);
    if (def) mass = def.physics.mass;
  }
  return {
    damage: COMBAT.BASE_MELEE_DAMAGE + mass * COMBAT.MASS_DAMAGE_SCALE,
    range: COMBAT.BASE_MELEE_RANGE + mass * COMBAT.MASS_RANGE_SCALE,
    cooldown: COMBAT.MELEE_COOLDOWN + mass * COMBAT.MASS_COOLDOWN_SCALE,
  };
}

// ---------------------------------------------------------------------------
// System factory
// ---------------------------------------------------------------------------

export function createCombatSystem(ctx: SceneContext): SystemFn {
  /**
   * Set of zombie bodyIds already hit during the current swing.
   * Prevents multi-hit from a single swing (the sensor persists for
   * several ticks). Cleared when the swing ends.
   */
  const swingHitSet = new Set<number>();

  /** Cached stats for the active swing (computed once per swing). */
  let swingDamage = 0;

  /** Position of the sensor centre for overlap checks. */
  let sensorCenterX = 0;
  let sensorCenterY = 0;

  /**
   * Hit radius for the distance-based overlap check.
   * Combines half the sensor diagonal with half the zombie body size.
   */
  let hitRadiusSq = 0;

  /**
   * Closure-scoped sensor body ID for orphan cleanup.
   * If the player entity is removed mid-swing (e.g. permadeath), the entity's
   * CombatState is inaccessible. This backup lets us clean up the physics body.
   */
  let activeSensorId: number | null = null;

  return (dt: number): void => {
    const player = combatPlayerEntities.entities[0];
    if (!player) {
      // Clean up orphaned sensor body if player was removed mid-swing
      if (activeSensorId !== null) {
        const sensorBody = ctx.bodyRegistry.get(activeSensorId);
        if (sensorBody) {
          ctx.scene.matter.world.remove(sensorBody);
        }
        ctx.bodyRegistry.unregister(activeSensorId);
        activeSensorId = null;
        swingHitSet.clear();
      }
      return;
    }

    const { combatState: cs, health, position: pos, inventory } = player;

    // ---- 1. Tick down cooldowns ----
    if (cs.attackCooldownRemaining > 0) {
      cs.attackCooldownRemaining = Math.max(0, cs.attackCooldownRemaining - dt);
    }
    if (cs.iFramesRemaining > 0) {
      cs.iFramesRemaining = Math.max(0, cs.iFramesRemaining - dt);
    }
    if (cs.swingTimeRemaining > 0) {
      cs.swingTimeRemaining = Math.max(0, cs.swingTimeRemaining - dt);
    }

    // ---- 2. Clean up expired sensor body ----
    if (cs.swingTimeRemaining <= 0 && cs.sensorBodyId !== null) {
      const sensorBody = ctx.bodyRegistry.get(cs.sensorBodyId);
      if (sensorBody) {
        ctx.scene.matter.world.remove(sensorBody);
      }
      ctx.bodyRegistry.unregister(cs.sensorBodyId);
      cs.sensorBodyId = null;
      activeSensorId = null;
      swingHitSet.clear();
    }

    // ---- 3. Trigger melee swing on attackPressed ----
    if (
      ctx.inputState.attackPressed &&
      cs.attackCooldownRemaining <= 0 &&
      cs.swingTimeRemaining <= 0
    ) {
      const itemType = getActiveItem(inventory);
      const stats = computeMeleeStats(itemType);

      // Aim direction from player to mouse
      const dx = ctx.inputState.aimX - pos.x;
      const dy = ctx.inputState.aimY - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Fallback: if mouse is exactly on player, aim right
      const nx = dist > 0 ? dx / dist : 1;
      const ny = dist > 0 ? dy / dist : 0;

      // Sensor centre position
      sensorCenterX = pos.x + nx * stats.range;
      sensorCenterY = pos.y + ny * stats.range;

      // Create Matter.js sensor body
      const sensorBody = ctx.scene.matter.add.rectangle(
        sensorCenterX,
        sensorCenterY,
        COMBAT.SWING_SENSOR_WIDTH,
        COMBAT.SWING_SENSOR_HEIGHT,
        { isSensor: true, isStatic: true },
      );
      ctx.bodyRegistry.register(sensorBody);
      cs.sensorBodyId = sensorBody.id;
      activeSensorId = sensorBody.id;

      // Set swing state
      cs.swingTimeRemaining = COMBAT.SWING_DURATION;
      cs.attackCooldownRemaining = stats.cooldown;
      swingDamage = stats.damage;
      swingHitSet.clear();

      // Hit radius: half sensor diagonal + generous zombie half-size
      const halfDiag = Math.sqrt(
        COMBAT.SWING_SENSOR_WIDTH * COMBAT.SWING_SENSOR_WIDTH +
        COMBAT.SWING_SENSOR_HEIGHT * COMBAT.SWING_SENSOR_HEIGHT,
      ) / 2;
      const maxZombieHalfSize = 14; // brute bodySize 28 / 2
      hitRadiusSq = (halfDiag + maxZombieHalfSize) * (halfDiag + maxZombieHalfSize);

      // Emit swing event for visual feedback
      safeEmit(ctx.eventBus, "melee-swing", {
        position: { x: sensorCenterX, y: sensorCenterY },
        aimAngle: Math.atan2(ny, nx),
        range: stats.range,
        itemType,
      });
    }

    // ---- 4. Check sensor overlap with zombies ----
    if (cs.sensorBodyId !== null && cs.swingTimeRemaining > 0) {
      for (const zombie of zombieEntities) {
        // Skip already-hit and dead zombies
        if (swingHitSet.has(zombie.physicsBody.bodyId)) continue;
        if (zombie.health.current <= 0) continue;

        const d = distSq(
          sensorCenterX,
          sensorCenterY,
          zombie.position.x,
          zombie.position.y,
        );

        if (d <= hitRadiusSq) {
          // ---- 5. Apply damage ----
          const prevHp = zombie.health.current;
          zombie.health.current = Math.max(0, prevHp - swingDamage);
          swingHitSet.add(zombie.physicsBody.bodyId);

          // Emit damage event for floating numbers
          safeEmit(ctx.eventBus, "damage-dealt", {
            position: { x: zombie.position.x, y: zombie.position.y },
            damage: Math.round(swingDamage),
            targetType: "zombie",
          });

          // ---- Apply knockback to zombie ----
          const kbDx = zombie.position.x - pos.x;
          const kbDy = zombie.position.y - pos.y;
          const kbDist = Math.sqrt(kbDx * kbDx + kbDy * kbDy);

          if (kbDist > 0) {
            const zombieBody = ctx.bodyRegistry.get(zombie.physicsBody.bodyId);
            if (zombieBody) {
              zombieBody.force.x += (kbDx / kbDist) * COMBAT.ZOMBIE_KNOCKBACK_FORCE;
              zombieBody.force.y += (kbDy / kbDist) * COMBAT.ZOMBIE_KNOCKBACK_FORCE;
            }
          }
        }
      }
    }

    // ---- 6. Player damage detection and i-frames ----
    if (health.current < cs.previousHealth) {
      // Health decreased since last tick (zombie AI applied damage)
      const damageTaken = cs.previousHealth - health.current;

      if (cs.iFramesRemaining > 0) {
        // During i-frames: revert the damage
        health.current = cs.previousHealth;

        // Re-emit corrected health to keep UI in sync
        safeEmit(ctx.eventBus, "player-health-changed", {
          current: health.current,
          max: health.max,
          delta: 0,
        });
      } else {
        // Not in i-frames: accept damage, start i-frames, apply knockback
        cs.iFramesRemaining = COMBAT.INVULNERABILITY_DURATION;

        // Find the closest attacking zombie for knockback direction
        let closestZombieDSq = Infinity;
        let closestZombieX = 0;
        let closestZombieY = 0;

        for (const zombie of zombieEntities) {
          if (zombie.aiState.state !== "attacking") continue;
          const zd = distSq(pos.x, pos.y, zombie.position.x, zombie.position.y);
          if (zd < closestZombieDSq) {
            closestZombieDSq = zd;
            closestZombieX = zombie.position.x;
            closestZombieY = zombie.position.y;
          }
        }

        // Apply knockback to player (away from attacker) when source is known
        let sourceDirX = 0;
        let sourceDirY = 0;

        if (closestZombieDSq < Infinity) {
          const kbDx = pos.x - closestZombieX;
          const kbDy = pos.y - closestZombieY;
          const kbDist = Math.sqrt(kbDx * kbDx + kbDy * kbDy);

          if (kbDist > 0) {
            const playerBody = ctx.bodyRegistry.get(player.physicsBody.bodyId);
            if (playerBody) {
              playerBody.force.x += (kbDx / kbDist) * COMBAT.PLAYER_KNOCKBACK_FORCE;
              playerBody.force.y += (kbDy / kbDist) * COMBAT.PLAYER_KNOCKBACK_FORCE;
            }
            sourceDirX = (closestZombieX - pos.x) / kbDist;
            sourceDirY = (closestZombieY - pos.y) / kbDist;
          }
        }

        // Always emit player-hit event for UI feedback (even if no attacker found)
        safeEmit(ctx.eventBus, "player-hit", {
          position: { x: pos.x, y: pos.y },
          damage: damageTaken,
          sourceDirection: { x: sourceDirX, y: sourceDirY },
        });
      }
    }

    // Always sync previousHealth at end of tick
    cs.previousHealth = health.current;
  };
}
