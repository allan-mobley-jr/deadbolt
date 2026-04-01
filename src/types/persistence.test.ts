import { describe, it, expect } from "vitest";
import {
  computeRunScore,
  EMPTY_LIFETIME_STATS,
} from "./persistence";

describe("computeRunScore", () => {
  it("computes score from day, kills, barricades, and time", () => {
    const score = computeRunScore({
      dayNumber: 3,
      totalKills: 42,
      barricadesBuilt: 5,
      elapsedTotal: 600.7,
    });
    // 3*1000 + 42 + 5*10 + 600 = 3692
    expect(score).toBe(3692);
  });

  it("returns 0 for zeroed stats (except day 0 edge)", () => {
    const score = computeRunScore({
      dayNumber: 0,
      totalKills: 0,
      barricadesBuilt: 0,
      elapsedTotal: 0,
    });
    expect(score).toBe(0);
  });

  it("weights days most heavily", () => {
    const moreKills = computeRunScore({
      dayNumber: 1,
      totalKills: 100,
      barricadesBuilt: 0,
      elapsedTotal: 0,
    });
    const moredays = computeRunScore({
      dayNumber: 2,
      totalKills: 0,
      barricadesBuilt: 0,
      elapsedTotal: 0,
    });
    expect(moredays).toBeGreaterThan(moreKills);
  });

  it("floors elapsed time (no fractional seconds in score)", () => {
    const score = computeRunScore({
      dayNumber: 1,
      totalKills: 0,
      barricadesBuilt: 0,
      elapsedTotal: 99.9,
    });
    expect(score).toBe(1099); // 1000 + 99
  });
});

describe("EMPTY_LIFETIME_STATS", () => {
  it("has all fields zeroed", () => {
    expect(EMPTY_LIFETIME_STATS.totalRuns).toBe(0);
    expect(EMPTY_LIFETIME_STATS.totalKills).toBe(0);
    expect(EMPTY_LIFETIME_STATS.totalBarricadesBuilt).toBe(0);
    expect(EMPTY_LIFETIME_STATS.totalTimePlayed).toBe(0);
    expect(EMPTY_LIFETIME_STATS.longestRunTime).toBe(0);
    expect(EMPTY_LIFETIME_STATS.highestDay).toBe(0);
    expect(EMPTY_LIFETIME_STATS.highestScore).toBe(0);
  });

  it("has empty killsByType", () => {
    expect(EMPTY_LIFETIME_STATS.killsByType).toEqual({});
  });
});
