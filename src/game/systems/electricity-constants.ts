/**
 * Electricity system constants and tuning parameters.
 *
 * All timing values are in seconds unless noted otherwise.
 * Tick intervals are in fixed ticks (60 Hz = 1 tick per ~16.67ms).
 *
 * NO React imports — this is pure TypeScript.
 */

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

export const ELECTRICITY = {
  // --- Chain detection ---

  /**
   * Ticks between full chain recalculation (6 ticks = 0.1s at 60 Hz).
   * Chains only need recalculation when topology changes (objects moved,
   * placed, or destroyed), but polling at 10 Hz is cheap and handles
   * all topology changes implicitly.
   */
  CHAIN_RECALC_INTERVAL: 6,

  // --- Battery ---

  /** Initial charge for a fresh car battery (arbitrary units). */
  INITIAL_CHARGE: 100,

  /** Maximum charge capacity for a car battery. */
  MAX_CHARGE: 100,

  /**
   * Base drain rate in charge units per second (battery alone in chain).
   * A battery with no connected objects does not drain.
   */
  BASE_DRAIN_RATE: 1.0,

  /**
   * Additional drain per connected object in the chain (per second).
   * A chain of 5 objects drains at: BASE + 5 * PER_OBJECT = 3.5 units/s.
   * At that rate, a fully charged battery lasts ~28.6 seconds.
   */
  PER_OBJECT_DRAIN_RATE: 0.5,

  // --- Damage ---

  /**
   * Contact radius (pixels) for detecting zombies/player touching
   * electrified objects. Approximates the sum of half-sizes for a
   * typical object (16px) and zombie/player (20-24px).
   */
  CONTACT_RADIUS: 32,

  /** Ticks between damage applications (6 ticks = 10 Hz at 60 Hz). */
  DAMAGE_TICK_INTERVAL: 6,

  /** Base damage per second from contact with electrified objects. */
  BASE_DAMAGE_PER_SECOND: 12,

  /**
   * Damage scaling factor for object conductivity.
   * Actual damage = BASE_DAMAGE_PER_SECOND * conductivity * CONDUCTIVITY_DAMAGE_SCALE.
   * Higher conductivity objects deal more shock damage.
   */
  CONDUCTIVITY_DAMAGE_SCALE: 1.0,

  // --- Stagger ---

  /**
   * Duration of electricity-induced stagger on zombies (seconds).
   * Slightly longer than melee stagger to reward trap placement.
   * Brutes use their own shorter stagger duration instead (min of the two).
   */
  ELECTROCUTION_STAGGER_DURATION: 0.8,

  // --- Visual ---

  /** Blue tint colour for electrified sprites (0xRRGGBB). */
  ELECTRIFIED_TINT_COLOR: 0x4488ff,

  /**
   * Oscillation rate for electrified tint pulsing (cycles per second).
   * Faster than fire to distinguish visually.
   */
  ELECTRIFIED_TINT_PULSE_RATE: 5.0,

  // --- Events ---

  /**
   * Ticks between battery charge-changed event emissions (30 ticks = 0.5s).
   * Throttled to avoid flooding the event bus with continuous drain updates.
   */
  CHARGE_EVENT_INTERVAL: 30,
} as const;
