import { describe, it, expect } from "vitest";
import { PALETTE, resolveColor, colorByHpTier } from "./palette";

describe("PALETTE", () => {
  it("exports valid hex numbers for all sprite colours", () => {
    for (const [key, value] of Object.entries(PALETTE.sprite)) {
      expect(value, `sprite.${key}`).toBeTypeOf("number");
      expect(value, `sprite.${key}`).toBeGreaterThanOrEqual(0);
      expect(value, `sprite.${key}`).toBeLessThanOrEqual(0xffffff);
    }
  });

  it("exports valid hex numbers for all category colours", () => {
    for (const [key, value] of Object.entries(PALETTE.category)) {
      expect(value, `category.${key}`).toBeTypeOf("number");
      expect(value, `category.${key}`).toBeGreaterThan(0);
    }
  });

  it("exports valid hex numbers for all health bar colours", () => {
    for (const [key, value] of Object.entries(PALETTE.healthBar)) {
      expect(value, `healthBar.${key}`).toBeTypeOf("number");
    }
  });

  it("exports valid CSS hex strings for all damage text colours", () => {
    for (const [key, value] of Object.entries(PALETTE.damageText)) {
      expect(value, `damageText.${key}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("resolveColor", () => {
  it("returns correct colour for known entity keys", () => {
    expect(resolveColor("player")).toBe(PALETTE.sprite.player);
    expect(resolveColor("zombie")).toBe(PALETTE.sprite.zombie);
    expect(resolveColor("zombie_runner")).toBe(PALETTE.sprite.zombie_runner);
    expect(resolveColor("zombie_brute")).toBe(PALETTE.sprite.zombie_brute);
    expect(resolveColor("zombie_horde")).toBe(PALETTE.sprite.zombie_horde);
    expect(resolveColor("barricade")).toBe(PALETTE.sprite.barricade);
    expect(resolveColor("bullet")).toBe(PALETTE.sprite.bullet);
  });

  it("falls back to object definition renderColor for world objects", () => {
    const color = resolveColor("bookshelf");
    expect(color).toBe(PALETTE.category.FURNITURE);
  });

  it("returns furniture colour for wooden_chair", () => {
    expect(resolveColor("wooden_chair")).toBe(PALETTE.category.FURNITURE);
  });

  it("returns loot colour for gas_can", () => {
    expect(resolveColor("gas_can")).toBe(PALETTE.category.LOOT);
  });

  it("returns container colour for fridge", () => {
    expect(resolveColor("fridge")).toBe(PALETTE.category.CONTAINER);
  });

  it("returns debris colour for tire", () => {
    expect(resolveColor("tire")).toBe(PALETTE.category.DEBRIS);
  });

  it("returns fallback white for unknown keys", () => {
    expect(resolveColor("nonexistent_key_xyz")).toBe(PALETTE.sprite.fallback);
  });
});

describe("colorByHpTier", () => {
  it("returns danger at 0%", () => {
    expect(colorByHpTier(0, 0x00ff00, 0xffff00, 0xff0000)).toBe(0xff0000);
  });

  it("returns danger at exactly 33%", () => {
    expect(colorByHpTier(0.33, 0x00ff00, 0xffff00, 0xff0000)).toBe(0xff0000);
  });

  it("returns warning just above 33%", () => {
    expect(colorByHpTier(0.34, 0x00ff00, 0xffff00, 0xff0000)).toBe(0xffff00);
  });

  it("returns warning at exactly 66%", () => {
    expect(colorByHpTier(0.66, 0x00ff00, 0xffff00, 0xff0000)).toBe(0xffff00);
  });

  it("returns good just above 66%", () => {
    expect(colorByHpTier(0.67, 0x00ff00, 0xffff00, 0xff0000)).toBe(0x00ff00);
  });

  it("returns good at 100%", () => {
    expect(colorByHpTier(1.0, 0x00ff00, 0xffff00, 0xff0000)).toBe(0x00ff00);
  });
});
