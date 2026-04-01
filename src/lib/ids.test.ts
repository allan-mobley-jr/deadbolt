import { describe, it, expect, beforeEach } from "vitest";
import {
  generateRunId,
  generateEphemeralId,
  _resetEphemeralCounter,
} from "./ids";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => {
  _resetEphemeralCounter();
});

describe("generateRunId", () => {
  it("returns a string starting with 'run-'", () => {
    const id = generateRunId();
    expect(id.startsWith("run-")).toBe(true);
  });

  it("contains a valid UUID v4 after the prefix", () => {
    const id = generateRunId();
    const uuidPart = id.slice(4); // remove "run-"
    expect(uuidPart).toMatch(UUID_V4_REGEX);
  });

  it("produces unique IDs across 1000 calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateRunId());
    }
    expect(ids.size).toBe(1000);
  });
});

describe("generateEphemeralId", () => {
  it("returns a string starting with the given prefix", () => {
    expect(generateEphemeralId("hit")).toMatch(/^hit-/);
    expect(generateEphemeralId("pickup")).toMatch(/^pickup-/);
  });

  it("produces monotonically increasing counters", () => {
    const a = generateEphemeralId("test");
    const b = generateEphemeralId("test");
    const c = generateEphemeralId("test");

    expect(a).toBe("test-1");
    expect(b).toBe("test-2");
    expect(c).toBe("test-3");
  });

  it("uses a shared counter across different prefixes", () => {
    const a = generateEphemeralId("hit");
    const b = generateEphemeralId("pickup");
    const c = generateEphemeralId("noise");

    expect(a).toBe("hit-1");
    expect(b).toBe("pickup-2");
    expect(c).toBe("noise-3");
  });

  it("never produces duplicate IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateEphemeralId("test"));
    }
    expect(ids.size).toBe(100);
  });
});

describe("_resetEphemeralCounter", () => {
  it("resets the counter so IDs start from 1 again", () => {
    generateEphemeralId("a");
    generateEphemeralId("a");
    expect(generateEphemeralId("a")).toBe("a-3");

    _resetEphemeralCounter();

    expect(generateEphemeralId("a")).toBe("a-1");
  });
});
