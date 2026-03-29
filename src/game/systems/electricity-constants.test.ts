import { describe, it, expect } from "vitest";
import { ELECTRICITY } from "./electricity-constants";

describe("ELECTRICITY constants", () => {
  // --- Chain detection ---

  it("chain recalc interval is a positive integer", () => {
    expect(ELECTRICITY.CHAIN_RECALC_INTERVAL).toBeGreaterThan(0);
    expect(Number.isInteger(ELECTRICITY.CHAIN_RECALC_INTERVAL)).toBe(true);
  });

  // --- Battery ---

  it("initial charge is positive", () => {
    expect(ELECTRICITY.INITIAL_CHARGE).toBeGreaterThan(0);
  });

  it("max charge is positive", () => {
    expect(ELECTRICITY.MAX_CHARGE).toBeGreaterThan(0);
  });

  it("initial charge does not exceed max charge", () => {
    expect(ELECTRICITY.INITIAL_CHARGE).toBeLessThanOrEqual(
      ELECTRICITY.MAX_CHARGE,
    );
  });

  it("base drain rate is positive", () => {
    expect(ELECTRICITY.BASE_DRAIN_RATE).toBeGreaterThan(0);
  });

  it("per-object drain rate is non-negative", () => {
    expect(ELECTRICITY.PER_OBJECT_DRAIN_RATE).toBeGreaterThanOrEqual(0);
  });

  // --- Damage ---

  it("contact radius is positive", () => {
    expect(ELECTRICITY.CONTACT_RADIUS).toBeGreaterThan(0);
  });

  it("damage tick interval is a positive integer", () => {
    expect(ELECTRICITY.DAMAGE_TICK_INTERVAL).toBeGreaterThan(0);
    expect(Number.isInteger(ELECTRICITY.DAMAGE_TICK_INTERVAL)).toBe(true);
  });

  it("base damage per second is positive", () => {
    expect(ELECTRICITY.BASE_DAMAGE_PER_SECOND).toBeGreaterThan(0);
  });

  it("conductivity damage scale is positive", () => {
    expect(ELECTRICITY.CONDUCTIVITY_DAMAGE_SCALE).toBeGreaterThan(0);
  });

  // --- Stagger ---

  it("electrocution stagger duration is positive", () => {
    expect(ELECTRICITY.ELECTROCUTION_STAGGER_DURATION).toBeGreaterThan(0);
  });

  // --- Visual ---

  it("electrified tint colour is a valid 24-bit RGB value", () => {
    expect(ELECTRICITY.ELECTRIFIED_TINT_COLOR).toBeGreaterThanOrEqual(0);
    expect(ELECTRICITY.ELECTRIFIED_TINT_COLOR).toBeLessThanOrEqual(0xffffff);
  });

  it("electrified tint pulse rate is positive", () => {
    expect(ELECTRICITY.ELECTRIFIED_TINT_PULSE_RATE).toBeGreaterThan(0);
  });

  // --- Events ---

  it("charge event interval is a positive integer", () => {
    expect(ELECTRICITY.CHARGE_EVENT_INTERVAL).toBeGreaterThan(0);
    expect(Number.isInteger(ELECTRICITY.CHARGE_EVENT_INTERVAL)).toBe(true);
  });

  // --- Gameplay balance ---

  it("battery lasts at least 10 seconds with a single connected object", () => {
    // drainRate = BASE + 1 * PER_OBJECT
    const drainRate =
      ELECTRICITY.BASE_DRAIN_RATE + ELECTRICITY.PER_OBJECT_DRAIN_RATE;
    const lifetime = ELECTRICITY.INITIAL_CHARGE / drainRate;
    expect(lifetime).toBeGreaterThanOrEqual(10);
  });

  it("battery lasts less than 120 seconds solo (prevents infinite traps)", () => {
    // Minimum drain with 1 connected object
    const drainRate =
      ELECTRICITY.BASE_DRAIN_RATE + ELECTRICITY.PER_OBJECT_DRAIN_RATE;
    const lifetime = ELECTRICITY.MAX_CHARGE / drainRate;
    expect(lifetime).toBeLessThan(120);
  });
});
