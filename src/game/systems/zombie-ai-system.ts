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

import type { With } from "miniplex";
import type { SceneContext } from "./scene-context";
import type { SystemFn } from "./system-runner";
import type { Entity } from "@/game/ecs/entity";
import type { ZombieEntity } from "@/game/ecs/archetypes";
import type { AIState, ZombieType, ZombieVariant } from "@/game/ecs/components";
import type { PathfindingGrid } from "@/game/procgen/pathfinding-grid";
import type { TileCoord } from "@/types/procgen";
import type { NoiseMap } from "./noise-system";
import { world } from "@/game/ecs/world";
import { zombieEntities, barricadeEntities, playerEntities } from "@/game/ecs/queries";
import { safeEmit } from "@/game/events/event-bus";
import { TILE_SIZE } from "@/game/procgen/constants";
import { ZOMBIE_AI } from "./zombie-ai-constants";
import { releaseZombie } from "@/game/ecs/zombie-pool";

// ---------------------------------------------------------------------------
// Local type alias matching the zombieEntities query result.
// Narrower than the full ZombieEntity archetype (no `renderable` required)
// because the AI system only touches movement, health, and AI components.
// ---------------------------------------------------------------------------

type ZombieAIEntity = With<
  Entity,
  "position" | "velocity" | "physicsBody" | "health" | "aiState" | "zombieType"
>;

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

/**
 * Find the barricade with the lowest currentDurability.
 * Returns the barricade entity or null if no barricades exist.
 * Used by brute AI for both pathfinding and attack target selection.
 */
function findWeakestBarricade(): Entity | null {
  let weakest: Entity | null = null;
  let lowestDurability = Infinity;
  for (const barricade of barricadeEntities) {
    if (barricade.barricade.currentDurability < lowestDurability) {
      lowestDurability = barricade.barricade.currentDurability;
      weakest = barricade;
    }
  }
  return weakest;
}

/** Convert tile coordinate to world pixel center. */
function tileToPx(tile: number): number {
  return tile * TILE_SIZE + TILE_SIZE / 2;
}

// ---------------------------------------------------------------------------
// Zombie kill counter (tracked across the session for events)
// ---------------------------------------------------------------------------

let totalKills = 0;

/** Per-variant kill counters for run statistics. */
const killsByType: Record<ZombieVariant, number> = {
  shambler: 0,
  runner: 0,
  brute: 0,
  horde: 0,
};

/** Reset kills (called on game restart). */
export function resetZombieKills(): void {
  totalKills = 0;
  for (const key of Object.keys(killsByType) as ZombieVariant[]) {
    killsByType[key] = 0;
  }
}

/** Get a snapshot of kills broken down by zombie variant. */
export function getKillsByType(): Readonly<Record<ZombieVariant, number>> {
  return { ...killsByType };
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

    const { pathfindingGrid, safehouseCenter, noiseMap } = ctx;
    const player = playerEntities.entities[0];

    // Clear deferred removal list (can't modify query during iteration)
    toRemove.length = 0;

    for (const entity of zombieEntities) {
      const { aiState: ai, zombieType: stats, health } = entity;

      // --- Death check (any state) ---
      if (health.current <= 0) {
        ai.state = "dead";
      }

      // --- Damage detection (pathing or attacking only) ---
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
          computePath(entity, ai, pathfindingGrid, safehouseCenter, noiseMap);
          // Fall through — run pathing logic on the same tick so the zombie
          // begins moving immediately rather than standing idle for one tick.
        case "pathing":
          runPathingState(entity, dt, pathfindingGrid, safehouseCenter, player, noiseMap);
          break;

        case "attacking":
          runAttackingState(entity, dt, ctx, player);
          break;

        case "staggered":
          runStaggeredState(entity, dt);
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
      if (ctx.zombiePool) {
        // Pool path — recycle the entity and its physics body.
        // ZombieAIEntity is narrower than ZombieEntity but the entity
        // always has renderable since it was created with one.
        releaseZombie(ctx.zombiePool, entity as unknown as ZombieEntity, ctx.bodyRegistry);
      } else {
        // Fallback — destroy the entity and physics body (no pool)
        if (entity.physicsBody) {
          const body = ctx.bodyRegistry.get(entity.physicsBody.bodyId);
          if (body) {
            ctx.scene.matter.world.remove(body);
          }
          ctx.bodyRegistry.unregister(entity.physicsBody.bodyId);
        }
        world.remove(entity);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// State handlers
// ---------------------------------------------------------------------------

function runPathingState(
  entity: ZombieAIEntity,
  _dt: number,
  pathfindingGrid: PathfindingGrid,
  safehouseCenter: TileCoord,
  player: Entity | undefined,
  noiseMap?: NoiseMap,
): void {
  const { aiState: ai, zombieType: stats } = entity;

  // --- Path recalculation (staggered) ---
  ai.ticksSinceLastPathCalc++;

  if (ai.ticksSinceLastPathCalc >= stats.pathRecalcInterval) {
    computePath(entity, ai, pathfindingGrid, safehouseCenter, noiseMap);
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
      ai.pathIndex++;
    } else {
      const dist = Math.sqrt(dSq);
      entity.velocity.vx = (dx / dist) * stats.moveSpeed;
      entity.velocity.vy = (dy / dist) * stats.moveSpeed;
    }

    if (ai.pathIndex >= ai.path.length) {
      entity.velocity.vx = 0;
      entity.velocity.vy = 0;
    }
  } else {
    entity.velocity.vx = 0;
    entity.velocity.vy = 0;
  }

  // --- Barricade detection ---
  const bDetectSq = ZOMBIE_AI.BARRICADE_DETECTION_RANGE * ZOMBIE_AI.BARRICADE_DETECTION_RANGE;

  // Brutes actively seek the weakest barricade regardless of proximity.
  // They enter attacking when within detection range of their target.
  if (stats.variant === "brute") {
    const weakestBarricade = findWeakestBarricade();
    if (weakestBarricade?.position && weakestBarricade.physicsBody) {
      const d = distSq(
        entity.position.x, entity.position.y,
        weakestBarricade.position.x, weakestBarricade.position.y,
      );
      if (d <= bDetectSq) {
        ai.state = "attacking";
        ai.attackTargetBodyId = weakestBarricade.physicsBody.bodyId;
        ai.attackCooldownRemaining = 0;
      }
    }
  } else {
    // Standard barricade proximity check (shambler, runner, horde)
    for (const barricade of barricadeEntities) {
      // Runner vault: skip barricades with durability at or below threshold
      if (
        stats.vaultDurabilityThreshold > 0 &&
        barricade.barricade.currentDurability <= stats.vaultDurabilityThreshold
      ) {
        continue;
      }

      const d = distSq(
        entity.position.x, entity.position.y,
        barricade.position.x, barricade.position.y,
      );
      if (d <= bDetectSq) {
        ai.state = "attacking";
        ai.attackTargetBodyId = barricade.physicsBody.bodyId;
        ai.attackCooldownRemaining = 0;
        break;
      }
    }
  }

  // --- Check proximity to player ---
  const atkRangeSq = ZOMBIE_AI.ATTACK_RANGE * ZOMBIE_AI.ATTACK_RANGE;
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
  entity: ZombieAIEntity,
  dt: number,
  ctx: SceneContext,
  player: Entity | undefined,
): void {
  const { aiState: ai, zombieType: stats } = entity;

  // Resolve target
  const targetBodyId = ai.attackTargetBodyId;
  if (targetBodyId === null) {
    transitionToPathing(ai, stats);
    return;
  }

  // Find the target entity -- check barricades first, then player
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

  // Target gone (barricade destroyed, etc.) -- return to pathing
  if (!targetEntity?.position) {
    transitionToPathing(ai, stats);
    return;
  }

  // Check range -- if significantly out of range, return to pathing
  const range = isBarricade ? ZOMBIE_AI.BARRICADE_DETECTION_RANGE : ZOMBIE_AI.ATTACK_RANGE;
  const rangeSq = range * range;
  const d = distSq(
    entity.position.x, entity.position.y,
    targetEntity.position.x, targetEntity.position.y,
  );

  if (d > rangeSq * 1.5) {
    transitionToPathing(ai, stats);
    return;
  }

  // Move toward target at reduced speed to maintain contact pressure
  const atkRangeSq = ZOMBIE_AI.ATTACK_RANGE * ZOMBIE_AI.ATTACK_RANGE;
  if (d > atkRangeSq) {
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
    if (targetEntity.health) {
      const prevHealth = targetEntity.health.current;
      const damage = isBarricade
        ? stats.attackDamage * stats.barricadeDamageMultiplier
        : stats.attackDamage;
      targetEntity.health.current = Math.max(0, prevHealth - damage);
      const actualDelta = targetEntity.health.current - prevHealth;

      if (!isBarricade && targetEntity.playerControlled) {
        safeEmit(ctx.eventBus, "player-health-changed", {
          current: targetEntity.health.current,
          max: targetEntity.health.max,
          delta: actualDelta,
        });

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

function runStaggeredState(entity: ZombieAIEntity, dt: number): void {
  entity.velocity.vx = 0;
  entity.velocity.vy = 0;

  entity.aiState.staggerTimeRemaining -= dt;
  if (entity.aiState.staggerTimeRemaining <= 0) {
    transitionToPathing(entity.aiState, entity.zombieType);
  }
}

function handleDeath(
  entity: ZombieAIEntity,
  ctx: SceneContext,
  toRemove: Entity[],
): void {
  entity.velocity.vx = 0;
  entity.velocity.vy = 0;

  totalKills++;
  killsByType[entity.zombieType.variant]++;

  safeEmit(ctx.eventBus, "zombie-killed", {
    position: { x: entity.position.x, y: entity.position.y },
    totalKills,
    variant: entity.zombieType.variant,
  });

  toRemove.push(entity);
}

// ---------------------------------------------------------------------------
// Transition helpers
// ---------------------------------------------------------------------------

/** Transition to pathing state and force an immediate path recalculation. */
function transitionToPathing(ai: AIState, stats: ZombieType): void {
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
 * Compute an A* path from the entity's current position to its target.
 *
 * Target selection is delegated to `resolveTarget` (noise > brute barricade
 * > safehouse). When a noise source fades, the zombie naturally reverts to
 * its default target on the next recalculation — no explicit state reset.
 *
 * Called from both the idle→pathing transition and periodic path recalc.
 */
function computePath(
  entity: ZombieAIEntity,
  ai: AIState,
  pathfindingGrid: PathfindingGrid,
  safehouseCenter: TileCoord,
  noiseMap?: NoiseMap,
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

  // Target priority: noise > brute barricade > safehouse center
  let target = resolveTarget(entity, safehouseCenter, noiseMap);

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
 * Determine the pathfinding target for a zombie.
 *
 * Priority chain:
 *   1. Loudest noise within hearing range (all variants)
 *   2. Weakest barricade (brutes only)
 *   3. Safehouse center (default fallback)
 */
function resolveTarget(
  entity: ZombieAIEntity,
  safehouseCenter: TileCoord,
  noiseMap?: NoiseMap,
): { x: number; y: number } {
  // 1. Noise attracts all zombie variants
  if (noiseMap) {
    const loudest = noiseMap.findLoudestNoise(
      entity.position.x,
      entity.position.y,
      entity.zombieType.hearingRange,
    );
    if (loudest) {
      return { x: pixelToTile(loudest.x), y: pixelToTile(loudest.y) };
    }
  }

  // 2. Brutes seek the weakest barricade
  if (entity.zombieType.variant === "brute") {
    const weakest = findWeakestBarricade();
    if (weakest?.position) {
      return {
        x: pixelToTile(weakest.position.x),
        y: pixelToTile(weakest.position.y),
      };
    }
  }

  // 3. Default: safehouse center
  return { x: safehouseCenter.x, y: safehouseCenter.y };
}

/**
 * Search in expanding squares around (cx, cy) for the nearest walkable tile.
 * Returns the first walkable tile found, or null if none within radius 5.
 */
function findNearestWalkable(
  grid: PathfindingGrid,
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
