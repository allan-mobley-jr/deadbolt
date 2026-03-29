import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getAvailableVariants,
  selectVariant,
  spawnZombie,
  spawnHordeCluster,
} from "./zombie-spawner-utils";
import type { SpawnContext } from "./zombie-spawner-utils";
import { BodyRegistry } from "./body-registry";
import { resetWorld, world } from "@/game/ecs/world";
import {
  HORDE_CLUSTER_SIZE,
  HORDE_CLUSTER_SPREAD,
  VARIANT_STATS,
  VARIANT_HEALTH,
} from "./zombie-ai-constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextBodyId = 1;

function createMockSpawnContext(): SpawnContext {
  return {
    matterAdd: {
      rectangle: () => ({
        id: nextBodyId++,
        inertia: Infinity,
        inverseInertia: 0,
      }),
    },
    bodyRegistry: new BodyRegistry(),
  };
}

/** Deterministic RNG for testing. Returns sequence 0.1, 0.2, 0.3, ... */
function createSequentialRng(): () => number {
  let i = 0;
  return () => {
    i = (i + 1) % 10;
    return i / 10; // 0.1, 0.2, ..., 0.9, 0.0, 0.1, ...
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("zombie-spawner-utils", () => {
  beforeEach(() => {
    nextBodyId = 1;
  });

  afterEach(() => {
    resetWorld();
  });

  // -----------------------------------------------------------------------
  // getAvailableVariants
  // -----------------------------------------------------------------------

  describe("getAvailableVariants", () => {
    it("returns only shambler on night 1", () => {
      const variants = getAvailableVariants(1);
      expect(variants).toEqual(["shambler"]);
    });

    it("returns shambler and runner on night 2", () => {
      const variants = getAvailableVariants(2);
      expect(variants).toContain("shambler");
      expect(variants).toContain("runner");
      expect(variants).not.toContain("brute");
      expect(variants).not.toContain("horde");
    });

    it("returns all variants on night 3", () => {
      const variants = getAvailableVariants(3);
      expect(variants).toContain("shambler");
      expect(variants).toContain("runner");
      expect(variants).toContain("brute");
      expect(variants).toContain("horde");
      expect(variants).toHaveLength(4);
    });

    it("returns all variants on night 5+", () => {
      const variants = getAvailableVariants(5);
      expect(variants).toHaveLength(4);
    });

    it("clamps dayNumber 0 to 1 and returns shambler", () => {
      const variants = getAvailableVariants(0);
      expect(variants).toEqual(["shambler"]);
    });

    it("clamps negative dayNumber to 1", () => {
      const variants = getAvailableVariants(-5);
      expect(variants).toEqual(["shambler"]);
    });

    it("clamps NaN dayNumber to 1", () => {
      const variants = getAvailableVariants(NaN);
      expect(variants).toEqual(["shambler"]);
    });
  });

  // -----------------------------------------------------------------------
  // selectVariant
  // -----------------------------------------------------------------------

  describe("selectVariant", () => {
    it("returns shambler when it is the only option", () => {
      const result = selectVariant(["shambler"], Math.random);
      expect(result).toBe("shambler");
    });

    it("returns shambler for empty input (fallback)", () => {
      const result = selectVariant([], Math.random);
      expect(result).toBe("shambler");
    });

    it("selects variants from the available pool", () => {
      const available = getAvailableVariants(3);
      const selected = new Set<string>();

      // Run many selections to cover all variants
      for (let i = 0; i < 1000; i++) {
        selected.add(selectVariant(available, Math.random));
      }

      expect(selected.has("shambler")).toBe(true);
      expect(selected.has("runner")).toBe(true);
      expect(selected.has("brute")).toBe(true);
      expect(selected.has("horde")).toBe(true);
    });

    it("respects weighted distribution approximately", () => {
      const available = getAvailableVariants(3);
      const counts: Record<string, number> = {
        shambler: 0,
        runner: 0,
        brute: 0,
        horde: 0,
      };

      const iterations = 10000;
      for (let i = 0; i < iterations; i++) {
        const v = selectVariant(available, Math.random);
        counts[v]++;
      }

      // Shambler (weight 40) should be most common
      // Runner (weight 25) next, Brute (weight 20), Horde (weight 15) least
      expect(counts.shambler).toBeGreaterThan(counts.runner);
      expect(counts.runner).toBeGreaterThan(counts.horde);
    });

    it("uses the rng parameter for selection", () => {
      const available = getAvailableVariants(3);

      // With rng always returning 0, should select the first variant (shambler)
      const result1 = selectVariant(available, () => 0);
      expect(result1).toBe("shambler");

      // With rng returning 0.99, should select the last variant
      const result2 = selectVariant(available, () => 0.99);
      expect(result2).toBe("horde");
    });
  });

  // -----------------------------------------------------------------------
  // spawnZombie
  // -----------------------------------------------------------------------

  describe("spawnZombie", () => {
    it("spawns a shambler with correct stats", () => {
      const ctx = createMockSpawnContext();
      const entity = spawnZombie(ctx, "shambler", 100, 200);

      expect(entity.zombieType.variant).toBe("shambler");
      expect(entity.health.current).toBe(VARIANT_HEALTH.shambler);
      expect(entity.health.max).toBe(VARIANT_HEALTH.shambler);
      expect(entity.zombieType.moveSpeed).toBe(VARIANT_STATS.shambler.moveSpeed);
    });

    it("spawns a runner with correct stats", () => {
      const ctx = createMockSpawnContext();
      const entity = spawnZombie(ctx, "runner", 100, 200);

      expect(entity.zombieType.variant).toBe("runner");
      expect(entity.health.current).toBe(VARIANT_HEALTH.runner);
      expect(entity.zombieType.moveSpeed).toBe(VARIANT_STATS.runner.moveSpeed);
      expect(entity.zombieType.vaultDurabilityThreshold).toBeGreaterThan(0);
    });

    it("spawns a brute with correct stats", () => {
      const ctx = createMockSpawnContext();
      const entity = spawnZombie(ctx, "brute", 100, 200);

      expect(entity.zombieType.variant).toBe("brute");
      expect(entity.health.current).toBe(VARIANT_HEALTH.brute);
      expect(entity.zombieType.barricadeDamageMultiplier).toBe(3);
      expect(entity.zombieType.bodySize).toBe(28);
    });

    it("spawns a horde zombie with correct stats", () => {
      const ctx = createMockSpawnContext();
      const entity = spawnZombie(ctx, "horde", 100, 200);

      expect(entity.zombieType.variant).toBe("horde");
      expect(entity.health.current).toBe(VARIANT_HEALTH.horde);
      expect(entity.zombieType.bodySize).toBe(14);
    });

    it("sets correct sprite key per variant", () => {
      const ctx = createMockSpawnContext();

      const shambler = spawnZombie(ctx, "shambler", 0, 0);
      expect(shambler.renderable.spriteKey).toBe("zombie");

      const runner = spawnZombie(ctx, "runner", 0, 0);
      expect(runner.renderable.spriteKey).toBe("zombie_runner");

      const brute = spawnZombie(ctx, "brute", 0, 0);
      expect(brute.renderable.spriteKey).toBe("zombie_brute");

      const horde = spawnZombie(ctx, "horde", 0, 0);
      expect(horde.renderable.spriteKey).toBe("zombie_horde");
    });

    it("applies tick offset for pathfinding stagger", () => {
      const ctx = createMockSpawnContext();
      const entity = spawnZombie(ctx, "shambler", 100, 200, 15);

      expect(entity.aiState.ticksSinceLastPathCalc).toBe(
        15 % VARIANT_STATS.shambler.pathRecalcInterval,
      );
    });

    it("registers physics body in the body registry", () => {
      const ctx = createMockSpawnContext();
      const entity = spawnZombie(ctx, "shambler", 100, 200);

      const body = ctx.bodyRegistry.get(entity.physicsBody.bodyId);
      expect(body).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // spawnHordeCluster
  // -----------------------------------------------------------------------

  describe("spawnHordeCluster", () => {
    it("spawns between min and max horde zombies", () => {
      const ctx = createMockSpawnContext();
      const rng = createSequentialRng();
      const entities = spawnHordeCluster(ctx, 100, 200, rng);

      expect(entities.length).toBeGreaterThanOrEqual(HORDE_CLUSTER_SIZE.min);
      expect(entities.length).toBeLessThanOrEqual(HORDE_CLUSTER_SIZE.max);
    });

    it("all cluster members are horde variant", () => {
      const ctx = createMockSpawnContext();
      const rng = createSequentialRng();
      const entities = spawnHordeCluster(ctx, 100, 200, rng);

      for (const e of entities) {
        expect(e.zombieType.variant).toBe("horde");
      }
    });

    it("cluster members have offset positions around center", () => {
      const ctx = createMockSpawnContext();
      const rng = createSequentialRng();
      const centerX = 500;
      const centerY = 500;
      const entities = spawnHordeCluster(ctx, centerX, centerY, rng);

      for (const e of entities) {
        const dx = e.position.x - centerX;
        const dy = e.position.y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Each zombie should be within cluster spread radius
        expect(dist).toBeLessThanOrEqual(HORDE_CLUSTER_SPREAD + 1);
      }
    });

    it("each cluster member has a unique body ID", () => {
      const ctx = createMockSpawnContext();
      const rng = createSequentialRng();
      const entities = spawnHordeCluster(ctx, 100, 200, rng);

      const bodyIds = new Set(entities.map((e) => e.physicsBody.bodyId));
      expect(bodyIds.size).toBe(entities.length);
    });

    it("cluster members have staggered tick offsets", () => {
      const ctx = createMockSpawnContext();
      const rng = createSequentialRng();
      const entities = spawnHordeCluster(ctx, 100, 200, rng, 10);

      // Each should have a different tick offset base + i
      const offsets = entities.map((e) => e.aiState.ticksSinceLastPathCalc);
      const uniqueOffsets = new Set(offsets);
      expect(uniqueOffsets.size).toBe(entities.length);
    });

    it("adds all entities to the ECS world", () => {
      const ctx = createMockSpawnContext();
      const rng = createSequentialRng();
      const initialCount = world.entities.length;
      const entities = spawnHordeCluster(ctx, 100, 200, rng);

      expect(world.entities.length).toBe(initialCount + entities.length);
    });
  });
});
