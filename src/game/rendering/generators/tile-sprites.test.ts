import { describe, it, expect, vi } from "vitest";
import { getTileSpriteDrawFn } from "./tile-sprites";
import { TileType, TILE_PROPERTIES, TILE_SIZE } from "@/game/tiles/tile-types";

// ---------------------------------------------------------------------------
// Mock canvas context
// ---------------------------------------------------------------------------

function createMockCtx() {
  return {
    fillStyle: "",
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

// All renderable tile types (excludes Empty)
const RENDERABLE_TYPES = [
  TileType.Wall,
  TileType.Floor,
  TileType.Door,
  TileType.Window,
  TileType.Road,
  TileType.Sidewalk,
  TileType.Grass,
];

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

describe("getTileSpriteDrawFn", () => {
  for (const tt of RENDERABLE_TYPES) {
    it(`returns a function for ${TILE_PROPERTIES[tt].label}`, () => {
      expect(getTileSpriteDrawFn(tt)).toBeTypeOf("function");
    });
  }

  it("returns null for TileType.Empty", () => {
    expect(getTileSpriteDrawFn(TileType.Empty)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Drawing behaviour
// ---------------------------------------------------------------------------

describe("tile drawing", () => {
  for (const tt of RENDERABLE_TYPES) {
    const label = TILE_PROPERTIES[tt].label;

    it(`${label}: calls fillRect at least once`, () => {
      const ctx = createMockCtx();
      const fn = getTileSpriteDrawFn(tt)!;
      fn(ctx, 0);
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it(`${label}: draws detail beyond the base fill (multiple fillRect calls)`, () => {
      const ctx = createMockCtx();
      const fn = getTileSpriteDrawFn(tt)!;
      fn(ctx, 0);
      const calls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length, `${label} should have detail beyond base fill`).toBeGreaterThan(1);
    });

    it(`${label}: first fillRect is the base fill at correct size`, () => {
      const ctx = createMockCtx();
      const fn = getTileSpriteDrawFn(tt)!;
      fn(ctx, 64); // offset = 64
      const firstCall = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(firstCall[0]).toBe(64);       // x offset
      expect(firstCall[1]).toBe(0);        // y = 0
      expect(firstCall[2]).toBe(TILE_SIZE); // full tile width
      expect(firstCall[3]).toBe(TILE_SIZE); // full tile height
    });

    it(`${label}: base fill uses the correct tile colour`, () => {
      const styles: string[] = [];
      const ctx = createMockCtx();
      ctx.fillRect = vi.fn().mockImplementation(() => {
        styles.push(ctx.fillStyle as string);
      }) as unknown as CanvasRenderingContext2D["fillRect"];
      const fn = getTileSpriteDrawFn(tt)!;
      fn(ctx, 0);

      const expectedBase = `#${TILE_PROPERTIES[tt].color.toString(16).padStart(6, "0")}`;
      expect(styles[0]).toBe(expectedBase);
    });

    it(`${label}: all drawing stays within 32px tile bounds`, () => {
      const ctx = createMockCtx();
      const fn = getTileSpriteDrawFn(tt)!;
      const offset = 96; // arbitrary offset
      fn(ctx, offset);

      const calls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
      for (const [rx, ry, rw, rh] of calls) {
        expect(rx as number, `x out of bounds`).toBeGreaterThanOrEqual(offset);
        expect(ry as number, `y out of bounds`).toBeGreaterThanOrEqual(0);
        expect(
          (rx as number) + (rw as number),
          `x+w exceeds right edge`,
        ).toBeLessThanOrEqual(offset + TILE_SIZE);
        expect(
          (ry as number) + (rh as number),
          `y+h exceeds bottom edge`,
        ).toBeLessThanOrEqual(TILE_SIZE);
      }
    });
  }

  it("uses only CSS hex colour strings (no named colours)", () => {
    const hexPattern = /^#[0-9a-f]{6}$/;
    for (const tt of RENDERABLE_TYPES) {
      const styles: string[] = [];
      const ctx = createMockCtx();
      ctx.fillRect = vi.fn().mockImplementation(() => {
        styles.push(ctx.fillStyle as string);
      }) as unknown as CanvasRenderingContext2D["fillRect"];
      const fn = getTileSpriteDrawFn(tt)!;
      fn(ctx, 0);

      for (const style of styles) {
        expect(
          hexPattern.test(style),
          `${TILE_PROPERTIES[tt].label} used non-hex style "${style}"`,
        ).toBe(true);
      }
    }
  });
});
