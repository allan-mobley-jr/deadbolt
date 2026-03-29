import { describe, it, expect } from "vitest";
import { COMBAT } from "./combat-constants";

describe("COMBAT constants", () => {
  it("has positive base melee damage", () => {
    expect(COMBAT.BASE_MELEE_DAMAGE).toBeGreaterThan(0);
  });

  it("has positive melee cooldown", () => {
    expect(COMBAT.MELEE_COOLDOWN).toBeGreaterThan(0);
  });

  it("has swing duration shorter than cooldown", () => {
    expect(COMBAT.SWING_DURATION).toBeLessThan(COMBAT.MELEE_COOLDOWN);
  });

  it("has positive swing duration", () => {
    expect(COMBAT.SWING_DURATION).toBeGreaterThan(0);
  });

  it("has positive base melee range", () => {
    expect(COMBAT.BASE_MELEE_RANGE).toBeGreaterThan(0);
  });

  it("has positive sensor dimensions", () => {
    expect(COMBAT.SWING_SENSOR_WIDTH).toBeGreaterThan(0);
    expect(COMBAT.SWING_SENSOR_HEIGHT).toBeGreaterThan(0);
  });

  it("has non-negative scaling factors", () => {
    expect(COMBAT.MASS_DAMAGE_SCALE).toBeGreaterThanOrEqual(0);
    expect(COMBAT.MASS_RANGE_SCALE).toBeGreaterThanOrEqual(0);
    expect(COMBAT.MASS_COOLDOWN_SCALE).toBeGreaterThanOrEqual(0);
  });

  it("has positive knockback forces", () => {
    expect(COMBAT.ZOMBIE_KNOCKBACK_FORCE).toBeGreaterThan(0);
    expect(COMBAT.PLAYER_KNOCKBACK_FORCE).toBeGreaterThan(0);
  });

  it("has positive invulnerability duration", () => {
    expect(COMBAT.INVULNERABILITY_DURATION).toBeGreaterThan(0);
  });
});
