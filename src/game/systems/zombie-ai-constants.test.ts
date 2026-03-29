import { describe, it, expect } from "vitest";
import { SHAMBLER_STATS, SHAMBLER_HEALTH, ZOMBIE_AI } from "./zombie-ai-constants";

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

    it("has positive body size", () => {
      expect(ZOMBIE_AI.BODY_SIZE).toBeGreaterThan(0);
    });

    it("has body size smaller than player (24)", () => {
      expect(ZOMBIE_AI.BODY_SIZE).toBeLessThan(24);
    });
  });
});
