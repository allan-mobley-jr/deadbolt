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
 * Uses `crypto.getRandomValues` for entropy (available in all modern browsers
 * and Node.js 16+).
 *
 * @param length - Character count of the generated seed (default 12).
 * @returns A random alphanumeric string suitable as an RNG seed.
 * @throws {RangeError} If `length` is not a positive integer.
 */
export function generateSeed(length: number = SEED_LENGTH): string {
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError(
      `generateSeed: length must be a positive integer, got ${length}`,
    );
  }

  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);

  const chars: string[] = [];
  for (let i = 0; i < length; i++) {
    chars.push(SEED_CHARS[bytes[i] % SEED_CHARS.length]);
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
   * @throws {RangeError} If `min` or `max` is not a finite number, or `min > max`.
   */
  int(min: number, max: number): number {
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      throw new RangeError(
        `RNG.int: min and max must be finite numbers, got min=${min}, max=${max}`,
      );
    }
    if (min > max) {
      throw new RangeError(
        `RNG.int: min (${min}) must be <= max (${max})`,
      );
    }
    // Floor/ceil to handle callers who accidentally pass floats.
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    if (lo > hi) {
      // Range collapsed after rounding (e.g. int(1.5, 1.9) → ceil=2, floor=1).
      return lo;
    }
    // seedrandom returns [0, 1) so (hi - lo + 1) * prng() is in [0, range).
    // Math.floor then gives [0, range - 1], shifted to [lo, hi].
    return lo + Math.floor(this._prng() * (hi - lo + 1));
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
   * The last item absorbs floating-point rounding slack so the loop is
   * guaranteed to return.
   *
   * @throws {RangeError} If `items` is empty, all weights are &le; 0, or any weight is negative.
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
    for (let i = 0; i < items.length; i++) {
      cumulative += items[i].weight;
      // The `i === items.length - 1` guard handles floating-point edge cases
      // where roll === cumulative due to rounding. Without it the loop could
      // exhaust without returning, which would indicate a real logic error.
      if (roll < cumulative || i === items.length - 1) {
        return items[i].value;
      }
    }

    // Unreachable — the loop always returns via the last-item guard above.
    // If we somehow get here, there is a genuine logic error.
    throw new Error('RNG.weightedPick: unreachable — weight accumulation error');

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
   * @throws {RangeError} If `namespace` is empty.
   */
  derive(namespace: string): RNG {
    if (namespace.length === 0) {
      throw new RangeError('RNG.derive: namespace must not be empty');
    }
    return new RNG(`${this._seed}-${namespace}`);
  }

  /**
   * Expose the underlying `seedrandom` PRNG callable.
   *
   * This exists for interop with code that already accepts `PRNG` (e.g. the
   * WFC solver). Calling `raw()()` advances the **same** internal state as
   * `float()` — they share one sequence.
   *
   * **Warning:** The returned reference becomes stale after {@link reset}.
   * Do not cache it across reset boundaries.
   */
  raw(): PRNG {
    return this._prng;
  }
}
