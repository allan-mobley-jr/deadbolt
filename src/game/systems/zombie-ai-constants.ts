/**
 * Tunable constants for the zombie AI system.
 *
 * All zombie-type stats and AI behaviour thresholds live here so they
 * are easy to find and adjust without touching state machine logic.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import type { ZombieType } from "@/game/ecs/components";

// ---------------------------------------------------------------------------
// Shambler preset
// ---------------------------------------------------------------------------

/** Default shambler stats — the baseline zombie archetype. */
export const SHAMBLER_STATS: Readonly<ZombieType> = {
  variant: "shambler",
  moveSpeed: 40, // pixels/sec (player is 200)
  attackDamage: 5, // HP per hit
  attackCooldown: 1.5, // seconds between attacks
  pathRecalcInterval: 45, // ticks (~750ms at 60Hz)
  staggerDuration: 0.4, // seconds
} as const;

/** Default shambler health. */
export const SHAMBLER_HEALTH = 50;

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
