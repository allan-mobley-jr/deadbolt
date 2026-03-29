/**
 * Tunable constants for the zombie AI system.
 *
 * All zombie-type stats and AI behaviour thresholds live here so they
 * are easy to find and adjust without touching state machine logic.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import type { ZombieType, ZombieVariant } from "@/game/ecs/components";

// ---------------------------------------------------------------------------
// Shambler preset — the baseline zombie archetype
// ---------------------------------------------------------------------------

export const SHAMBLER_STATS: Readonly<ZombieType> = {
  variant: "shambler",
  moveSpeed: 40,               // pixels/sec (player is 200)
  attackDamage: 5,             // HP per hit
  attackCooldown: 1.5,         // seconds between attacks
  pathRecalcInterval: 45,      // ticks (~750ms at 60Hz)
  staggerDuration: 0.4,        // seconds
  barricadeDamageMultiplier: 1,
  vaultDurabilityThreshold: 0, // no vaulting
  bodySize: 20,
} as const;

export const SHAMBLER_HEALTH = 50;

// ---------------------------------------------------------------------------
// Runner preset — fast and fragile, vaults weak barricades (Night 2+)
// ---------------------------------------------------------------------------

export const RUNNER_STATS: Readonly<ZombieType> = {
  variant: "runner",
  moveSpeed: 100,              // 2.5× shambler (still below player's 200)
  attackDamage: 3,             // lower damage
  attackCooldown: 1.0,         // faster swings
  pathRecalcInterval: 20,      // recalc every ~333ms
  staggerDuration: 0.6,        // longer stagger (fragile)
  barricadeDamageMultiplier: 1,
  vaultDurabilityThreshold: 30, // ignores barricades with ≤ 30 durability
  bodySize: 20,
} as const;

export const RUNNER_HEALTH = 30;

// ---------------------------------------------------------------------------
// Brute preset — slow tank that targets the weakest barricade (Night 3+)
// ---------------------------------------------------------------------------

export const BRUTE_STATS: Readonly<ZombieType> = {
  variant: "brute",
  moveSpeed: 25,               // slower than shambler
  attackDamage: 10,            // 2× shambler per hit
  attackCooldown: 2.0,         // slow but devastating
  pathRecalcInterval: 60,      // less frequent recalc
  staggerDuration: 0.2,        // very hard to stagger
  barricadeDamageMultiplier: 3, // 3× barricade damage (10 × 3 = 30 per hit)
  vaultDurabilityThreshold: 0,
  bodySize: 28,                // visually larger
} as const;

export const BRUTE_HEALTH = 150;

// ---------------------------------------------------------------------------
// Horde preset — weak individually, dangerous in swarms (Night 3+)
// ---------------------------------------------------------------------------

export const HORDE_STATS: Readonly<ZombieType> = {
  variant: "horde",
  moveSpeed: 35,               // slightly slower than shambler
  attackDamage: 3,             // weak per hit
  attackCooldown: 1.2,
  pathRecalcInterval: 45,      // same as shambler
  staggerDuration: 0.5,
  barricadeDamageMultiplier: 1,
  vaultDurabilityThreshold: 0,
  bodySize: 14,                // small
} as const;

export const HORDE_HEALTH = 20;

/** Number of zombies in a horde cluster. */
export const HORDE_CLUSTER_SIZE = { min: 5, max: 10 } as const;

/** Pixel radius for cluster spawn position offsets. */
export const HORDE_CLUSTER_SPREAD = 32;

// ---------------------------------------------------------------------------
// Night-based archetype unlocks
// ---------------------------------------------------------------------------

/**
 * Minimum night number required for each archetype to appear.
 * The spawner checks `dayNumber >= threshold` before including
 * a variant in the pool.
 */
export const ARCHETYPE_UNLOCK_NIGHT: Readonly<Record<ZombieVariant, number>> = {
  shambler: 1,
  runner: 2,
  brute: 3,
  horde: 3,
} as const;

/**
 * Spawn weight per variant (relative probability when variant is available).
 * Higher weight = more likely to be selected by the spawner.
 */
export const ARCHETYPE_SPAWN_WEIGHT: Readonly<Record<ZombieVariant, number>> = {
  shambler: 40,
  runner: 25,
  brute: 20,
  horde: 15,
} as const;

// ---------------------------------------------------------------------------
// Stat lookup helpers
// ---------------------------------------------------------------------------

/** Map from variant name to its stat preset. */
export const VARIANT_STATS: Readonly<Record<ZombieVariant, Readonly<ZombieType>>> = {
  shambler: SHAMBLER_STATS,
  runner: RUNNER_STATS,
  brute: BRUTE_STATS,
  horde: HORDE_STATS,
} as const;

/** Map from variant name to its base health. */
export const VARIANT_HEALTH: Readonly<Record<ZombieVariant, number>> = {
  shambler: SHAMBLER_HEALTH,
  runner: RUNNER_HEALTH,
  brute: BRUTE_HEALTH,
  horde: HORDE_HEALTH,
} as const;

// ---------------------------------------------------------------------------
// AI behaviour thresholds
// ---------------------------------------------------------------------------

export const ZOMBIE_AI = {
  /**
   * Distance (pixels) at which a zombie can attack a barricade or player.
   * Slightly more than the sum of zombie half-size + target half-size.
   */
  ATTACK_RANGE: 28,

  /**
   * Distance (pixels) at which a zombie detects a barricade on its path
   * and switches to attacking.
   */
  BARRICADE_DETECTION_RANGE: 48,

  /**
   * Distance (pixels) within which a zombie considers it has reached
   * its current path waypoint and advances to the next one.
   */
  WAYPOINT_THRESHOLD: 4,

  /**
   * Maximum random offset (pixels) in each axis applied to zombie convergence
   * points on barricades. Prevents perfect stacking when multiple zombies
   * target the same barricade.
   */
  CONVERGENCE_SPREAD: 8,

  /**
   * Size of the zombie physics body (pixels). Slightly smaller than the
   * player (24) for visual distinction and to allow them to bunch up.
   */
  BODY_SIZE: 20,
} as const;
