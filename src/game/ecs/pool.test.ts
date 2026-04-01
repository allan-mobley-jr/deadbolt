import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EntityPool } from "./pool";
import type { Entity } from "./entity";
import { world } from "./world";
import { resetWorld } from "./world";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TestEntity extends Entity {
  position: { x: number; y: number };
  health: { current: number; max: number };
}

function testFactory(): TestEntity {
  return {
    position: { x: 0, y: 0 },
    health: { current: 100, max: 100 },
  };
}

function testReset(entity: TestEntity): void {
  entity.position.x = 0;
  entity.position.y = 0;
  entity.health.current = 100;
  entity.health.max = 100;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EntityPool", () => {
  beforeEach(() => resetWorld());
  afterEach(() => resetWorld());

  it("prewarm creates the requested number of dormant entities", () => {
    const pool = new EntityPool<TestEntity>(
      { name: "test", initialSize: 10, maxSize: 20 },
      testFactory,
      testReset,
    );
    pool.prewarm(10);

    const stats = pool.stats;
    expect(stats.available).toBe(10);
    expect(stats.active).toBe(0);
    expect(stats.totalAllocations).toBe(10);
  });

  it("acquire returns entity and adds it to the world", () => {
    const pool = new EntityPool<TestEntity>(
      { name: "test", initialSize: 5, maxSize: 20 },
      testFactory,
      testReset,
    );
    pool.prewarm(5);

    const entity = pool.acquire();

    expect(entity).toBeDefined();
    expect(entity.position).toBeDefined();
    expect(pool.stats.active).toBe(1);
    expect(pool.stats.available).toBe(4);
  });

  it("acquire calls reset function before returning", () => {
    const resetFn = vi.fn(testReset);
    const pool = new EntityPool<TestEntity>(
      { name: "test", initialSize: 1, maxSize: 20 },
      testFactory,
      resetFn,
    );
    pool.prewarm(1);

    pool.acquire();

    expect(resetFn).toHaveBeenCalledOnce();
  });

  it("release removes entity from world and returns to pool", () => {
    const pool = new EntityPool<TestEntity>(
      { name: "test", initialSize: 5, maxSize: 20 },
      testFactory,
      testReset,
    );
    pool.prewarm(5);

    const entity = pool.acquire();
    expect(pool.stats.active).toBe(1);

    pool.release(entity);
    expect(pool.stats.active).toBe(0);
    expect(pool.stats.available).toBe(5);
  });

  it("release followed by acquire reuses the same object reference (FIFO)", () => {
    const pool = new EntityPool<TestEntity>(
      { name: "test", initialSize: 3, maxSize: 20 },
      testFactory,
      testReset,
    );
    pool.prewarm(3);

    const a = pool.acquire();
    const b = pool.acquire();
    const c = pool.acquire();

    pool.release(a);
    pool.release(b);

    // FIFO: next acquire should return `a` (released first)
    const reused = pool.acquire();
    expect(reused).toBe(a);
  });

  it("auto-grows and warns when pool is exhausted", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pool = new EntityPool<TestEntity>(
      { name: "test", initialSize: 1, maxSize: 20 },
      testFactory,
      testReset,
    );
    pool.prewarm(1);

    pool.acquire(); // Use the pre-warmed entity
    const grown = pool.acquire(); // Should auto-grow

    expect(grown).toBeDefined();
    expect(pool.stats.growEvents).toBe(1);
    expect(pool.stats.totalAllocations).toBe(2);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Pool exhausted"),
    );

    warnSpy.mockRestore();
  });

  it("tracks peak usage correctly", () => {
    const pool = new EntityPool<TestEntity>(
      { name: "test", initialSize: 5, maxSize: 20 },
      testFactory,
      testReset,
    );
    pool.prewarm(5);

    const entities = [];
    for (let i = 0; i < 4; i++) {
      entities.push(pool.acquire());
    }
    expect(pool.stats.peak).toBe(4);

    pool.release(entities[0]);
    pool.release(entities[1]);
    expect(pool.stats.peak).toBe(4); // Peak doesn't decrease

    pool.acquire();
    pool.acquire();
    pool.acquire(); // 5 total active now
    expect(pool.stats.peak).toBe(5);
  });

  it("clear drains all dormant entities", () => {
    const pool = new EntityPool<TestEntity>(
      { name: "test", initialSize: 5, maxSize: 20 },
      testFactory,
      testReset,
    );
    pool.prewarm(5);

    pool.clear();

    expect(pool.stats.available).toBe(0);
    expect(pool.stats.active).toBe(0);
  });

  it("warns on releasing entity not tracked by pool", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pool = new EntityPool<TestEntity>(
      { name: "test", initialSize: 1, maxSize: 20 },
      testFactory,
      testReset,
    );
    pool.prewarm(1);

    const outsider: TestEntity = {
      position: { x: 99, y: 99 },
      health: { current: 1, max: 1 },
    };
    world.add(outsider);

    pool.release(outsider);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("not tracked by this pool"),
    );
    warnSpy.mockRestore();
  });

  it("respects maxSize cap on dormant entities", () => {
    const pool = new EntityPool<TestEntity>(
      { name: "test", initialSize: 2, maxSize: 2 },
      testFactory,
      testReset,
    );
    pool.prewarm(2);

    const a = pool.acquire();
    const b = pool.acquire();
    expect(pool.stats.available).toBe(0);

    // Grow beyond pre-warmed
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const c = pool.acquire();

    // Release all three — only 2 should be kept (maxSize)
    pool.release(a);
    pool.release(b);
    pool.release(c);

    expect(pool.stats.available).toBe(2); // Capped at maxSize
    vi.restoreAllMocks();
  });
});
