import { describe, it, expect, vi } from "vitest";
import GameScene from "@/game/scenes/game-scene";

describe("GameScene", () => {
  it("registers with the key 'GameScene'", () => {
    const scene = new GameScene();
    expect((scene as unknown as { key: string }).key).toBe("GameScene");
  });

  it("sets a non-black background color on create", () => {
    const scene = new GameScene();
    const setBackgroundColor = vi.fn();
    scene.cameras = {
      main: { setBackgroundColor },
    } as unknown as Phaser.Cameras.Scene2D.CameraManager;

    const setOrigin = vi.fn();
    scene.add = {
      text: vi.fn().mockReturnValue({ setOrigin }),
    } as unknown as Phaser.GameObjects.GameObjectFactory;

    scene.scale = {
      width: 1280,
      height: 720,
    } as unknown as Phaser.Scale.ScaleManager;

    scene.create();

    expect(setBackgroundColor).toHaveBeenCalledWith("#1a1a2e");
  });

  it("renders centered title text on create", () => {
    const scene = new GameScene();
    const setOrigin = vi.fn();
    scene.cameras = {
      main: { setBackgroundColor: vi.fn() },
    } as unknown as Phaser.Cameras.Scene2D.CameraManager;

    scene.add = {
      text: vi.fn().mockReturnValue({ setOrigin }),
    } as unknown as Phaser.GameObjects.GameObjectFactory;

    scene.scale = {
      width: 1280,
      height: 720,
    } as unknown as Phaser.Scale.ScaleManager;

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
