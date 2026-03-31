/**
 * Camera system constants and tuning parameters.
 *
 * Controls follow behavior, screen shake, zoom, look-ahead, and
 * phase-dependent camera adjustments. All values are in pixels
 * and seconds unless noted otherwise.
 *
 * NO React imports — this is pure TypeScript.
 */

export const CAMERA = {
  // --- Follow ---

  /** Lerp factor for camera following player (0-1, higher = snappier). */
  FOLLOW_LERP: 0.08,

  // --- Look-ahead ---

  /** Maximum look-ahead distance in pixels. */
  LOOK_AHEAD_DISTANCE: 48,

  /** Lerp factor for look-ahead offset smoothing (slower than follow). */
  LOOK_AHEAD_LERP: 0.04,

  // --- Screen shake ---

  /** Exponential decay rate per second (higher = faster fade). */
  SHAKE_DECAY_RATE: 5.0,

  /** Minimum intensity below which shake is zeroed out. */
  SHAKE_MIN_THRESHOLD: 0.1,

  /** Shake intensity in pixels for explosion events. */
  EXPLOSION_SHAKE_INTENSITY: 8,

  /** Shake intensity in pixels for player-hit events. */
  PLAYER_HIT_SHAKE_INTENSITY: 4,

  /** Shake intensity in pixels for barricade-broken events. */
  BARRICADE_BREAK_SHAKE_INTENSITY: 3,

  // --- Zoom ---

  /** Default zoom level. */
  DEFAULT_ZOOM: 1.0,

  /** Minimum zoom (zoomed out, more overview). */
  MIN_ZOOM: 0.5,

  /** Maximum zoom (zoomed in, closer). */
  MAX_ZOOM: 2.0,

  /** Zoom change per scroll wheel tick. */
  ZOOM_STEP: 0.1,

  /** Lerp factor for smooth zoom interpolation. */
  ZOOM_LERP: 0.06,

  /** Additional zoom applied during night phase for claustrophobic tension. */
  NIGHT_ZOOM_BONUS: 0.15,

  /** Lerp factor for night zoom transition (slow, atmospheric). */
  PHASE_ZOOM_LERP: 0.02,
} as const;
