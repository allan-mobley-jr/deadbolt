import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateTileset, TILESET_KEY } from "./tileset-generator";
import {
  TileType,
  TILE_PROPERTIES,
  TILE_SIZE,
  RENDERABLE_TILE_COUNT,
} from "./tile-types";

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockCtx() {
  return {
    fillStyle: "",
    fillRect: vi.fn(),
  };
}

function createMockCanvasTexture(ctx: ReturnType<typeof createMockCtx>) {
  return {
    getContext: vi.fn().mockReturnValue(ctx),
    refresh: vi.fn(),
  };
}

function createMockScene(
  canvasTexture: ReturnType<typeof createMockCanvasTexture> | null = null,
) {
  const ctx = createMockCtx();
  const texture = canvasTexture ?? createMockCanvasTexture(ctx);

  return {
    scene: {
      textures: {
        createCanvas: vi.fn().mockReturnValue(texture),
      },
    } as unknown as Phaser.Scene,
    ctx,
    texture,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("tileset-generator", () => {
  describe("TILESET_KEY", () => {
    it("is a non-empty string", () => {
      expect(typeof TILESET_KEY).toBe("string");
      expect(TILESET_KEY.length).toBeGreaterThan(0);
    });
  });

  describe("generateTileset", () => {
    let mockCtx: ReturnType<typeof createMockCtx>;
    let mockTexture: ReturnType<typeof createMockCanvasTexture>;
    let mockScene: Phaser.Scene;

    beforeEach(() => {
      const mocks = createMockScene();
      mockCtx = mocks.ctx;
      mockTexture = mocks.texture;
      mockScene = mocks.scene;
    });

    it("creates a canvas texture with correct dimensions", () => {
      generateTileset(mockScene);

      const createCanvas = mockScene.textures
        .createCanvas as ReturnType<typeof vi.fn>;
      expect(createCanvas).toHaveBeenCalledWith(
        TILESET_KEY,
        RENDERABLE_TILE_COUNT * TILE_SIZE,
        TILE_SIZE,
      );
    });

    it("throws when createCanvas returns null", () => {
      (mockScene.textures.createCanvas as ReturnType<typeof vi.fn>).mockReturnValue(null);

      expect(() => generateTileset(mockScene)).toThrow(
        "Failed to create tileset canvas texture",
      );
    });

    it("draws exactly RENDERABLE_TILE_COUNT rectangles", () => {
      generateTileset(mockScene);
      expect(mockCtx.fillRect).toHaveBeenCalledTimes(RENDERABLE_TILE_COUNT);
    });

    it("skips TileType.Empty (does not draw at frame index -1)", () => {
      generateTileset(mockScene);

      // No fillRect at x = -TILE_SIZE (which would be Empty: 0 - 1 = -1)
      for (const call of mockCtx.fillRect.mock.calls) {
        expect(call[0]).toBeGreaterThanOrEqual(0);
      }
    });

    it("draws TileType.Wall at frame index 0 (x=0)", () => {
      generateTileset(mockScene);

      const wallFrameX = (TileType.Wall - 1) * TILE_SIZE; // 0
      const wallCall = mockCtx.fillRect.mock.calls.find(
        (args: unknown[]) => args[0] === wallFrameX,
      );
      expect(wallCall).toBeDefined();
      expect(wallCall![2]).toBe(TILE_SIZE); // width
      expect(wallCall![3]).toBe(TILE_SIZE); // height
    });

    it("draws TileType.Grass at the last frame position", () => {
      generateTileset(mockScene);

      const grassFrameX = (TileType.Grass - 1) * TILE_SIZE; // 6 * 32 = 192
      const grassCall = mockCtx.fillRect.mock.calls.find(
        (args: unknown[]) => args[0] === grassFrameX,
      );
      expect(grassCall).toBeDefined();
    });

    it("uses correct hex color strings from TILE_PROPERTIES", () => {
      // Track all fillStyle values set before each fillRect call
      const fillStyles: string[] = [];
      const originalFillRect = mockCtx.fillRect;
      mockCtx.fillRect = vi.fn().mockImplementation((...args: unknown[]) => {
        fillStyles.push(mockCtx.fillStyle);
        return originalFillRect(...args);
      });

      generateTileset(mockScene);

      // Verify each renderable tile type's color appears
      for (const key of Object.values(TileType)) {
        if (typeof key !== "number" || key === TileType.Empty) continue;
        const props = TILE_PROPERTIES[key as TileType];
        const expectedColor = `#${props.color.toString(16).padStart(6, "0")}`;
        expect(fillStyles).toContain(expectedColor);
      }
    });

    it("calls canvasTexture.refresh after drawing", () => {
      generateTileset(mockScene);
      expect(mockTexture.refresh).toHaveBeenCalledTimes(1);
    });

    it("all tiles are drawn at y=0 with full tile height", () => {
      generateTileset(mockScene);

      for (const call of mockCtx.fillRect.mock.calls) {
        expect(call[1]).toBe(0);        // y position
        expect(call[3]).toBe(TILE_SIZE); // height
      }
    });
  });
});
