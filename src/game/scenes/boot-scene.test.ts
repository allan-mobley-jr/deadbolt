import { describe, it, expect, vi } from "vitest";
import BootScene from "@/game/scenes/boot-scene";

describe("BootScene", () => {
  it("registers with the key 'BootScene'", () => {
    const scene = new BootScene();
    // Before Phaser boots the scene, the key lives on the mock's `key` field.
    expect((scene as unknown as { key: string }).key).toBe("BootScene");
  });

  it("transitions to GameScene on create", () => {
    const scene = new BootScene();
    // Mock the scene manager that Phaser.Scene uses
    scene.scene = { start: vi.fn() } as unknown as Phaser.Scenes.ScenePlugin;
    scene.create();
    expect(scene.scene.start).toHaveBeenCalledWith("GameScene");
  });
});
