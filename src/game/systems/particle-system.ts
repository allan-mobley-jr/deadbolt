/**
 * Particle effects system — visual-only particle emitters for fire,
 * explosions, combat, movement, and electricity.
 *
 * Runs as a render-phase system (once per display frame) for smooth
 * particle interpolation. All particles use Phaser's built-in
 * ParticleEmitter — no ECS entities, no physics bodies.
 *
 * A global particle cap prevents performance degradation. The
 * graphicsQuality setting scales particle counts (low = minimal,
 * medium = normal, high = full).
 *
 * NO React imports — this is pure game-side TypeScript.
 */

import type { SceneContext } from "./scene-context";
import type { SystemFn } from "./system-runner";
import { PARTICLES, PARTICLE_TEXTURES } from "./particle-constants";
import { playerEntities, materialEntities } from "@/game/ecs/queries";
import type { GraphicsQuality } from "@/lib/settings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Tracked ongoing emitter tied to an entity reference. */
interface TrackedEmitter {
  entity: unknown;
  emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  type: "fire" | "electric";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Quality multiplier for particle counts. */
function qualityMultiplier(quality: GraphicsQuality): number {
  switch (quality) {
    case "low": return 0;
    case "medium": return 0.6;
    case "high": return 1.0;
  }
}

// ---------------------------------------------------------------------------
// System factory
// ---------------------------------------------------------------------------

export function createParticleSystem(ctx: SceneContext): SystemFn {
  const scene = ctx.scene;

  // --- Settings ---
  let quality: GraphicsQuality = "medium";
  let qMul = qualityMultiplier(quality);

  // --- Active particle tracking ---
  let activeParticleCount = 0;

  // --- Ongoing emitters for material-state effects ---
  const trackedEmitters: TrackedEmitter[] = [];

  // --- Dust emission timer ---
  let dustTimer = 0;

  // =========================================================================
  // Helpers
  // =========================================================================

  /** Check if we can emit more particles. */
  function canEmit(count: number): boolean {
    return qMul > 0 && activeParticleCount + count <= PARTICLES.MAX_ACTIVE;
  }

  /** Register particles as active and schedule their removal. */
  function trackParticles(count: number, lifespanMs: number): void {
    const actual = Math.max(1, Math.round(count * qMul));
    activeParticleCount += actual;
    setTimeout(() => {
      activeParticleCount = Math.max(0, activeParticleCount - actual);
    }, lifespanMs + 100); // slight buffer for fade-out
  }

  /**
   * Emit a one-shot particle burst at a world position.
   * Returns the emitter (auto-destroys after lifespan).
   */
  function burstAt(
    x: number,
    y: number,
    config: {
      texture?: string;
      count: number;
      lifespan: number;
      speedMin: number;
      speedMax: number;
      tint: number;
      scaleStart?: number;
      scaleEnd?: number;
      alphaStart?: number;
      alphaEnd?: number;
      gravityY?: number;
      angle?: { min: number; max: number };
    },
  ): void {
    const count = Math.max(1, Math.round(config.count * qMul));
    if (!canEmit(count)) return;

    try {
      const emitter = scene.add.particles(
        x,
        y,
        config.texture ?? PARTICLE_TEXTURES.CIRCLE,
        {
          lifespan: config.lifespan,
          speed: { min: config.speedMin, max: config.speedMax },
          scale: { start: config.scaleStart ?? 0.6, end: config.scaleEnd ?? 0.1 },
          alpha: { start: config.alphaStart ?? 1, end: config.alphaEnd ?? 0 },
          tint: config.tint,
          gravityY: config.gravityY ?? 0,
          angle: config.angle ?? { min: 0, max: 360 },
          emitting: false,
          quantity: count,
        },
      );

      emitter.setDepth(PARTICLES.DEPTH);
      emitter.explode(count);
      trackParticles(count, config.lifespan);

      // Auto-destroy after particles fade
      setTimeout(() => {
        try { emitter.destroy(); } catch { /* already destroyed */ }
      }, config.lifespan + 200);
    } catch {
      // Particle creation may fail in test environments
    }
  }

  /**
   * Create a continuous emitter at a position (for fire/electricity).
   * Returns the emitter or null if over budget.
   */
  function createContinuousEmitter(
    x: number,
    y: number,
    config: {
      texture?: string;
      count: number;
      lifespan: number;
      speedMin: number;
      speedMax: number;
      frequency: number;
      tint: number;
      scaleStart?: number;
      scaleEnd?: number;
      alphaStart?: number;
      alphaEnd?: number;
      gravityY?: number;
      angle?: { min: number; max: number };
    },
  ): Phaser.GameObjects.Particles.ParticleEmitter | null {
    const count = Math.max(1, Math.round(config.count * qMul));
    if (qMul <= 0) return null;

    try {
      const emitter = scene.add.particles(
        x,
        y,
        config.texture ?? PARTICLE_TEXTURES.CIRCLE,
        {
          lifespan: config.lifespan,
          speed: { min: config.speedMin, max: config.speedMax },
          scale: { start: config.scaleStart ?? 0.6, end: config.scaleEnd ?? 0.1 },
          alpha: { start: config.alphaStart ?? 1, end: config.alphaEnd ?? 0 },
          tint: config.tint,
          gravityY: config.gravityY ?? 0,
          angle: config.angle ?? { min: 0, max: 360 },
          frequency: config.frequency,
          quantity: count,
        },
      );

      emitter.setDepth(PARTICLES.DEPTH);
      return emitter;
    } catch {
      return null;
    }
  }

  // =========================================================================
  // Event listeners (one-shot effects)
  // =========================================================================

  // --- Explosion burst ---
  ctx.eventBus.on("explosion-detonated", (e) => {
    burstAt(e.position.x, e.position.y, {
      count: PARTICLES.EXPLOSION_COUNT,
      lifespan: PARTICLES.EXPLOSION_LIFESPAN,
      speedMin: PARTICLES.EXPLOSION_SPEED_MIN,
      speedMax: PARTICLES.EXPLOSION_SPEED_MAX,
      tint: PARTICLES.EXPLOSION_TINT,
      scaleStart: 1.0,
      scaleEnd: 0.2,
    });
  });

  // --- Blood/damage on player hit ---
  ctx.eventBus.on("player-hit", (e) => {
    burstAt(e.position.x, e.position.y, {
      count: PARTICLES.BLOOD_COUNT,
      lifespan: PARTICLES.BLOOD_LIFESPAN,
      speedMin: PARTICLES.BLOOD_SPEED_MIN,
      speedMax: PARTICLES.BLOOD_SPEED_MAX,
      tint: PARTICLES.BLOOD_TINT,
    });
  });

  // --- Blood/damage on zombie hit ---
  ctx.eventBus.on("damage-dealt", (e) => {
    burstAt(e.position.x, e.position.y, {
      count: PARTICLES.BLOOD_COUNT,
      lifespan: PARTICLES.BLOOD_LIFESPAN,
      speedMin: PARTICLES.BLOOD_SPEED_MIN,
      speedMax: PARTICLES.BLOOD_SPEED_MAX,
      tint: PARTICLES.BLOOD_TINT,
    });
  });

  // --- Zombie death burst ---
  ctx.eventBus.on("zombie-killed", (e) => {
    burstAt(e.position.x, e.position.y, {
      count: PARTICLES.DEATH_COUNT,
      lifespan: PARTICLES.DEATH_LIFESPAN,
      speedMin: PARTICLES.DEATH_SPEED_MIN,
      speedMax: PARTICLES.DEATH_SPEED_MAX,
      tint: PARTICLES.DEATH_TINT,
    });
  });

  // --- Melee swing trail ---
  ctx.eventBus.on("melee-swing", (e) => {
    burstAt(e.position.x, e.position.y, {
      count: PARTICLES.SWING_COUNT,
      lifespan: PARTICLES.SWING_LIFESPAN,
      speedMin: 10,
      speedMax: 40,
      tint: PARTICLES.SWING_TINT,
      alphaStart: 0.6,
      alphaEnd: 0,
    });
  });

  // --- Barricade break splinters ---
  ctx.eventBus.on("barricade-broken", (e) => {
    burstAt(e.position.x, e.position.y, {
      texture: PARTICLE_TEXTURES.SQUARE,
      count: PARTICLES.BREAK_COUNT,
      lifespan: PARTICLES.BREAK_LIFESPAN,
      speedMin: PARTICLES.BREAK_SPEED_MIN,
      speedMax: PARTICLES.BREAK_SPEED_MAX,
      tint: PARTICLES.BREAK_TINT,
      gravityY: 80,
    });
  });

  // --- Electricity zap sparks ---
  ctx.eventBus.on("electricity-damage", (e) => {
    burstAt(e.position.x, e.position.y, {
      count: 4,
      lifespan: PARTICLES.ELECTRIC_LIFESPAN,
      speedMin: PARTICLES.ELECTRIC_SPEED_MIN,
      speedMax: PARTICLES.ELECTRIC_SPEED_MAX,
      tint: PARTICLES.ELECTRIC_TINT,
    });
  });

  // --- Fire ignition burst ---
  ctx.eventBus.on("fire-ignited", (e) => {
    burstAt(e.position.x, e.position.y, {
      count: 8,
      lifespan: PARTICLES.FIRE_LIFESPAN,
      speedMin: PARTICLES.FIRE_SPEED_MIN,
      speedMax: PARTICLES.FIRE_SPEED_MAX,
      tint: PARTICLES.FIRE_TINT,
      angle: { min: 250, max: 290 },
      gravityY: -30,
    });
  });

  // --- Settings changes ---
  ctx.eventBus.on("cmd:settings-changed", (e) => {
    if (e.key === "graphicsQuality" && typeof e.value === "string") {
      quality = e.value as GraphicsQuality;
      qMul = qualityMultiplier(quality);

      // If set to low, destroy all ongoing emitters
      if (qMul <= 0) {
        for (const tracked of trackedEmitters) {
          try { tracked.emitter.destroy(); } catch { /* ignore */ }
        }
        trackedEmitters.length = 0;
      }
    }
  });

  // =========================================================================
  // Per-frame function (render phase)
  // =========================================================================

  return function particleSystem(dt: number): void {
    if (qMul <= 0) return;

    // --- Manage ongoing fire/electricity emitters from material state ---
    const materials = materialEntities.entities;
    const activeEntities = new Set<unknown>();

    for (let i = 0; i < materials.length; i++) {
      const entity = materials[i];
      const state = entity.material.state;

      if (state === "burning" || state === "electrified") {
        activeEntities.add(entity);

        // Check if we already have an emitter for this entity
        const existing = trackedEmitters.find((t) => t.entity === entity);
        if (existing) {
          // Update position
          existing.emitter.setPosition(entity.position.x, entity.position.y);
        } else {
          // Create new continuous emitter
          const type = state === "burning" ? "fire" : "electric";
          const config =
            type === "fire"
              ? {
                  count: PARTICLES.FIRE_COUNT,
                  lifespan: PARTICLES.FIRE_LIFESPAN,
                  speedMin: PARTICLES.FIRE_SPEED_MIN,
                  speedMax: PARTICLES.FIRE_SPEED_MAX,
                  frequency: PARTICLES.FIRE_FREQUENCY,
                  tint: PARTICLES.FIRE_TINT,
                  scaleStart: PARTICLES.FIRE_SCALE_START,
                  scaleEnd: PARTICLES.FIRE_SCALE_END,
                  angle: { min: 250, max: 290 } as { min: number; max: number },
                  gravityY: -30,
                }
              : {
                  count: PARTICLES.ELECTRIC_COUNT,
                  lifespan: PARTICLES.ELECTRIC_LIFESPAN,
                  speedMin: PARTICLES.ELECTRIC_SPEED_MIN,
                  speedMax: PARTICLES.ELECTRIC_SPEED_MAX,
                  frequency: PARTICLES.ELECTRIC_FREQUENCY,
                  tint: PARTICLES.ELECTRIC_TINT,
                };

          const emitter = createContinuousEmitter(
            entity.position.x,
            entity.position.y,
            config,
          );
          if (emitter) {
            trackedEmitters.push({ entity, emitter, type });
          }
        }
      }
    }

    // Clean up emitters for entities that are no longer burning/electrified
    for (let i = trackedEmitters.length - 1; i >= 0; i--) {
      if (!activeEntities.has(trackedEmitters[i].entity)) {
        try { trackedEmitters[i].emitter.destroy(); } catch { /* ignore */ }
        trackedEmitters.splice(i, 1);
      }
    }

    // --- Dust particles for fast-moving player ---
    const players = playerEntities.entities;
    if (players.length > 0) {
      const player = players[0];
      const vx = player.velocity.vx;
      const vy = player.velocity.vy;
      const speed = Math.sqrt(vx * vx + vy * vy);

      if (speed > PARTICLES.DUST_SPEED_THRESHOLD) {
        dustTimer -= dt * 1000; // convert to ms
        if (dustTimer <= 0) {
          dustTimer = PARTICLES.DUST_FREQUENCY;
          burstAt(player.position.x, player.position.y, {
            count: PARTICLES.DUST_COUNT,
            lifespan: PARTICLES.DUST_LIFESPAN,
            speedMin: 5,
            speedMax: 15,
            tint: PARTICLES.DUST_TINT,
            alphaStart: PARTICLES.DUST_ALPHA_START,
            alphaEnd: PARTICLES.DUST_ALPHA_END,
            scaleStart: 0.4,
            scaleEnd: 0.1,
          });
        }
      } else {
        dustTimer = 0;
      }
    }
  };
}
