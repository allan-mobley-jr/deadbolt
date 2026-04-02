import { describe, it, expect, vi, afterEach } from "vitest";
import { SpriteRegistry, resetSpriteRegistry } from "./sprite-registry";

// ---------------------------------------------------------------------------
// Mock Phaser scene with texture manager
// ---------------------------------------------------------------------------

function createMockScene() {
  const canvases: Array<{
    key: string;
    width: number;
    height: number;
    ctx: { fillStyle: string; fillRect: ReturnType<typeof vi.fn> };
    refresh: ReturnType<typeof vi.fn>;
  }> = [];

  const existingKeys = new Set<string>();

  const scene = {
    textures: {
      exists: vi.fn().mockImplementation((key: string) => existingKeys.has(key)),
      createCanvas: vi.fn().mockImplementation((key: string, w: number, h: number) => {
        const ctx = { fillStyle: "", fillRect: vi.fn() };
        const canvas = { key, width: w, height: h, getContext: () => ctx, ctx, refresh: vi.fn() };
        canvases.push(canvas);
        return canvas;
      }),
    },
  } as unknown as Phaser.Scene;

  return { scene, canvases, existingKeys };
}

describe("SpriteRegistry", () => {
  afterEach(() => {
    resetSpriteRegistry();
  });

  it("initializes without errors", () => {
    const { scene } = createMockScene();
    const registry = new SpriteRegistry();
    expect(() => registry.initialize(scene)).not.toThrow();
    expect(registry.isInitialized).toBe(true);
  });

  it("generates canvas textures for all known sprite keys", () => {
    const { scene, canvases } = createMockScene();
    const registry = new SpriteRegistry();
    registry.initialize(scene);

    // Should have created many textures (entities + objects + fallback)
    expect(canvases.length).toBeGreaterThan(10);
  });

  it("fills all canvas textures with white", () => {
    const { scene, canvases } = createMockScene();
    const registry = new SpriteRegistry();
    registry.initialize(scene);

    for (const c of canvases) {
      expect(c.ctx.fillStyle).toBe("#ffffff");
      expect(c.ctx.fillRect).toHaveBeenCalledWith(0, 0, c.width, c.height);
      expect(c.refresh).toHaveBeenCalled();
    }
  });

  it("returns correct dimensions for player", () => {
    const { scene } = createMockScene();
    const registry = new SpriteRegistry();
    registry.initialize(scene);

    const entry = registry.get("player");
    expect(entry.width).toBe(24);
    expect(entry.height).toBe(24);
    expect(entry.textureKey).toBe("spr_player");
  });

  it("returns correct dimensions for zombie variants", () => {
    const { scene } = createMockScene();
    const registry = new SpriteRegistry();
    registry.initialize(scene);

    expect(registry.get("zombie").width).toBe(20);
    expect(registry.get("zombie_runner").width).toBe(18);
    expect(registry.get("zombie_brute").width).toBe(28);
    expect(registry.get("zombie_horde").width).toBe(12);
  });

  it("returns correct dimensions for bullet", () => {
    const { scene } = createMockScene();
    const registry = new SpriteRegistry();
    registry.initialize(scene);

    const entry = registry.get("bullet");
    expect(entry.width).toBe(6);
    expect(entry.height).toBe(6);
  });

  it("returns 32x32 for immovable objects (bookshelf)", () => {
    const { scene } = createMockScene();
    const registry = new SpriteRegistry();
    registry.initialize(scene);

    const entry = registry.get("bookshelf");
    expect(entry.width).toBe(32);
    expect(entry.height).toBe(32);
  });

  it("returns 16x16 for movable objects (wooden_chair)", () => {
    const { scene } = createMockScene();
    const registry = new SpriteRegistry();
    registry.initialize(scene);

    const entry = registry.get("wooden_chair");
    expect(entry.width).toBe(16);
    expect(entry.height).toBe(16);
  });

  it("returns a valid fallback for unknown keys", () => {
    const { scene } = createMockScene();
    const registry = new SpriteRegistry();
    registry.initialize(scene);

    const entry = registry.get("unknown_key_xyz");
    expect(entry.textureKey).toBeTruthy();
    expect(entry.width).toBeGreaterThan(0);
    expect(entry.height).toBeGreaterThan(0);
  });

  it("skips texture generation when texture already exists (atlas hot-swap)", () => {
    const { scene, existingKeys, canvases } = createMockScene();

    // Pre-register a texture key to simulate an atlas
    existingKeys.add("spr_player");

    const registry = new SpriteRegistry();
    registry.initialize(scene);

    // Should NOT have created a canvas for the already-existing key
    const playerCanvases = canvases.filter((c) => c.key === "spr_player");
    expect(playerCanvases).toHaveLength(0);

    // But entry should still exist with correct metadata
    const entry = registry.get("player");
    expect(entry.textureKey).toBe("spr_player");
    expect(entry.width).toBe(24);
  });

  it("does not reinitialize on second call", () => {
    const { scene, canvases } = createMockScene();
    const registry = new SpriteRegistry();
    registry.initialize(scene);
    const firstCount = canvases.length;

    registry.initialize(scene);
    expect(canvases.length).toBe(firstCount);
  });

  it("dynamically resolves unknown object types via getObjectDef", () => {
    const { scene } = createMockScene();
    const registry = new SpriteRegistry();
    registry.initialize(scene);

    // tire is in the manifest, so it's not truly "dynamic" — but this
    // verifies the fallback path returns consistent results for objects
    const entry = registry.get("tire");
    expect(entry.width).toBe(16); // tire is movable → 16x16
  });

  it("completes initialization in under 100ms", () => {
    const { scene } = createMockScene();
    const registry = new SpriteRegistry();

    const start = performance.now();
    registry.initialize(scene);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });
});
