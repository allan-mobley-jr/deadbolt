import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createZombiePool, configureZombie, releaseZombie, clearZombiePoolBodies, getPooledBody } from "./zombie-pool";
import { resetWorld, world } from "./world";
import { zombieEntities } from "./queries";
import { BodyRegistry } from "@/game/systems/body-registry";
import { SHAMBLER_STATS, RUNNER_STATS, VARIANT_HEALTH } from "@/game/systems/zombie-ai-constants";

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
        inertia: Infinity,
        inverseInertia: 0,
        isStatic: opts?.isStatic ?? false,
        isSensor: opts?.isSensor ?? false,
        force: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        speed: 0,
        angularVelocity: 0,
      }),
    ),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Zombie Pool", () => {
  let bodyRegistry: BodyRegistry;
  let matterAdd: ReturnType<typeof createMockMatterAdd>;

  beforeEach(() => {
    nextBodyId = 1;
    bodyRegistry = new BodyRegistry();
    matterAdd = createMockMatterAdd();
    resetWorld();
    clearZombiePoolBodies();
  });

  afterEach(() => {
    resetWorld();
    clearZombiePoolBodies();
  });

  it("creates pre-warmed entities that are NOT in the world", () => {
    const pool = createZombiePool(
      { matterAdd: matterAdd as never, bodyRegistry },
      10,
    );

    expect(pool.stats.available).toBe(10);
    expect(pool.stats.active).toBe(0);
    expect(zombieEntities.entities.length).toBe(0);
  });

  it("acquire returns entity in the world with correct zombie components", () => {
    const pool = createZombiePool(
      { matterAdd: matterAdd as never, bodyRegistry },
      5,
    );

    const entity = pool.acquire();

    expect(entity).toBeDefined();
    expect(entity.position).toBeDefined();
    expect(entity.velocity).toBeDefined();
    expect(entity.health).toBeDefined();
    expect(entity.aiState).toBeDefined();
    expect(entity.zombieType).toBeDefined();
    expect(entity.physicsBody).toBeDefined();
    expect(entity.renderable).toBeDefined();

    // Entity should be in the zombieEntities query
    expect(zombieEntities.entities).toContain(entity);
    expect(pool.stats.active).toBe(1);
  });

  it("acquire registers body in bodyRegistry", () => {
    const pool = createZombiePool(
      { matterAdd: matterAdd as never, bodyRegistry },
      3,
    );

    const entity = pool.acquire();
    const body = bodyRegistry.get(entity.physicsBody.bodyId);

    expect(body).toBeDefined();
  });

  it("release removes entity from world and unregisters body", () => {
    const pool = createZombiePool(
      { matterAdd: matterAdd as never, bodyRegistry },
      5,
    );

    const entity = pool.acquire();
    const bodyId = entity.physicsBody.bodyId;

    releaseZombie(pool, entity, bodyRegistry);

    expect(zombieEntities.entities).not.toContain(entity);
    expect(bodyRegistry.get(bodyId)).toBeUndefined();
    expect(pool.stats.active).toBe(0);
    expect(pool.stats.available).toBe(5);
  });

  it("release deactivates body (static + sensor)", () => {
    const pool = createZombiePool(
      { matterAdd: matterAdd as never, bodyRegistry },
      3,
    );

    const entity = pool.acquire();
    const body = getPooledBody(entity);

    releaseZombie(pool, entity, bodyRegistry);

    expect(body!.isStatic).toBe(true);
    expect(body!.isSensor).toBe(true);
  });

  it("configureZombie sets variant-specific stats and position", () => {
    const pool = createZombiePool(
      { matterAdd: matterAdd as never, bodyRegistry },
      3,
    );

    const entity = pool.acquire();
    configureZombie(entity, "runner", 100, 200, 7);

    expect(entity.position.x).toBe(100);
    expect(entity.position.y).toBe(200);
    expect(entity.renderable.spriteKey).toBe("zombie_runner");
    expect(entity.health.current).toBe(VARIANT_HEALTH.runner);
    expect(entity.health.max).toBe(VARIANT_HEALTH.runner);
    expect(entity.zombieType.variant).toBe("runner");
    expect(entity.zombieType.moveSpeed).toBe(RUNNER_STATS.moveSpeed);
    expect(entity.aiState.state).toBe("idle");
    expect(entity.aiState.ticksSinceLastPathCalc).toBe(
      7 % RUNNER_STATS.pathRecalcInterval,
    );
  });

  it("recycled zombie has completely fresh AI state", () => {
    const pool = createZombiePool(
      { matterAdd: matterAdd as never, bodyRegistry },
      3,
    );

    const entity = pool.acquire();
    configureZombie(entity, "shambler", 50, 50, 0);

    // Simulate zombie doing work
    entity.aiState.state = "attacking";
    entity.aiState.targetPosition = { x: 999, y: 999 };
    entity.aiState.path = [{ x: 1, y: 1 }, { x: 2, y: 2 }];
    entity.aiState.pathIndex = 5;
    entity.aiState.attackCooldownRemaining = 1.5;
    entity.aiState.staggerTimeRemaining = 0.3;
    entity.aiState.attackTargetBodyId = 42;
    entity.health.current = 0;

    // Release and re-acquire
    releaseZombie(pool, entity, bodyRegistry);
    const recycled = pool.acquire();
    configureZombie(recycled, "brute", 200, 300, 3);

    // All AI state should be fresh
    expect(recycled.aiState.state).toBe("idle");
    expect(recycled.aiState.targetPosition).toBeNull();
    expect(recycled.aiState.path).toHaveLength(0);
    expect(recycled.aiState.pathIndex).toBe(0);
    expect(recycled.aiState.attackCooldownRemaining).toBe(0);
    expect(recycled.aiState.staggerTimeRemaining).toBe(0);
    expect(recycled.aiState.attackTargetBodyId).toBeNull();
    expect(recycled.velocity.vx).toBe(0);
    expect(recycled.velocity.vy).toBe(0);
  });

  it("variant switching works correctly on recycled entities", () => {
    const pool = createZombiePool(
      { matterAdd: matterAdd as never, bodyRegistry },
      2,
    );

    // First life: shambler
    const entity = pool.acquire();
    configureZombie(entity, "shambler", 10, 10, 0);
    expect(entity.zombieType.variant).toBe("shambler");
    expect(entity.health.max).toBe(VARIANT_HEALTH.shambler);

    // Release and re-acquire as brute
    releaseZombie(pool, entity, bodyRegistry);
    const recycled = pool.acquire();
    configureZombie(recycled, "brute", 50, 50, 0);
    expect(recycled.zombieType.variant).toBe("brute");
    expect(recycled.health.max).toBe(VARIANT_HEALTH.brute);
    expect(recycled.health.current).toBe(VARIANT_HEALTH.brute);
  });

  it("pool auto-grows when exhausted", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pool = createZombiePool(
      { matterAdd: matterAdd as never, bodyRegistry },
      2,
    );

    pool.acquire();
    pool.acquire();
    const grown = pool.acquire(); // Should auto-grow

    expect(grown).toBeDefined();
    expect(pool.stats.growEvents).toBe(1);
    expect(pool.stats.totalAllocations).toBe(3);

    warnSpy.mockRestore();
  });

  it("pool stats report peak usage", () => {
    const pool = createZombiePool(
      { matterAdd: matterAdd as never, bodyRegistry },
      10,
    );

    const entities = [];
    for (let i = 0; i < 7; i++) {
      entities.push(pool.acquire());
    }

    expect(pool.stats.peak).toBe(7);
    expect(pool.stats.active).toBe(7);
    expect(pool.stats.available).toBe(3);

    // Release some
    releaseZombie(pool, entities[0], bodyRegistry);
    releaseZombie(pool, entities[1], bodyRegistry);

    expect(pool.stats.peak).toBe(7); // Peak doesn't decrease
    expect(pool.stats.active).toBe(5);
    expect(pool.stats.available).toBe(5);
  });
});
