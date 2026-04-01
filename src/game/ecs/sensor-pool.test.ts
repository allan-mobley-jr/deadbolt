import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SensorBodyPool } from "./sensor-pool";
import { BodyRegistry } from "@/game/systems/body-registry";

// ---------------------------------------------------------------------------
// Mock Matter factory
// ---------------------------------------------------------------------------

let nextBodyId = 1;

function createMockMatterAdd() {
  return {
    rectangle: vi.fn(
      (
        x: number,
        y: number,
        _w: number,
        _h: number,
        opts?: Record<string, unknown>,
      ) => ({
        id: nextBodyId++,
        position: { x, y },
        isStatic: opts?.isStatic ?? false,
        isSensor: opts?.isSensor ?? false,
      }),
    ),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SensorBodyPool", () => {
  let bodyRegistry: BodyRegistry;
  let matterAdd: ReturnType<typeof createMockMatterAdd>;

  beforeEach(() => {
    nextBodyId = 1;
    bodyRegistry = new BodyRegistry();
    matterAdd = createMockMatterAdd();
  });

  afterEach(() => {
    bodyRegistry.clear();
  });

  it("pre-warms the requested number of sensor bodies", () => {
    const pool = new SensorBodyPool(
      matterAdd as never,
      bodyRegistry,
      32,
      16,
      5,
    );

    expect(pool.stats.available).toBe(5);
    expect(pool.stats.active).toBe(0);
    expect(pool.stats.totalAllocations).toBe(5);
  });

  it("acquire returns a sensor body at the specified position", () => {
    const pool = new SensorBodyPool(
      matterAdd as never,
      bodyRegistry,
      32,
      16,
      3,
    );

    const body = pool.acquire(100, 200);

    expect(body).toBeDefined();
    expect(body.position.x).toBe(100);
    expect(body.position.y).toBe(200);
    expect(pool.stats.active).toBe(1);
    expect(pool.stats.available).toBe(2);
  });

  it("acquire registers body in bodyRegistry", () => {
    const pool = new SensorBodyPool(
      matterAdd as never,
      bodyRegistry,
      32,
      16,
      3,
    );

    const body = pool.acquire(50, 50);

    expect(bodyRegistry.get(body.id)).toBe(body);
  });

  it("release unregisters body and moves off-screen", () => {
    const pool = new SensorBodyPool(
      matterAdd as never,
      bodyRegistry,
      32,
      16,
      3,
    );

    const body = pool.acquire(100, 200);
    pool.release(body);

    expect(bodyRegistry.get(body.id)).toBeUndefined();
    expect(body.position.x).toBe(-9999);
    expect(body.position.y).toBe(-9999);
    expect(pool.stats.active).toBe(0);
    expect(pool.stats.available).toBe(3);
  });

  it("recycles the same body on release then acquire", () => {
    const pool = new SensorBodyPool(
      matterAdd as never,
      bodyRegistry,
      32,
      16,
      1,
    );

    const body = pool.acquire(10, 20);
    const bodyId = body.id;
    pool.release(body);

    const reused = pool.acquire(30, 40);
    expect(reused.id).toBe(bodyId);
    expect(reused.position.x).toBe(30);
    expect(reused.position.y).toBe(40);
  });

  it("auto-grows when pool is exhausted", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pool = new SensorBodyPool(
      matterAdd as never,
      bodyRegistry,
      32,
      16,
      1,
    );

    pool.acquire(0, 0); // Use the pre-warmed body
    const grown = pool.acquire(1, 1); // Should auto-grow

    expect(grown).toBeDefined();
    expect(pool.stats.growEvents).toBe(1);
    expect(pool.stats.totalAllocations).toBe(2);

    warnSpy.mockRestore();
  });

  it("tracks peak usage", () => {
    const pool = new SensorBodyPool(
      matterAdd as never,
      bodyRegistry,
      32,
      16,
      5,
    );

    const a = pool.acquire(0, 0);
    const b = pool.acquire(1, 1);
    pool.acquire(2, 2);

    expect(pool.stats.peak).toBe(3);

    pool.release(a);
    pool.release(b);

    expect(pool.stats.peak).toBe(3); // Peak doesn't decrease
  });

  it("clear empties the pool", () => {
    const pool = new SensorBodyPool(
      matterAdd as never,
      bodyRegistry,
      32,
      16,
      5,
    );

    pool.clear();

    expect(pool.stats.available).toBe(0);
    expect(pool.stats.active).toBe(0);
  });
});
