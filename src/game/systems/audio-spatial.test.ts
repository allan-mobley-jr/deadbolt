import { describe, it, expect } from "vitest";
import {
  computeSpatialVolume,
  computeStereoPan,
  computeEffectiveVolume,
} from "./audio-spatial";
import { AUDIO } from "./audio-constants";

describe("computeSpatialVolume", () => {
  it("returns 1.0 when source is at listener position", () => {
    expect(computeSpatialVolume(100, 100, 100, 100)).toBe(1.0);
  });

  it("returns 1.0 when source is within reference distance", () => {
    expect(computeSpatialVolume(120, 100, 100, 100)).toBe(1.0);
  });

  it("returns 0.0 when source is at or beyond max range", () => {
    expect(
      computeSpatialVolume(100 + AUDIO.SPATIAL_MAX_RANGE, 100, 100, 100),
    ).toBe(0.0);
  });

  it("returns 0.0 when source is beyond max range", () => {
    expect(
      computeSpatialVolume(100 + AUDIO.SPATIAL_MAX_RANGE + 100, 100, 100, 100),
    ).toBe(0.0);
  });

  it("returns value between 0 and 1 at intermediate distances", () => {
    const vol = computeSpatialVolume(400, 100, 100, 100);
    expect(vol).toBeGreaterThan(0);
    expect(vol).toBeLessThan(1);
  });

  it("volume decreases with distance", () => {
    const close = computeSpatialVolume(200, 100, 100, 100);
    const far = computeSpatialVolume(500, 100, 100, 100);
    expect(close).toBeGreaterThan(far);
  });

  it("works with custom parameters", () => {
    const vol = computeSpatialVolume(200, 100, 100, 100, 400, 25, 1.0);
    expect(vol).toBeGreaterThan(0);
    expect(vol).toBeLessThan(1);
  });

  it("handles diagonal distance correctly", () => {
    // Distance from (0,0) to (300,400) is 500
    const vol = computeSpatialVolume(300, 400, 0, 0);
    expect(vol).toBeGreaterThan(0);
    expect(vol).toBeLessThan(1);
  });
});

describe("computeStereoPan", () => {
  it("returns 0 when source is directly above/below listener", () => {
    expect(computeStereoPan(100, 200, 100, 100)).toBe(0);
  });

  it("returns positive when source is to the right", () => {
    expect(computeStereoPan(500, 100, 100, 100)).toBeGreaterThan(0);
  });

  it("returns negative when source is to the left", () => {
    expect(computeStereoPan(-300, 100, 100, 100)).toBeLessThan(0);
  });

  it("clamps to +1 for far right sources", () => {
    expect(
      computeStereoPan(100 + AUDIO.SPATIAL_MAX_RANGE * 2, 100, 100, 100),
    ).toBe(1.0);
  });

  it("clamps to -1 for far left sources", () => {
    expect(
      computeStereoPan(100 - AUDIO.SPATIAL_MAX_RANGE * 2, 100, 100, 100),
    ).toBe(-1.0);
  });

  it("returns 0 when source is at listener", () => {
    expect(computeStereoPan(100, 100, 100, 100)).toBe(0);
  });
});

describe("computeEffectiveVolume", () => {
  it("multiplies all three factors", () => {
    expect(computeEffectiveVolume(0.5, 0.8, 0.6)).toBeCloseTo(0.24);
  });

  it("returns 0 when master volume is 0", () => {
    expect(computeEffectiveVolume(1.0, 0, 1.0)).toBe(0);
  });

  it("returns 0 when category volume is 0", () => {
    expect(computeEffectiveVolume(1.0, 1.0, 0)).toBe(0);
  });

  it("returns 0 when spatial volume is 0", () => {
    expect(computeEffectiveVolume(0, 1.0, 1.0)).toBe(0);
  });

  it("returns 1 when all factors are 1", () => {
    expect(computeEffectiveVolume(1.0, 1.0, 1.0)).toBe(1.0);
  });
});
