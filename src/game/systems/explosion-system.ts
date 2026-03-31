/**
 * Explosion system -- detonation, radial force, area damage, chain reactions,
 * wall destruction, and fire ignition.
 *
 * Runs each fixed tick after FireSystem. Detects burning objects with
 * explosive potential above the threshold and processes detonations as
 * instantaneous one-frame events. Chain detonations are resolved within
 * the same tick using BFS with a depth cap.
 *
 * The system:
 *   1. Finds burning entities with explosivePotential >= EXPLOSIVE_THRESHOLD
 *   2. Processes each detonation:
 *      - Applies radial force to all physics bodies within blast radius
 *      - Deals area damage to zombies and player (with distance falloff)
 *      - Damages/destroys barricades and objects
 *      - Ignites nearby flammable objects (chains with fire system)
 *      - Destroys interior wall tiles and updates pathfinding
 *      - Triggers screen shake and visual effects
 *   3. Chain-detonates nearby explosive objects (same tick, BFS)
 *
 * NO React imports -- this is pure TypeScript.
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
import { igniteEntity } from "./fire-system";
import { EXPLOSION } from "./explosion-constants";
import { MATERIAL } from "./material-constants";
import { NOISE } from "./noise-constants";
import { TileType } from "@/game/tiles/tile-types";
import { TILE_SIZE } from "@/game/procgen/constants";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** A material entity narrowed to have position and material. */
type MaterialEntity = With<Entity, "position" | "material">;

/** Detonation candidate queued for BFS processing. */
interface DetonationCandidate {
  entity: MaterialEntity;
  x: number;
  y: number;
  explosivePotential: number;
}

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

/** Convert world pixels to tile coordinates. */
function pixelToTile(px: number): number {
  return Math.floor(px / TILE_SIZE);
}

/** Run a callback, silently swallowing errors (Phaser APIs may not exist in tests). */
function tryVisual(fn: () => void): void {
  try {
    fn();
  } catch {
    // Phaser scene/camera APIs may not be available in test environments
  }
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
 * Heuristic to determine if a wall tile is an interior wall (destructible).
 *
 * A wall is considered interior if it has walkable tiles (Floor, Door, Road,
 * Sidewalk) on both opposing sides (left+right OR top+bottom). Exterior
 * walls typically border Empty tiles on one side.
 *
 * @returns true if the wall is interior and can be destroyed by explosions.
 */
function isInteriorWall(
  tileGrid: number[][],
  tx: number,
  ty: number,
  width: number,
  height: number,
): boolean {
  // Bounds check -- tiles at the grid edge are always exterior
  if (tx <= 0 || tx >= width - 1 || ty <= 0 || ty >= height - 1) {
    return false;
  }

  const walkable = (t: number): boolean =>
    t === TileType.Floor ||
    t === TileType.Door ||
    t === TileType.Road ||
    t === TileType.Sidewalk;

  // Check horizontal neighbors (left + right both walkable)
  const leftWalkable = walkable(tileGrid[ty][tx - 1]);
  const rightWalkable = walkable(tileGrid[ty][tx + 1]);
  if (leftWalkable && rightWalkable) return true;

  // Check vertical neighbors (top + bottom both walkable)
  const topWalkable = walkable(tileGrid[ty - 1][tx]);
  const bottomWalkable = walkable(tileGrid[ty + 1][tx]);
  if (topWalkable && bottomWalkable) return true;

  return false;
}

// ---------------------------------------------------------------------------
// System factory
// ---------------------------------------------------------------------------

/**
 * Create the explosion system.
 *
 * Per-tick responsibilities:
 *   1. Detect burning entities with explosive potential above threshold
 *   2. Process detonations via BFS (chain reactions within same tick)
 *   3. Apply radial force, area damage, fire ignition, wall destruction
 *   4. Emit events for all explosion phases
 */
export function createExplosionSystem(ctx: SceneContext): SystemFn {
  const registry = ctx.materialRegistry;
  if (!registry) {
    throw new Error("[ExplosionSystem] ctx.materialRegistry is required");
  }

  return (_dt: number): void => {
    // Track detonated entities this tick to prevent re-detonation
    const detonated = new Set<Entity>();

    // -----------------------------------------------------------------
    // 1. Find burning entities with explosive potential above threshold
    // -----------------------------------------------------------------

    const burningEntities = registry.getBurningEntities();
    const queue: DetonationCandidate[] = [];

    for (const entity of burningEntities) {
      if (entity.material.explosivePotential < MATERIAL.EXPLOSIVE_THRESHOLD) {
        continue;
      }
      if (detonated.has(entity)) continue;

      queue.push({
        entity,
        x: entity.position.x,
        y: entity.position.y,
        explosivePotential: entity.material.explosivePotential,
      });
    }

    // Early exit if no explosions this tick
    if (queue.length === 0) return;

    // -----------------------------------------------------------------
    // 2. BFS chain detonation loop
    // -----------------------------------------------------------------

    const blastRadius = EXPLOSION.BLAST_RADIUS;
    const blastRadiusSq = blastRadius * blastRadius;
    let depth = 0;

    while (queue.length > 0 && depth < EXPLOSION.MAX_CHAIN_DEPTH) {
      // Snapshot current batch (new chain candidates are appended for next depth)
      const batch = queue.splice(0);
      depth++;

      for (const candidate of batch) {
        const { entity, x, y, explosivePotential } = candidate;

        // Guard: entity may have been destroyed by a prior detonation
        if (!entity.position || !entity.material) continue;
        if (detonated.has(entity)) continue;

        detonated.add(entity);

        // --- Emit detonation event ---
        safeEmit(ctx.eventBus, "explosion-detonated", {
          position: { x, y },
          objectType: getObjectType(entity),
          explosivePotential,
          radius: blastRadius,
        });

        // ---------------------------------------------------------------
        // 2a. Apply radial force to all physics bodies within blast radius
        // ---------------------------------------------------------------

        const allBodies = ctx.bodyRegistry.getAll();
        for (const body of allBodies) {
          if (body.isStatic) continue;

          const bx = body.position.x;
          const by = body.position.y;
          const d2 = distSq(x, y, bx, by);
          if (d2 > blastRadiusSq) continue;

          const distance = Math.sqrt(d2);
          // Avoid division by zero for bodies at the exact blast center
          if (distance < 1) continue;

          const nx = (bx - x) / distance;
          const ny = (by - y) / distance;
          const falloff = lerp(
            1.0,
            EXPLOSION.FORCE_FALLOFF,
            distance / blastRadius,
          );
          const forceMag = EXPLOSION.BASE_FORCE * explosivePotential * falloff;

          body.force.x += nx * forceMag;
          body.force.y += ny * forceMag;
        }

        // ---------------------------------------------------------------
        // 2b. Damage zombies within blast radius
        // ---------------------------------------------------------------

        for (const zombie of zombieEntities) {
          if (!zombie.position || !zombie.health) continue;
          if (zombie.health.current <= 0) continue; // Already dead

          const d2 = distSq(x, y, zombie.position.x, zombie.position.y);
          if (d2 > blastRadiusSq) continue;

          const distance = Math.sqrt(d2);
          const falloff = lerp(
            1.0,
            EXPLOSION.DAMAGE_FALLOFF,
            distance / blastRadius,
          );
          const damage = EXPLOSION.BASE_DAMAGE * explosivePotential * falloff;

          zombie.health.current = Math.max(0, zombie.health.current - damage);

          // Trigger stagger if not already staggered or dead
          if (
            zombie.aiState.state === "pathing" ||
            zombie.aiState.state === "attacking" ||
            zombie.aiState.state === "idle"
          ) {
            const staggerDuration = Math.min(
              EXPLOSION.STAGGER_DURATION,
              zombie.zombieType.staggerDuration,
            );
            zombie.aiState.state = "staggered";
            zombie.aiState.staggerTimeRemaining = staggerDuration;
            zombie.velocity.vx = 0;
            zombie.velocity.vy = 0;
          }

          // Sync previousHealth so zombie AI does not re-trigger stagger
          zombie.aiState.previousHealth = zombie.health.current;

          safeEmit(ctx.eventBus, "explosion-damage", {
            position: { x: zombie.position.x, y: zombie.position.y },
            damage,
            targetType: "zombie",
          });
        }

        // ---------------------------------------------------------------
        // 2c. Damage player within blast radius
        // ---------------------------------------------------------------

        const player = combatPlayerEntities.entities[0];
        if (player && player.combatState.iFramesRemaining <= 0) {
          const d2 = distSq(x, y, player.position.x, player.position.y);
          if (d2 <= blastRadiusSq) {
            const distance = Math.sqrt(d2);
            const falloff = lerp(
              1.0,
              EXPLOSION.DAMAGE_FALLOFF,
              distance / blastRadius,
            );
            const damage =
              EXPLOSION.BASE_DAMAGE * explosivePotential * falloff;

            player.health.current = Math.max(
              0,
              player.health.current - damage,
            );

            // Sync previousHealth so combat system does not interpret
            // explosion damage as a zombie hit and grant i-frames
            player.combatState.previousHealth = player.health.current;

            safeEmit(ctx.eventBus, "explosion-damage", {
              position: { x: player.position.x, y: player.position.y },
              damage,
              targetType: "player",
            });
          }
        }

        // ---------------------------------------------------------------
        // 2d. Damage/destroy barricades within blast radius
        // ---------------------------------------------------------------

        const barricadesToDestroy: Array<
          With<Entity, "position" | "physicsBody" | "health" | "barricade">
        > = [];

        for (const barricade of barricadeEntities) {
          if (!barricade.position) continue;

          const d2 = distSq(
            x,
            y,
            barricade.position.x,
            barricade.position.y,
          );
          if (d2 > blastRadiusSq) continue;

          const distance = Math.sqrt(d2);
          const falloff = lerp(
            1.0,
            EXPLOSION.DAMAGE_FALLOFF,
            distance / blastRadius,
          );
          const damage =
            EXPLOSION.BARRICADE_DAMAGE * explosivePotential * falloff;

          barricade.barricade.currentDurability = Math.max(
            0,
            barricade.barricade.currentDurability - damage,
          );
          barricade.health.current = Math.max(
            0,
            barricade.health.current - damage,
          );

          safeEmit(ctx.eventBus, "explosion-damage", {
            position: {
              x: barricade.position.x,
              y: barricade.position.y,
            },
            damage,
            targetType: "barricade",
          });

          if (barricade.barricade.currentDurability <= 0) {
            barricadesToDestroy.push(barricade);
          }
        }

        // Destroy barricades (same pattern as fire system burnout)
        for (const barricade of barricadesToDestroy) {
          if (!barricade.position) continue;

          const positionCopy = {
            x: barricade.position.x,
            y: barricade.position.y,
          };
          const { constraintIds, entryPointIndex } = barricade.barricade;

          // Release constraints
          if (ctx.constraintRegistry) {
            for (const constraintId of constraintIds) {
              const constraint = ctx.constraintRegistry.get(constraintId);
              if (constraint) {
                try {
                  ctx.scene.matter.world.removeConstraint(constraint);
                } catch (err) {
                  console.error(
                    `[ExplosionSystem] Failed to remove constraint ${constraintId}:`,
                    err,
                  );
                }
                ctx.constraintRegistry.unregister(constraintId);
              }
            }
          }

          // Update pathfinding
          if (ctx.pathfindingGrid) {
            const hasOtherBarricades = barricadeEntities.entities.some(
              (e) =>
                e !== barricade &&
                e.barricade?.entryPointIndex === entryPointIndex &&
                (e.health?.current ?? 0) > 0,
            );

            if (!hasOtherBarricades) {
              const tileX = pixelToTile(positionCopy.x);
              const tileY = pixelToTile(positionCopy.y);
              ctx.pathfindingGrid.setWalkable(tileX, tileY, true);

              if (ctx.entryPoints?.[entryPointIndex]) {
                ctx.entryPoints[entryPointIndex].barricaded = false;
              }
            }
          }

          // Remove physics body
          if (barricade.physicsBody) {
            const bodyId = barricade.physicsBody.bodyId;
            const body = ctx.bodyRegistry.get(bodyId);
            if (body) {
              try {
                ctx.scene.matter.world.remove(body);
              } catch (err) {
                console.error(
                  `[ExplosionSystem] Failed to remove physics body ${bodyId}:`,
                  err,
                );
              }
            }
            ctx.bodyRegistry.unregister(bodyId);
          }

          // Remove entity from ECS
          world.remove(barricade);

          safeEmit(ctx.eventBus, "barricade-broken", {
            position: positionCopy,
          });
        }

        // ---------------------------------------------------------------
        // 2e. Ignite nearby flammable objects (chain with fire system)
        // ---------------------------------------------------------------

        const flammables = registry.getFlammableInRadius(x, y, blastRadius);
        for (const result of flammables) {
          const target = result.entity;
          if (target === entity) continue;
          if (target.material.state !== "inert") continue;

          igniteEntity(target, ctx);
        }

        // ---------------------------------------------------------------
        // 2f. Chain detonation -- find nearby explosives to detonate
        // ---------------------------------------------------------------

        const explosives = registry.getExplosiveInRadius(x, y, blastRadius);
        for (const result of explosives) {
          const target = result.entity;
          if (detonated.has(target)) continue;
          if (target === entity) continue;

          // Ignite first (if not already burning) so the explosion
          // follows the fire → explosion chain naturally
          if (target.material.state === "inert") {
            if (target.material.flammability >= MATERIAL.FLAMMABILITY_THRESHOLD) {
              igniteEntity(target, ctx);
            } else {
              // Non-flammable explosive (edge case) -- detonate directly
              target.material.state = "burning";
            }
          }

          queue.push({
            entity: target,
            x: target.position.x,
            y: target.position.y,
            explosivePotential: target.material.explosivePotential,
          });
        }

        // ---------------------------------------------------------------
        // 2g. Destroy interior wall tiles within blast radius
        // ---------------------------------------------------------------

        if (ctx.tileGrid && ctx.pathfindingGrid) {
          const centerTX = pixelToTile(x);
          const centerTY = pixelToTile(y);
          const gridHeight = ctx.tileGrid.length;
          const gridWidth = gridHeight > 0 ? ctx.tileGrid[0].length : 0;

          const r = EXPLOSION.WALL_DESTROY_RADIUS_TILES;
          for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              const tx = centerTX + dx;
              const ty = centerTY + dy;

              // Bounds check
              if (tx < 0 || tx >= gridWidth || ty < 0 || ty >= gridHeight) {
                continue;
              }

              if (ctx.tileGrid[ty][tx] !== TileType.Wall) continue;

              if (!isInteriorWall(ctx.tileGrid, tx, ty, gridWidth, gridHeight)) {
                continue;
              }

              // Mutate tile grid to Floor
              ctx.tileGrid[ty][tx] = TileType.Floor;

              // Update pathfinding grid
              ctx.pathfindingGrid.setWalkable(tx, ty, true);

              // Update Phaser tilemap visual and collision
              if (ctx.tilemap) {
                const layer = ctx.tilemap.getLayer(0);
                if (layer?.tilemapLayer) {
                  const tile = layer.tilemapLayer.putTileAt(
                    TileType.Floor,
                    tx,
                    ty,
                  );
                  if (tile) {
                    tile.setCollision(false);
                  }
                }
              }

              safeEmit(ctx.eventBus, "explosion-wall-destroyed", {
                tilePosition: { x: tx, y: ty },
              });
            }
          }
        }

        // ---------------------------------------------------------------
        // 2h. Destroy the exploding entity itself
        // ---------------------------------------------------------------

        if (entity.physicsBody) {
          const bodyId = entity.physicsBody.bodyId;
          const body = ctx.bodyRegistry.get(bodyId);
          if (body) {
            try {
              ctx.scene.matter.world.remove(body);
            } catch (err) {
              console.error(
                `[ExplosionSystem] Failed to remove detonating body ${bodyId}:`,
                err,
              );
            }
          }
          ctx.bodyRegistry.unregister(bodyId);
        }

        if (entity.position && entity.material) {
          world.remove(entity);
        }

        // ---------------------------------------------------------------
        // 2i. Visual feedback
        // ---------------------------------------------------------------

        // Screen shake
        tryVisual(() => {
          ctx.scene.cameras.main.shake(
            EXPLOSION.SCREEN_SHAKE_DURATION,
            EXPLOSION.SCREEN_SHAKE_INTENSITY,
          );
        });

        // Brief white flash overlay
        tryVisual(() => {
          const cam = ctx.scene.cameras.main;
          const flash = ctx.scene.add
            .rectangle(
              cam.scrollX + cam.width / 2,
              cam.scrollY + cam.height / 2,
              cam.width,
              cam.height,
              0xffffff,
              0.8,
            )
            .setScrollFactor(0)
            .setDepth(Number.MAX_SAFE_INTEGER);

          ctx.scene.tweens.add({
            targets: flash,
            alpha: 0,
            duration: EXPLOSION.FLASH_DURATION,
            onComplete: () => flash.destroy(),
          });
        });

        // Expanding circle effect
        tryVisual(() => {
          const circle = ctx.scene.add
            .circle(x, y, EXPLOSION.CIRCLE_MAX_RADIUS, 0xff8800, 0.6)
            .setDepth(Number.MAX_SAFE_INTEGER - 1);

          circle.setScale(0);

          ctx.scene.tweens.add({
            targets: circle,
            scaleX: 1,
            scaleY: 1,
            alpha: 0,
            duration: EXPLOSION.CIRCLE_DURATION,
            onComplete: () => circle.destroy(),
          });
        });

        // Emit noise for the explosion (loudest possible)
        safeEmit(ctx.eventBus, "noise-generated", {
          position: { x, y },
          radius: blastRadius * 3,
          intensity: NOISE.EXPLOSION_INTENSITY,
          duration: NOISE.EXPLOSION_DECAY_DURATION,
          source: "explosion",
        });
      }
    }
  };
}
