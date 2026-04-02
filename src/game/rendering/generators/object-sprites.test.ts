import { describe, it, expect, vi } from "vitest";
import {
  getObjectSpriteGenerator,
  getObjectGeneratorKeys,
} from "./object-sprites";
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

// ---------------------------------------------------------------------------
// All 15 object type keys
// ---------------------------------------------------------------------------

const ALL_OBJECT_KEYS = [
  "bookshelf", "wooden_chair", "table", "sofa", "bed",
  "gas_can", "car_battery", "wire_spool", "wooden_plank", "metal_sheet",
  "fridge", "metal_shelving", "cardboard_box", "trash_can",
  "tire",
];

const IMMOVABLE_KEYS = ["bookshelf", "sofa", "bed", "fridge", "metal_shelving"];

// ---------------------------------------------------------------------------
// Generator lookup
// ---------------------------------------------------------------------------

describe("getObjectSpriteGenerator", () => {
  for (const key of ALL_OBJECT_KEYS) {
    it(`returns a generator for ${key}`, () => {
      expect(getObjectSpriteGenerator(key)).not.toBeNull();
    });
  }

  it("returns null for entity keys", () => {
    expect(getObjectSpriteGenerator("player")).toBeNull();
    expect(getObjectSpriteGenerator("zombie")).toBeNull();
    expect(getObjectSpriteGenerator("bullet")).toBeNull();
  });

  it("returns null for unknown keys", () => {
    expect(getObjectSpriteGenerator("nonexistent")).toBeNull();
  });

  it("getObjectGeneratorKeys returns all 15 object types", () => {
    const keys = getObjectGeneratorKeys();
    expect(keys).toHaveLength(15);
    for (const key of ALL_OBJECT_KEYS) {
      expect(keys).toContain(key);
    }
  });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe("object generator metadata", () => {
  for (const key of IMMOVABLE_KEYS) {
    it(`${key} is 32×32 (immovable)`, () => {
      const gen = getObjectSpriteGenerator(key)!;
      expect(gen.width).toBe(32);
      expect(gen.height).toBe(32);
    });
  }

  const movableKeys = ALL_OBJECT_KEYS.filter((k) => !IMMOVABLE_KEYS.includes(k));
  for (const key of movableKeys) {
    it(`${key} is 16×16 (movable)`, () => {
      const gen = getObjectSpriteGenerator(key)!;
      expect(gen.width).toBe(16);
      expect(gen.height).toBe(16);
    });
  }

  it("all generators have frameCount 1", () => {
    for (const key of ALL_OBJECT_KEYS) {
      const gen = getObjectSpriteGenerator(key)!;
      expect(gen.frameCount, key).toBe(1);
    }
  });

  it("all generators have consistent width = frameCount × frameWidth", () => {
    for (const key of ALL_OBJECT_KEYS) {
      const gen = getObjectSpriteGenerator(key)!;
      expect(gen.width, key).toBe(gen.frameCount * gen.frameWidth);
    }
  });
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

  it("all generators draw only white/gray fill styles", () => {
    for (const key of ALL_OBJECT_KEYS) {
      const gen = getObjectSpriteGenerator(key)!;
      const styles = collectFillStyles(gen);
      for (const style of styles) {
        expect(ALLOWED_FILLS.has(style), `${key} used disallowed fillStyle "${style}"`).toBe(true);
      }
    }
  });

  it("all generators call fillRect at least once", () => {
    for (const key of ALL_OBJECT_KEYS) {
      const gen = getObjectSpriteGenerator(key)!;
      const ctx = createMockCtx();
      gen.draw(ctx);
      expect(ctx.fillRect, `${key} did not draw anything`).toHaveBeenCalled();
    }
  });

  it("all generators draw within their declared bounds", () => {
    for (const key of ALL_OBJECT_KEYS) {
      const gen = getObjectSpriteGenerator(key)!;
      const ctx = createMockCtx();
      gen.draw(ctx);

      const calls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
      for (const [x, y, w, h] of calls) {
        expect(x as number, `${key} x out of bounds`).toBeGreaterThanOrEqual(0);
        expect(y as number, `${key} y out of bounds`).toBeGreaterThanOrEqual(0);
        expect(
          (x as number) + (w as number),
          `${key} x+w=${(x as number) + (w as number)} exceeds width ${gen.width}`,
        ).toBeLessThanOrEqual(gen.width);
        expect(
          (y as number) + (h as number),
          `${key} y+h=${(y as number) + (h as number)} exceeds height ${gen.height}`,
        ).toBeLessThanOrEqual(gen.height);
      }
    }
  });

  it("each object draws a unique silhouette (different call patterns)", () => {
    const signatures = new Map<string, number>();
    for (const key of ALL_OBJECT_KEYS) {
      const gen = getObjectSpriteGenerator(key)!;
      const ctx = createMockCtx();
      gen.draw(ctx);
      const callCount = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls.length;
      signatures.set(key, callCount);
    }
    // At least check that not ALL objects have the same call count
    const uniqueCounts = new Set(signatures.values());
    expect(uniqueCounts.size).toBeGreaterThan(1);
  });
});
