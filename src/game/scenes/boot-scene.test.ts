import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import BootScene from "@/game/scenes/boot-scene";
import { PLAYER_TEXTURE_KEY, PLAYER_SIZE } from "@/game/scenes/boot-scene";
import { TILE_SIZE } from "@/game/tiles/tile-types";
import { TILESET_KEY } from "@/game/tiles/tileset-generator";
import { resetSpriteRegistry } from "@/game/rendering/sprite-registry";

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockCanvasTexture() {
  return {
    getContext: vi.fn().mockReturnValue({
      fillStyle: "",
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
    }),
    refresh: vi.fn(),
  };
}

function createMockScene() {
  const scene = new BootScene();

  scene.scene = { start: vi.fn() } as unknown as Phaser.Scenes.ScenePlugin;

  scene.textures = {
    createCanvas: vi.fn().mockImplementation(() => createMockCanvasTexture()),
    exists: vi.fn().mockReturnValue(false),
  } as unknown as Phaser.Textures.TextureManager;

  scene.game = {
    events: {
      emit: vi.fn(),
    },
  } as unknown as Phaser.Game;

  return scene;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("BootScene", () => {
  let scene: BootScene;

  beforeEach(() => {
    scene = createMockScene();
  });

  afterEach(() => {
    resetSpriteRegistry();
  });

  it("registers with the key 'BootScene'", () => {
    expect((scene as unknown as { key: string }).key).toBe("BootScene");
  });

  it("transitions to LoadingScene on create", () => {
    scene.create();
    expect(scene.scene.start).toHaveBeenCalledWith("LoadingScene");
  });

  it("generates the tileset texture during create", () => {
    scene.create();
    const createCanvas = scene.textures.createCanvas as ReturnType<typeof vi.fn>;
    // First call is the tileset, second is the player texture
    expect(createCanvas).toHaveBeenCalledWith(
      TILESET_KEY,
      expect.any(Number),
      TILE_SIZE,
    );
  });

  it("generates the player texture during create", () => {
    scene.create();
    const createCanvas = scene.textures.createCanvas as ReturnType<typeof vi.fn>;
    // Player texture call
    const playerCall = createCanvas.mock.calls.find(
      (args: unknown[]) => args[0] === PLAYER_TEXTURE_KEY,
    );
    expect(playerCall).toBeDefined();
    expect(playerCall![1]).toBe(TILE_SIZE);
    expect(playerCall![2]).toBe(TILE_SIZE);
  });

  it("draws the player texture as a coloured square with border gap", () => {
    const mockCtx = { fillStyle: "", fillRect: vi.fn() };
    const mockCanvas = { getContext: vi.fn().mockReturnValue(mockCtx), refresh: vi.fn() };
    let callCount = 0;
    (scene.textures.createCanvas as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      // Second createCanvas call is for the player texture
      return callCount === 2 ? mockCanvas : createMockCanvasTexture();
    });

    scene.create();

    const offset = (TILE_SIZE - PLAYER_SIZE) / 2;
    expect(mockCtx.fillStyle).toBe("#3366ff");
    expect(mockCtx.fillRect).toHaveBeenCalledWith(offset, offset, PLAYER_SIZE, PLAYER_SIZE);
    expect(mockCanvas.refresh).toHaveBeenCalled();
  });

  it("initializes the sprite registry during create", () => {
    scene.create();
    const createCanvas = scene.textures.createCanvas as ReturnType<typeof vi.fn>;
    // Registry generates textures with spr_ prefix
    const sprCalls = createCanvas.mock.calls.filter(
      (args: unknown[]) => typeof args[0] === "string" && (args[0] as string).startsWith("spr_"),
    );
    // Should have generated textures for player, zombies, bullet, and all object types + fallback
    expect(sprCalls.length).toBeGreaterThan(10);
  });

  it("initializes sprite registry before transitioning to LoadingScene", () => {
    const callOrder: string[] = [];
    const createCanvas = scene.textures.createCanvas as ReturnType<typeof vi.fn>;
    createCanvas.mockImplementation((...args: unknown[]) => {
      const key = args[0] as string;
      if (key.startsWith("spr_")) {
        callOrder.push("registry");
      }
      return createMockCanvasTexture();
    });
    (scene.scene.start as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callOrder.push("transition");
    });

    scene.create();

    // Registry should be initialized before scene transition
    const registryIndex = callOrder.indexOf("registry");
    const transitionIndex = callOrder.indexOf("transition");
    expect(registryIndex).toBeLessThan(transitionIndex);
  });

  it("emits boot-error event when asset generation fails", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (scene.textures.createCanvas as ReturnType<typeof vi.fn>).mockReturnValue(null);

    scene.create();

    expect(scene.game.events.emit).toHaveBeenCalledWith(
      "boot-error",
      expect.any(Error),
    );
    expect(scene.scene.start).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("does not transition to GameScene when asset generation fails", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (scene.textures.createCanvas as ReturnType<typeof vi.fn>).mockReturnValue(null);

    scene.create();

    expect(scene.scene.start).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
