/**
 * Zombie AI system — drives zombie behaviour via a finite state machine.
 *
 * Each zombie cycles through five states:
 *   idle → pathing → attacking ↔ pathing
 *                    staggered → pathing
 *                    dead (terminal, entity removed)
 *
 * Pathfinding recalculations are staggered across frames by giving each
 * zombie a different initial tick counter. At 45 ticks between recalcs
 * (shambler default), ~1 zombie recalculates per tick for 45 zombies,
 * keeping CPU cost amortised.
 *
 * Runs after BarricadeSystem (so destruction is processed) and before
 * PhysicsSyncSystem (so velocity writes take effect in the same tick).
 *
 * NO React imports — this is pure TypeScript.
 */

import type { SceneContext } from "./scene-context";
import type { SystemFn } from "./system-runner";
import type { Entity } from "@/game/ecs/entity";
import { world } from "@/game/ecs/world";
import { zombieEntities, barricadeEntities, playerEntities } from "@/game/ecs/queries";
import { safeEmit } from "@/game/events/event-bus";
import { TILE_SIZE } from "@/game/procgen/constants";
import { ZOMBIE_AI } from "./zombie-ai-constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Squared Euclidean distance between two 2D points. */
function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Convert world pixels to tile coordinate. */
function pixelToTile(px: number): number {
  return Math.floor(px / TILE_SIZE);
}

/** Convert tile coordinate to world pixel center. */
function tileToPx(tile: number): number {
  return tile * TILE_SIZE + TILE_SIZE / 2;
}

// ---------------------------------------------------------------------------
// Zombie kill counter (tracked across the session for events)
// ---------------------------------------------------------------------------

let totalKills = 0;

/** Reset kills (called on game restart). */
export function resetZombieKills(): void {
  totalKills = 0;
}

// ---------------------------------------------------------------------------
// System factory
// ---------------------------------------------------------------------------

/**
 * Create the zombie AI system.
 *
 * Requires pathfindingGrid and safehouseCenter on SceneContext.
 * If either is missing, the system logs a one-time warning and becomes a no-op.
 */
export function createZombieAISystem(ctx: SceneContext): SystemFn {
  let warnedMissingContext = false;

  // Hoist to closure scope to avoid per-tick GC pressure at 60 Hz.
  // Cleared at the start of each tick; backing buffer is reused.
  const toRemove: Entity[] = [];

  return (dt: number): void => {
    if (!ctx.pathfindingGrid || !ctx.safehouseCenter) {
      if (!warnedMissingContext) {
        warnedMissingContext = true;
        console.warn(
          "[ZombieAISystem] Skipping — missing required context:",
          !ctx.pathfindingGrid && "pathfindingGrid",
          !ctx.safehouseCenter && "safehouseCenter",
        );
      }
      return;
    }

    const { pathfindingGrid, safehouseCenter } = ctx;
    const player = playerEntities.entities[0];

    // Clear deferred removal list (can't modify query during iteration)
    toRemove.length = 0;

    for (const entity of zombieEntities) {
      const ai = entity.aiState;
      const stats = entity.zombieType;
      const health = entity.health;

      // --- Death check (any state) ---
      if (health.current <= 0) {
        ai.state = "dead";
      }

      // --- Damage detection (any state except dead) ---
      if (ai.state !== "dead" && health.current < ai.previousHealth) {
        if (ai.state === "pathing" || ai.state === "attacking") {
          ai.state = "staggered";
          ai.staggerTimeRemaining = stats.staggerDuration;
          entity.velocity.vx = 0;
          entity.velocity.vy = 0;
        }
      }
      ai.previousHealth = health.current;

      // --- State machine ---
      switch (ai.state) {
        case "idle":
          // Immediately transition to pathing and compute the initial path.
          // The stagger counter is preserved (set at spawn time) so that
          // zombies desynchronise their subsequent path recalculations.
          ai.state = "pathing";
          computePath(entity, ai, pathfindingGrid, safehouseCenter);
          // Fall through — run pathing logic on the same tick so the zombie
          // begins moving immediately rather than standing idle for one tick.
        case "pathing":
          runPathingState(entity, ai, stats, dt, pathfindingGrid, safehouseCenter, player);
          break;

        case "attacking":
          runAttackingState(entity, ai, stats, dt, ctx, player);
          break;

        case "staggered":
          runStaggeredState(entity, ai, stats, dt);
          break;

        case "dead":
          // Guard: only process death once per entity (prevents double-counting
          // kills if entity persists in the query for one extra tick).
          if (!toRemove.includes(entity)) {
            handleDeath(entity, ctx, toRemove);
          }
          break;
      }
    }

    // Deferred removal of dead entities
    for (const entity of toRemove) {
      // Unregister physics body
      if (entity.physicsBody) {
        const body = ctx.bodyRegistry.get(entity.physicsBody.bodyId);
        if (body) {
          ctx.scene.matter.world.remove(body);
        }
        ctx.bodyRegistry.unregister(entity.physicsBody.bodyId);
      }
      world.remove(entity);
    }
  };
}

// ---------------------------------------------------------------------------
// State handlers
// ---------------------------------------------------------------------------

function runPathingState(
  entity: Entity & { position: NonNullable<Entity["position"]>; velocity: NonNullable<Entity["velocity"]>; aiState: NonNullable<Entity["aiState"]>; zombieType: NonNullable<Entity["zombieType"]> },
  ai: NonNullable<Entity["aiState"]>,
  stats: NonNullable<Entity["zombieType"]>,
  _dt: number,
  pathfindingGrid: NonNullable<SceneContext["pathfindingGrid"]>,
  safehouseCenter: NonNullable<SceneContext["safehouseCenter"]>,
  player: Entity | undefined,
): void {
  // --- Path recalculation (staggered) ---
  ai.ticksSinceLastPathCalc++;

  if (ai.ticksSinceLastPathCalc >= stats.pathRecalcInterval) {
    computePath(entity, ai, pathfindingGrid, safehouseCenter);
    ai.ticksSinceLastPathCalc = 0;
  }

  // --- Follow path waypoints ---
  if (ai.path.length > 0 && ai.pathIndex < ai.path.length) {
    const wp = ai.path[ai.pathIndex];
    const wpX = tileToPx(wp.x);
    const wpY = tileToPx(wp.y);

    const dx = wpX - entity.position.x;
    const dy = wpY - entity.position.y;
    const dSq = dx * dx + dy * dy;
    const threshSq = ZOMBIE_AI.WAYPOINT_THRESHOLD * ZOMBIE_AI.WAYPOINT_THRESHOLD;

    if (dSq <= threshSq) {
      // Reached waypoint, advance
      ai.pathIndex++;
    } else {
      // Move toward waypoint
      const dist = Math.sqrt(dSq);
      entity.velocity.vx = (dx / dist) * stats.moveSpeed;
      entity.velocity.vy = (dy / dist) * stats.moveSpeed;
    }

    // Check if we've exhausted the path
    if (ai.pathIndex >= ai.path.length) {
      entity.velocity.vx = 0;
      entity.velocity.vy = 0;
    }
  } else {
    // No path — stand still
    entity.velocity.vx = 0;
    entity.velocity.vy = 0;
  }

  // --- Check proximity to barricades ---
  const bDetectSq = ZOMBIE_AI.BARRICADE_DETECTION_RANGE * ZOMBIE_AI.BARRICADE_DETECTION_RANGE;
  const atkRangeSq = ZOMBIE_AI.ATTACK_RANGE * ZOMBIE_AI.ATTACK_RANGE;

  for (const barricade of barricadeEntities) {
    const d = distSq(
      entity.position.x, entity.position.y,
      barricade.position.x, barricade.position.y,
    );
    if (d <= bDetectSq) {
      ai.state = "attacking";
      ai.attackTargetBodyId = barricade.physicsBody.bodyId;
      ai.attackCooldownRemaining = 0; // First hit is immediate
      // Move toward barricade instead of stopping
      break;
    }
  }

  // --- Check proximity to player ---
  if (ai.state === "pathing" && player?.position) {
    const d = distSq(
      entity.position.x, entity.position.y,
      player.position.x, player.position.y,
    );
    if (d <= atkRangeSq) {
      ai.state = "attacking";
      ai.attackTargetBodyId = player.physicsBody?.bodyId ?? null;
      ai.attackCooldownRemaining = 0;
    }
  }
}

function runAttackingState(
  entity: Entity & { position: NonNullable<Entity["position"]>; velocity: NonNullable<Entity["velocity"]>; aiState: NonNullable<Entity["aiState"]>; zombieType: NonNullable<Entity["zombieType"]>; health: NonNullable<Entity["health"]> },
  ai: NonNullable<Entity["aiState"]>,
  stats: NonNullable<Entity["zombieType"]>,
  dt: number,
  ctx: SceneContext,
  player: Entity | undefined,
): void {
  // Resolve target
  const targetBodyId = ai.attackTargetBodyId;
  if (targetBodyId === null) {
    // No target — go back to pathing
    transitionToPathing(ai, stats);
    return;
  }

  // Find the target entity — check barricades first, then player
  let targetEntity: Entity | undefined;
  let isBarricade = false;

  for (const barricade of barricadeEntities) {
    if (barricade.physicsBody.bodyId === targetBodyId) {
      targetEntity = barricade;
      isBarricade = true;
      break;
    }
  }

  if (!targetEntity && player?.physicsBody?.bodyId === targetBodyId) {
    targetEntity = player;
  }

  // Target gone (barricade destroyed, etc.) — return to pathing
  if (!targetEntity?.position) {
    transitionToPathing(ai, stats);
    return;
  }

  // Check range — if out of range, go back to pathing
  const range = isBarricade ? ZOMBIE_AI.BARRICADE_DETECTION_RANGE : ZOMBIE_AI.ATTACK_RANGE;
  const rangeSq = range * range;
  const d = distSq(
    entity.position.x, entity.position.y,
    targetEntity.position.x, targetEntity.position.y,
  );

  if (d > rangeSq * 1.5) {
    // Significantly out of range — return to pathing
    transitionToPathing(ai, stats);
    return;
  }

  // Move toward target at reduced speed to maintain contact pressure
  if (d > ZOMBIE_AI.ATTACK_RANGE * ZOMBIE_AI.ATTACK_RANGE) {
    const dx = targetEntity.position.x - entity.position.x;
    const dy = targetEntity.position.y - entity.position.y;
    const dist = Math.sqrt(d);
    entity.velocity.vx = (dx / dist) * stats.moveSpeed * 0.5;
    entity.velocity.vy = (dy / dist) * stats.moveSpeed * 0.5;
  } else {
    entity.velocity.vx = 0;
    entity.velocity.vy = 0;
  }

  // Attack cooldown
  ai.attackCooldownRemaining -= dt;
  if (ai.attackCooldownRemaining <= 0) {
    // Deal damage
    if (targetEntity.health) {
      targetEntity.health.current = Math.max(0, targetEntity.health.current - stats.attackDamage);

      // Emit player health event
      if (!isBarricade && targetEntity.playerControlled) {
        safeEmit(ctx.eventBus, "player-health-changed", {
          current: targetEntity.health.current,
          max: targetEntity.health.max,
          delta: -stats.attackDamage,
        });

        // Check for player death
        if (targetEntity.health.current <= 0) {
          safeEmit(ctx.eventBus, "player-died", {
            dayNumber: ctx.clockState.dayNumber,
            totalKills,
            survivalTime: ctx.clockState.elapsedTotal,
            cause: "zombie",
          });
        }
      }
    }

    ai.attackCooldownRemaining = stats.attackCooldown;
  }
}

function runStaggeredState(
  entity: Entity & { velocity: NonNullable<Entity["velocity"]>; aiState: NonNullable<Entity["aiState"]> },
  ai: NonNullable<Entity["aiState"]>,
  stats: NonNullable<Entity["zombieType"]>,
  dt: number,
): void {
  entity.velocity.vx = 0;
  entity.velocity.vy = 0;

  ai.staggerTimeRemaining -= dt;
  if (ai.staggerTimeRemaining <= 0) {
    transitionToPathing(ai, stats);
  }
}

function handleDeath(
  entity: Entity & { position: NonNullable<Entity["position"]> },
  ctx: SceneContext,
  toRemove: Entity[],
): void {
  if (entity.velocity) {
    entity.velocity.vx = 0;
    entity.velocity.vy = 0;
  }

  totalKills++;

  safeEmit(ctx.eventBus, "zombie-killed", {
    position: { x: entity.position.x, y: entity.position.y },
    totalKills,
  });

  toRemove.push(entity);
}

// ---------------------------------------------------------------------------
// Transition helpers
// ---------------------------------------------------------------------------

/** Transition to pathing state and force an immediate path recalculation. */
function transitionToPathing(
  ai: NonNullable<Entity["aiState"]>,
  stats: NonNullable<Entity["zombieType"]>,
): void {
  ai.state = "pathing";
  ai.attackTargetBodyId = null;
  ai.path = [];
  ai.pathIndex = 0;
  ai.ticksSinceLastPathCalc = stats.pathRecalcInterval; // Force recalc next tick
}

// ---------------------------------------------------------------------------
// Path computation
// ---------------------------------------------------------------------------

/**
 * Compute an A* path from the entity's current position to the safehouse.
 *
 * Extracted as a shared helper so it can be called both from the idle→pathing
 * transition (initial path) and from the pathing handler (periodic recalc).
 */
function computePath(
  entity: Entity & { position: NonNullable<Entity["position"]> },
  ai: NonNullable<Entity["aiState"]>,
  pathfindingGrid: NonNullable<SceneContext["pathfindingGrid"]>,
  safehouseCenter: NonNullable<SceneContext["safehouseCenter"]>,
): void {
  const startTileX = pixelToTile(entity.position.x);
  const startTileY = pixelToTile(entity.position.y);

  // Guard against NaN/non-finite positions from physics glitches
  if (!Number.isFinite(startTileX) || !Number.isFinite(startTileY)) {
    console.warn(
      "[ZombieAISystem] Zombie has non-finite position, skipping pathfind",
    );
    ai.path = [];
    ai.pathIndex = 0;
    return;
  }

  const start = { x: startTileX, y: startTileY };

  // Try to path to safehouse center; if center isn't walkable, find nearest
  let target = { x: safehouseCenter.x, y: safehouseCenter.y };

  if (!pathfindingGrid.isWalkable(target.x, target.y)) {
    const found = findNearestWalkable(pathfindingGrid, target.x, target.y);
    if (found) {
      target = found;
    }
    // If nothing found, try anyway — findPath will return no path
  }

  const result = pathfindingGrid.findSmoothedPath(start, target);
  if (result.found) {
    ai.path = result.path;
    ai.pathIndex = 1; // Skip start tile (zombie is already there)
  } else {
    // Path failure — clear stale path so zombie doesn't walk an outdated route
    ai.path = [];
    ai.pathIndex = 0;
  }
}

// ---------------------------------------------------------------------------
// Pathfinding helpers
// ---------------------------------------------------------------------------

/**
 * Search in expanding squares around (cx, cy) for the nearest walkable tile.
 * Returns the first walkable tile found, or null if none within radius 5.
 */
function findNearestWalkable(
  grid: NonNullable<SceneContext["pathfindingGrid"]>,
  cx: number,
  cy: number,
): { x: number; y: number } | null {
  for (let r = 1; r <= 5; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // Only check perimeter
        const nx = cx + dx;
        const ny = cy + dy;
        if (grid.isWalkable(nx, ny)) {
          return { x: nx, y: ny };
        }
      }
    }
  }
  return null;
}
