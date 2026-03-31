import { describe, it, expect } from "vitest";
import { NOISE } from "./noise-constants";

describe("NOISE constants", () => {
  // --- Intensities are in [0, 1] ---

  it("explosion intensity is in valid range", () => {
    expect(NOISE.EXPLOSION_INTENSITY).toBeGreaterThan(0);
    expect(NOISE.EXPLOSION_INTENSITY).toBeLessThanOrEqual(1);
  });

  it("barricade break intensity is in valid range", () => {
    expect(NOISE.BARRICADE_BREAK_INTENSITY).toBeGreaterThan(0);
    expect(NOISE.BARRICADE_BREAK_INTENSITY).toBeLessThanOrEqual(1);
  });

  it("combat hit intensity is in valid range", () => {
    expect(NOISE.COMBAT_HIT_INTENSITY).toBeGreaterThan(0);
    expect(NOISE.COMBAT_HIT_INTENSITY).toBeLessThanOrEqual(1);
  });

  it("drag intensity is in valid range", () => {
    expect(NOISE.DRAG_INTENSITY).toBeGreaterThan(0);
    expect(NOISE.DRAG_INTENSITY).toBeLessThanOrEqual(1);
  });

  it("footstep intensity is in valid range", () => {
    expect(NOISE.FOOTSTEP_INTENSITY).toBeGreaterThan(0);
    expect(NOISE.FOOTSTEP_INTENSITY).toBeLessThanOrEqual(1);
  });

  // --- Intensities are ordered from loudest to quietest ---

  it("intensity ordering: explosion > barricade > combat > drag > footstep", () => {
    expect(NOISE.EXPLOSION_INTENSITY).toBeGreaterThan(NOISE.BARRICADE_BREAK_INTENSITY);
    expect(NOISE.BARRICADE_BREAK_INTENSITY).toBeGreaterThan(NOISE.COMBAT_HIT_INTENSITY);
    expect(NOISE.COMBAT_HIT_INTENSITY).toBeGreaterThan(NOISE.DRAG_INTENSITY);
    expect(NOISE.DRAG_INTENSITY).toBeGreaterThan(NOISE.FOOTSTEP_INTENSITY);
  });

  // --- Radii are positive ---

  it("all noise radii are positive", () => {
    expect(NOISE.BARRICADE_BREAK_RADIUS).toBeGreaterThan(0);
    expect(NOISE.COMBAT_HIT_RADIUS).toBeGreaterThan(0);
    expect(NOISE.FOOTSTEP_RADIUS).toBeGreaterThan(0);
  });

  // --- Decay durations are positive ---

  it("all decay durations are positive", () => {
    expect(NOISE.DEFAULT_DECAY_DURATION).toBeGreaterThan(0);
    expect(NOISE.EXPLOSION_DECAY_DURATION).toBeGreaterThan(0);
    expect(NOISE.BARRICADE_BREAK_DECAY_DURATION).toBeGreaterThan(0);
    expect(NOISE.FOOTSTEP_DECAY_DURATION).toBeGreaterThan(0);
    expect(NOISE.DRAG_DECAY_DURATION).toBeGreaterThan(0);
  });

  // --- Hearing ranges are positive and runner > default ---

  it("hearing ranges are positive", () => {
    expect(NOISE.HEARING_RANGE_DEFAULT).toBeGreaterThan(0);
    expect(NOISE.HEARING_RANGE_RUNNER).toBeGreaterThan(0);
  });

  it("runner hearing range is larger than default", () => {
    expect(NOISE.HEARING_RANGE_RUNNER).toBeGreaterThan(NOISE.HEARING_RANGE_DEFAULT);
  });

  // --- Footstep throttling ---

  it("footstep speed threshold is positive", () => {
    expect(NOISE.FOOTSTEP_SPEED_THRESHOLD).toBeGreaterThan(0);
  });

  it("footstep tick interval is at least 1", () => {
    expect(NOISE.FOOTSTEP_TICK_INTERVAL).toBeGreaterThanOrEqual(1);
  });

  // --- UI threshold ---

  it("UI intensity threshold filters out footsteps and drag", () => {
    expect(NOISE.UI_INTENSITY_THRESHOLD).toBeGreaterThan(NOISE.DRAG_INTENSITY);
    expect(NOISE.UI_INTENSITY_THRESHOLD).toBeGreaterThan(NOISE.FOOTSTEP_INTENSITY);
  });

  it("UI intensity threshold allows combat, barricade, and explosion through", () => {
    expect(NOISE.COMBAT_HIT_INTENSITY).toBeGreaterThanOrEqual(NOISE.UI_INTENSITY_THRESHOLD);
    expect(NOISE.BARRICADE_BREAK_INTENSITY).toBeGreaterThanOrEqual(NOISE.UI_INTENSITY_THRESHOLD);
    expect(NOISE.EXPLOSION_INTENSITY).toBeGreaterThanOrEqual(NOISE.UI_INTENSITY_THRESHOLD);
  });
});
