import { describe, it, expect, beforeEach } from "vitest";
import { useGameStore } from "./useGameStore";

describe("useGameStore", () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it("has correct initial state", () => {
    const state = useGameStore.getState();
    expect(state.phase).toBe("day");
    expect(state.dayNumber).toBe(1);
    expect(state.timeRemainingInPhase).toBe(300);
    expect(state.phaseDuration).toBe(300);
    expect(state.elapsedTotal).toBe(0);
    expect(state.waveActive).toBe(false);
    expect(state.waveNumber).toBe(0);
    expect(state.zombiesInWave).toBe(0);
    expect(state.totalKills).toBe(0);
    expect(state.killsByType).toEqual({});
    expect(state.paused).toBe(false);
  });

  describe("updateClock", () => {
    it("updates all clock fields", () => {
      useGameStore.getState().updateClock("dusk", 2, 10, 15, 590);
      const state = useGameStore.getState();
      expect(state.phase).toBe("dusk");
      expect(state.dayNumber).toBe(2);
      expect(state.timeRemainingInPhase).toBe(10);
      expect(state.phaseDuration).toBe(15);
      expect(state.elapsedTotal).toBe(590);
    });
  });

  describe("wave actions", () => {
    it("marks wave as active on setWaveStarted", () => {
      useGameStore.getState().setWaveStarted(3, 20);
      const state = useGameStore.getState();
      expect(state.waveActive).toBe(true);
      expect(state.waveNumber).toBe(3);
      expect(state.zombiesInWave).toBe(20);
    });

    it("marks wave as inactive on setWaveEnded", () => {
      useGameStore.getState().setWaveStarted(1, 10);
      useGameStore.getState().setWaveEnded();
      expect(useGameStore.getState().waveActive).toBe(false);
    });
  });

  describe("setTotalKills", () => {
    it("sets totalKills to the authoritative value", () => {
      useGameStore.getState().setTotalKills(5);
      expect(useGameStore.getState().totalKills).toBe(5);
    });

    it("overwrites previous value", () => {
      useGameStore.getState().setTotalKills(3);
      useGameStore.getState().setTotalKills(7);
      expect(useGameStore.getState().totalKills).toBe(7);
    });
  });

  describe("incrementKillsByType", () => {
    it("increments count for a single variant from zero", () => {
      useGameStore.getState().incrementKillsByType("shambler");
      expect(useGameStore.getState().killsByType.shambler).toBe(1);
    });

    it("increments count for a variant that already has kills", () => {
      useGameStore.getState().incrementKillsByType("runner");
      useGameStore.getState().incrementKillsByType("runner");
      expect(useGameStore.getState().killsByType.runner).toBe(2);
    });

    it("tracks multiple variants independently", () => {
      useGameStore.getState().incrementKillsByType("shambler");
      useGameStore.getState().incrementKillsByType("shambler");
      useGameStore.getState().incrementKillsByType("runner");

      const { killsByType } = useGameStore.getState();
      expect(killsByType.shambler).toBe(2);
      expect(killsByType.runner).toBe(1);
      expect(killsByType.brute).toBeUndefined();
      expect(killsByType.horde).toBeUndefined();
    });

    it("reset clears killsByType to empty object", () => {
      useGameStore.getState().incrementKillsByType("shambler");
      useGameStore.getState().incrementKillsByType("runner");

      useGameStore.getState().reset();

      expect(useGameStore.getState().killsByType).toEqual({});
    });
  });

  describe("setPaused", () => {
    it("sets paused to true", () => {
      useGameStore.getState().setPaused(true);
      expect(useGameStore.getState().paused).toBe(true);
    });

    it("sets paused back to false", () => {
      useGameStore.getState().setPaused(true);
      useGameStore.getState().setPaused(false);
      expect(useGameStore.getState().paused).toBe(false);
    });
  });

  describe("reset", () => {
    it("returns all fields to initial values", () => {
      useGameStore.getState().updateClock("night", 5, 50, 180, 1500);
      useGameStore.getState().setWaveStarted(4, 30);
      useGameStore.getState().setTotalKills(42);
      useGameStore.getState().incrementKillsByType("shambler");
      useGameStore.getState().setPaused(true);

      useGameStore.getState().reset();

      const state = useGameStore.getState();
      expect(state.phase).toBe("day");
      expect(state.dayNumber).toBe(1);
      expect(state.waveActive).toBe(false);
      expect(state.totalKills).toBe(0);
      expect(state.killsByType).toEqual({});
      expect(state.paused).toBe(false);
    });
  });

  describe("subscribeWithSelector", () => {
    it("supports selector-based subscriptions", () => {
      const phases: string[] = [];
      const unsub = useGameStore.subscribe(
        (state) => state.phase,
        (phase) => phases.push(phase),
      );

      useGameStore.getState().updateClock("dusk", 1, 10, 15, 285);
      useGameStore.getState().updateClock("night", 1, 90, 90, 300);

      expect(phases).toEqual(["dusk", "night"]);
      unsub();
    });

    it("does not fire when selected value is unchanged", () => {
      const calls: number[] = [];
      const unsub = useGameStore.subscribe(
        (state) => state.dayNumber,
        (day) => calls.push(day),
      );

      // Same day number, different time remaining
      useGameStore.getState().updateClock("day", 1, 200, 300, 100);
      useGameStore.getState().updateClock("day", 1, 150, 300, 150);

      expect(calls).toHaveLength(0);
      unsub();
    });
  });
});
