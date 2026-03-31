import { describe, it, expect } from "vitest";
import { PARTICLES, PARTICLE_TEXTURES } from "./particle-constants";

describe("PARTICLES constants", () => {
  it("global max active is a positive integer", () => {
    expect(PARTICLES.MAX_ACTIVE).toBeGreaterThan(0);
    expect(Number.isInteger(PARTICLES.MAX_ACTIVE)).toBe(true);
  });

  it("depth is positive", () => {
    expect(PARTICLES.DEPTH).toBeGreaterThan(0);
  });

  it("fire particle values are valid", () => {
    expect(PARTICLES.FIRE_COUNT).toBeGreaterThan(0);
    expect(PARTICLES.FIRE_LIFESPAN).toBeGreaterThan(0);
    expect(PARTICLES.FIRE_SPEED_MIN).toBeLessThan(PARTICLES.FIRE_SPEED_MAX);
    expect(PARTICLES.FIRE_FREQUENCY).toBeGreaterThan(0);
  });

  it("explosion particle values are valid", () => {
    expect(PARTICLES.EXPLOSION_COUNT).toBeGreaterThan(0);
    expect(PARTICLES.EXPLOSION_LIFESPAN).toBeGreaterThan(0);
    expect(PARTICLES.EXPLOSION_SPEED_MIN).toBeLessThan(PARTICLES.EXPLOSION_SPEED_MAX);
  });

  it("blood particle values are valid", () => {
    expect(PARTICLES.BLOOD_COUNT).toBeGreaterThan(0);
    expect(PARTICLES.BLOOD_LIFESPAN).toBeGreaterThan(0);
  });

  it("dust speed threshold is positive", () => {
    expect(PARTICLES.DUST_SPEED_THRESHOLD).toBeGreaterThan(0);
  });

  it("electricity values are valid", () => {
    expect(PARTICLES.ELECTRIC_COUNT).toBeGreaterThan(0);
    expect(PARTICLES.ELECTRIC_LIFESPAN).toBeGreaterThan(0);
    expect(PARTICLES.ELECTRIC_FREQUENCY).toBeGreaterThan(0);
  });

  it("all tint values are non-negative integers", () => {
    const tints = [
      PARTICLES.FIRE_TINT,
      PARTICLES.EXPLOSION_TINT,
      PARTICLES.BLOOD_TINT,
      PARTICLES.DUST_TINT,
      PARTICLES.ELECTRIC_TINT,
      PARTICLES.SWING_TINT,
      PARTICLES.BREAK_TINT,
      PARTICLES.DEATH_TINT,
    ];
    for (const tint of tints) {
      expect(tint).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(tint)).toBe(true);
    }
  });
});

describe("PARTICLE_TEXTURES", () => {
  it("has circle and square texture keys", () => {
    expect(PARTICLE_TEXTURES.CIRCLE).toBe("particle-circle");
    expect(PARTICLE_TEXTURES.SQUARE).toBe("particle-square");
  });

  it("keys are non-empty strings", () => {
    expect(typeof PARTICLE_TEXTURES.CIRCLE).toBe("string");
    expect(PARTICLE_TEXTURES.CIRCLE.length).toBeGreaterThan(0);
    expect(typeof PARTICLE_TEXTURES.SQUARE).toBe("string");
    expect(PARTICLE_TEXTURES.SQUARE.length).toBeGreaterThan(0);
  });
});
