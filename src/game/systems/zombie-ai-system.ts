/**
 * Zombie AI system — drives zombie behaviour via a finite state machine.
 *
 * Each zombie cycles through five states:
 *   idle → pathing → attacking ↔ pathing
 *                    staggered → pathing
 *                    dead (terminal, entity removed)
 *
 * Pathfinding uses a hybrid approach (issue #43):
 *   - **Flow field** for zombies targeting the safehouse (common case).
 *     A single BFS computes direction vectors for the entire grid — all
 *     zombies read their direction in O(1) per tick.
 *   - **Individual A*** for zombies attracted to noise or brutes targeting
 *     barricades. These use distance-based priority and a per-tick frame
 *     budget (default 2ms) to prevent frame drops.
 *
 * Path caching avoids redundant A* calls: if a zombie's start tile,
 * target tile, and topology version haven't changed, the cached path
 * is reused. Topology changes (barricade placed/broken) trigger selective
 * invalidation — only nearby zombies re-path.
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
import { ZOMBIE_AI, PATHFINDING_OPT } from "./zombie-ai-constants";
import { releaseZombie } from "@/game/ecs/zombie-pool";
import { FlowField } from "@/game/procgen/flow-field";
import { safeRemoveBody } from "./physics-utils";

// ---------------------------------------------------------------------------
// Local type alias
// ---------------------------------------------------------------------------

type ZombieAIEntity = With<
  Entity,
  "position" | "velocity" | "physicsBody" | "health" | "aiState" | "zombieType"
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function pixelToTile(px: number): number {
  return Math.floor(px / TILE_SIZE);
}

function tileToPx(tile: number): number {
  return tile * TILE_SIZE + TILE_SIZE / 2;
}

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

// ---------------------------------------------------------------------------
// Path cache
// ---------------------------------------------------------------------------

interface CachedPath {
  path: TileCoord[];
  topologyVersion: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

const PATH_CACHE_MAX = 200;

// ---------------------------------------------------------------------------
// Zombie kill counter
// ---------------------------------------------------------------------------

let totalKills = 0;
const killsByType: Record<ZombieVariant, number> = {
  shambler: 0, runner: 0, brute: 0, horde: 0,
};

export function resetZombieKills(): void {
  totalKills = 0;
  for (const key of Object.keys(killsByType) as ZombieVariant[]) {
    killsByType[key] = 0;
  }
}

export function getKillsByType(): Readonly<Record<ZombieVariant, number>> {
  return { ...killsByType };
}

// ---------------------------------------------------------------------------
// Timer utility (works in both browser and Node test environments)
// ---------------------------------------------------------------------------

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

// ---------------------------------------------------------------------------
// System factory
// ---------------------------------------------------------------------------

export function createZombieAISystem(ctx: SceneContext): SystemFn {
  let warnedMissingContext = false;
  const toRemove: Entity[] = [];

  // --- Flow field (shared direction grid for safehouse target) ---
  let flowField: FlowField | null = null;
  let flowFieldActive = false;

  // --- Path cache (keyed by entity reference) ---
  const pathCache = new Map<Entity, CachedPath>();

  // --- A* frame budget tracking ---
  let aStarCallsThisTick = 0;
  let aStarBudgetExhausted = false;

  // --- Topology change listener ---
  let topologyDirty = false;
  let lastTopologyChangeTileX = 0;
  let lastTopologyChangeTileY = 0;

  ctx.eventBus.on("topology-changed", (e) => {
    topologyDirty = true;
    lastTopologyChangeTileX = e.tileX;
    lastTopologyChangeTileY = e.tileY;

    // Invalidate flow field
    if (flowField) flowField.invalidate();

    // Selective cache invalidation: remove entries near the changed tile
    const radiusSq =
      PATHFINDING_OPT.INVALIDATION_RADIUS_TILES *
      PATHFINDING_OPT.INVALIDATION_RADIUS_TILES;
    for (const [entity, cached] of pathCache) {
      // Check if the cached path passes near the topology change
      const dStartSq = distSq(cached.startX, cached.startY, e.tileX, e.tileY);
      const dEndSq = distSq(cached.endX, cached.endY, e.tileX, e.tileY);
      if (dStartSq <= radiusSq || dEndSq <= radiusSq) {
        pathCache.delete(entity);
      }
    }
  });

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
    const zombieCount = zombieEntities.entities.length;

    // --- Reset per-tick tracking ---
    toRemove.length = 0;
    aStarCallsThisTick = 0;
    aStarBudgetExhausted = false;
    const tickStart = now();

    // --- Flow field activation (hysteresis to avoid flapping) ---
    if (!flowFieldActive && zombieCount >= PATHFINDING_OPT.FLOW_FIELD_THRESHOLD) {
      flowFieldActive = true;
    } else if (
      flowFieldActive &&
      zombieCount < PATHFINDING_OPT.FLOW_FIELD_THRESHOLD - PATHFINDING_OPT.FLOW_FIELD_HYSTERESIS
    ) {
      flowFieldActive = false;
    }

    // --- Recompute flow field if needed ---
    if (flowFieldActive) {
      if (!flowField) {
        flowField = new FlowField(pathfindingGrid.width, pathfindingGrid.height);
      }
      if (!flowField.isValid(pathfindingGrid.topologyVersion)) {
        flowField.compute(
          pathfindingGrid,
          safehouseCenter.x,
          safehouseCenter.y,
          pathfindingGrid.topologyVersion,
        );
      }
    }

    // Reset topology dirty flag after flow field recompute
    topologyDirty = false;

    // --- Zombie loop ---
    for (const entity of zombieEntities) {
      const { aiState: ai, zombieType: stats, health } = entity;

      // --- Death check ---
      if (health.current <= 0) {
        ai.state = "dead";
      }

      // --- Damage detection ---
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
          ai.state = "pathing";
          handlePathingInit(entity, ai, pathfindingGrid, safehouseCenter, noiseMap, tickStart);
          // eslint-disable-next-line no-fallthrough
        case "pathing":
          runPathingState(entity, dt, pathfindingGrid, safehouseCenter, player, noiseMap, tickStart);
          break;
        case "attacking":
          runAttackingState(entity, dt, ctx, player);
          break;
        case "staggered":
          runStaggeredState(entity, dt);
          break;
        case "dead":
          if (!toRemove.includes(entity)) {
            handleDeath(entity, ctx, toRemove);
          }
          break;
      }
    }

    // --- Deferred removal ---
    for (const entity of toRemove) {
      pathCache.delete(entity);
      if (ctx.zombiePool) {
        releaseZombie(ctx.zombiePool, entity as unknown as ZombieEntity, ctx.bodyRegistry);
      } else {
        if (entity.physicsBody) {
          safeRemoveBody(
            ctx.scene.matter.world,
            ctx.bodyRegistry,
            entity.physicsBody.bodyId,
            "ZombieAISystem",
          );
        }
        world.remove(entity);
      }
    }

    // Evict path cache if it grows too large
    if (pathCache.size > PATH_CACHE_MAX) {
      const excess = pathCache.size - PATH_CACHE_MAX;
      const iter = pathCache.keys();
      for (let i = 0; i < excess; i++) {
        const key = iter.next().value;
        if (key) pathCache.delete(key);
      }
    }
  };

  // -----------------------------------------------------------------------
  // Pathing state
  // -----------------------------------------------------------------------

  function handlePathingInit(
    entity: ZombieAIEntity,
    ai: AIState,
    pathfindingGrid: PathfindingGrid,
    safehouseCenter: TileCoord,
    noiseMap: NoiseMap | undefined,
    tickStart: number,
  ): void {
    // For idle→pathing transition, compute initial path
    const useFlow = shouldUseFlowField(entity, noiseMap);
    if (!useFlow) {
      computePathBudgeted(entity, ai, pathfindingGrid, safehouseCenter, noiseMap, tickStart);
    }
    // If using flow field, velocity is set in runPathingState
  }

  function runPathingState(
    entity: ZombieAIEntity,
    _dt: number,
    pathfindingGrid: PathfindingGrid,
    safehouseCenter: TileCoord,
    player: Entity | undefined,
    noiseMap: NoiseMap | undefined,
    tickStart: number,
  ): void {
    const { aiState: ai, zombieType: stats } = entity;
    const useFlow = shouldUseFlowField(entity, noiseMap);

    if (useFlow && flowField) {
      // --- FLOW FIELD PATH ---
      // Read direction from the flow field grid (O(1))
      const tileX = pixelToTile(entity.position.x);
      const tileY = pixelToTile(entity.position.y);
      const dir = flowField.getDirection(tileX, tileY);

      if (dir && (dir.dx !== 0 || dir.dy !== 0)) {
        // Normalise diagonal directions for consistent speed
        const len = Math.sqrt(dir.dx * dir.dx + dir.dy * dir.dy);
        entity.velocity.vx = (dir.dx / len) * stats.moveSpeed;
        entity.velocity.vy = (dir.dy / len) * stats.moveSpeed;
      } else {
        entity.velocity.vx = 0;
        entity.velocity.vy = 0;
      }
    } else {
      // --- A* PATH (with priority-based recalculation) ---
      ai.ticksSinceLastPathCalc++;

      // Distance-based recalc interval
      const recalcInterval = getRecalcInterval(entity, safehouseCenter);

      if (ai.ticksSinceLastPathCalc >= recalcInterval) {
        computePathBudgeted(entity, ai, pathfindingGrid, safehouseCenter, noiseMap, tickStart);
        ai.ticksSinceLastPathCalc = 0;
      }

      // Follow waypoints
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
    }

    // --- Barricade detection (same as before) ---
    const bDetectSq = ZOMBIE_AI.BARRICADE_DETECTION_RANGE * ZOMBIE_AI.BARRICADE_DETECTION_RANGE;

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
      for (const barricade of barricadeEntities) {
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

    // --- Player proximity check ---
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

  // -----------------------------------------------------------------------
  // Flow field decision
  // -----------------------------------------------------------------------

  /**
   * Determine if a zombie should use the flow field or individual A*.
   * Flow field is used only for safehouse-targeting zombies (no noise, no brute barricade).
   */
  function shouldUseFlowField(entity: ZombieAIEntity, noiseMap?: NoiseMap): boolean {
    if (!flowFieldActive || !flowField) return false;

    // Brutes have their own target (weakest barricade)
    if (entity.zombieType.variant === "brute") return false;

    // Check for noise attraction
    if (noiseMap) {
      const loudest = noiseMap.findLoudestNoise(
        entity.position.x,
        entity.position.y,
        entity.zombieType.hearingRange,
      );
      if (loudest) return false;
    }

    // Default safehouse target → use flow field
    return true;
  }

  // -----------------------------------------------------------------------
  // Distance-based recalc interval
  // -----------------------------------------------------------------------

  function getRecalcInterval(entity: ZombieAIEntity, safehouseCenter: TileCoord): number {
    const tileX = pixelToTile(entity.position.x);
    const tileY = pixelToTile(entity.position.y);
    const dx = tileX - safehouseCenter.x;
    const dy = tileY - safehouseCenter.y;
    const distTiles = Math.sqrt(dx * dx + dy * dy);

    if (distTiles < PATHFINDING_OPT.CLOSE_DISTANCE_TILES) {
      return Math.max(
        PATHFINDING_OPT.CLOSE_RECALC_INTERVAL,
        Math.min(entity.zombieType.pathRecalcInterval, PATHFINDING_OPT.CLOSE_RECALC_INTERVAL),
      );
    }
    return Math.min(PATHFINDING_OPT.FAR_RECALC_INTERVAL, entity.zombieType.pathRecalcInterval * 2);
  }

  // -----------------------------------------------------------------------
  // Frame-budgeted A* path computation
  // -----------------------------------------------------------------------

  function computePathBudgeted(
    entity: ZombieAIEntity,
    ai: AIState,
    pathfindingGrid: PathfindingGrid,
    safehouseCenter: TileCoord,
    noiseMap: NoiseMap | undefined,
    tickStart: number,
  ): void {
    // Frame budget check
    if (aStarBudgetExhausted) return; // Keep current path, try next tick
    const elapsed = now() - tickStart;
    if (elapsed >= PATHFINDING_OPT.FRAME_BUDGET_MS) {
      aStarBudgetExhausted = true;
      return;
    }

    const startTileX = pixelToTile(entity.position.x);
    const startTileY = pixelToTile(entity.position.y);

    if (!Number.isFinite(startTileX) || !Number.isFinite(startTileY)) {
      ai.path = [];
      ai.pathIndex = 0;
      return;
    }

    const start = { x: startTileX, y: startTileY };
    let target = resolveTarget(entity, safehouseCenter, noiseMap);

    if (!pathfindingGrid.isWalkable(target.x, target.y)) {
      const found = findNearestWalkable(pathfindingGrid, target.x, target.y);
      if (found) target = found;
    }

    // --- Path cache check ---
    const cached = pathCache.get(entity);
    if (
      cached &&
      cached.topologyVersion === pathfindingGrid.topologyVersion &&
      cached.startX === start.x &&
      cached.startY === start.y &&
      cached.endX === target.x &&
      cached.endY === target.y
    ) {
      // Cache hit — reuse path
      ai.path = cached.path;
      ai.pathIndex = 1;
      return;
    }

    // --- A* search ---
    const result = pathfindingGrid.findSmoothedPath(start, target);
    aStarCallsThisTick++;

    if (result.found) {
      ai.path = result.path;
      ai.pathIndex = 1;

      // Cache the result
      pathCache.set(entity, {
        path: result.path,
        topologyVersion: pathfindingGrid.topologyVersion,
        startX: start.x,
        startY: start.y,
        endX: target.x,
        endY: target.y,
      });
    } else {
      ai.path = [];
      ai.pathIndex = 0;
    }
  }

  // -----------------------------------------------------------------------
  // Other state handlers
  // -----------------------------------------------------------------------

  function runAttackingState(
    entity: ZombieAIEntity,
    dt: number,
    ctx: SceneContext,
    player: Entity | undefined,
  ): void {
    const { aiState: ai, zombieType: stats } = entity;

    const targetBodyId = ai.attackTargetBodyId;
    if (targetBodyId === null) {
      transitionToPathing(ai, stats);
      return;
    }

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

    if (!targetEntity?.position) {
      transitionToPathing(ai, stats);
      return;
    }

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

  function transitionToPathing(ai: AIState, stats: ZombieType): void {
    ai.state = "pathing";
    ai.attackTargetBodyId = null;
    ai.path = [];
    ai.pathIndex = 0;
    ai.ticksSinceLastPathCalc = stats.pathRecalcInterval; // Force recalc next tick
  }

  // -----------------------------------------------------------------------
  // Target resolution and pathfinding helpers (unchanged)
  // -----------------------------------------------------------------------

  function resolveTarget(
    entity: ZombieAIEntity,
    safehouseCenter: TileCoord,
    noiseMap?: NoiseMap,
  ): { x: number; y: number } {
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

    if (entity.zombieType.variant === "brute") {
      const weakest = findWeakestBarricade();
      if (weakest?.position) {
        return {
          x: pixelToTile(weakest.position.x),
          y: pixelToTile(weakest.position.y),
        };
      }
    }

    return { x: safehouseCenter.x, y: safehouseCenter.y };
  }

  function findNearestWalkable(
    grid: PathfindingGrid,
    cx: number,
    cy: number,
  ): { x: number; y: number } | null {
    for (let r = 1; r <= 5; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
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
}
