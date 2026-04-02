import { describe, it, expect, vi } from "vitest";
import {
  getEntitySpriteGenerator,
  getGeneratorKeys,
} from "./entity-sprites";
import type { EntitySpriteGenerator } from "./entity-sprites";

// ---------------------------------------------------------------------------
// Mock canvas context
// ---------------------------------------------------------------------------

function createMockCtx() {
  return {
    fillStyle: "",
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

// ---------------------------------------------------------------------------
// Generator lookup
// ---------------------------------------------------------------------------

describe("getEntitySpriteGenerator", () => {
  it("returns a generator for player", () => {
    expect(getEntitySpriteGenerator("player")).not.toBeNull();
  });

  it("returns a generator for zombie", () => {
    expect(getEntitySpriteGenerator("zombie")).not.toBeNull();
  });

  it("returns a generator for zombie_runner", () => {
    expect(getEntitySpriteGenerator("zombie_runner")).not.toBeNull();
  });

  it("returns a generator for zombie_brute", () => {
    expect(getEntitySpriteGenerator("zombie_brute")).not.toBeNull();
  });

  it("returns a generator for zombie_horde", () => {
    expect(getEntitySpriteGenerator("zombie_horde")).not.toBeNull();
  });

  it("returns a generator for bullet", () => {
    expect(getEntitySpriteGenerator("bullet")).not.toBeNull();
  });

  it("returns null for unknown keys", () => {
    expect(getEntitySpriteGenerator("bookshelf")).toBeNull();
    expect(getEntitySpriteGenerator("unknown_xyz")).toBeNull();
  });

  it("getGeneratorKeys returns all 6 entity types", () => {
    const keys = getGeneratorKeys();
    expect(keys).toContain("player");
    expect(keys).toContain("zombie");
    expect(keys).toContain("zombie_runner");
    expect(keys).toContain("zombie_brute");
    expect(keys).toContain("zombie_horde");
    expect(keys).toContain("bullet");
    expect(keys).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// Generator metadata
// ---------------------------------------------------------------------------

describe("generator metadata", () => {
  it("player has 12 frames at 24px each (3 per direction × 4 directions)", () => {
    const gen = getEntitySpriteGenerator("player")!;
    expect(gen.frameCount).toBe(12);
    expect(gen.frameWidth).toBe(24);
    expect(gen.width).toBe(288); // 12 × 24
    expect(gen.height).toBe(24);
  });

  it("zombie has 2 frames at 20×20", () => {
    const gen = getEntitySpriteGenerator("zombie")!;
    expect(gen.frameCount).toBe(2);
    expect(gen.frameWidth).toBe(20);
    expect(gen.width).toBe(40);
    expect(gen.height).toBe(20);
  });

  it("zombie_runner has 2 frames at 18×18", () => {
    const gen = getEntitySpriteGenerator("zombie_runner")!;
    expect(gen.frameCount).toBe(2);
    expect(gen.frameWidth).toBe(18);
    expect(gen.width).toBe(36);
    expect(gen.height).toBe(18);
  });

  it("zombie_brute has 2 frames at 28×28", () => {
    const gen = getEntitySpriteGenerator("zombie_brute")!;
    expect(gen.frameCount).toBe(2);
    expect(gen.frameWidth).toBe(28);
    expect(gen.width).toBe(56);
    expect(gen.height).toBe(28);
  });

  it("zombie_horde has 2 frames at 12×12", () => {
    const gen = getEntitySpriteGenerator("zombie_horde")!;
    expect(gen.frameCount).toBe(2);
    expect(gen.frameWidth).toBe(12);
    expect(gen.width).toBe(24);
    expect(gen.height).toBe(12);
  });

  it("bullet has 1 frame at 6×6", () => {
    const gen = getEntitySpriteGenerator("bullet")!;
    expect(gen.frameCount).toBe(1);
    expect(gen.width).toBe(6);
    expect(gen.height).toBe(6);
  });

  it("all generators have consistent width = frameCount × frameWidth", () => {
    for (const key of getGeneratorKeys()) {
      const gen = getEntitySpriteGenerator(key)!;
      expect(gen.width, key).toBe(gen.frameCount * gen.frameWidth);
    }
  });
});

// ---------------------------------------------------------------------------
// Drawing operations
// ---------------------------------------------------------------------------

describe("drawing operations", () => {
  /** Collect all fillStyle values set during a generator draw call. */
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
    const allowed = new Set(["#ffffff", "#dddddd", "#cccccc", "#aaaaaa"]);
    for (const key of getGeneratorKeys()) {
      const gen = getEntitySpriteGenerator(key)!;
      const styles = collectFillStyles(gen);
      for (const style of styles) {
        expect(allowed.has(style), `${key} used disallowed fillStyle "${style}"`).toBe(true);
      }
    }
  });

  it("all generators call fillRect at least once", () => {
    for (const key of getGeneratorKeys()) {
      const gen = getEntitySpriteGenerator(key)!;
      const ctx = createMockCtx();
      gen.draw(ctx);
      expect(ctx.fillRect, `${key} did not draw anything`).toHaveBeenCalled();
    }
  });

  it("player generator draws across all 12 frames", () => {
    const gen = getEntitySpriteGenerator("player")!;
    const ctx = createMockCtx();
    gen.draw(ctx);

    // Collect all x positions from fillRect calls
    const xPositions = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls.map(
      (args: unknown[]) => args[0] as number,
    );

    // Should have drawing in all 12 frames (each 24px wide)
    for (let i = 0; i < 12; i++) {
      const lo = i * 24;
      const hi = lo + 24;
      const hasFrame = xPositions.some((x) => x >= lo && x < hi);
      expect(hasFrame, `missing frame ${i}`).toBe(true);
    }
  });

  it("single-frame generators draw within their bounds", () => {
    for (const key of getGeneratorKeys()) {
      const gen = getEntitySpriteGenerator(key)!;
      if (gen.frameCount > 1) continue; // skip multi-frame

      const ctx = createMockCtx();
      gen.draw(ctx);

      const calls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
      for (const [x, y, w, h] of calls) {
        expect(x as number, `${key} x out of bounds`).toBeGreaterThanOrEqual(0);
        expect(y as number, `${key} y out of bounds`).toBeGreaterThanOrEqual(0);
        expect((x as number) + (w as number), `${key} x+w exceeds width`).toBeLessThanOrEqual(gen.width);
        expect((y as number) + (h as number), `${key} y+h exceeds height`).toBeLessThanOrEqual(gen.height);
      }
    }
  });

  it("player generator draws within strip bounds", () => {
    const gen = getEntitySpriteGenerator("player")!;
    const ctx = createMockCtx();
    gen.draw(ctx);

    const calls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
    for (const [x, y, w, h] of calls) {
      expect(x as number, "x out of bounds").toBeGreaterThanOrEqual(0);
      expect(y as number, "y out of bounds").toBeGreaterThanOrEqual(0);
      expect((x as number) + (w as number), "x+w exceeds strip width").toBeLessThanOrEqual(gen.width);
      expect((y as number) + (h as number), "y+h exceeds height").toBeLessThanOrEqual(gen.height);
    }
  });
});
