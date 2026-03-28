import { describe, expect, it } from 'vitest';

import { generateSeed, RNG, type WeightedItem } from '@/lib/rng';

// ---------------------------------------------------------------------------
// generateSeed
// ---------------------------------------------------------------------------

describe('generateSeed', () => {
  it('returns a string of the default length (12)', () => {
    const seed = generateSeed();
    expect(seed).toHaveLength(12);
  });

  it('respects a custom length parameter', () => {
    expect(generateSeed(6)).toHaveLength(6);
    expect(generateSeed(32)).toHaveLength(32);
  });

  it('contains only alphanumeric characters', () => {
    const seed = generateSeed(100);
    expect(seed).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('produces different seeds across calls', () => {
    const seeds = new Set(Array.from({ length: 50 }, () => generateSeed()));
    // With 12-char alphanumeric seeds the collision probability is negligible.
    expect(seeds.size).toBeGreaterThan(1);
  });

  it('throws RangeError on zero length', () => {
    expect(() => generateSeed(0)).toThrow(RangeError);
  });

  it('throws RangeError on negative length', () => {
    expect(() => generateSeed(-1)).toThrow(RangeError);
  });

  it('throws RangeError on NaN', () => {
    expect(() => generateSeed(NaN)).toThrow(RangeError);
  });

  it('throws RangeError on fractional length', () => {
    expect(() => generateSeed(1.5)).toThrow(RangeError);
  });

  it('throws RangeError on Infinity', () => {
    expect(() => generateSeed(Infinity)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// RNG — constructor & seed getter
// ---------------------------------------------------------------------------

describe('RNG constructor', () => {
  it('stores and exposes the seed', () => {
    const rng = new RNG('hello');
    expect(rng.seed).toBe('hello');
  });

  it('accepts an empty string seed without throwing', () => {
    expect(() => new RNG('')).not.toThrow();
  });

  it('accepts unicode seeds', () => {
    const rng = new RNG('');
    expect(rng.seed).toBe('');
    expect(rng.float()).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// float()
// ---------------------------------------------------------------------------

describe('RNG.float', () => {
  it('returns values in [0, 1)', () => {
    const rng = new RNG('range-check');
    for (let i = 0; i < 1_000; i++) {
      const v = rng.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic — same seed produces same sequence', () => {
    const a = new RNG('determinism');
    const b = new RNG('determinism');
    for (let i = 0; i < 100; i++) {
      expect(a.float()).toBe(b.float());
    }
  });

  it('different seeds produce different sequences', () => {
    const a = new RNG('seed-A');
    const b = new RNG('seed-B');
    // Extremely unlikely (but possible) for the first value to collide.
    // Check a few values — at least one must differ.
    const diffs = Array.from({ length: 10 }, () => a.float() !== b.float());
    expect(diffs.some(Boolean)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// int(min, max)
// ---------------------------------------------------------------------------

describe('RNG.int', () => {
  it('returns values in [min, max] inclusive', () => {
    const rng = new RNG('int-range');
    const results = new Set<number>();
    for (let i = 0; i < 1_000; i++) {
      const v = rng.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      results.add(v);
    }
    // With 1000 rolls of a d6, we should see all 6 faces.
    expect(results.size).toBe(6);
  });

  it('handles equal min and max', () => {
    const rng = new RNG('single');
    for (let i = 0; i < 20; i++) {
      expect(rng.int(5, 5)).toBe(5);
    }
  });

  it('handles negative ranges', () => {
    const rng = new RNG('negative');
    for (let i = 0; i < 200; i++) {
      const v = rng.int(-3, 3);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThanOrEqual(3);
    }
  });

  it('throws RangeError when min > max', () => {
    const rng = new RNG('error');
    expect(() => rng.int(10, 5)).toThrow(RangeError);
  });

  it('throws RangeError on NaN', () => {
    const rng = new RNG('nan');
    expect(() => rng.int(NaN, 5)).toThrow(RangeError);
    expect(() => rng.int(0, NaN)).toThrow(RangeError);
  });

  it('throws RangeError on Infinity', () => {
    const rng = new RNG('inf');
    expect(() => rng.int(-Infinity, 5)).toThrow(RangeError);
    expect(() => rng.int(0, Infinity)).toThrow(RangeError);
  });

  it('handles fractional bounds by rounding inward', () => {
    const rng = new RNG('frac');
    // int(1.2, 3.8) → ceil(1.2)=2, floor(3.8)=3 → range [2, 3]
    for (let i = 0; i < 100; i++) {
      const v = rng.int(1.2, 3.8);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(3);
    }
  });

  it('collapsed-range branch still advances PRNG state', () => {
    const a = new RNG('collapsed');
    const b = new RNG('collapsed');

    // a: collapsed range (ceil(1.5)=2 > floor(1.9)=1, returns 2)
    a.int(1.5, 1.9);
    // b: normal call that advances PRNG once
    b.float();

    // Both should have advanced the PRNG by one step, so subsequent
    // calls produce identical values.
    expect(a.float()).toBe(b.float());
  });

  it('is deterministic', () => {
    const a = new RNG('int-det');
    const b = new RNG('int-det');
    for (let i = 0; i < 100; i++) {
      expect(a.int(0, 100)).toBe(b.int(0, 100));
    }
  });
});

// ---------------------------------------------------------------------------
// pick(array)
// ---------------------------------------------------------------------------

describe('RNG.pick', () => {
  it('returns an element from the source array', () => {
    const rng = new RNG('pick-test');
    const items = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 100; i++) {
      expect(items).toContain(rng.pick(items));
    }
  });

  it('single-element array always returns that element', () => {
    const rng = new RNG('single-pick');
    for (let i = 0; i < 20; i++) {
      expect(rng.pick([42])).toBe(42);
    }
  });

  it('throws RangeError on empty array', () => {
    const rng = new RNG('empty');
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it('is deterministic', () => {
    const a = new RNG('pick-det');
    const b = new RNG('pick-det');
    const items = ['x', 'y', 'z'];
    for (let i = 0; i < 50; i++) {
      expect(a.pick(items)).toBe(b.pick(items));
    }
  });
});

// ---------------------------------------------------------------------------
// weightedPick(items)
// ---------------------------------------------------------------------------

describe('RNG.weightedPick', () => {
  it('always returns the sole item', () => {
    const rng = new RNG('weighted-single');
    const items: WeightedItem<string>[] = [{ value: 'only', weight: 1 }];
    for (let i = 0; i < 20; i++) {
      expect(rng.weightedPick(items)).toBe('only');
    }
  });

  it('never returns a zero-weight item when another has positive weight', () => {
    const rng = new RNG('weighted-zero');
    const items: WeightedItem<string>[] = [
      { value: 'yes', weight: 1 },
      { value: 'no', weight: 0 },
    ];
    for (let i = 0; i < 200; i++) {
      expect(rng.weightedPick(items)).toBe('yes');
    }
  });

  it('distribution roughly matches weights', () => {
    const rng = new RNG('weighted-dist');
    const items: WeightedItem<string>[] = [
      { value: 'A', weight: 3 },
      { value: 'B', weight: 1 },
    ];
    const counts = { A: 0, B: 0 };
    const trials = 10_000;
    for (let i = 0; i < trials; i++) {
      counts[rng.weightedPick(items) as 'A' | 'B']++;
    }
    // Expected ratio A:B ≈ 3:1. Allow generous tolerance for randomness.
    const ratio = counts.A / counts.B;
    expect(ratio).toBeGreaterThan(2);
    expect(ratio).toBeLessThan(4.5);
  });

  it('throws RangeError on empty array', () => {
    const rng = new RNG('weighted-empty');
    expect(() => rng.weightedPick([])).toThrow(RangeError);
  });

  it('throws RangeError when all weights are zero', () => {
    const rng = new RNG('weighted-all-zero');
    const items: WeightedItem<string>[] = [
      { value: 'a', weight: 0 },
      { value: 'b', weight: 0 },
    ];
    expect(() => rng.weightedPick(items)).toThrow(RangeError);
  });

  it('throws RangeError on negative weight', () => {
    const rng = new RNG('weighted-negative');
    const items: WeightedItem<string>[] = [{ value: 'x', weight: -1 }];
    expect(() => rng.weightedPick(items)).toThrow(RangeError);
  });

  it('throws RangeError on NaN weight', () => {
    const rng = new RNG('weighted-nan');
    const items: WeightedItem<string>[] = [{ value: 'x', weight: NaN }];
    expect(() => rng.weightedPick(items)).toThrow(RangeError);
  });

  it('throws RangeError on Infinity weight', () => {
    const rng = new RNG('weighted-inf');
    const items: WeightedItem<string>[] = [{ value: 'x', weight: Infinity }];
    expect(() => rng.weightedPick(items)).toThrow(RangeError);
  });

  it('throws RangeError on -Infinity weight', () => {
    const rng = new RNG('weighted-neg-inf');
    const items: WeightedItem<string>[] = [{ value: 'x', weight: -Infinity }];
    expect(() => rng.weightedPick(items)).toThrow(RangeError);
  });

  it('throws RangeError when a non-first item has a NaN weight', () => {
    const rng = new RNG('weighted-nan-mid');
    const items: WeightedItem<string>[] = [
      { value: 'ok', weight: 5 },
      { value: 'bad', weight: NaN },
    ];
    expect(() => rng.weightedPick(items)).toThrow(RangeError);
  });

  it('handles fractional weights correctly', () => {
    const rng = new RNG('weighted-frac');
    const items: WeightedItem<string>[] = [
      { value: 'A', weight: 0.7 },
      { value: 'B', weight: 0.3 },
    ];
    const counts = { A: 0, B: 0 };
    const trials = 10_000;
    for (let i = 0; i < trials; i++) {
      counts[rng.weightedPick(items) as 'A' | 'B']++;
    }
    // Expected ratio A:B ≈ 7:3 (2.33). Allow generous tolerance.
    const ratio = counts.A / counts.B;
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(3.5);
  });

  it('is deterministic', () => {
    const a = new RNG('weighted-det');
    const b = new RNG('weighted-det');
    const items: WeightedItem<string>[] = [
      { value: 'A', weight: 5 },
      { value: 'B', weight: 3 },
      { value: 'C', weight: 2 },
    ];
    for (let i = 0; i < 50; i++) {
      expect(a.weightedPick(items)).toBe(b.weightedPick(items));
    }
  });
});

// ---------------------------------------------------------------------------
// shuffle(array)
// ---------------------------------------------------------------------------

describe('RNG.shuffle', () => {
  it('returns a new array (does not mutate the original)', () => {
    const rng = new RNG('shuffle-immutable');
    const original = [1, 2, 3, 4, 5];
    const copy = [...original];
    const shuffled = rng.shuffle(original);

    expect(shuffled).not.toBe(original); // different reference
    expect(original).toEqual(copy); // not mutated
  });

  it('contains the same elements as the input', () => {
    const rng = new RNG('shuffle-elements');
    const input = [10, 20, 30, 40, 50];
    const shuffled = rng.shuffle(input);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(
      [...input].sort((a, b) => a - b),
    );
  });

  it('handles empty array', () => {
    const rng = new RNG('shuffle-empty');
    expect(rng.shuffle([])).toEqual([]);
  });

  it('handles single-element array', () => {
    const rng = new RNG('shuffle-single');
    expect(rng.shuffle([42])).toEqual([42]);
  });

  it('actually reorders elements (statistical)', () => {
    const rng = new RNG('shuffle-reorder');
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    let differentCount = 0;
    for (let i = 0; i < 20; i++) {
      rng.reset();
      // Advance past i iterations to get different shuffles
      for (let j = 0; j < i; j++) rng.float();
      const shuffled = rng.shuffle(input);
      if (shuffled.some((v, idx) => v !== input[idx])) {
        differentCount++;
      }
    }
    // At least some shuffles should differ from the identity ordering.
    expect(differentCount).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const a = new RNG('shuffle-det');
    const b = new RNG('shuffle-det');
    const input = ['w', 'x', 'y', 'z'];
    expect(a.shuffle(input)).toEqual(b.shuffle(input));
  });
});

// ---------------------------------------------------------------------------
// derive(namespace)
// ---------------------------------------------------------------------------

describe('RNG.derive', () => {
  it('returns a new RNG instance', () => {
    const parent = new RNG('parent');
    const child = parent.derive('child');
    expect(child).toBeInstanceOf(RNG);
    expect(child).not.toBe(parent);
  });

  it('derived seed incorporates namespace', () => {
    const parent = new RNG('parent');
    const child = parent.derive('wfc');
    expect(child.seed).toBe('parent-wfc');
  });

  it('same namespace from same seed produces identical derived RNG', () => {
    const a = new RNG('root').derive('sub');
    const b = new RNG('root').derive('sub');
    for (let i = 0; i < 50; i++) {
      expect(a.float()).toBe(b.float());
    }
  });

  it('different namespaces produce different sequences', () => {
    const a = new RNG('root').derive('alpha');
    const b = new RNG('root').derive('beta');
    const diffs = Array.from({ length: 10 }, () => a.float() !== b.float());
    expect(diffs.some(Boolean)).toBe(true);
  });

  it('throws RangeError on empty namespace', () => {
    const rng = new RNG('parent');
    expect(() => rng.derive('')).toThrow(RangeError);
  });

  it('derived RNG is independent from parent sequence', () => {
    const parent = new RNG('root');
    parent.float(); // advance parent
    parent.float();
    const child = parent.derive('sub');

    // A "fresh" derive from same seed should produce the same child.
    const freshChild = new RNG('root').derive('sub');
    for (let i = 0; i < 20; i++) {
      expect(child.float()).toBe(freshChild.float());
    }
  });

  it('derive() does not advance the parent PRNG state', () => {
    const a = new RNG('parent-state');
    const b = new RNG('parent-state');

    // a: call derive, then read floats
    a.derive('child');
    // b: skip derive, read floats directly

    // Parent sequence should be identical whether or not derive() was called.
    for (let i = 0; i < 10; i++) {
      expect(a.float()).toBe(b.float());
    }
  });
});

// ---------------------------------------------------------------------------
// reset()
// ---------------------------------------------------------------------------

describe('RNG.reset', () => {
  it('replays the same float sequence after reset', () => {
    const rng = new RNG('reset-test');
    const first = Array.from({ length: 10 }, () => rng.float());
    rng.reset();
    const second = Array.from({ length: 10 }, () => rng.float());
    expect(first).toEqual(second);
  });

  it('replays the same int sequence after reset', () => {
    const rng = new RNG('reset-int');
    const first = Array.from({ length: 10 }, () => rng.int(0, 100));
    rng.reset();
    const second = Array.from({ length: 10 }, () => rng.int(0, 100));
    expect(first).toEqual(second);
  });

  it('replays the same shuffle after reset', () => {
    const rng = new RNG('reset-shuffle');
    const input = [1, 2, 3, 4, 5];
    const first = rng.shuffle(input);
    rng.reset();
    const second = rng.shuffle(input);
    expect(first).toEqual(second);
  });
});

// ---------------------------------------------------------------------------
// raw()
// ---------------------------------------------------------------------------

describe('RNG.raw', () => {
  it('returns a callable function', () => {
    const rng = new RNG('raw-test');
    const prng = rng.raw();
    expect(typeof prng).toBe('function');
  });

  it('returns values in [0, 1)', () => {
    const rng = new RNG('raw-range');
    const prng = rng.raw();
    for (let i = 0; i < 100; i++) {
      const v = prng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('shares state with float() — they advance the same sequence', () => {
    const rng1 = new RNG('raw-shared');
    const rng2 = new RNG('raw-shared');

    // rng1: float, float, raw()
    rng1.float();
    rng1.float();
    const viaRaw = rng1.raw()();

    // rng2: float, float, float — should equal viaRaw
    rng2.float();
    rng2.float();
    const viaFloat = rng2.float();

    expect(viaRaw).toBe(viaFloat);
  });

  it('cached raw() reference becomes stale after reset()', () => {
    const rng = new RNG('stale-raw');
    const cachedPrng = rng.raw();

    // Record the first 3 values of the sequence (positions 0, 1, 2).
    // Both rng and cachedPrng share state, so both are now at position 3.
    const sequence = [rng.float(), rng.float(), rng.float()];

    // Reset replaces the internal PRNG — rng starts over at position 0,
    // but cachedPrng still points to the old PRNG at position 3.
    rng.reset();

    // rng replays from position 0
    expect(rng.float()).toBe(sequence[0]);
    expect(rng.float()).toBe(sequence[1]);

    // cachedPrng is stale — it continues from position 3 (not reset).
    const staleValues = [cachedPrng(), cachedPrng(), cachedPrng()];
    // Positions 3, 4, 5 should NOT equal positions 0, 1, 2.
    expect(staleValues).not.toEqual(sequence);
  });
});

// ---------------------------------------------------------------------------
// Integration: full determinism across mixed operations
// ---------------------------------------------------------------------------

describe('determinism (integration)', () => {
  it('mixed operations produce identical results from the same seed', () => {
    function runSequence(seed: string) {
      const rng = new RNG(seed);
      const results: unknown[] = [];

      results.push(rng.float());
      results.push(rng.int(1, 100));
      results.push(rng.pick(['a', 'b', 'c', 'd', 'e']));
      results.push(
        rng.weightedPick([
          { value: 'X', weight: 5 },
          { value: 'Y', weight: 3 },
          { value: 'Z', weight: 2 },
        ]),
      );
      results.push(rng.shuffle([10, 20, 30, 40, 50]));
      results.push(rng.float());
      results.push(rng.int(-50, 50));

      return results;
    }

    const a = runSequence('integration-seed');
    const b = runSequence('integration-seed');
    expect(a).toEqual(b);
  });

  it('different seeds produce different mixed results', () => {
    function runSequence(seed: string) {
      const rng = new RNG(seed);
      return [rng.float(), rng.int(0, 999), rng.shuffle([1, 2, 3, 4])];
    }

    const a = JSON.stringify(runSequence('seed-1'));
    const b = JSON.stringify(runSequence('seed-2'));
    expect(a).not.toBe(b);
  });
});
