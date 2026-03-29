/**
 * Barricade system — snap detection, placement, damage tracking, and destruction.
 *
 * Runs each fixed tick after InteractionSystem (to see freshly-dropped objects)
 * and before PhysicsSyncSystem (so constraints are active for the same tick).
 *
 * Four responsibilities:
 *   1. Snap detection: detect objects near entry points and emit visual feedback
 *   2. Placement: on pointer release within snap zone, anchor object with constraints
 *   3. Damage tracking: detect health changes and emit visual feedback events
 *   4. Destruction: when barricade health reaches zero, break constraints and restore debris
 *
 * NO React imports — this is pure TypeScript.
 */

import type { SceneContext } from "./scene-context";
import type { SystemFn } from "./system-runner";
import type { Entity } from "@/game/ecs/entity";
import { world } from "@/game/ecs/world";
import {
  interactableEntities,
  playerEntities,
  barricadeEntities,
} from "@/game/ecs/queries";
import { getObjectDef } from "@/game/procgen/object-defs";
import { safeEmit } from "@/game/events/event-bus";
import { TILE_SIZE } from "@/game/procgen/constants";
import type { WallAnchorPair } from "./wall-anchor-registry";

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/**
 * Multiplier applied to ObjectDefinition.physics.durability (0-1) to derive
 * barricade max HP. A wooden_plank (0.3) gets 60 HP; a metal_sheet (0.8)
 * gets 160 HP.
 */
export const BARRICADE_DURABILITY_SCALE = 200;

/**
 * Default constraint stiffness for barricade anchoring.
 * 0.8 = slightly flexible, allows visible shake on impact.
 */
export const CONSTRAINT_STIFFNESS = 0.8;

/**
 * Default constraint damping to prevent oscillation.
 */
export const CONSTRAINT_DAMPING = 0.1;

/**
 * Maximum distance (pixels) from the player to an object for barricade
 * placement. Slightly larger than INTERACTION_RANGE to allow placement
 * at arm's length.
 */
export const BARRICADE_PLACE_RANGE = 96;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Squared Euclidean distance between two 2D points. */
function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Convert world pixels to tile coordinates. */
function pixelToTile(px: number): number {
  return Math.floor(px / TILE_SIZE);
}

// ---------------------------------------------------------------------------
// System factory
// ---------------------------------------------------------------------------

/**
 * Create the barricade system.
 *
 * Requires constraintRegistry, wallAnchorRegistry, pathfindingGrid, and
 * entryPoints to be set on SceneContext. If any are missing, the system
 * logs a one-time warning and becomes a no-op.
 */
export function createBarricadeSystem(ctx: SceneContext): SystemFn {
  /** Track the last snap target for event deduplication. */
  let activeSnapTarget: WallAnchorPair | null = null;

  /** Track previous health values to detect damage events. */
  const prevHealthMap = new Map<Entity, number>();

  /** Whether we have already warned about missing context properties. */
  let warnedMissingContext = false;

  return (_dt: number): void => {
    // Guard: skip if registries are not wired up
    if (
      !ctx.constraintRegistry ||
      !ctx.wallAnchorRegistry ||
      !ctx.pathfindingGrid ||
      !ctx.entryPoints
    ) {
      if (!warnedMissingContext) {
        warnedMissingContext = true;
        console.warn(
          "[BarricadeSystem] Skipping — missing required context:",
          !ctx.constraintRegistry && "constraintRegistry",
          !ctx.wallAnchorRegistry && "wallAnchorRegistry",
          !ctx.pathfindingGrid && "pathfindingGrid",
          !ctx.entryPoints && "entryPoints",
        );
      }
      return;
    }

    const { constraintRegistry, wallAnchorRegistry, pathfindingGrid, entryPoints } = ctx;

    const player = playerEntities.entities[0];
    if (!player) return;

    const px = player.position.x;
    const py = player.position.y;
    const placeRangeSq = BARRICADE_PLACE_RANGE * BARRICADE_PLACE_RANGE;

    // -----------------------------------------------------------------
    // 1. Snap detection — find objects near entry points
    // -----------------------------------------------------------------

    let currentSnapTarget: WallAnchorPair | null = null;
    let snapObjectEntity: Entity | null = null;

    // Only check for snap when pointer is down (dragging) or just released
    if (ctx.inputState.pointerDown || ctx.inputState.pointerReleased) {
      // Find the nearest interactable object being dragged near the player
      for (const entity of interactableEntities) {
        const objX = entity.position.x;
        const objY = entity.position.y;

        // Must be within placement range of player
        if (distSq(px, py, objX, objY) > placeRangeSq) continue;

        // Check if object is near a snap target
        const snapTarget = wallAnchorRegistry.findSnapTarget(objX, objY);
        if (snapTarget) {
          currentSnapTarget = snapTarget;
          snapObjectEntity = entity;
          break; // Use first matching object
        }
      }
    }

    // Emit snap events for visual feedback
    if (currentSnapTarget !== activeSnapTarget) {
      if (activeSnapTarget && !currentSnapTarget) {
        // Left snap zone
        safeEmit(ctx.eventBus, "barricade-snap", {
          entryPointIndex: activeSnapTarget.entryPointIndex,
          snapCenter: { x: activeSnapTarget.centerX, y: activeSnapTarget.centerY },
          orientation: activeSnapTarget.orientation,
          snapping: false,
        });
      }
      if (currentSnapTarget) {
        // Entered snap zone
        safeEmit(ctx.eventBus, "barricade-snap", {
          entryPointIndex: currentSnapTarget.entryPointIndex,
          snapCenter: { x: currentSnapTarget.centerX, y: currentSnapTarget.centerY },
          orientation: currentSnapTarget.orientation,
          snapping: true,
        });
      }
      activeSnapTarget = currentSnapTarget;
    }

    // -----------------------------------------------------------------
    // 2. Placement — on pointer release within snap zone
    // -----------------------------------------------------------------

    if (
      ctx.inputState.pointerReleased &&
      currentSnapTarget &&
      snapObjectEntity &&
      snapObjectEntity.objectProperties &&
      snapObjectEntity.physicsBody
    ) {
      tryPlaceBarricade(
        ctx,
        constraintRegistry,
        pathfindingGrid,
        entryPoints,
        currentSnapTarget,
        snapObjectEntity,
        prevHealthMap,
      );
      // Clear snap state after placement attempt
      activeSnapTarget = null;
    }

    // -----------------------------------------------------------------
    // 3. Damage tracking — detect health changes and emit feedback
    // -----------------------------------------------------------------

    for (const entity of barricadeEntities) {
      const currentHealth = entity.health.current;
      const prevHealth = prevHealthMap.get(entity);

      if (prevHealth !== undefined && currentHealth < prevHealth) {
        // Barricade took damage — sync durability and emit feedback
        entity.barricade.currentDurability = currentHealth;

        const healthFraction =
          entity.health.max > 0 ? currentHealth / entity.health.max : 0;

        safeEmit(ctx.eventBus, "barricade-damaged", {
          position: { x: entity.position.x, y: entity.position.y },
          healthFraction,
          entryPointIndex: entity.barricade.entryPointIndex,
        });
      }

      prevHealthMap.set(entity, currentHealth);
    }

    // -----------------------------------------------------------------
    // 4. Destruction — break barricades at zero health
    // -----------------------------------------------------------------

    // Collect entities to destroy (can't modify during iteration)
    const toDestroy: Entity[] = [];

    for (const entity of barricadeEntities) {
      if (entity.health.current <= 0) {
        toDestroy.push(entity);
      }
    }

    for (const entity of toDestroy) {
      // Read all values defensively before any mutations
      const barricade = entity.barricade;
      const position = entity.position;
      const physicsBodyId = entity.physicsBody?.bodyId;

      if (!barricade || !position) {
        console.warn(
          "[BarricadeSystem] Skipping destruction — entity missing expected components",
        );
        prevHealthMap.delete(entity);
        continue;
      }

      const entryPointIndex = barricade.entryPointIndex;
      const sourceObjectType = barricade.sourceObjectType;
      const positionCopy = { x: position.x, y: position.y };

      // Remove constraints from Matter.js world
      for (const constraintId of barricade.constraintIds) {
        const constraint = constraintRegistry.get(constraintId);
        if (constraint) {
          try {
            ctx.scene.matter.world.removeConstraint(constraint);
          } catch (err) {
            console.error(
              `[BarricadeSystem] Failed to remove constraint ${constraintId}:`,
              err,
            );
          }
          constraintRegistry.unregister(constraintId);
        }
      }

      // Remove barricade + health components
      world.removeComponent(entity, "barricade");
      world.removeComponent(entity, "health");

      // Restore as a loose debris object — re-add interactable + objectProperties
      const def = getObjectDef(sourceObjectType);
      if (def) {
        world.addComponent(entity, "interactable", {
          interactionType: def.immovable ? "push" : "pickup",
          highlighted: false,
        });
        world.addComponent(entity, "objectProperties", {
          objectType: sourceObjectType,
          category: def.category,
          durability: def.physics.durability,
          flammability: def.physics.flammability,
          conductivity: def.physics.conductivity,
          lootValue: def.lootValue,
          immovable: def.immovable,
        });
      }

      // Reduce body friction so debris slides when pushed
      if (physicsBodyId !== undefined) {
        const body = ctx.bodyRegistry.get(physicsBodyId);
        if (body) {
          body.friction = def?.immovable ? 0.95 : 0.8;
          body.frictionAir = def?.immovable ? 0.3 : 0.1;
        }
      }

      // Clean up health tracking
      prevHealthMap.delete(entity);

      // Update pathfinding — only unblock if no other barricades at this entry point
      const hasOtherBarricades = barricadeEntities.entities.some(
        (e) =>
          e !== entity &&
          e.barricade.entryPointIndex === entryPointIndex &&
          e.health.current > 0,
      );

      if (!hasOtherBarricades) {
        const tileX = pixelToTile(positionCopy.x);
        const tileY = pixelToTile(positionCopy.y);
        const updated = pathfindingGrid.setWalkable(tileX, tileY, true);
        if (!updated) {
          console.warn(
            `[BarricadeSystem] Failed to unblock pathfinding at tile (${tileX}, ${tileY}) — out of grid bounds`,
          );
        }

        if (entryPoints[entryPointIndex]) {
          entryPoints[entryPointIndex].barricaded = false;
        } else {
          console.warn(
            `[BarricadeSystem] Entry point index ${entryPointIndex} out of bounds (${entryPoints.length} entry points)`,
          );
        }
      }

      // Emit destruction event
      safeEmit(ctx.eventBus, "barricade-broken", { position: positionCopy });
    }

    // -----------------------------------------------------------------
    // 5. Cleanup — remove stale entries from prevHealthMap
    // -----------------------------------------------------------------

    for (const entity of prevHealthMap.keys()) {
      if (!entity.barricade || !entity.health) {
        prevHealthMap.delete(entity);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Placement helper (extracted so errors don't skip damage/destruction)
// ---------------------------------------------------------------------------

/**
 * Attempt to place a barricade at the given snap target.
 *
 * Extracted as a separate function so `return` on error only exits
 * placement, not the entire system tick (which must still process
 * damage tracking and destruction).
 */
function tryPlaceBarricade(
  ctx: SceneContext,
  constraintRegistry: NonNullable<SceneContext["constraintRegistry"]>,
  pathfindingGrid: NonNullable<SceneContext["pathfindingGrid"]>,
  entryPoints: NonNullable<SceneContext["entryPoints"]>,
  snapTarget: WallAnchorPair,
  snapObjectEntity: Entity,
  prevHealthMap: Map<Entity, number>,
): void {
  const op = snapObjectEntity.objectProperties!;
  const def = getObjectDef(op.objectType);
  if (!def) {
    console.warn(
      `[BarricadeSystem] Unknown object type for barricade: ${op.objectType}`,
    );
    return;
  }

  // Calculate durability from material
  const maxDurability = Math.round(
    def.physics.durability * BARRICADE_DURABILITY_SCALE,
  );

  if (maxDurability <= 0) {
    console.warn(
      `[BarricadeSystem] Object ${op.objectType} has zero durability, cannot barricade`,
    );
    return;
  }

  // Resolve the physics body
  const bodyId = snapObjectEntity.physicsBody!.bodyId;
  const objectBody = ctx.bodyRegistry.get(bodyId);
  if (!objectBody) {
    console.warn(
      `[BarricadeSystem] No body found for bodyId=${bodyId}`,
    );
    return;
  }

  // Move object to snap center for clean alignment
  objectBody.position.x = snapTarget.centerX;
  objectBody.position.y = snapTarget.centerY;
  objectBody.velocity.x = 0;
  objectBody.velocity.y = 0;

  // Resolve anchor bodies
  const anchorA = ctx.bodyRegistry.get(snapTarget.anchorBodyIdA);
  const anchorB = ctx.bodyRegistry.get(snapTarget.anchorBodyIdB);

  if (!anchorA || !anchorB) {
    console.warn(
      `[BarricadeSystem] Missing anchor bodies for entry point ${snapTarget.entryPointIndex}`,
    );
    return;
  }

  // Create constraints anchoring the object to both frame sides
  const constraintIds: number[] = [];

  try {
    const constraintA = ctx.scene.matter.add.constraint(
      anchorA,
      objectBody,
      0,
      CONSTRAINT_STIFFNESS,
    );
    (constraintA as MatterJS.ConstraintType & { damping?: number }).damping = CONSTRAINT_DAMPING;
    constraintRegistry.register(constraintA);
    constraintIds.push(constraintA.id);

    const constraintB = ctx.scene.matter.add.constraint(
      anchorB,
      objectBody,
      0,
      CONSTRAINT_STIFFNESS,
    );
    (constraintB as MatterJS.ConstraintType & { damping?: number }).damping = CONSTRAINT_DAMPING;
    constraintRegistry.register(constraintB);
    constraintIds.push(constraintB.id);
  } catch (err) {
    console.error(
      "[BarricadeSystem] Failed to create constraints:",
      err,
    );
    // Clean up any partially created constraints
    for (const id of constraintIds) {
      const c = constraintRegistry.get(id);
      if (c) {
        try {
          ctx.scene.matter.world.removeConstraint(c);
        } catch (cleanupErr) {
          console.error(
            `[BarricadeSystem] Failed to clean up partial constraint ${id}:`,
            cleanupErr,
          );
        }
        constraintRegistry.unregister(id);
      }
    }
    return;
  }

  // Convert entity: add barricade + health, remove interactable + objectProperties
  const entryPointIndex = snapTarget.entryPointIndex;
  const sourceObjectType = op.objectType;

  // Add barricade component
  world.addComponent(snapObjectEntity, "barricade", {
    constraintIds,
    entryPointIndex,
    sourceObjectType,
    maxDurability,
    currentDurability: maxDurability,
  });

  // Add health component
  world.addComponent(snapObjectEntity, "health", {
    current: maxDurability,
    max: maxDurability,
  });

  // Remove interaction components — barricades are not interactable
  world.removeComponent(snapObjectEntity, "interactable");
  world.removeComponent(snapObjectEntity, "objectProperties");

  // Update ECS position to match snap center
  snapObjectEntity.position!.x = snapTarget.centerX;
  snapObjectEntity.position!.y = snapTarget.centerY;

  // Increase body friction so barricade resists pushing
  objectBody.friction = 0.95;
  objectBody.frictionAir = 0.3;

  // Update pathfinding grid
  const tileX = pixelToTile(snapTarget.centerX);
  const tileY = pixelToTile(snapTarget.centerY);
  const updated = pathfindingGrid.setWalkable(tileX, tileY, false);
  if (!updated) {
    console.warn(
      `[BarricadeSystem] Failed to block pathfinding at tile (${tileX}, ${tileY}) — out of grid bounds`,
    );
  }

  // Update entry point state
  if (entryPoints[entryPointIndex]) {
    entryPoints[entryPointIndex].barricaded = true;
  } else {
    console.warn(
      `[BarricadeSystem] Entry point index ${entryPointIndex} out of bounds (${entryPoints.length} entry points)`,
    );
  }

  // Track initial health for damage detection
  prevHealthMap.set(snapObjectEntity, maxDurability);

  // Emit placement event
  safeEmit(ctx.eventBus, "barricade-placed", {
    position: { x: snapTarget.centerX, y: snapTarget.centerY },
    health: maxDurability,
    maxHealth: maxDurability,
  });
}
