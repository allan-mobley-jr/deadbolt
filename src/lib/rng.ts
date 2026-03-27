/**
 * Seeded PRNG utility for deterministic procedural generation.
 *
 * All procedural game systems consume an {@link RNG} instance instead of
 * calling `Math.random()` or `seedrandom` directly. Same seed + same
 * sequence of operations = identical results every time.
 *
 * @module
 */

import seedrandom from 'seedrandom';
import type { PRNG } from 'seedrandom';

/** Length of generated seed strings. */
const SEED_LENGTH = 12;

/** Characters used when generating random seed strings. */
const SEED_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate a random alphanumeric seed string for a new run.
 *
 * This is the **one** place where non-deterministic randomness is acceptable.
 * It uses `crypto.getRandomValues` when available for better entropy,
 * falling back to `Math.random` otherwise.
 *
 * @param length - Character count of the generated seed (default 12).
 * @returns A random alphanumeric string suitable as an RNG seed.
 */
export function generateSeed(length: number = SEED_LENGTH): string {
  const chars: string[] = [];

  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      chars.push(SEED_CHARS[bytes[i] % SEED_CHARS.length]);
    }
  } else {
    for (let i = 0; i < length; i++) {
      chars.push(SEED_CHARS[Math.floor(Math.random() * SEED_CHARS.length)]);
    }
  }

  return chars.join('');
}

/**
 * Item with an associated weight for {@link RNG.weightedPick}.
 */
export interface WeightedItem<T> {
  readonly value: T;
  readonly weight: number;
}

/**
 * Seeded pseudo-random number generator with typed convenience methods.
 *
 * Create one instance per run (seeded from `RunConfig.seed`), then derive
 * child instances for each subsystem so that adding or removing calls in
 * one subsystem does not shift the sequence for another.
 *
 * @example
 * ```ts
 * const rng = new RNG('my-seed');
 * const cityRng = rng.derive('city');
 * const lootRng = rng.derive('loot');
 *
 * cityRng.int(0, 100);   // deterministic, isolated from loot calls
 * lootRng.pick(['axe', 'bat', 'pipe']);
 * ```
 */
export class RNG {
  private _seed: string;
  private _prng: PRNG;

  constructor(seed: string) {
    this._seed = seed;
    this._prng = seedrandom(seed);
  }

  // ---------------------------------------------------------------------------
  // Properties
  // ---------------------------------------------------------------------------

  /** The seed this instance was created with. */
  get seed(): string {
    return this._seed;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Reset to the initial state as if freshly constructed with the same seed.
   * Useful in tests to replay a known sequence.
   */
  reset(): void {
    this._prng = seedrandom(this._seed);
  }

  // ---------------------------------------------------------------------------
  // Core random operations
  // ---------------------------------------------------------------------------

  /**
   * Return a float in **[0, 1)**.
   *
   * `seedrandom` guarantees the upper bound is exclusive, so this can
   * safely be used in `Math.floor(rng.float() * n)` without overflow.
   */
  float(): number {
    return this._prng();
  }

  /**
   * Return an integer in **[min, max]** (inclusive on both ends).
   *
   * @throws {RangeError} If `min > max`.
   */
  int(min: number, max: number): number {
    if (min > max) {
      throw new RangeError(
        `RNG.int: min (${min}) must be <= max (${max})`,
      );
    }
    // seedrandom returns [0, 1) so (max - min + 1) * prng() is in [0, range).
    // Math.floor then gives [0, range - 1], shifted to [min, max].
    return min + Math.floor(this._prng() * (max - min + 1));
  }

  /**
   * Pick a uniformly random element from a non-empty array.
   *
   * @throws {RangeError} If the array is empty.
   */
  pick<T>(array: readonly T[]): T {
    if (array.length === 0) {
      throw new RangeError('RNG.pick: cannot pick from an empty array');
    }
    return array[this.int(0, array.length - 1)];
  }

  /**
   * Pick a random element weighted by the provided weights.
   *
   * Weights must be non-negative. At least one weight must be positive.
   * The last item is returned as a floating-point safety net (same pattern
   * used in the WFC weighted collapse).
   *
   * @throws {RangeError} If `items` is empty or all weights are &le; 0.
   */
  weightedPick<T>(items: readonly WeightedItem<T>[]): T {
    if (items.length === 0) {
      throw new RangeError(
        'RNG.weightedPick: cannot pick from an empty array',
      );
    }

    let totalWeight = 0;
    for (const item of items) {
      if (item.weight < 0) {
        throw new RangeError(
          `RNG.weightedPick: negative weight (${item.weight}) is not allowed`,
        );
      }
      totalWeight += item.weight;
    }

    if (totalWeight <= 0) {
      throw new RangeError(
        'RNG.weightedPick: total weight must be positive',
      );
    }

    const roll = this._prng() * totalWeight;
    let cumulative = 0;
    for (const item of items) {
      cumulative += item.weight;
      if (roll < cumulative) {
        return item.value;
      }
    }

    // Floating-point safety net — return the last item.
    return items[items.length - 1].value;
  }

  /**
   * Return a new array with elements in a random order (Fisher-Yates shuffle).
   *
   * The input array is **not** mutated.
   */
  shuffle<T>(array: readonly T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this._prng() * (i + 1));
      const tmp = result[i];
      result[i] = result[j];
      result[j] = tmp;
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Derivation & interop
  // ---------------------------------------------------------------------------

  /**
   * Create a child RNG whose seed is `"${parentSeed}-${namespace}"`.
   *
   * Use this to isolate subsystems so that adding or removing random calls
   * in one subsystem does not shift the sequence for another.
   *
   * @param namespace - A unique label for the subsystem (e.g. `"wfc"`, `"bsp"`, `"loot"`).
   */
  derive(namespace: string): RNG {
    return new RNG(`${this._seed}-${namespace}`);
  }

  /**
   * Expose the underlying `seedrandom` PRNG callable.
   *
   * This exists for interop with code that already accepts `PRNG` (e.g. the
   * WFC solver). Calling `raw()()` advances the **same** internal state as
   * `float()` — they share one sequence.
   */
  raw(): PRNG {
    return this._prng;
  }
}
