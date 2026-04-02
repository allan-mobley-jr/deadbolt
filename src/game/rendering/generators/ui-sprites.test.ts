import { describe, it, expect, vi } from "vitest";
import { getUiSpriteGenerator, getUiGeneratorKeys } from "./ui-sprites";
import type { EntitySpriteGenerator } from "./entity-sprites";

// ---------------------------------------------------------------------------
// Mock canvas context
// ---------------------------------------------------------------------------

function createMockCtx() {
  return {
    fillStyle: "",
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

// All 15 object type keys
const ALL_OBJECT_KEYS = [
  "bookshelf", "wooden_chair", "table", "sofa", "bed",
  "gas_can", "car_battery", "wire_spool", "wooden_plank", "metal_sheet",
  "fridge", "metal_shelving", "cardboard_box", "trash_can",
  "tire",
];

// ---------------------------------------------------------------------------
// Generator lookup
// ---------------------------------------------------------------------------

describe("getUiSpriteGenerator", () => {
  for (const key of ALL_OBJECT_KEYS) {
    it(`returns a generator for ${key}`, () => {
      expect(getUiSpriteGenerator(key)).not.toBeNull();
    });
  }

  it("returns null for entity keys", () => {
    expect(getUiSpriteGenerator("player")).toBeNull();
    expect(getUiSpriteGenerator("zombie")).toBeNull();
  });

  it("returns null for unknown keys", () => {
    expect(getUiSpriteGenerator("nonexistent")).toBeNull();
  });

  it("getUiGeneratorKeys returns all 15 object types", () => {
    const keys = getUiGeneratorKeys();
    expect(keys).toHaveLength(15);
    for (const key of ALL_OBJECT_KEYS) {
      expect(keys).toContain(key);
    }
  });
});

// ---------------------------------------------------------------------------
// Metadata — all icons are 16×16
// ---------------------------------------------------------------------------

describe("UI icon metadata", () => {
  for (const key of ALL_OBJECT_KEYS) {
    it(`${key} icon is 16×16`, () => {
      const gen = getUiSpriteGenerator(key)!;
      expect(gen.width).toBe(16);
      expect(gen.height).toBe(16);
      expect(gen.frameCount).toBe(1);
    });
  }
});

// ---------------------------------------------------------------------------
// Drawing operations
// ---------------------------------------------------------------------------

describe("drawing operations", () => {
  const ALLOWED_FILLS = new Set(["#ffffff", "#dddddd", "#cccccc", "#aaaaaa"]);

  function collectFillStyles(gen: EntitySpriteGenerator): string[] {
    const styles: string[] = [];
    const ctx = createMockCtx();
    ctx.fillRect = vi.fn().mockImplementation(() => {
      styles.push(ctx.fillStyle as string);
    }) as unknown as CanvasRenderingContext2D["fillRect"];
    gen.draw(ctx);
    return styles;
  }

  it("all UI icons draw only white/gray fill styles", () => {
    for (const key of ALL_OBJECT_KEYS) {
      const gen = getUiSpriteGenerator(key)!;
      const styles = collectFillStyles(gen);
      for (const style of styles) {
        expect(ALLOWED_FILLS.has(style), `${key} icon used disallowed "${style}"`).toBe(true);
      }
    }
  });

  it("all UI icons call fillRect at least once", () => {
    for (const key of ALL_OBJECT_KEYS) {
      const gen = getUiSpriteGenerator(key)!;
      const ctx = createMockCtx();
      gen.draw(ctx);
      expect(ctx.fillRect, `${key} icon did not draw`).toHaveBeenCalled();
    }
  });

  it("all UI icons draw within 16×16 bounds", () => {
    for (const key of ALL_OBJECT_KEYS) {
      const gen = getUiSpriteGenerator(key)!;
      const ctx = createMockCtx();
      gen.draw(ctx);

      const calls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
      for (const [x, y, w, h] of calls) {
        expect(x as number, `${key} icon x<0`).toBeGreaterThanOrEqual(0);
        expect(y as number, `${key} icon y<0`).toBeGreaterThanOrEqual(0);
        expect(
          (x as number) + (w as number),
          `${key} icon x+w exceeds 16`,
        ).toBeLessThanOrEqual(16);
        expect(
          (y as number) + (h as number),
          `${key} icon y+h exceeds 16`,
        ).toBeLessThanOrEqual(16);
      }
    }
  });
});
