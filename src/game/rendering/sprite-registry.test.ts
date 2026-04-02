import { describe, it, expect, vi, afterEach } from "vitest";
import { SpriteRegistry, resetSpriteRegistry, ATLAS_KEYS } from "./sprite-registry";

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
  const mockTextureAdd = vi.fn();

  /**
   * Atlas mock: maps atlasKey → set of frame names.
   * Populate via `atlasFrames.set("atlas-entities", new Set(["zombie"]))`.
   */
  const atlasFrames = new Map<string, Set<string>>();

  const scene = {
    textures: {
      exists: vi.fn().mockImplementation((key: string) => existingKeys.has(key)),
      createCanvas: vi.fn().mockImplementation((key: string, w: number, h: number) => {
        const ctx = { fillStyle: "", fillRect: vi.fn() };
        const canvas = { key, width: w, height: h, getContext: () => ctx, ctx, refresh: vi.fn() };
        canvases.push(canvas);
        return canvas;
      }),
      get: vi.fn().mockImplementation((key: string) => {
        const frames = atlasFrames.get(key);
        return {
          add: mockTextureAdd,
          has: (frameName: string) => frames?.has(frameName) ?? false,
        };
      }),
    },
  } as unknown as Phaser.Scene;

  return { scene, canvases, existingKeys, mockTextureAdd, atlasFrames };
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

  it("uses object sprite generators for world object textures", () => {
    const { scene, canvases } = createMockScene();
    const registry = new SpriteRegistry();
    registry.initialize(scene);

    // Object textures should exist and have drawing operations
    const objectCanvas = canvases.find((c) => c.key === "spr_bookshelf");
    expect(objectCanvas).toBeDefined();
    expect(objectCanvas!.width).toBe(32);
    expect(objectCanvas!.height).toBe(32);
    // Generators draw multiple fillRect calls (not just one white fill)
    expect(objectCanvas!.ctx.fillRect).toHaveBeenCalled();
    const callCount = objectCanvas!.ctx.fillRect.mock.calls.length;
    expect(callCount).toBeGreaterThan(1);
  });

  it("calls refresh on all canvas textures", () => {
    const { scene, canvases } = createMockScene();
    const registry = new SpriteRegistry();
    registry.initialize(scene);

    for (const c of canvases) {
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

  // -------------------------------------------------------------------------
  // Entity sprite generators (issue #176)
  // -------------------------------------------------------------------------

  it("creates wider canvas for player sprite strip (12 frames)", () => {
    const { scene, canvases } = createMockScene();
    const registry = new SpriteRegistry();
    registry.initialize(scene);

    const playerCanvas = canvases.find((c) => c.key === "spr_player");
    expect(playerCanvas).toBeDefined();
    // 12 frames × 24px = 288px wide, 24px tall
    expect(playerCanvas!.width).toBe(288);
    expect(playerCanvas!.height).toBe(24);
  });

  it("defines 12 frame regions on the player texture", () => {
    const { scene, mockTextureAdd } = createMockScene();
    const registry = new SpriteRegistry();
    registry.initialize(scene);

    const getTextures = scene.textures.get as ReturnType<typeof vi.fn>;
    expect(getTextures).toHaveBeenCalledWith("spr_player");

    // 12 frame definitions at 24px offsets
    for (let i = 0; i < 12; i++) {
      expect(mockTextureAdd).toHaveBeenCalledWith(i, 0, i * 24, 0, 24, 24);
    }
  });

  it("sets defaultFrame on player entry", () => {
    const { scene } = createMockScene();
    const registry = new SpriteRegistry();
    registry.initialize(scene);

    const entry = registry.get("player");
    expect(entry.defaultFrame).toBe(0);
  });

  it("sets defaultFrame on multi-frame zombie entries", () => {
    const { scene } = createMockScene();
    const registry = new SpriteRegistry();
    registry.initialize(scene);

    expect(registry.get("zombie").defaultFrame).toBe(0);
    expect(registry.get("zombie_runner").defaultFrame).toBe(0);
    expect(registry.get("zombie_brute").defaultFrame).toBe(0);
    expect(registry.get("zombie_horde").defaultFrame).toBe(0);
  });

  it("does not set defaultFrame on single-frame entities", () => {
    const { scene } = createMockScene();
    const registry = new SpriteRegistry();
    registry.initialize(scene);

    expect(registry.get("bullet").defaultFrame).toBeUndefined();
  });

  it("uses entity generators for known entity keys with walk frames", () => {
    const { scene, canvases } = createMockScene();
    const registry = new SpriteRegistry();
    registry.initialize(scene);

    // Zombie canvases should be 2-frame strips (double width)
    const zombieCanvas = canvases.find((c) => c.key === "spr_zombie");
    expect(zombieCanvas).toBeDefined();
    expect(zombieCanvas!.width).toBe(40); // 2 × 20
    expect(zombieCanvas!.height).toBe(20);

    const bruteCanvas = canvases.find((c) => c.key === "spr_zombie_brute");
    expect(bruteCanvas).toBeDefined();
    expect(bruteCanvas!.width).toBe(56); // 2 × 28
    expect(bruteCanvas!.height).toBe(28);
  });

  it("uses object generators for world object textures", () => {
    const { scene, canvases } = createMockScene();
    const registry = new SpriteRegistry();
    registry.initialize(scene);

    // World objects now use custom generators instead of plain white fills
    const chairCanvas = canvases.find((c) => c.key === "spr_wooden_chair");
    expect(chairCanvas).toBeDefined();
    expect(chairCanvas!.width).toBe(16);
    expect(chairCanvas!.height).toBe(16);
    // Should have multiple drawing calls (not just one white fill)
    expect(chairCanvas!.ctx.fillRect.mock.calls.length).toBeGreaterThan(1);
  });

  it("generates UI icon textures for all object types", () => {
    const { scene, canvases } = createMockScene();
    const registry = new SpriteRegistry();
    registry.initialize(scene);

    // UI icons should be registered with ui_ prefix
    const uiBookshelfCanvas = canvases.find((c) => c.key === "spr_ui_bookshelf");
    expect(uiBookshelfCanvas).toBeDefined();
    expect(uiBookshelfCanvas!.width).toBe(16);
    expect(uiBookshelfCanvas!.height).toBe(16);

    // Verify UI entry exists in registry
    const entry = registry.get("ui_bookshelf");
    expect(entry.textureKey).toBe("spr_ui_bookshelf");
    expect(entry.width).toBe(16);
    expect(entry.height).toBe(16);
  });

  // -------------------------------------------------------------------------
  // Atlas pipeline (issue #181)
  // -------------------------------------------------------------------------

  it("prioritises atlas frame over programmatic generation", () => {
    const { scene, canvases, existingKeys, atlasFrames } = createMockScene();

    // Simulate a loaded atlas with a "zombie" frame
    existingKeys.add(ATLAS_KEYS.ENTITIES);
    atlasFrames.set(ATLAS_KEYS.ENTITIES, new Set(["zombie"]));

    const registry = new SpriteRegistry();
    registry.initialize(scene);

    // Entry should use the atlas texture key + frame name
    const entry = registry.get("zombie");
    expect(entry.textureKey).toBe(ATLAS_KEYS.ENTITIES);
    expect(entry.defaultFrame).toBe("zombie");

    // No programmatic canvas should have been created for zombie
    const zombieCanvas = canvases.find((c) => c.key === "spr_zombie");
    expect(zombieCanvas).toBeUndefined();
  });

  it("falls back to programmatic generation when atlas has no matching frame", () => {
    const { scene, canvases, existingKeys, atlasFrames } = createMockScene();

    // Atlas loaded but contains no zombie frame
    existingKeys.add(ATLAS_KEYS.ENTITIES);
    atlasFrames.set(ATLAS_KEYS.ENTITIES, new Set(["bullet"]));

    const registry = new SpriteRegistry();
    registry.initialize(scene);

    // Zombie should still be programmatically generated
    const entry = registry.get("zombie");
    expect(entry.textureKey).toBe("spr_zombie");

    const zombieCanvas = canvases.find((c) => c.key === "spr_zombie");
    expect(zombieCanvas).toBeDefined();
  });

  it("supports partial atlas coverage (some frames from atlas, rest programmatic)", () => {
    const { scene, canvases, existingKeys, atlasFrames } = createMockScene();

    // Atlas has zombie but not zombie_runner
    existingKeys.add(ATLAS_KEYS.ENTITIES);
    atlasFrames.set(ATLAS_KEYS.ENTITIES, new Set(["zombie"]));

    const registry = new SpriteRegistry();
    registry.initialize(scene);

    // zombie → atlas
    expect(registry.get("zombie").textureKey).toBe(ATLAS_KEYS.ENTITIES);
    // zombie_runner → programmatic
    expect(registry.get("zombie_runner").textureKey).toBe("spr_zombie_runner");
    // player → programmatic (not in atlas)
    expect(registry.get("player").textureKey).toBe("spr_player");
  });

  it("falls back gracefully when no atlas files are loaded (current state)", () => {
    const { scene, canvases } = createMockScene();
    // No atlas keys in existingKeys — default state
    const registry = new SpriteRegistry();
    registry.initialize(scene);

    // All entries should use spr_ prefix (programmatic)
    expect(registry.get("player").textureKey).toBe("spr_player");
    expect(registry.get("zombie").textureKey).toBe("spr_zombie");
    expect(registry.get("bookshelf").textureKey).toBe("spr_bookshelf");

    // Programmatic canvases should have been created
    expect(canvases.length).toBeGreaterThan(10);
  });

  it("prioritises atlas frames for UI icons", () => {
    const { scene, existingKeys, atlasFrames } = createMockScene();

    existingKeys.add(ATLAS_KEYS.UI);
    atlasFrames.set(ATLAS_KEYS.UI, new Set(["ui_bookshelf"]));

    const registry = new SpriteRegistry();
    registry.initialize(scene);

    const entry = registry.get("ui_bookshelf");
    expect(entry.textureKey).toBe(ATLAS_KEYS.UI);
    expect(entry.defaultFrame).toBe("ui_bookshelf");
  });

  it("exports ATLAS_KEYS constants", () => {
    expect(ATLAS_KEYS.ENTITIES).toBe("atlas-entities");
    expect(ATLAS_KEYS.OBJECTS).toBe("atlas-objects");
    expect(ATLAS_KEYS.UI).toBe("atlas-ui");
  });
});
