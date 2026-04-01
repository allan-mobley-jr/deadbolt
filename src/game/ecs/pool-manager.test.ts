import { describe, it, expect, vi, afterEach } from "vitest";
import type { EntityPool, PoolStats } from "@/game/ecs/pool";
import type { Entity } from "@/game/ecs/entity";
import {
  PoolManager,
  getPoolManager,
  setPoolManager,
} from "@/game/ecs/pool-manager";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock pool with the given stats and a tracked clear() method. */
function createMockPool(stats: PoolStats): EntityPool<Entity> {
  return {
    clear: vi.fn(),
    get stats() {
      return stats;
    },
  } as unknown as EntityPool<Entity>;
}

function makeStats(overrides: Partial<PoolStats> = {}): PoolStats {
  return {
    name: "test",
    active: 0,
    available: 0,
    peak: 0,
    totalAllocations: 0,
    growEvents: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  setPoolManager(null);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PoolManager", () => {
  describe("clearAll()", () => {
    it("calls clear() on every registered pool", () => {
      const pm = new PoolManager();
      const pool1 = createMockPool(makeStats({ name: "zombie" }));
      const pool2 = createMockPool(makeStats({ name: "sensor" }));
      const pool3 = createMockPool(makeStats({ name: "projectile" }));

      pm.register("zombie", pool1);
      pm.register("sensor", pool2);
      pm.register("projectile", pool3);

      pm.clearAll();

      expect(pool1.clear).toHaveBeenCalledTimes(1);
      expect(pool2.clear).toHaveBeenCalledTimes(1);
      expect(pool3.clear).toHaveBeenCalledTimes(1);
    });

    it("is a no-op when no pools are registered", () => {
      const pm = new PoolManager();
      expect(() => pm.clearAll()).not.toThrow();
    });
  });

  describe("allStats()", () => {
    it("returns stats from all registered pools", () => {
      const pm = new PoolManager();
      const stats1 = makeStats({ name: "zombie", active: 12, available: 48 });
      const stats2 = makeStats({ name: "sensor", active: 3, available: 2 });

      pm.register("zombie", createMockPool(stats1));
      pm.register("sensor", createMockPool(stats2));

      const result = pm.allStats();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(stats1);
      expect(result[1]).toEqual(stats2);
    });

    it("returns an empty array when no pools are registered", () => {
      const pm = new PoolManager();
      expect(pm.allStats()).toEqual([]);
    });
  });

  describe("debugString()", () => {
    it("formats one line per pool with stats", () => {
      const pm = new PoolManager();
      pm.register(
        "zombie",
        createMockPool(
          makeStats({
            name: "zombie",
            active: 12,
            available: 48,
            peak: 50,
            growEvents: 2,
          }),
        ),
      );
      pm.register(
        "sensor",
        createMockPool(
          makeStats({
            name: "sensor",
            active: 3,
            available: 2,
            peak: 5,
            growEvents: 0,
          }),
        ),
      );

      const result = pm.debugString();

      expect(result).toBe(
        "zombie: 12 active / 48 avail / 50 peak / 2 grows\n" +
          "sensor: 3 active / 2 avail / 5 peak / 0 grows",
      );
    });

    it("returns an empty string when no pools are registered", () => {
      const pm = new PoolManager();
      expect(pm.debugString()).toBe("");
    });
  });

  describe("singleton accessors", () => {
    it("getPoolManager() returns null before any instance is set", () => {
      expect(getPoolManager()).toBeNull();
    });

    it("setPoolManager() stores and getPoolManager() retrieves", () => {
      const pm = new PoolManager();
      setPoolManager(pm);
      expect(getPoolManager()).toBe(pm);
    });

    it("setPoolManager(null) clears the singleton", () => {
      setPoolManager(new PoolManager());
      setPoolManager(null);
      expect(getPoolManager()).toBeNull();
    });
  });

  describe("get()", () => {
    it("returns the pool registered under the given name", () => {
      const pm = new PoolManager();
      const pool = createMockPool(makeStats({ name: "zombie" }));
      pm.register("zombie", pool);
      expect(pm.get("zombie")).toBe(pool);
    });

    it("returns undefined for an unregistered name", () => {
      const pm = new PoolManager();
      expect(pm.get("nonexistent")).toBeUndefined();
    });
  });
});
