/**
 * Per-run configuration for a Deadbolt roguelike session.
 *
 * Every procedural system receives the seed from this config (via an RNG
 * instance) to ensure full deterministic reproducibility.
 */

/** Difficulty tier affecting enemy density, loot scarcity, and wave pacing. */
export type Difficulty = 1 | 2 | 3;

/** Configuration for a single roguelike run. */
export interface RunConfig {
  /** Deterministic PRNG seed string. Same seed = same world. */
  seed: string;
  /** Difficulty tier (1 = easy, 2 = normal, 3 = hard). */
  difficulty: Difficulty;
  /** Target run duration in minutes. Affects map size and wave pacing. */
  targetMinutes: number;
}

/** Sensible defaults for a new run (seed must be provided separately). */
export const RUN_DEFAULTS = {
  difficulty: 2 as Difficulty,
  targetMinutes: 15,
} as const;
