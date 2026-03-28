/**
 * Tunable constants for the day/night cycle and lighting systems.
 *
 * All timing values are in seconds. The escalation curve makes each
 * successive day shorter and each night longer, creating increasing
 * pressure on the player.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

// ---------------------------------------------------------------------------
// Phase type
// ---------------------------------------------------------------------------

/** The four phases of the day/night cycle. */
export type DayPhase = "day" | "dusk" | "night" | "dawn";

// ---------------------------------------------------------------------------
// Timing constants
// ---------------------------------------------------------------------------

/** Per-day timing entry: day and night durations in seconds. */
export interface DayNightTiming {
  readonly day: number;
  readonly night: number;
}

export const DAY_NIGHT = {
  /**
   * Escalation curve indexed by day number (0-based offset from day 1).
   * Day 4+ all use the last entry.
   */
  ESCALATION: [
    { day: 300, night: 90 },  // Day 1: 5 min day, 1.5 min night
    { day: 240, night: 120 }, // Day 2: 4 min day, 2 min night
    { day: 180, night: 150 }, // Day 3: 3 min day, 2.5 min night
    { day: 120, night: 180 }, // Day 4+: 2 min day, 3 min night
  ] as readonly DayNightTiming[],

  /** Dusk warning transition duration in seconds. */
  DUSK_DURATION: 15,

  /** Dawn transition duration in seconds. */
  DAWN_DURATION: 15,

  /** Phase the game starts in. */
  INITIAL_PHASE: "day" as DayPhase,

  /** Starting day number. */
  INITIAL_DAY: 1,

  /**
   * How often the clock-tick event fires, in fixed ticks.
   * 15 ticks at 60 Hz ≈ 4 Hz — fast enough for a HUD timer.
   */
  TICK_EVENT_INTERVAL: 15,
} as const;

// ---------------------------------------------------------------------------
// Lighting constants
// ---------------------------------------------------------------------------

export const LIGHTING = {
  /** Overlay alpha during full daylight (no darkness). */
  DAY_OVERLAY_ALPHA: 0,

  /** Overlay alpha during full night. */
  NIGHT_OVERLAY_ALPHA: 0.7,

  /** Tint color for the night overlay (deep blue-black). */
  NIGHT_TINT: 0x0a0a2e,

  /** Tint color for dusk transition (warm purple hint). */
  DUSK_TINT: 0x1a0a2e,

  /** Tint color for dawn transition (warm amber hint). */
  DAWN_TINT: 0x1e1a0a,

  /** Player visibility radius in pixels during night. */
  VISIBILITY_RADIUS: 160,

  /** Soft edge fade distance in pixels at the visibility boundary. */
  VISIBILITY_EDGE_SOFTNESS: 40,

  /** Depth value for the lighting overlay (below debug text). */
  OVERLAY_DEPTH: 9999,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the duration of a given phase for a given day number.
 *
 * Day and night durations come from the escalation curve.
 * Dusk and dawn have fixed durations.
 */
export function getPhaseDuration(phase: DayPhase, dayNumber: number): number {
  const idx = Math.max(0, Math.min(dayNumber - 1, DAY_NIGHT.ESCALATION.length - 1));
  const entry = DAY_NIGHT.ESCALATION[idx];
  switch (phase) {
    case "day":
      return entry.day;
    case "dusk":
      return DAY_NIGHT.DUSK_DURATION;
    case "night":
      return entry.night;
    case "dawn":
      return DAY_NIGHT.DAWN_DURATION;
  }
}

/**
 * Get the next phase in the cycle. Dawn wraps back to day.
 */
export function getNextPhase(phase: DayPhase): DayPhase {
  switch (phase) {
    case "day":
      return "dusk";
    case "dusk":
      return "night";
    case "night":
      return "dawn";
    case "dawn":
      return "day";
  }
}
