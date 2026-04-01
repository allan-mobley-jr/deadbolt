/**
 * Zustand store for game-wide display state.
 *
 * Holds clock/phase, wave, and aggregate stats derived from game events.
 * This is UI display state only — the authoritative game state lives in
 * ECS components and the ClockState object inside SceneContext.
 *
 * Uses subscribeWithSelector middleware so the bridge can subscribe to
 * individual fields and emit command events on change.
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { DayPhase } from "@/game/systems/day-night-constants";
import type { ZombieVariant } from "@/types/entities";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface GameStoreState {
  /** Current phase of the day/night cycle. */
  phase: DayPhase;
  /** Current day number (starts at 1). */
  dayNumber: number;
  /** Seconds remaining in the current phase. */
  timeRemainingInPhase: number;
  /** Total duration of the current phase in seconds. */
  phaseDuration: number;
  /** Total elapsed game time in seconds. */
  elapsedTotal: number;

  /** Whether a zombie wave is currently active. */
  waveActive: boolean;
  /** Current or most recent wave number. */
  waveNumber: number;
  /** Number of zombies in the current wave. */
  zombiesInWave: number;
  /** Number of zombies remaining alive in the current wave. */
  zombiesRemainingInWave: number;

  /** Total zombies killed across all waves. */
  totalKills: number;

  /** Kills broken down by zombie variant type. */
  killsByType: Partial<Record<ZombieVariant, number>>;

  /** Whether the game is paused. */
  paused: boolean;

  /** Run seed for death screen display and sharing. */
  seed: string | null;
  /** Number of barricades built during the run. */
  barricadesBuilt: number;
  /** Total distance traveled in pixels during the run. */
  distanceTraveled: number;
  /** Number of items picked up during the run. */
  objectsUsed: number;
  /** Incremented to trigger GameContainer remount for new runs. */
  runKey: number;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface GameStoreActions {
  /** Update clock display from a clock-tick event. */
  updateClock: (
    phase: DayPhase,
    dayNumber: number,
    timeRemainingInPhase: number,
    phaseDuration: number,
    elapsedTotal: number,
  ) => void;
  /** Mark a new wave as started. */
  setWaveStarted: (waveNumber: number, zombieCount: number) => void;
  /** Mark the current wave as ended. */
  setWaveEnded: () => void;
  /** Decrement the remaining zombie count (called on each zombie kill during a wave). */
  decrementZombiesRemaining: () => void;
  /** Set the total kill count (authoritative value from game events). */
  setTotalKills: (totalKills: number) => void;
  /** Increment the kill count for a specific zombie variant. */
  incrementKillsByType: (variant: ZombieVariant) => void;
  /** Set the paused state (used by bridge for UI → game commands). */
  setPaused: (paused: boolean) => void;
  /** Store the run seed from a run-started event. */
  setSeed: (seed: string) => void;
  /** Snapshot final run stats from the stats system at death time. */
  setRunStats: (barricadesBuilt: number, distanceTraveled: number, objectsUsed: number) => void;
  /** Increment barricades built counter. */
  incrementBarricadesBuilt: () => void;
  /** Increment runKey to trigger GameContainer remount for a new run. */
  incrementRunKey: () => void;
  /** Reset to initial state between game sessions. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: GameStoreState = {
  phase: "day",
  dayNumber: 1,
  timeRemainingInPhase: 300,
  phaseDuration: 300,
  elapsedTotal: 0,
  waveActive: false,
  waveNumber: 0,
  zombiesInWave: 0,
  zombiesRemainingInWave: 0,
  totalKills: 0,
  killsByType: {},
  paused: false,
  seed: null,
  barricadesBuilt: 0,
  distanceTraveled: 0,
  objectsUsed: 0,
  runKey: 0,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useGameStore = create<GameStoreState & GameStoreActions>()(
  subscribeWithSelector((set) => ({
    ...initialState,

    updateClock: (phase, dayNumber, timeRemainingInPhase, phaseDuration, elapsedTotal) =>
      set({ phase, dayNumber, timeRemainingInPhase, phaseDuration, elapsedTotal }),

    setWaveStarted: (waveNumber, zombieCount) =>
      set({ waveActive: true, waveNumber, zombiesInWave: zombieCount, zombiesRemainingInWave: zombieCount }),

    setWaveEnded: () => set({ waveActive: false, zombiesRemainingInWave: 0 }),

    decrementZombiesRemaining: () =>
      set((state) => ({
        zombiesRemainingInWave: Math.max(0, state.zombiesRemainingInWave - 1),
      })),

    setTotalKills: (totalKills) => set({ totalKills }),

    incrementKillsByType: (variant) =>
      set((state) => ({
        killsByType: {
          ...state.killsByType,
          [variant]: (state.killsByType[variant] ?? 0) + 1,
        },
      })),

    setPaused: (paused) => set({ paused }),

    setSeed: (seed) => set({ seed }),

    setRunStats: (barricadesBuilt, distanceTraveled, objectsUsed) =>
      set({ barricadesBuilt, distanceTraveled, objectsUsed }),

    incrementBarricadesBuilt: () =>
      set((state) => ({ barricadesBuilt: state.barricadesBuilt + 1 })),

    incrementRunKey: () =>
      set((state) => ({ runKey: state.runKey + 1 })),

    reset: () => set((state) => ({ ...initialState, runKey: state.runKey })),
  })),
);
