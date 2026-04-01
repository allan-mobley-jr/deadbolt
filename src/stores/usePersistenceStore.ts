/**
 * Zustand store caching IndexedDB persistence data in memory.
 *
 * Provides synchronous access to run history, leaderboard, and
 * lifetime stats for React components. Data is loaded from IndexedDB
 * once on game boot and updated when new runs complete.
 *
 * This store does NOT use subscribeWithSelector because it is only
 * read by UI components, never by the game event bus bridge.
 */

import { create } from "zustand";
import type { CompletedRun, LifetimeStats } from "@/types/persistence";
import { EMPTY_LIFETIME_STATS, computeRunScore } from "@/types/persistence";
import { generateRunId } from "@/lib/ids";
import {
  saveRun,
  loadRunHistory,
  getLeaderboard,
  getLifetimeStats,
  isIndexedDBAvailable,
} from "@/lib/persistence";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface PersistenceStoreState {
  /** Whether data has been loaded from IndexedDB. */
  loaded: boolean;
  /** Whether IndexedDB is available in this environment. */
  available: boolean;
  /** Error message from the most recent load attempt, or null. */
  loadError: string | null;
  /** Error message from the most recent save attempt, or null. */
  saveError: string | null;
  /** Recent completed runs (newest first, max 20). */
  runHistory: CompletedRun[];
  /** Top runs by score (highest first, max 10). */
  leaderboard: CompletedRun[];
  /** Aggregated lifetime statistics. */
  lifetimeStats: LifetimeStats;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface PersistenceStoreActions {
  /** Load all persistence data from IndexedDB. Call once on game boot. */
  loadFromDB: () => Promise<void>;
  /**
   * Record a completed run: save to IndexedDB and update cached state.
   *
   * Accepts the run stats from Zustand stores (same data the death
   * screen displays). Computes the composite score and persists.
   */
  recordRun: (stats: {
    seed: string;
    elapsedTotal: number;
    dayNumber: number;
    waveNumber: number;
    totalKills: number;
    killsByType: Partial<Record<string, number>>;
    barricadesBuilt: number;
    distanceTraveled: number;
    objectsUsed: number;
  }) => Promise<void>;
  /** Dismiss the save error banner. */
  clearSaveError: () => void;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: PersistenceStoreState = {
  loaded: false,
  available: false,
  loadError: null,
  saveError: null,
  runHistory: [],
  leaderboard: [],
  lifetimeStats: { ...EMPTY_LIFETIME_STATS },
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePersistenceStore = create<
  PersistenceStoreState & PersistenceStoreActions
>()((set) => ({
  ...initialState,

  loadFromDB: async () => {
    if (!isIndexedDBAvailable()) {
      set({ loaded: true, available: false });
      return;
    }

    try {
      const [runHistory, leaderboard, lifetimeStats] = await Promise.all([
        loadRunHistory(),
        getLeaderboard(),
        getLifetimeStats(),
      ]);

      set({
        loaded: true,
        available: true,
        loadError: null,
        runHistory,
        leaderboard,
        lifetimeStats,
      });
    } catch (err) {
      console.error("[PersistenceStore] Failed to load from IndexedDB:", err);
      set({
        loaded: true,
        available: false,
        loadError: "Failed to load saved data. Your run history may be unavailable.",
      });
    }
  },

  recordRun: async (stats) => {
    const run: CompletedRun = {
      id: generateRunId(),
      seed: stats.seed,
      completedAt: Date.now(),
      elapsedTotal: stats.elapsedTotal,
      dayNumber: stats.dayNumber,
      waveNumber: stats.waveNumber,
      totalKills: stats.totalKills,
      killsByType: stats.killsByType as CompletedRun["killsByType"],
      barricadesBuilt: stats.barricadesBuilt,
      distanceTraveled: stats.distanceTraveled,
      objectsUsed: stats.objectsUsed,
      score: computeRunScore(stats),
    };

    // Save to IndexedDB
    try {
      await saveRun(run);
      set({ saveError: null });
    } catch (err) {
      console.error("[PersistenceStore] Failed to save run:", err);
      set({ saveError: "This run may not have been saved." });
    }

    // Refresh cached data from DB
    try {
      const [runHistory, leaderboard, lifetimeStats] = await Promise.all([
        loadRunHistory(),
        getLeaderboard(),
        getLifetimeStats(),
      ]);

      set({ runHistory, leaderboard, lifetimeStats });
    } catch {
      // If refresh fails, at least add the run to the local cache
      set((state) => ({
        runHistory: [run, ...state.runHistory].slice(0, 20),
        leaderboard: [...state.leaderboard, run]
          .sort((a, b) => b.score - a.score)
          .slice(0, 10),
      }));
    }
  },

  clearSaveError: () => set({ saveError: null }),
}));
