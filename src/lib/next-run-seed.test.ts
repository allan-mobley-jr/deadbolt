import { describe, it, expect } from "vitest";
import { setNextRunSeed, consumeNextRunSeed } from "./next-run-seed";

describe("next-run-seed", () => {
  it("returns null when no seed is set", () => {
    // Consume any leftover state
    consumeNextRunSeed();
    expect(consumeNextRunSeed()).toBeNull();
  });

  it("returns the set seed and clears it", () => {
    setNextRunSeed("test-seed-123");
    expect(consumeNextRunSeed()).toBe("test-seed-123");
    // Second consume should be null (already consumed)
    expect(consumeNextRunSeed()).toBeNull();
  });

  it("overwrites previous seed on re-set", () => {
    setNextRunSeed("seed-1");
    setNextRunSeed("seed-2");
    expect(consumeNextRunSeed()).toBe("seed-2");
  });

  it("can be cleared by setting null", () => {
    setNextRunSeed("some-seed");
    setNextRunSeed(null);
    expect(consumeNextRunSeed()).toBeNull();
  });
});
