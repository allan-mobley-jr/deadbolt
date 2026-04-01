/**
 * Wave spawner system — manages escalating zombie waves during night phases.
 *
 * Activates when the day/night clock transitions to night. Spawns zombies
 * in pulses with brief respites between them for barricade repair. Tracks
 * wave completion (all killed or dawn arrives) and emits events for HUD.
 *
 * State machine:
 *   inactive → preparing (dusk) → spawning ↔ pausing → complete → inactive
 *
 * If dusk is skipped (direct day→night), the system self-recovers by
 * calling prepareNight() and startWave() in the same tick.
 *
 * Depends on zombie-ai-system (runs later in the system array) to remove
 * entities whose health reaches 0 (both combat kills and dawn despawning).
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import seedrandom from "seedrandom";
import type { SystemFn } from "./system-runner";
import type { SceneContext, ClockState } from "./scene-context";
import type { DayPhase } from "./day-night-constants";
import { safeEmit } from "@/game/events/event-bus";
import { zombieEntities } from "@/game/ecs/queries";
import {
  getAvailableVariants,
  selectVariant,
  spawnZombie,
  spawnHordeCluster,
  type SpawnContext,
} from "./zombie-spawner-utils";
import type { SpawnZone } from "@/types/procgen";
import { TILE_SIZE } from "@/game/tiles/tile-types";
import { getWaveConfig, WAVE_SYSTEM } from "./wave-system-constants";
import type { NightWaveConfig } from "./wave-system-constants";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type WaveState = "inactive" | "preparing" | "spawning" | "pausing" | "complete";

// ---------------------------------------------------------------------------
// Spawn zone edge classification
// ---------------------------------------------------------------------------

/**
 * Group edge spawn zones into 4 directional buckets (N/S/W/E).
 *
 * Edge zones are generated in order: N(0-2), S(3-5), W(6-8), E(9-11).
 * We use this ordering to split them into groups of ZONES_PER_EDGE.
 * Far-building zones are collected separately. Zones with no spawn
 * points are filtered out.
 */
function classifyZones(zones: SpawnZone[]): {
  edgeGroups: SpawnZone[][];
  farZones: SpawnZone[];
} {
  const edgeZones = zones.filter(
    (z) => z.type === "map_edge" && z.spawnPoints.length > 0,
  );
  const farZones = zones.filter(
    (z) => z.type === "far_building" && z.spawnPoints.length > 0,
  );

  const { ZONES_PER_EDGE, EDGES } = WAVE_SYSTEM;
  const edgeGroups: SpawnZone[][] = [];

  for (let e = 0; e < EDGES; e++) {
    const start = e * ZONES_PER_EDGE;
    const group = edgeZones.slice(start, start + ZONES_PER_EDGE);
    if (group.length > 0) {
      edgeGroups.push(group);
    }
  }

  return { edgeGroups, farZones };
}

/**
 * Select active spawn zones for a night based on approach direction count.
 *
 * @param edgeGroups - Edge zones grouped by direction (N/S/W/E).
 * @param farZones - Far-building zones.
 * @param directions - Number of approach directions (1-4).
 * @param rng - Random number generator for direction selection.
 * @returns Flat array of active spawn zones for this night.
 */
function selectActiveZones(
  edgeGroups: SpawnZone[][],
  farZones: SpawnZone[],
  directions: number,
  rng: () => number,
): SpawnZone[] {
  if (edgeGroups.length === 0) return farZones;

  const clamped = Math.min(directions, edgeGroups.length);

  if (clamped >= edgeGroups.length) {
    // All directions active — include far-building zones too
    return [...edgeGroups.flat(), ...farZones];
  }

  // Shuffle edge groups using Fisher-Yates, pick first `clamped`
  const shuffled = [...edgeGroups];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const selected: SpawnZone[] = [];
  for (let i = 0; i < clamped; i++) {
    selected.push(...shuffled[i]);
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Wave system factory
// ---------------------------------------------------------------------------

/**
 * Create the wave spawner system.
 *
 * Reads `ctx.clockState` each tick to detect phase transitions.
 * Spawns zombies during night in timed pulses, tracks completion,
 * and despawns survivors at dawn.
 */
export function createWaveSystem(ctx: SceneContext): SystemFn {
  // State machine
  let state: WaveState = "inactive";
  let lastPhase: DayPhase = ctx.clockState.phase;

  // Night-level tracking
  let waveNumber = 0;
  let nightConfig: NightWaveConfig | null = null;
  let totalToSpawn = 0;
  let totalSpawned = 0;
  let killsDuringWave = 0;

  // Pulse-level tracking
  let currentPulse = 0;
  let zombiesInPulse = 0;
  let spawnedInPulse = 0;
  let spawnTimer = 0;

  // Pause tracking
  let pauseTimer = 0;

  // Spawn zone state
  let activeZones: SpawnZone[] = [];
  let zoneIndex = 0;
  let spawnPointIndex = 0;

  // RNG (seedrandom — matches project convention)
  let rng: () => number = () => 0;

  // Spawn context (lazy — created on first spawn)
  let spawnCtx: SpawnContext | null = null;

  // Pre-classified zone data
  let edgeGroups: SpawnZone[][] = [];
  let farZones: SpawnZone[] = [];
  let zonesClassified = false;

  // Kill tracking — subscribe to zombie-killed events
  const killListener = () => {
    if (state !== "inactive") {
      killsDuringWave++;
    }
  };
  ctx.eventBus.on("zombie-killed", killListener);

  /** Classify zones once on first use. */
  function ensureZonesClassified(): void {
    if (zonesClassified) return;
    const zones = ctx.spawnZones;
    if (zones && zones.length > 0) {
      const classified = classifyZones(zones);
      edgeGroups = classified.edgeGroups;
      farZones = classified.farZones;
    }
    zonesClassified = true;
  }

  /** Get or create the spawn context from the Phaser scene. */
  function getSpawnCtx(): SpawnContext | null {
    if (!spawnCtx) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scene = ctx.scene as any;
      if (!scene?.matter?.add?.rectangle) {
        console.error(
          "[wave-system] scene.matter.add is not available. " +
            "Cannot spawn zombies. Ensure Matter.js plugin is loaded.",
        );
        return null;
      }
      spawnCtx = {
        matterAdd: scene.matter.add,
        bodyRegistry: ctx.bodyRegistry,
      };
    }
    return spawnCtx;
  }

  /** Prepare for an upcoming night during dusk. */
  function prepareNight(): void {
    ensureZonesClassified();

    const dayNumber = ctx.clockState.dayNumber;
    nightConfig = getWaveConfig(dayNumber);
    rng = seedrandom(String(dayNumber));

    // Guard: clamp spawnInterval to a safe minimum
    if (nightConfig.spawnInterval <= 0) {
      nightConfig.spawnInterval = 0.1;
    }

    // Determine total zombie count for the night
    const { min, max } = nightConfig.totalCount;
    totalToSpawn = min + Math.floor(rng() * (max - min + 1));
    totalSpawned = 0;
    killsDuringWave = 0;

    // Select active spawn zones
    activeZones = selectActiveZones(
      edgeGroups,
      farZones,
      nightConfig.approachDirections,
      rng,
    );
    zoneIndex = 0;
    spawnPointIndex = 0;

    // Reset pulse tracking
    currentPulse = 0;

    state = "preparing";
  }

  /** Start the night wave — begin first pulse. */
  function startWave(): void {
    waveNumber++;

    // If no active zones, complete immediately with 0 zombies
    if (activeZones.length === 0) {
      totalToSpawn = 0;
    }

    safeEmit(ctx.eventBus, "wave-started", {
      waveNumber,
      zombieCount: totalToSpawn,
      dayNumber: ctx.clockState.dayNumber,
    });

    if (totalToSpawn === 0) {
      state = "complete";
      return;
    }

    startNextPulse();
    state = "spawning";
  }

  /** Begin the next pulse within the wave. */
  function startNextPulse(): void {
    currentPulse++;
    const remaining = totalToSpawn - totalSpawned;
    if (remaining <= 0) {
      zombiesInPulse = 0;
      spawnedInPulse = 0;
      spawnTimer = 0;
      return;
    }
    const pulsesLeft = (nightConfig?.pulseCount ?? 1) - currentPulse + 1;
    zombiesInPulse = Math.max(1, Math.ceil(remaining / pulsesLeft));
    spawnedInPulse = 0;
    spawnTimer = 0;
  }

  /** Spawn a single zombie (or horde cluster) at the next spawn point. */
  function spawnNextZombie(): void {
    if (activeZones.length === 0 || !nightConfig) return;

    const sCtx = getSpawnCtx();
    if (!sCtx) return;

    const dayNumber = ctx.clockState.dayNumber;
    const available = getAvailableVariants(dayNumber);
    let variant = selectVariant(available, rng);

    // Cap horde cluster to not overshoot totalToSpawn
    const remaining = totalToSpawn - totalSpawned;
    if (variant === "horde" && remaining < 5) {
      // Horde clusters spawn 5-10 — if fewer than 5 remaining, use shambler
      variant = "shambler";
    }

    // Pick spawn point (round-robin across zones and their points)
    const zone = activeZones[zoneIndex % activeZones.length];
    if (zone.spawnPoints.length === 0) {
      // Skip zones with no spawn points (shouldn't happen after filtering)
      zoneIndex++;
      return;
    }
    const point = zone.spawnPoints[spawnPointIndex % zone.spawnPoints.length];

    const px = point.x * TILE_SIZE + TILE_SIZE / 2;
    const py = point.y * TILE_SIZE + TILE_SIZE / 2;

    // Spawn entity (or cluster).  Per-spawn try-catch ensures a single
    // spawn failure doesn't kill the entire wave.
    try {
      const spawned =
        variant === "horde"
          ? spawnHordeCluster(sCtx, px, py, rng, totalSpawned)
          : [spawnZombie(sCtx, variant, px, py, totalSpawned)];

      // Apply stat scaling for night 4+
      if (nightConfig.statMultiplier !== 1.0) {
        for (const entity of spawned) {
          applyStatMultiplier(entity, nightConfig.statMultiplier);
        }
      }

      totalSpawned += spawned.length;
      spawnedInPulse += spawned.length;
    } catch (err) {
      console.error(
        `[wave-system] Spawn failed (variant=${variant}, wave=${waveNumber}):`,
        err,
      );
      // Count the failed spawn to prevent infinite retry loops
      totalSpawned += 1;
      spawnedInPulse += 1;
    }

    // Advance to next spawn point
    spawnPointIndex++;
    if (spawnPointIndex >= zone.spawnPoints.length) {
      spawnPointIndex = 0;
      zoneIndex++;
    }
  }

  /**
   * Despawn all surviving zombies at dawn by zeroing their health.
   *
   * The zombie AI system (which runs later in the system array) detects
   * health ≤ 0 and removes the entities from the ECS world, cleaning
   * up physics bodies in the process.
   */
  function despawnSurvivors(): void {
    for (const entity of zombieEntities) {
      if (entity.health.current > 0) {
        entity.health.current = 0;
      }
    }
  }

  /** End the current wave and emit the event. */
  function endWave(): void {
    safeEmit(ctx.eventBus, "wave-ended", {
      waveNumber,
      zombiesKilled: killsDuringWave,
      dayNumber: ctx.clockState.dayNumber,
    });

    nightConfig = null;
    state = "inactive";
  }

  // -------------------------------------------------------------------------
  // Main tick function
  // -------------------------------------------------------------------------

  return (dt: number): void => {
    const { clockState } = ctx;

    // Paused clock pauses wave system too
    if (clockState.paused) return;

    try {
      tickInternal(dt, clockState);
    } catch (err) {
      console.error(
        `[wave-system] Tick error (state=${state}, wave=${waveNumber}, ` +
          `spawned=${totalSpawned}/${totalToSpawn}, day=${clockState.dayNumber}):`,
        err,
      );
      // Emit wave-ended if a wave was actively running, so the bridge
      // clears waveActive in the Zustand store (prevents stale HUD).
      if (state === "spawning" || state === "pausing" || state === "complete") {
        safeEmit(ctx.eventBus, "wave-ended", {
          waveNumber,
          zombiesKilled: killsDuringWave,
          dayNumber: clockState.dayNumber,
        });
      }
      // Fail safe: transition to inactive to prevent repeated crashes
      state = "inactive";
      nightConfig = null;
    }
  };

  function tickInternal(dt: number, clockState: ClockState): void {
    // Detect phase transitions
    const currentPhase = clockState.phase;
    const phaseChanged = currentPhase !== lastPhase;
    lastPhase = currentPhase;

    // Handle phase transitions
    if (phaseChanged) {
      if (currentPhase === "dusk") {
        prepareNight();
        return;
      }

      if (currentPhase === "night") {
        // Normal flow: dusk prepared us, now start.
        // Recovery: if dusk was skipped, prepare and start in one tick.
        if (state !== "preparing") {
          prepareNight();
        }
        startWave();
        return;
      }

      if (currentPhase === "dawn" && state !== "inactive") {
        despawnSurvivors();
        endWave();
        return;
      }

      // Day phase — ensure inactive (edge case: game starts in day)
      if (currentPhase === "day") {
        state = "inactive";
        return;
      }
    }

    // State machine tick
    switch (state) {
      case "spawning": {
        if (!nightConfig) break;

        spawnTimer += dt;

        // Safety: limit iterations per tick to prevent runaway loops
        let iterations = 0;
        const maxIterations = 100;

        while (
          spawnTimer >= nightConfig.spawnInterval &&
          spawnedInPulse < zombiesInPulse &&
          totalSpawned < totalToSpawn &&
          iterations < maxIterations
        ) {
          spawnTimer -= nightConfig.spawnInterval;
          spawnNextZombie();
          iterations++;
        }

        // Check if pulse is complete
        if (spawnedInPulse >= zombiesInPulse || totalSpawned >= totalToSpawn) {
          if (totalSpawned >= totalToSpawn) {
            // All zombies spawned — check for wave completion
            state = "complete";
          } else if (currentPulse < nightConfig.pulseCount) {
            // More pulses remain — pause for repair
            pauseTimer = 0;
            state = "pausing";
          } else {
            // Final pulse done but count not reached (rounding) — complete
            state = "complete";
          }
        }
        break;
      }

      case "pausing": {
        if (!nightConfig) break;

        pauseTimer += dt;
        if (pauseTimer >= nightConfig.pulsePause) {
          startNextPulse();
          state = "spawning";
        }
        break;
      }

      case "complete": {
        // Wait for all zombies to be killed
        if (zombieEntities.entities.length === 0) {
          endWave();
        }
        break;
      }

      // 'inactive' and 'preparing' — no-op per tick
      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Apply a stat multiplier to a zombie entity's speed, damage, and health.
 * Called post-creation because spawnZombie copies stats from presets.
 */
function applyStatMultiplier(
  entity: {
    zombieType: { moveSpeed: number; attackDamage: number };
    health: { current: number; max: number };
  },
  multiplier: number,
): void {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    return;
  }
  entity.zombieType.moveSpeed = Math.round(
    entity.zombieType.moveSpeed * multiplier,
  );
  entity.zombieType.attackDamage = Math.round(
    entity.zombieType.attackDamage * multiplier,
  );
  entity.health.max = Math.round(entity.health.max * multiplier);
  entity.health.current = entity.health.max;
}
