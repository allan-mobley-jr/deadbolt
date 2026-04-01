import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { usePersistenceStore } from "./usePersistenceStore";
import { _resetDBConnection, clearAllRuns } from "@/lib/persistence";
import { EMPTY_LIFETIME_STATS } from "@/types/persistence";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  _resetDBConnection();
  // Reset Zustand store to initial state
  usePersistenceStore.setState({
    loaded: false,
    available: false,
    runHistory: [],
    leaderboard: [],
    lifetimeStats: { ...EMPTY_LIFETIME_STATS, killsByType: {} },
  });
  // Clear any prior test data
  await clearAllRuns();
});

afterEach(() => {
  _resetDBConnection();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("usePersistenceStore", () => {
  describe("initial state", () => {
    it("starts unloaded with empty data", () => {
      const state = usePersistenceStore.getState();
      expect(state.loaded).toBe(false);
      expect(state.available).toBe(false);
      expect(state.runHistory).toEqual([]);
      expect(state.leaderboard).toEqual([]);
      expect(state.lifetimeStats.totalRuns).toBe(0);
    });
  });

  describe("loadFromDB", () => {
    it("loads and sets loaded/available flags", async () => {
      await usePersistenceStore.getState().loadFromDB();
      const state = usePersistenceStore.getState();
      expect(state.loaded).toBe(true);
      expect(state.available).toBe(true);
    });

    it("loads empty data when no runs exist", async () => {
      await usePersistenceStore.getState().loadFromDB();
      const state = usePersistenceStore.getState();
      expect(state.runHistory).toEqual([]);
      expect(state.leaderboard).toEqual([]);
      expect(state.lifetimeStats.totalRuns).toBe(0);
    });
  });

  describe("recordRun", () => {
    it("saves a run and updates cached state", async () => {
      await usePersistenceStore.getState().loadFromDB();

      await usePersistenceStore.getState().recordRun({
        seed: "test-seed",
        elapsedTotal: 300,
        dayNumber: 2,
        waveNumber: 3,
        totalKills: 20,
        killsByType: { shambler: 15, runner: 5 },
        barricadesBuilt: 3,
        distanceTraveled: 5000,
        objectsUsed: 8,
      });

      const state = usePersistenceStore.getState();
      expect(state.runHistory).toHaveLength(1);
      expect(state.leaderboard).toHaveLength(1);
      expect(state.lifetimeStats.totalRuns).toBe(1);
      expect(state.lifetimeStats.totalKills).toBe(20);
    });

    it("computes score for the run", async () => {
      await usePersistenceStore.getState().loadFromDB();

      await usePersistenceStore.getState().recordRun({
        seed: "test-seed",
        elapsedTotal: 600,
        dayNumber: 3,
        waveNumber: 4,
        totalKills: 42,
        killsByType: {},
        barricadesBuilt: 5,
        distanceTraveled: 8000,
        objectsUsed: 12,
      });

      const run = usePersistenceStore.getState().runHistory[0];
      // 3*1000 + 42 + 5*10 + 600 = 3692
      expect(run.score).toBe(3692);
    });

    it("accumulates lifetime stats across multiple runs", async () => {
      await usePersistenceStore.getState().loadFromDB();

      await usePersistenceStore.getState().recordRun({
        seed: "s1",
        elapsedTotal: 200,
        dayNumber: 1,
        waveNumber: 1,
        totalKills: 5,
        killsByType: { shambler: 5 },
        barricadesBuilt: 1,
        distanceTraveled: 2000,
        objectsUsed: 3,
      });

      await usePersistenceStore.getState().recordRun({
        seed: "s2",
        elapsedTotal: 500,
        dayNumber: 3,
        waveNumber: 4,
        totalKills: 30,
        killsByType: { runner: 10, brute: 20 },
        barricadesBuilt: 4,
        distanceTraveled: 7000,
        objectsUsed: 10,
      });

      const stats = usePersistenceStore.getState().lifetimeStats;
      expect(stats.totalRuns).toBe(2);
      expect(stats.totalKills).toBe(35);
      expect(stats.totalBarricadesBuilt).toBe(5);
      expect(stats.totalTimePlayed).toBe(700);
      expect(stats.longestRunTime).toBe(500);
      expect(stats.highestDay).toBe(3);
    });

    it("orders leaderboard by score descending", async () => {
      await usePersistenceStore.getState().loadFromDB();

      // Low score run
      await usePersistenceStore.getState().recordRun({
        seed: "s1",
        elapsedTotal: 100,
        dayNumber: 1,
        waveNumber: 1,
        totalKills: 2,
        killsByType: {},
        barricadesBuilt: 0,
        distanceTraveled: 1000,
        objectsUsed: 1,
      });

      // High score run
      await usePersistenceStore.getState().recordRun({
        seed: "s2",
        elapsedTotal: 900,
        dayNumber: 4,
        waveNumber: 5,
        totalKills: 50,
        killsByType: {},
        barricadesBuilt: 10,
        distanceTraveled: 10000,
        objectsUsed: 20,
      });

      const leaderboard = usePersistenceStore.getState().leaderboard;
      expect(leaderboard[0].score).toBeGreaterThan(leaderboard[1].score);
    });
  });
});
