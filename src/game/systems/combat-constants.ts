/**
 * Tunable constants for the player combat system.
 *
 * All melee attack parameters, item scaling factors, knockback forces,
 * and invulnerability timing live here. Mirrors the pattern used by
 * zombie-ai-constants.ts for easy tuning without touching system logic.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

export const COMBAT = {
  // --- Player melee ---

  /** Base melee damage when bare-handed (no item equipped). */
  BASE_MELEE_DAMAGE: 10,

  /** Seconds between melee swings (base cooldown). */
  MELEE_COOLDOWN: 0.5,

  /** Duration of the swing sensor being active (seconds). ~9 ticks at 60 Hz. */
  SWING_DURATION: 0.15,

  /** Base reach of melee swing sensor from player centre (pixels). */
  BASE_MELEE_RANGE: 28,

  /** Width of the melee sensor body (pixels). */
  SWING_SENSOR_WIDTH: 24,

  /** Height/depth of the melee sensor body (pixels). */
  SWING_SENSOR_HEIGHT: 16,

  /** Largest zombie half-size for overlap checks (brute bodySize 28 / 2). */
  MAX_ZOMBIE_HALF_SIZE: 14,

  // --- Item scaling ---
  //
  // Equipped item mass modifies damage, range, and cooldown:
  //   damage   = BASE_MELEE_DAMAGE + mass * MASS_DAMAGE_SCALE
  //   range    = BASE_MELEE_RANGE  + mass * MASS_RANGE_SCALE
  //   cooldown = MELEE_COOLDOWN    + mass * MASS_COOLDOWN_SCALE
  //
  // Examples:
  //   Bare hand:    10 dmg, 28 px range, 0.50 s cooldown
  //   wooden_plank: 14.5 dmg, 29.5 px, 0.56 s  (mass 3)
  //   metal_sheet:  25 dmg, 33 px, 0.70 s       (mass 10)
  //   table:        47.5 dmg, 40.5 px, 1.00 s   (mass 25)

  /** Damage bonus per kg of equipped item mass. */
  MASS_DAMAGE_SCALE: 1.5,

  /** Range bonus per kg of equipped item mass (pixels). */
  MASS_RANGE_SCALE: 0.5,

  /** Cooldown penalty per kg of equipped item mass (seconds). */
  MASS_COOLDOWN_SCALE: 0.02,

  // --- Knockback ---

  /** Force magnitude applied to zombies on melee hit. */
  ZOMBIE_KNOCKBACK_FORCE: 0.08,

  /** Force magnitude applied to player when hit by a zombie. */
  PLAYER_KNOCKBACK_FORCE: 0.04,

  // --- Invulnerability ---

  /** Duration of player invulnerability after taking damage (seconds). */
  INVULNERABILITY_DURATION: 0.5,
} as const;
