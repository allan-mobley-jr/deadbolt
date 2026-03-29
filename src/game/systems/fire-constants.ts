/**
 * Fire system constants and tuning parameters.
 *
 * All timing values are in seconds unless noted otherwise.
 * Tick intervals are in fixed ticks (60 Hz = 1 tick per ~16.67ms).
 *
 * NO React imports — this is pure TypeScript.
 */

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

export const FIRE = {
  // --- Spread ---

  /** Ticks between fire spread checks (12 ticks = 0.2s at 60 Hz). */
  SPREAD_CHECK_INTERVAL: 12,

  /** Radius (pixels) within which fire can spread to flammable objects. */
  SPREAD_RADIUS: 64,

  /**
   * Base probability of ignition per spread check.
   * Actual chance = BASE_IGNITION_CHANCE * target.flammability.
   * At 0.2s intervals, a fuel object (1.0) has ~87% cumulative chance over 2.4s.
   */
  BASE_IGNITION_CHANCE: 0.15,

  // --- Burn duration ---

  /**
   * Minimum burn time in seconds.
   * Actual burn time = BASE_BURN_DURATION + (1 - flammability) * FLAMMABILITY_DURATION_SCALE.
   */
  BASE_BURN_DURATION: 3.0,

  /**
   * Additional burn time scaled inversely with flammability.
   * High flammability burns shorter; low flammability burns longer.
   *
   * Examples at 60 Hz:
   *   fuel    (1.0):  3 + 0.0*8 = 3.0s
   *   fabric  (0.95): 3 + 0.05*8 = 3.4s
   *   wood    (0.9):  3 + 0.1*8 = 3.8s
   *   tire    (0.4):  3 + 0.6*8 = 7.8s
   */
  FLAMMABILITY_DURATION_SCALE: 8.0,

  // --- Fuel overrides ---

  /** Burn duration override for fuel-category objects (seconds). */
  FUEL_BURN_DURATION: 2.0,

  /** Damage multiplier for fuel-category burning objects. */
  FUEL_DAMAGE_MULTIPLIER: 2.0,

  // --- AoE damage ---

  /** Radius (pixels) for fire area-of-effect damage. */
  DAMAGE_RADIUS: 48,

  /** Base damage per second at distance 0. */
  BASE_DAMAGE_PER_SECOND: 8,

  /** Damage multiplier at max radius edge (linear falloff from 1.0). */
  DAMAGE_FALLOFF: 0.5,

  /** Ticks between damage applications (6 ticks = 10 Hz at 60 Hz). */
  DAMAGE_TICK_INTERVAL: 6,

  // --- Visual ---

  /** Orange-red tint colour for burning sprites (0xRRGGBB). */
  BURN_TINT_COLOR: 0xff4500,

  /** Oscillation rate for tint pulsing (cycles per second). */
  BURN_TINT_PULSE_RATE: 3.0,

  // --- Fire light ---

  /** Light radius (pixels) erased from darkness overlay at burning objects. */
  FIRE_LIGHT_RADIUS: 80,
} as const;
