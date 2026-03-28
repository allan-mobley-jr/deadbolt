import { describe, it, expect, vi } from "vitest";
import BootScene from "@/game/scenes/boot-scene";

describe("BootScene", () => {
  it("registers with the key 'BootScene'", () => {
    const scene = new BootScene();
    // Phaser.Scene stores the config key on sys.settings after init,
    // but before being added to a game, we can read the config passed to super.
    // The scene key is stored internally — access via the constructor arg
    // that Phaser.Scene reads: scene.sys.config.key (before boot) or
    // we verify by checking the internal field.
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
