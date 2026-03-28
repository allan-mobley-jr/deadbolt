import { describe, it, expect, vi, beforeEach } from "vitest";
import BootScene from "@/game/scenes/boot-scene";
import { PLAYER_TEXTURE_KEY, PLAYER_SIZE } from "@/game/scenes/boot-scene";
import { TILE_SIZE } from "@/game/tiles/tile-types";
import { TILESET_KEY } from "@/game/tiles/tileset-generator";

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockCanvasTexture() {
  return {
    getContext: vi.fn().mockReturnValue({
      fillStyle: "",
      fillRect: vi.fn(),
    }),
    refresh: vi.fn(),
  };
}

function createMockScene() {
  const scene = new BootScene();

  scene.scene = { start: vi.fn() } as unknown as Phaser.Scenes.ScenePlugin;

  scene.textures = {
    createCanvas: vi.fn().mockImplementation(() => createMockCanvasTexture()),
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
