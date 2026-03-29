import { describe, it, expect } from "vitest";
import { FIRE } from "./fire-constants";

describe("FIRE constants", () => {
  it("spread check interval is a positive integer", () => {
    expect(FIRE.SPREAD_CHECK_INTERVAL).toBeGreaterThan(0);
    expect(Number.isInteger(FIRE.SPREAD_CHECK_INTERVAL)).toBe(true);
  });

  it("spread radius is positive", () => {
    expect(FIRE.SPREAD_RADIUS).toBeGreaterThan(0);
  });

  it("base ignition chance is between 0 and 1", () => {
    expect(FIRE.BASE_IGNITION_CHANCE).toBeGreaterThan(0);
    expect(FIRE.BASE_IGNITION_CHANCE).toBeLessThanOrEqual(1);
  });

  it("base burn duration is positive", () => {
    expect(FIRE.BASE_BURN_DURATION).toBeGreaterThan(0);
  });

  it("flammability duration scale is non-negative", () => {
    expect(FIRE.FLAMMABILITY_DURATION_SCALE).toBeGreaterThanOrEqual(0);
  });

  it("fuel burn duration is positive", () => {
    expect(FIRE.FUEL_BURN_DURATION).toBeGreaterThan(0);
  });

  it("fuel damage multiplier is at least 1", () => {
    expect(FIRE.FUEL_DAMAGE_MULTIPLIER).toBeGreaterThanOrEqual(1);
  });

  it("damage radius is positive", () => {
    expect(FIRE.DAMAGE_RADIUS).toBeGreaterThan(0);
  });

  it("base damage per second is positive", () => {
    expect(FIRE.BASE_DAMAGE_PER_SECOND).toBeGreaterThan(0);
  });

  it("damage falloff is between 0 and 1", () => {
    expect(FIRE.DAMAGE_FALLOFF).toBeGreaterThan(0);
    expect(FIRE.DAMAGE_FALLOFF).toBeLessThanOrEqual(1);
  });

  it("damage tick interval is a positive integer", () => {
    expect(FIRE.DAMAGE_TICK_INTERVAL).toBeGreaterThan(0);
    expect(Number.isInteger(FIRE.DAMAGE_TICK_INTERVAL)).toBe(true);
  });

  it("burn tint colour is a valid 24-bit RGB value", () => {
    expect(FIRE.BURN_TINT_COLOR).toBeGreaterThanOrEqual(0);
    expect(FIRE.BURN_TINT_COLOR).toBeLessThanOrEqual(0xffffff);
  });

  it("burn tint pulse rate is positive", () => {
    expect(FIRE.BURN_TINT_PULSE_RATE).toBeGreaterThan(0);
  });

  it("fire light radius is positive", () => {
    expect(FIRE.FIRE_LIGHT_RADIUS).toBeGreaterThan(0);
  });

  it("damage radius is less than or equal to spread radius", () => {
    // Fire should damage within a smaller zone than it spreads to
    expect(FIRE.DAMAGE_RADIUS).toBeLessThanOrEqual(FIRE.SPREAD_RADIUS);
  });

  it("fuel burns shorter than the base duration", () => {
    // Fuel has its own shorter override
    expect(FIRE.FUEL_BURN_DURATION).toBeLessThanOrEqual(FIRE.BASE_BURN_DURATION);
  });
});
