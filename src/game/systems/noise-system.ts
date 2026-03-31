/**
 * Noise propagation system — maintains a spatial noise map and decays
 * noise events over time.
 *
 * The NoiseMap is a lightweight spatial store of active noise events.
 * Each tick it decays all events and removes expired ones. Other systems
 * emit "noise-generated" events on the bus; the NoiseSystem collects them
 * and adds them to the map. The ZombieAISystem queries the map to find
 * the loudest noise within each zombie's hearing range.
 *
 * Runs after MovementSystem and before ZombieAISystem so the noise map
 * is current when zombies query it.
 *
 * NO React imports — this is pure TypeScript.
 */

import type { SceneContext } from "./scene-context";
import type { SystemFn } from "./system-runner";
import { playerEntities } from "@/game/ecs/queries";
import { safeEmit } from "@/game/events/event-bus";
import { NOISE } from "./noise-constants";

// ---------------------------------------------------------------------------
// NoiseEvent — a single active noise in the world
// ---------------------------------------------------------------------------

export interface NoiseEvent {
  /** Unique ID for this noise event. */
  id: number;
  /** World-space X position (pixels). */
  x: number;
  /** World-space Y position (pixels). */
  y: number;
  /** Maximum audible radius (pixels). Beyond this, the noise is silent. */
  radius: number;
  /** Current intensity (decays linearly from maxIntensity to 0). */
  intensity: number;
  /** Original intensity at creation time. */
  maxIntensity: number;
  /** Seconds remaining until fully decayed. */
  timeRemaining: number;
  /** Total lifetime in seconds. */
  duration: number;
  /** Source identifier (e.g. "explosion", "combat", "drag"). */
  source: string;
}

// ---------------------------------------------------------------------------
// NoiseMap — spatial store of active noise events
// ---------------------------------------------------------------------------

/**
 * Maintains a collection of active noise events in world space.
 *
 * Events decay linearly over their duration and are removed when expired.
 * The map supports querying for the loudest perceived noise at any point,
 * accounting for distance falloff within each event's radius.
 *
 * The array is kept small (typically <20 active events at 60Hz) so linear
 * scans are perfectly efficient — no spatial index needed.
 */
export class NoiseMap {
  private events: NoiseEvent[] = [];
  private nextId = 0;

  /**
   * Add a new noise event to the map.
   *
   * @returns The assigned event ID.
   */
  addNoise(
    x: number,
    y: number,
    radius: number,
    intensity: number,
    duration: number,
    source: string,
  ): number {
    const id = this.nextId++;
    this.events.push({
      id,
      x,
      y,
      radius,
      intensity,
      maxIntensity: intensity,
      timeRemaining: duration,
      duration,
      source,
    });
    return id;
  }

  /**
   * Decay all events by `dt` seconds. Removes expired events.
   *
   * Intensity decays linearly: `currentIntensity = maxIntensity * (timeRemaining / duration)`.
   */
  update(dt: number): void {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const event = this.events[i];
      event.timeRemaining -= dt;

      if (event.timeRemaining <= 0) {
        // Expired — swap-and-pop for O(1) removal
        this.events[i] = this.events[this.events.length - 1];
        this.events.pop();
      } else {
        // Linear intensity decay
        event.intensity = event.maxIntensity * (event.timeRemaining / event.duration);
      }
    }
  }

  /**
   * Find the loudest noise source perceived at position (px, py) within
   * the listener's hearing range.
   *
   * Perceived intensity = `event.intensity * max(0, 1 - dist / radius)`.
   * The event must be within both the listener's hearing range and the
   * noise event's own radius.
   *
   * @returns The NoiseEvent with the highest perceived intensity, or null
   *          if no events are audible from this position.
   */
  findLoudestNoise(
    px: number,
    py: number,
    hearingRange: number,
  ): NoiseEvent | null {
    let loudest: NoiseEvent | null = null;
    let loudestPerceived = 0;

    for (const event of this.events) {
      const dx = px - event.x;
      const dy = py - event.y;
      const distSq = dx * dx + dy * dy;

      // Must be within both the zombie's hearing range and the noise radius
      const maxRange = Math.min(hearingRange, event.radius);
      if (distSq > maxRange * maxRange) continue;

      const dist = Math.sqrt(distSq);
      const perceived = event.intensity * (1 - dist / event.radius);

      if (perceived > loudestPerceived) {
        loudestPerceived = perceived;
        loudest = event;
      }
    }

    return loudest;
  }

  /** Get all active noise events (read-only, for debug/UI). */
  getActiveEvents(): readonly NoiseEvent[] {
    return this.events;
  }

  /** Number of active noise events. */
  get size(): number {
    return this.events.length;
  }

  /** Clear all events (for run reset). */
  clear(): void {
    this.events.length = 0;
    this.nextId = 0;
  }
}

// ---------------------------------------------------------------------------
// System factory
// ---------------------------------------------------------------------------

/**
 * Create the noise propagation system.
 *
 * Subscribes to "noise-generated" events on the bus and populates the NoiseMap.
 * Each tick, decays existing events and generates player footstep noise based
 * on movement speed.
 *
 * Requires `noiseMap` on SceneContext.
 */
export function createNoiseSystem(ctx: SceneContext): SystemFn {
  const noiseMap = ctx.noiseMap;
  if (!noiseMap) {
    throw new Error("[NoiseSystem] ctx.noiseMap is required");
  }

  // Subscribe to noise events emitted by other systems (explosion, combat, etc.)
  // Footstep noise is added directly to the map by this system to avoid
  // double-registration — the bus emission is for UI consumption only.
  ctx.eventBus.on("noise-generated", (e) => {
    if (e.source === "footstep") return;
    noiseMap.addNoise(
      e.position.x,
      e.position.y,
      e.radius,
      e.intensity,
      e.duration ?? NOISE.DEFAULT_DECAY_DURATION,
      e.source,
    );
  });

  // Tick counter for throttling footstep noise
  let ticksSinceLastFootstep = 0;

  return (dt: number): void => {
    // 1. Decay existing noise events
    noiseMap.update(dt);

    // 2. Generate footstep noise from player movement
    ticksSinceLastFootstep++;

    if (ticksSinceLastFootstep >= NOISE.FOOTSTEP_TICK_INTERVAL) {
      const player = playerEntities.entities[0];
      if (player) {
        const speed = Math.sqrt(
          player.velocity.vx * player.velocity.vx +
          player.velocity.vy * player.velocity.vy,
        );

        if (speed > NOISE.FOOTSTEP_SPEED_THRESHOLD) {
          ticksSinceLastFootstep = 0;

          // Add directly to noise map (avoids one-tick latency from bus)
          noiseMap.addNoise(
            player.position.x,
            player.position.y,
            NOISE.FOOTSTEP_RADIUS,
            NOISE.FOOTSTEP_INTENSITY,
            NOISE.FOOTSTEP_DECAY_DURATION,
            "footstep",
          );

          // Also emit event for UI consumption
          safeEmit(ctx.eventBus, "noise-generated", {
            position: { x: player.position.x, y: player.position.y },
            radius: NOISE.FOOTSTEP_RADIUS,
            intensity: NOISE.FOOTSTEP_INTENSITY,
            duration: NOISE.FOOTSTEP_DECAY_DURATION,
            source: "footstep",
          });
        }
      }
    }
  };
}
