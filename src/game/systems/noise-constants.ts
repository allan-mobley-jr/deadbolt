/**
 * Noise propagation system constants and tuning parameters.
 *
 * Controls noise source intensities, radii, decay rates, and zombie
 * hearing ranges. Tweak these values to balance how much noise affects
 * zombie pathfinding behavior.
 *
 * NO React imports — this is pure TypeScript.
 */

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

export const NOISE = {
  // --- Noise source intensities (0-1, higher = louder) ---

  /** Explosions are the loudest possible noise source. */
  EXPLOSION_INTENSITY: 1.0,

  /** A barricade breaking produces significant noise. */
  BARRICADE_BREAK_INTENSITY: 0.6,

  /** Melee combat hits produce moderate noise. */
  COMBAT_HIT_INTENSITY: 0.4,

  /** Dragging heavy objects produces low continuous noise. */
  DRAG_INTENSITY: 0.25,

  /** Player footsteps are barely audible except at very close range. */
  FOOTSTEP_INTENSITY: 0.1,

  // --- Noise source radii (pixels) ---

  /** Barricade destruction noise radius. */
  BARRICADE_BREAK_RADIUS: 300,

  /** Combat melee hit noise radius. */
  COMBAT_HIT_RADIUS: 150,

  /** Player footstep noise radius (very small). */
  FOOTSTEP_RADIUS: 80,

  // --- Decay durations (seconds) ---

  /** Default decay duration for noise events without an explicit duration. */
  DEFAULT_DECAY_DURATION: 2.0,

  /** Explosions linger longer in the noise map. */
  EXPLOSION_DECAY_DURATION: 4.0,

  /** Barricade break noise persists briefly. */
  BARRICADE_BREAK_DECAY_DURATION: 2.5,

  /** Combat hit noise persists briefly. */
  COMBAT_HIT_DECAY_DURATION: 1.5,

  /** Footsteps fade almost immediately. */
  FOOTSTEP_DECAY_DURATION: 0.5,

  /** Drag noise is very brief since it's emitted continuously. */
  DRAG_DECAY_DURATION: 0.3,

  // --- Zombie hearing ranges (pixels) ---

  /** Hearing range for shamblers, brutes, and horde zombies. */
  HEARING_RANGE_DEFAULT: 300,

  /** Runners have significantly better hearing. */
  HEARING_RANGE_RUNNER: 500,

  // --- Footstep throttling ---

  /**
   * Minimum player speed (pixels/sec) required to generate footstep noise.
   * Below this threshold, the player is considered stationary.
   */
  FOOTSTEP_SPEED_THRESHOLD: 10,

  /**
   * Minimum ticks between footstep noise emissions (throttle).
   * At 60Hz, 10 ticks = ~167ms = ~6 footstep events per second.
   */
  FOOTSTEP_TICK_INTERVAL: 10,

  // --- UI bridge threshold ---

  /**
   * Minimum noise intensity to forward to the UI for directional indicators.
   * Prevents flooding the UI with footstep/drag noise.
   */
  UI_INTENSITY_THRESHOLD: 0.3,
} as const;
