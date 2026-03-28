import Phaser from "phaser";
import { describe, it, expect, afterEach } from "vitest";
import {
  buildGameConfig,
  destroyGame,
  getGame,
} from "@/game/PhaserGame";
import BootScene from "@/game/scenes/boot-scene";
import GameScene from "@/game/scenes/game-scene";

describe("buildGameConfig", () => {
  it("sets Matter.js physics with zero gravity", () => {
    const config = buildGameConfig("test");
    expect(config.physics).toEqual({
      default: "matter",
      matter: {
        gravity: { x: 0, y: 0 },
        debug: true,
      },
    });
  });

  it("sets scale to 1280x720 with FIT mode", () => {
    const config = buildGameConfig("test");
    const scale = config.scale as Record<string, unknown>;
    expect(scale.width).toBe(1280);
    expect(scale.height).toBe(720);
  });

  it("sets parent to the provided element id", () => {
    const config = buildGameConfig("my-container");
    expect(config.parent).toBe("my-container");
  });

  it("includes BootScene and GameScene in scene list", () => {
    const config = buildGameConfig("test");
    expect(config.scene).toEqual([BootScene, GameScene]);
  });

  it("targets 60 fps", () => {
    const config = buildGameConfig("test");
    const fps = config.fps as Record<string, unknown>;
    expect(fps.target).toBe(60);
    expect(fps.limit).toBe(60);
  });

  it("uses Phaser.AUTO renderer", () => {
    const config = buildGameConfig("test");
    expect(config.type).toBe(Phaser.AUTO);
  });

  it("suppresses the console banner", () => {
    const config = buildGameConfig("test");
    expect(config.banner).toBe(false);
  });
});

describe("game singleton", () => {
  afterEach(() => {
    destroyGame();
  });

  it("getGame returns null before creation", () => {
    expect(getGame()).toBeNull();
  });

  it("destroyGame is safe to call when no game exists", () => {
    expect(() => destroyGame()).not.toThrow();
  });
});
