import { describe, it, expect } from "vitest";
import {
  SHAMBLER_STATS,
  SHAMBLER_HEALTH,
  RUNNER_STATS,
  RUNNER_HEALTH,
  BRUTE_STATS,
  BRUTE_HEALTH,
  HORDE_STATS,
  HORDE_HEALTH,
  ARCHETYPE_UNLOCK_NIGHT,
  ARCHETYPE_SPAWN_WEIGHT,
  VARIANT_STATS,
  VARIANT_HEALTH,
  HORDE_CLUSTER_SIZE,
  HORDE_CLUSTER_SPREAD,
  ZOMBIE_AI,
} from "./zombie-ai-constants";

describe("zombie AI constants", () => {
  describe("SHAMBLER_STATS", () => {
    it("has positive movement speed", () => {
      expect(SHAMBLER_STATS.moveSpeed).toBeGreaterThan(0);
    });

    it("is slower than the player (player is 200 px/s)", () => {
      expect(SHAMBLER_STATS.moveSpeed).toBeLessThan(200);
    });

    it("has positive attack damage", () => {
      expect(SHAMBLER_STATS.attackDamage).toBeGreaterThan(0);
    });

    it("has positive attack cooldown", () => {
      expect(SHAMBLER_STATS.attackCooldown).toBeGreaterThan(0);
    });

    it("has path recalc interval in the 30-60 range", () => {
      expect(SHAMBLER_STATS.pathRecalcInterval).toBeGreaterThanOrEqual(30);
      expect(SHAMBLER_STATS.pathRecalcInterval).toBeLessThanOrEqual(60);
    });

    it("has positive stagger duration", () => {
      expect(SHAMBLER_STATS.staggerDuration).toBeGreaterThan(0);
    });

    it("has variant set to shambler", () => {
      expect(SHAMBLER_STATS.variant).toBe("shambler");
    });
  });

  describe("SHAMBLER_HEALTH", () => {
    it("is a positive number", () => {
      expect(SHAMBLER_HEALTH).toBeGreaterThan(0);
    });
  });

  describe("ZOMBIE_AI", () => {
    it("has positive attack range", () => {
      expect(ZOMBIE_AI.ATTACK_RANGE).toBeGreaterThan(0);
    });

    it("has barricade detection range greater than attack range", () => {
      expect(ZOMBIE_AI.BARRICADE_DETECTION_RANGE).toBeGreaterThan(
        ZOMBIE_AI.ATTACK_RANGE,
      );
    });

    it("has positive waypoint threshold", () => {
      expect(ZOMBIE_AI.WAYPOINT_THRESHOLD).toBeGreaterThan(0);
    });

    it("has positive convergence spread", () => {
      expect(ZOMBIE_AI.CONVERGENCE_SPREAD).toBeGreaterThan(0);
    });

  });

  // -----------------------------------------------------------------------
  // Runner archetype constants
  // -----------------------------------------------------------------------

  describe("RUNNER_STATS", () => {
    it("moves 2-3x faster than shambler", () => {
      expect(RUNNER_STATS.moveSpeed).toBeGreaterThanOrEqual(SHAMBLER_STATS.moveSpeed * 2);
      expect(RUNNER_STATS.moveSpeed).toBeLessThanOrEqual(SHAMBLER_STATS.moveSpeed * 3);
    });

    it("has lower health than shambler", () => {
      expect(RUNNER_HEALTH).toBeLessThan(SHAMBLER_HEALTH);
    });

    it("has positive vault durability threshold", () => {
      expect(RUNNER_STATS.vaultDurabilityThreshold).toBeGreaterThan(0);
    });

    it("recalculates path more frequently than shambler", () => {
      expect(RUNNER_STATS.pathRecalcInterval).toBeLessThan(SHAMBLER_STATS.pathRecalcInterval);
    });

    it("has variant set to runner", () => {
      expect(RUNNER_STATS.variant).toBe("runner");
    });

    it("has default barricade damage multiplier", () => {
      expect(RUNNER_STATS.barricadeDamageMultiplier).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Brute archetype constants
  // -----------------------------------------------------------------------

  describe("BRUTE_STATS", () => {
    it("moves slower than shambler", () => {
      expect(BRUTE_STATS.moveSpeed).toBeLessThan(SHAMBLER_STATS.moveSpeed);
    });

    it("has higher health than shambler", () => {
      expect(BRUTE_HEALTH).toBeGreaterThan(SHAMBLER_HEALTH);
    });

    it("deals more damage per hit than shambler", () => {
      expect(BRUTE_STATS.attackDamage).toBeGreaterThan(SHAMBLER_STATS.attackDamage);
    });

    it("has 3x barricade damage multiplier", () => {
      expect(BRUTE_STATS.barricadeDamageMultiplier).toBe(3);
    });

    it("has larger body size than shambler", () => {
      expect(BRUTE_STATS.bodySize).toBeGreaterThan(SHAMBLER_STATS.bodySize);
    });

    it("has no vault capability", () => {
      expect(BRUTE_STATS.vaultDurabilityThreshold).toBe(0);
    });

    it("has variant set to brute", () => {
      expect(BRUTE_STATS.variant).toBe("brute");
    });
  });

  // -----------------------------------------------------------------------
  // Horde archetype constants
  // -----------------------------------------------------------------------

  describe("HORDE_STATS", () => {
    it("has lower health than shambler", () => {
      expect(HORDE_HEALTH).toBeLessThan(SHAMBLER_HEALTH);
    });

    it("deals less damage than shambler", () => {
      expect(HORDE_STATS.attackDamage).toBeLessThan(SHAMBLER_STATS.attackDamage);
    });

    it("has smaller body size than shambler", () => {
      expect(HORDE_STATS.bodySize).toBeLessThan(SHAMBLER_STATS.bodySize);
    });

    it("has default barricade damage multiplier", () => {
      expect(HORDE_STATS.barricadeDamageMultiplier).toBe(1);
    });

    it("has no vault capability", () => {
      expect(HORDE_STATS.vaultDurabilityThreshold).toBe(0);
    });

    it("has variant set to horde", () => {
      expect(HORDE_STATS.variant).toBe("horde");
    });
  });

  // -----------------------------------------------------------------------
  // Lookup maps and archetype meta
  // -----------------------------------------------------------------------

  describe("VARIANT_STATS lookup map", () => {
    it("maps all four variants to their stat presets", () => {
      expect(VARIANT_STATS.shambler).toBe(SHAMBLER_STATS);
      expect(VARIANT_STATS.runner).toBe(RUNNER_STATS);
      expect(VARIANT_STATS.brute).toBe(BRUTE_STATS);
      expect(VARIANT_STATS.horde).toBe(HORDE_STATS);
    });
  });

  describe("VARIANT_HEALTH lookup map", () => {
    it("maps all four variants to their health values", () => {
      expect(VARIANT_HEALTH.shambler).toBe(SHAMBLER_HEALTH);
      expect(VARIANT_HEALTH.runner).toBe(RUNNER_HEALTH);
      expect(VARIANT_HEALTH.brute).toBe(BRUTE_HEALTH);
      expect(VARIANT_HEALTH.horde).toBe(HORDE_HEALTH);
    });
  });

  describe("ARCHETYPE_UNLOCK_NIGHT", () => {
    it("shambler is available from night 1", () => {
      expect(ARCHETYPE_UNLOCK_NIGHT.shambler).toBe(1);
    });

    it("runner unlocks on night 2", () => {
      expect(ARCHETYPE_UNLOCK_NIGHT.runner).toBe(2);
    });

    it("brute unlocks on night 3", () => {
      expect(ARCHETYPE_UNLOCK_NIGHT.brute).toBe(3);
    });

    it("horde unlocks on night 3", () => {
      expect(ARCHETYPE_UNLOCK_NIGHT.horde).toBe(3);
    });
  });

  describe("ARCHETYPE_SPAWN_WEIGHT", () => {
    it("all weights are positive", () => {
      for (const v of ["shambler", "runner", "brute", "horde"] as const) {
        expect(ARCHETYPE_SPAWN_WEIGHT[v]).toBeGreaterThan(0);
      }
    });

    it("shambler has the highest weight", () => {
      expect(ARCHETYPE_SPAWN_WEIGHT.shambler).toBeGreaterThan(ARCHETYPE_SPAWN_WEIGHT.runner);
      expect(ARCHETYPE_SPAWN_WEIGHT.shambler).toBeGreaterThan(ARCHETYPE_SPAWN_WEIGHT.brute);
      expect(ARCHETYPE_SPAWN_WEIGHT.shambler).toBeGreaterThan(ARCHETYPE_SPAWN_WEIGHT.horde);
    });
  });

  describe("HORDE_CLUSTER_SIZE", () => {
    it("has min between 5 and 10", () => {
      expect(HORDE_CLUSTER_SIZE.min).toBeGreaterThanOrEqual(5);
      expect(HORDE_CLUSTER_SIZE.min).toBeLessThanOrEqual(10);
    });

    it("has max between min and 10", () => {
      expect(HORDE_CLUSTER_SIZE.max).toBeGreaterThanOrEqual(HORDE_CLUSTER_SIZE.min);
      expect(HORDE_CLUSTER_SIZE.max).toBeLessThanOrEqual(10);
    });
  });

  describe("HORDE_CLUSTER_SPREAD", () => {
    it("is a positive number", () => {
      expect(HORDE_CLUSTER_SPREAD).toBeGreaterThan(0);
    });
  });
});
