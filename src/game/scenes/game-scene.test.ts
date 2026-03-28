import { describe, it, expect, vi, beforeEach } from "vitest";
import GameScene from "@/game/scenes/game-scene";

describe("GameScene", () => {
  let scene: GameScene;
  let setBackgroundColor: ReturnType<typeof vi.fn>;
  let setOrigin: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scene = new GameScene();
    setBackgroundColor = vi.fn();
    setOrigin = vi.fn();

    scene.cameras = {
      main: { setBackgroundColor },
    } as unknown as Phaser.Cameras.Scene2D.CameraManager;

    scene.add = {
      text: vi.fn().mockReturnValue({ setOrigin }),
    } as unknown as Phaser.GameObjects.GameObjectFactory;

    scene.scale = {
      width: 1280,
      height: 720,
    } as unknown as Phaser.Scale.ScaleManager;
  });

  it("registers with the key 'GameScene'", () => {
    expect((scene as unknown as { key: string }).key).toBe("GameScene");
  });

  it("sets a non-black background color on create", () => {
    scene.create();
    expect(setBackgroundColor).toHaveBeenCalledWith("#1a1a2e");
  });

  it("renders centered title text on create", () => {
    scene.create();

    expect(scene.add.text).toHaveBeenCalledWith(
      640,
      360,
      "Deadbolt",
      expect.objectContaining({ fontFamily: "monospace" }),
    );
    expect(setOrigin).toHaveBeenCalledWith(0.5);
  });
});
