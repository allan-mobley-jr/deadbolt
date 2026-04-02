/**
 * Particle system constants and tuning parameters.
 *
 * Controls emission rates, lifetimes, colors, and the global particle
 * budget. Particles are purely visual — no physics, no ECS cost.
 *
 * NO React imports — this is pure TypeScript.
 */

export const PARTICLES = {
  // --- Global budget ---

  /** Maximum number of active particles across all emitters. */
  MAX_ACTIVE: 200,

  /** Depth for particle emitters (above game objects, below lighting). */
  DEPTH: 50,

  // --- Fire particles ---

  /** Number of ember particles per fire emission cycle. */
  FIRE_COUNT: 3,

  /** Fire particle lifespan in milliseconds. */
  FIRE_LIFESPAN: 1000,

  /** Upward speed for fire embers (pixels/second). */
  FIRE_SPEED_MIN: 20,
  FIRE_SPEED_MAX: 60,

  /** Fire emission interval in milliseconds. */
  FIRE_FREQUENCY: 200,

  /** Fire particle tint (orange-red). */
  FIRE_TINT: 0xff4500,

  /** Fire particle start scale. */
  FIRE_SCALE_START: 0.8,

  /** Fire particle end scale. */
  FIRE_SCALE_END: 0.1,

  // --- Explosion particles ---

  /** Number of debris particles per explosion burst. */
  EXPLOSION_COUNT: 20,

  /** Explosion particle lifespan in milliseconds. */
  EXPLOSION_LIFESPAN: 800,

  /** Explosion outward speed range (pixels/second). */
  EXPLOSION_SPEED_MIN: 80,
  EXPLOSION_SPEED_MAX: 200,

  /** Explosion particle tint (yellow/white flash). */
  EXPLOSION_TINT: 0xffcc00,

  // --- Blood / damage particles ---

  /** Number of blood splash particles on hit. */
  BLOOD_COUNT: 6,

  /** Blood particle lifespan in milliseconds. */
  BLOOD_LIFESPAN: 500,

  /** Blood outward speed (pixels/second). */
  BLOOD_SPEED_MIN: 30,
  BLOOD_SPEED_MAX: 80,

  /** Blood particle tint (red). */
  BLOOD_TINT: 0xcc0000,

  // --- Dust particles ---

  /** Minimum movement speed (px/s) before dust emits. */
  DUST_SPEED_THRESHOLD: 120,

  /** Dust particle lifespan in milliseconds. */
  DUST_LIFESPAN: 600,

  /** Dust emission interval in milliseconds. */
  DUST_FREQUENCY: 150,

  /** Number of dust particles per emission. */
  DUST_COUNT: 1,

  /** Dust particle tint (light brown). */
  DUST_TINT: 0x8b7355,

  /** Dust particle start alpha. */
  DUST_ALPHA_START: 0.4,

  /** Dust particle end alpha. */
  DUST_ALPHA_END: 0,

  // --- Electricity sparks ---

  /** Number of spark particles per electricity emission cycle. */
  ELECTRIC_COUNT: 2,

  /** Electricity spark lifespan in milliseconds. */
  ELECTRIC_LIFESPAN: 300,

  /** Electricity spark speed (pixels/second). */
  ELECTRIC_SPEED_MIN: 40,
  ELECTRIC_SPEED_MAX: 100,

  /** Electricity emission interval in milliseconds. */
  ELECTRIC_FREQUENCY: 150,

  /** Electric spark tint (cyan-blue). */
  ELECTRIC_TINT: 0x44aaff,

  // --- Melee swing trail ---

  /** Number of trail particles per swing. */
  SWING_COUNT: 4,

  /** Swing trail lifespan in milliseconds. */
  SWING_LIFESPAN: 150,

  /** Swing trail tint (dim white). */
  SWING_TINT: 0xaaaaaa,

  // --- Barricade break ---

  /** Number of splinter particles on barricade break. */
  BREAK_COUNT: 10,

  /** Break particle lifespan in milliseconds. */
  BREAK_LIFESPAN: 800,

  /** Break outward speed (pixels/second). */
  BREAK_SPEED_MIN: 40,
  BREAK_SPEED_MAX: 120,

  /** Break particle tint (brown wood). */
  BREAK_TINT: 0x8b6914,

  // --- Zombie death ---

  /** Number of particles on zombie death. */
  DEATH_COUNT: 8,

  /** Death burst lifespan in milliseconds. */
  DEATH_LIFESPAN: 600,

  /** Death burst speed (pixels/second). */
  DEATH_SPEED_MIN: 20,
  DEATH_SPEED_MAX: 60,

  /** Death particle tint (dark red). */
  DEATH_TINT: 0x880000,
} as const;

// ---------------------------------------------------------------------------
// Texture keys for particle sprites
// ---------------------------------------------------------------------------

export const PARTICLE_TEXTURES = {
  /** 4x4 white circle — tinted at emit time (generic fallback). */
  CIRCLE: "particle-circle",
  /** 3x3 white square — tinted at emit time (generic fallback). */
  SQUARE: "particle-square",

  // Purpose-shaped particle textures (issue #179)
  /** 4x4 diamond — fire embers and flame effects. */
  EMBER: "particle-ember",
  /** 3x3 irregular blob — blood and combat damage. */
  BLOOD: "particle-blood",
  /** 4x4 cross/star — electric sparks. */
  SPARK: "particle-spark",
  /** 2x5 elongated rectangle — wood splinters and debris. */
  SPLINTER: "particle-splinter",
  /** 3x3 soft-edged circle — dust puffs. */
  DUST: "particle-dust",
} as const;
