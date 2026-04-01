import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  saveRun,
  loadRunHistory,
  getLeaderboard,
  getLifetimeStats,
  clearAllRuns,
  computeLifetimeFromRuns,
  _resetDBConnection,
} from "./persistence";
import type { CompletedRun } from "@/types/persistence";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRun(overrides: Partial<CompletedRun> = {}): CompletedRun {
  return {
    id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    seed: "test-seed",
    completedAt: Date.now(),
    elapsedTotal: 300,
    dayNumber: 2,
    waveNumber: 3,
    totalKills: 20,
    killsByType: { shambler: 15, runner: 5 },
    barricadesBuilt: 3,
    distanceTraveled: 5000,
    objectsUsed: 8,
    score: 2350,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(async () => {
  _resetDBConnection();
  // Clear stored data between tests
  try {
    await clearAllRuns();
  } catch {
    // DB may not exist yet on first test
  }
});

afterEach(() => {
  _resetDBConnection();
});

describe("saveRun + loadRunHistory", () => {
  it("saves and loads a single run", async () => {
    const run = makeRun({ id: "test-1", score: 1000 });
    await saveRun(run);

    const history = await loadRunHistory();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe("test-1");
    expect(history[0].score).toBe(1000);
  });

  it("returns runs in newest-first order", async () => {
    await saveRun(makeRun({ id: "old", completedAt: 1000 }));
    await saveRun(makeRun({ id: "new", completedAt: 2000 }));

    const history = await loadRunHistory();
    expect(history[0].id).toBe("new");
    expect(history[1].id).toBe("old");
  });

  it("limits history to 20 runs by pruning oldest", async () => {
    // Save 25 runs
    for (let i = 0; i < 25; i++) {
      await saveRun(makeRun({
        id: `run-${i}`,
        completedAt: 1000 + i,
      }));
    }

    const history = await loadRunHistory();
    expect(history.length).toBeLessThanOrEqual(20);

    // The 5 oldest should have been pruned
    const ids = history.map((r) => r.id);
    expect(ids).not.toContain("run-0");
    expect(ids).not.toContain("run-4");
    // The newest should still be there
    expect(ids).toContain("run-24");
  });
});

describe("getLeaderboard", () => {
  it("returns runs sorted by score descending", async () => {
    await saveRun(makeRun({ id: "low", score: 100 }));
    await saveRun(makeRun({ id: "high", score: 9000 }));
    await saveRun(makeRun({ id: "mid", score: 5000 }));

    const leaderboard = await getLeaderboard();
    expect(leaderboard[0].id).toBe("high");
    expect(leaderboard[1].id).toBe("mid");
    expect(leaderboard[2].id).toBe("low");
  });

  it("limits leaderboard to 10 entries", async () => {
    for (let i = 0; i < 15; i++) {
      await saveRun(makeRun({ id: `run-${i}`, score: i * 100 }));
    }

    const leaderboard = await getLeaderboard();
    expect(leaderboard).toHaveLength(10);
  });
});

describe("getLifetimeStats", () => {
  it("returns empty stats when no runs exist", async () => {
    const stats = await getLifetimeStats();
    expect(stats.totalRuns).toBe(0);
    expect(stats.totalKills).toBe(0);
  });

  it("aggregates stats across multiple runs", async () => {
    await saveRun(makeRun({
      id: "r1",
      totalKills: 10,
      barricadesBuilt: 2,
      elapsedTotal: 300,
      dayNumber: 2,
      score: 2310,
      killsByType: { shambler: 8, runner: 2 },
    }));
    await saveRun(makeRun({
      id: "r2",
      totalKills: 30,
      barricadesBuilt: 5,
      elapsedTotal: 600,
      dayNumber: 4,
      score: 4630,
      killsByType: { shambler: 20, brute: 10 },
    }));

    const stats = await getLifetimeStats();
    expect(stats.totalRuns).toBe(2);
    expect(stats.totalKills).toBe(40);
    expect(stats.totalBarricadesBuilt).toBe(7);
    expect(stats.totalTimePlayed).toBe(900);
    expect(stats.longestRunTime).toBe(600);
    expect(stats.highestDay).toBe(4);
    expect(stats.highestScore).toBe(4630);
    expect(stats.killsByType.shambler).toBe(28);
    expect(stats.killsByType.runner).toBe(2);
    expect(stats.killsByType.brute).toBe(10);
  });
});

describe("clearAllRuns", () => {
  it("removes all stored runs", async () => {
    await saveRun(makeRun({ id: "r1" }));
    await saveRun(makeRun({ id: "r2" }));

    await clearAllRuns();

    const history = await loadRunHistory();
    expect(history).toHaveLength(0);
  });
});

describe("computeLifetimeFromRuns (pure)", () => {
  it("computes correctly from an array of runs", () => {
    const runs: CompletedRun[] = [
      makeRun({ totalKills: 5, elapsedTotal: 100, dayNumber: 1, score: 1100 }),
      makeRun({ totalKills: 15, elapsedTotal: 400, dayNumber: 3, score: 3400 }),
    ];

    const stats = computeLifetimeFromRuns(runs);
    expect(stats.totalRuns).toBe(2);
    expect(stats.totalKills).toBe(20);
    expect(stats.longestRunTime).toBe(400);
    expect(stats.highestDay).toBe(3);
    expect(stats.highestScore).toBe(3400);
  });

  it("returns empty stats for empty array", () => {
    const stats = computeLifetimeFromRuns([]);
    expect(stats.totalRuns).toBe(0);
  });
});
