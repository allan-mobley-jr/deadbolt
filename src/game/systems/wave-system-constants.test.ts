import { describe, it, expect } from "vitest";
import {
  getWaveConfig,
  STAT_MULTIPLIER_GROWTH,
  COUNT_SCALE_FACTOR,
} from "./wave-system-constants";

describe("wave-system-constants", () => {
  // -----------------------------------------------------------------------
  // getWaveConfig — per-night lookup
  // -----------------------------------------------------------------------

  describe("getWaveConfig", () => {
    it("Night 1: 5-8 shamblers, 1 direction, 2 pulses", () => {
      const cfg = getWaveConfig(1);
      expect(cfg.totalCount.min).toBe(5);
      expect(cfg.totalCount.max).toBe(8);
      expect(cfg.approachDirections).toBe(1);
      expect(cfg.pulseCount).toBe(2);
      expect(cfg.pulsePause).toBe(15);
      expect(cfg.spawnInterval).toBe(0.8);
      expect(cfg.statMultiplier).toBe(1.0);
    });

    it("Night 2: 12-18, 2 directions, 3 pulses", () => {
      const cfg = getWaveConfig(2);
      expect(cfg.totalCount.min).toBe(12);
      expect(cfg.totalCount.max).toBe(18);
      expect(cfg.approachDirections).toBe(2);
      expect(cfg.pulseCount).toBe(3);
      expect(cfg.pulsePause).toBe(12);
      expect(cfg.spawnInterval).toBe(0.6);
      expect(cfg.statMultiplier).toBe(1.0);
    });

    it("Night 3: 25-35, 4 directions, 4 pulses", () => {
      const cfg = getWaveConfig(3);
      expect(cfg.totalCount.min).toBe(25);
      expect(cfg.totalCount.max).toBe(35);
      expect(cfg.approachDirections).toBe(4);
      expect(cfg.pulseCount).toBe(4);
      expect(cfg.pulsePause).toBe(10);
      expect(cfg.spawnInterval).toBe(0.4);
      expect(cfg.statMultiplier).toBe(1.0);
    });

    it("Night 4: 40-55, 4 directions, 5 pulses, stat multiplier 1.15", () => {
      const cfg = getWaveConfig(4);
      expect(cfg.totalCount.min).toBe(40);
      expect(cfg.totalCount.max).toBe(55);
      expect(cfg.approachDirections).toBe(4);
      expect(cfg.pulseCount).toBe(5);
      expect(cfg.pulsePause).toBe(7);
      expect(cfg.spawnInterval).toBe(0.3);
      expect(cfg.statMultiplier).toBe(1.15);
    });

    it("Night 5 scales count from Night 4 baseline", () => {
      const cfg = getWaveConfig(5);
      // 1 overflow: count * 1.1^1
      expect(cfg.totalCount.min).toBe(Math.round(40 * COUNT_SCALE_FACTOR));
      expect(cfg.totalCount.max).toBe(Math.round(55 * COUNT_SCALE_FACTOR));
      // Stat multiplier: 1.15 + 0.05 * 1 = 1.2
      expect(cfg.statMultiplier).toBeCloseTo(1.15 + STAT_MULTIPLIER_GROWTH, 10);
    });

    it("Night 10 scales progressively", () => {
      const cfg = getWaveConfig(10);
      const overflow = 6; // 10 - 4
      const expectedMin = Math.round(40 * Math.pow(COUNT_SCALE_FACTOR, overflow));
      const expectedMax = Math.round(55 * Math.pow(COUNT_SCALE_FACTOR, overflow));
      expect(cfg.totalCount.min).toBe(expectedMin);
      expect(cfg.totalCount.max).toBe(expectedMax);
      expect(cfg.statMultiplier).toBeCloseTo(
        1.15 + STAT_MULTIPLIER_GROWTH * overflow,
        10,
      );
      // Timing stays at Night 4 values
      expect(cfg.pulseCount).toBe(5);
      expect(cfg.pulsePause).toBe(7);
      expect(cfg.spawnInterval).toBe(0.3);
    });

    it("returns a copy (not a reference to the internal table)", () => {
      const a = getWaveConfig(1);
      const b = getWaveConfig(1);
      expect(a).not.toBe(b);
      a.totalCount.min = 999;
      expect(b.totalCount.min).toBe(5);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe("edge cases", () => {
    it("invalid nightNumber defaults to 1", () => {
      const cfg = getWaveConfig(0);
      expect(cfg.totalCount.min).toBe(5);
    });

    it("negative nightNumber defaults to 1", () => {
      const cfg = getWaveConfig(-3);
      expect(cfg.totalCount.min).toBe(5);
    });

    it("NaN nightNumber defaults to 1", () => {
      const cfg = getWaveConfig(NaN);
      expect(cfg.totalCount.min).toBe(5);
    });

    it("Infinity nightNumber defaults to 1", () => {
      const cfg = getWaveConfig(Infinity);
      expect(cfg.totalCount.min).toBe(5);
    });
  });
});
