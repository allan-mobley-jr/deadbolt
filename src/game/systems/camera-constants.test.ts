import { describe, it, expect } from "vitest";
import { CAMERA } from "./camera-constants";

describe("CAMERA constants", () => {
  it("follow lerp is between 0 and 1", () => {
    expect(CAMERA.FOLLOW_LERP).toBeGreaterThan(0);
    expect(CAMERA.FOLLOW_LERP).toBeLessThanOrEqual(1);
  });

  it("look-ahead distance is positive", () => {
    expect(CAMERA.LOOK_AHEAD_DISTANCE).toBeGreaterThan(0);
  });

  it("look-ahead lerp is between 0 and 1", () => {
    expect(CAMERA.LOOK_AHEAD_LERP).toBeGreaterThan(0);
    expect(CAMERA.LOOK_AHEAD_LERP).toBeLessThanOrEqual(1);
  });

  it("shake decay rate is positive", () => {
    expect(CAMERA.SHAKE_DECAY_RATE).toBeGreaterThan(0);
  });

  it("shake intensities are positive", () => {
    expect(CAMERA.EXPLOSION_SHAKE_INTENSITY).toBeGreaterThan(0);
    expect(CAMERA.PLAYER_HIT_SHAKE_INTENSITY).toBeGreaterThan(0);
    expect(CAMERA.BARRICADE_BREAK_SHAKE_INTENSITY).toBeGreaterThan(0);
  });

  it("zoom range is valid (min < default < max)", () => {
    expect(CAMERA.MIN_ZOOM).toBeGreaterThan(0);
    expect(CAMERA.MIN_ZOOM).toBeLessThan(CAMERA.DEFAULT_ZOOM);
    expect(CAMERA.DEFAULT_ZOOM).toBeLessThan(CAMERA.MAX_ZOOM);
  });

  it("zoom step is positive", () => {
    expect(CAMERA.ZOOM_STEP).toBeGreaterThan(0);
  });

  it("zoom lerp is between 0 and 1", () => {
    expect(CAMERA.ZOOM_LERP).toBeGreaterThan(0);
    expect(CAMERA.ZOOM_LERP).toBeLessThanOrEqual(1);
  });

  it("night zoom bonus is positive", () => {
    expect(CAMERA.NIGHT_ZOOM_BONUS).toBeGreaterThan(0);
  });

  it("phase zoom lerp is between 0 and 1", () => {
    expect(CAMERA.PHASE_ZOOM_LERP).toBeGreaterThan(0);
    expect(CAMERA.PHASE_ZOOM_LERP).toBeLessThanOrEqual(1);
  });
});
