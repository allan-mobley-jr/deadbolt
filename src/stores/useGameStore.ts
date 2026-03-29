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
import type { ZombieVariant } from "@/game/ecs/components";

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

  /** Total zombies killed across all waves. */
  totalKills: number;

  /** Kills broken down by zombie variant type. */
  killsByType: Partial<Record<ZombieVariant, number>>;

  /** Whether the game is paused. */
  paused: boolean;
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
  /** Set the total kill count (authoritative value from game events). */
  setTotalKills: (totalKills: number) => void;
  /** Increment the kill count for a specific zombie variant. */
  incrementKillsByType: (variant: ZombieVariant) => void;
  /** Set the paused state (used by bridge for UI → game commands). */
  setPaused: (paused: boolean) => void;
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
  totalKills: 0,
  killsByType: {},
  paused: false,
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
      set({ waveActive: true, waveNumber, zombiesInWave: zombieCount }),

    setWaveEnded: () => set({ waveActive: false }),

    setTotalKills: (totalKills) => set({ totalKills }),

    incrementKillsByType: (variant) =>
      set((state) => ({
        killsByType: {
          ...state.killsByType,
          [variant]: (state.killsByType[variant] ?? 0) + 1,
        },
      })),

    setPaused: (paused) => set({ paused }),

    reset: () => set(initialState),
  })),
);
