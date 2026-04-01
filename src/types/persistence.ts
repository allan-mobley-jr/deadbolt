/**
 * Type definitions for cross-session persistence.
 *
 * CompletedRun captures all statistics from a finished roguelike run.
 * LifetimeStats aggregates data across all runs for career tracking.
 *
 * NO React imports — pure TypeScript types.
 */

import type { ZombieVariant } from "./entities";

// ---------------------------------------------------------------------------
// Run record
// ---------------------------------------------------------------------------

/** A completed roguelike run with all final statistics. */
export interface CompletedRun {
  /** Unique identifier (timestamp-based). */
  id: string;
  /** Run seed for reproducibility/sharing. */
  seed: string;
  /** Timestamp when the run ended (ms since epoch). */
  completedAt: number;
  /** Total elapsed game time in seconds. */
  elapsedTotal: number;
  /** Final day number reached. */
  dayNumber: number;
  /** Final wave number reached. */
  waveNumber: number;
  /** Total zombies killed. */
  totalKills: number;
  /** Kills broken down by zombie variant. */
  killsByType: Partial<Record<ZombieVariant, number>>;
  /** Number of barricades built. */
  barricadesBuilt: number;
  /** Distance traveled in pixels. */
  distanceTraveled: number;
  /** Items collected. */
  objectsUsed: number;
  /** Composite score for leaderboard ranking. */
  score: number;
}

// ---------------------------------------------------------------------------
// Lifetime stats (computed from all runs)
// ---------------------------------------------------------------------------

/** Aggregated statistics across all completed runs. */
export interface LifetimeStats {
  /** Total number of completed runs. */
  totalRuns: number;
  /** Total zombies killed across all runs. */
  totalKills: number;
  /** Kills by variant across all runs. */
  killsByType: Partial<Record<ZombieVariant, number>>;
  /** Total barricades built across all runs. */
  totalBarricadesBuilt: number;
  /** Total time played in seconds across all runs. */
  totalTimePlayed: number;
  /** Longest single run in seconds. */
  longestRunTime: number;
  /** Highest day reached in any run. */
  highestDay: number;
  /** Highest score achieved in any run. */
  highestScore: number;
}

// ---------------------------------------------------------------------------
// Score computation
// ---------------------------------------------------------------------------

/**
 * Compute a composite score for leaderboard ranking.
 *
 * Weights: days survived are most important (×1000), then kills,
 * then barricades (×10), then survival time (floor to seconds).
 */
export function computeRunScore(run: {
  dayNumber: number;
  totalKills: number;
  barricadesBuilt: number;
  elapsedTotal: number;
}): number {
  return (
    run.dayNumber * 1000 +
    run.totalKills +
    run.barricadesBuilt * 10 +
    Math.floor(run.elapsedTotal)
  );
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const EMPTY_LIFETIME_STATS: LifetimeStats = {
  totalRuns: 0,
  totalKills: 0,
  killsByType: {},
  totalBarricadesBuilt: 0,
  totalTimePlayed: 0,
  longestRunTime: 0,
  highestDay: 0,
  highestScore: 0,
};
