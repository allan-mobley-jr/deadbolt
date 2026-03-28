import Phaser from "phaser";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import {
  buildGameConfig,
  createGame,
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
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    container.id = "test";
    document.body.appendChild(container);
  });

  afterEach(() => {
    destroyGame();
    container.remove();
  });

  it("getGame returns null before creation", () => {
    expect(getGame()).toBeNull();
  });

  it("destroyGame is safe to call when no game exists", () => {
    expect(() => destroyGame()).not.toThrow();
  });

  it("createGame returns a game instance", () => {
    const game = createGame("test");
    expect(game).toBeDefined();
    expect(getGame()).toBe(game);
  });

  it("createGame returns the same instance on double call (singleton guard)", () => {
    const first = createGame("test");
    const second = createGame("test");
    expect(first).toBe(second);
  });

  it("destroyGame resets getGame to null", () => {
    createGame("test");
    expect(getGame()).not.toBeNull();
    destroyGame();
    expect(getGame()).toBeNull();
  });

  it("createGame works again after destroyGame", () => {
    const first = createGame("test");
    destroyGame();
    const second = createGame("test");
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
  });

  it("removes stale canvas from parent before creating game", () => {
    const staleCanvas = document.createElement("canvas");
    container.appendChild(staleCanvas);
    expect(container.querySelector("canvas")).toBe(staleCanvas);

    createGame("test");

    // The stale canvas should have been removed
    expect(container.contains(staleCanvas)).toBe(false);
  });

  it("clears singleton before calling destroy to prevent corrupted state", () => {
    const game = createGame("test");
    // Make destroy throw to simulate a Phaser teardown failure
    game.destroy = () => {
      throw new Error("WebGL context lost");
    };

    // Should not throw — the error is caught internally
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => destroyGame()).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();

    // Singleton should be cleared despite the destroy failure
    expect(getGame()).toBeNull();

    // A new game can be created without getting the broken instance
    const newGame = createGame("test");
    expect(newGame).toBeDefined();
    expect(newGame).not.toBe(game);
  });
});
