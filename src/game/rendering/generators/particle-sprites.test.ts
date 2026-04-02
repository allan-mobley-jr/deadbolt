import { describe, it, expect, vi } from "vitest";
import { PARTICLE_GENERATORS } from "./particle-sprites";

function createMockCtx() {
  return {
    fillStyle: "",
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

const ALL_KEYS = Object.keys(PARTICLE_GENERATORS);
const ALLOWED_FILLS = new Set(["#ffffff", "#dddddd", "#cccccc", "#aaaaaa"]);

describe("PARTICLE_GENERATORS", () => {
  it("defines 5 particle texture types", () => {
    expect(ALL_KEYS).toHaveLength(5);
    expect(ALL_KEYS).toContain("particle-ember");
    expect(ALL_KEYS).toContain("particle-blood");
    expect(ALL_KEYS).toContain("particle-spark");
    expect(ALL_KEYS).toContain("particle-splinter");
    expect(ALL_KEYS).toContain("particle-dust");
  });
});

describe("particle drawing", () => {
  for (const key of ALL_KEYS) {
    const gen = PARTICLE_GENERATORS[key];

    it(`${key}: calls fillRect at least once`, () => {
      const ctx = createMockCtx();
      gen.draw(ctx);
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it(`${key}: uses only white/gray fill styles`, () => {
      const styles: string[] = [];
      const ctx = createMockCtx();
      ctx.fillRect = vi.fn().mockImplementation(() => {
        styles.push(ctx.fillStyle as string);
      }) as unknown as CanvasRenderingContext2D["fillRect"];
      gen.draw(ctx);
      for (const s of styles) {
        expect(ALLOWED_FILLS.has(s), `${key} used "${s}"`).toBe(true);
      }
    });

    it(`${key}: draws within declared bounds`, () => {
      const ctx = createMockCtx();
      gen.draw(ctx);
      const calls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
      for (const [x, y, w, h] of calls) {
        expect(x as number, "x < 0").toBeGreaterThanOrEqual(0);
        expect(y as number, "y < 0").toBeGreaterThanOrEqual(0);
        expect((x as number) + (w as number), "exceeds width").toBeLessThanOrEqual(gen.width);
        expect((y as number) + (h as number), "exceeds height").toBeLessThanOrEqual(gen.height);
      }
    });
  }

  it("ember has diamond shape (4×4)", () => {
    const gen = PARTICLE_GENERATORS["particle-ember"];
    expect(gen.width).toBe(4);
    expect(gen.height).toBe(4);
  });

  it("blood has irregular blob (3×3)", () => {
    const gen = PARTICLE_GENERATORS["particle-blood"];
    expect(gen.width).toBe(3);
    expect(gen.height).toBe(3);
  });

  it("spark has cross shape (4×4)", () => {
    const gen = PARTICLE_GENERATORS["particle-spark"];
    expect(gen.width).toBe(4);
    expect(gen.height).toBe(4);
  });

  it("splinter is elongated (2×5)", () => {
    const gen = PARTICLE_GENERATORS["particle-splinter"];
    expect(gen.width).toBe(2);
    expect(gen.height).toBe(5);
  });

  it("dust is soft circle (3×3)", () => {
    const gen = PARTICLE_GENERATORS["particle-dust"];
    expect(gen.width).toBe(3);
    expect(gen.height).toBe(3);
  });
});
