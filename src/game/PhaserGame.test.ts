import Phaser from "phaser";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import {
  buildGameConfig,
  createGame,
  destroyGame,
  getGame,
  setActiveBus,
  getActiveBus,
  setActiveSeed,
  getActiveSeed,
} from "@/game/PhaserGame";
import { createGameEventBus } from "@/game/events/event-bus";
import BootScene from "@/game/scenes/boot-scene";
import LoadingScene from "@/game/scenes/loading-scene";
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
    expect(config.scale).toMatchObject({ width: 1280, height: 720 });
  });

  it("sets parent to the provided element id", () => {
    const config = buildGameConfig("my-container");
    expect(config.parent).toBe("my-container");
  });

  it("includes BootScene, LoadingScene, and GameScene in scene list", () => {
    const config = buildGameConfig("test");
    expect(config.scene).toEqual([BootScene, LoadingScene, GameScene]);
  });

  it("targets 60 fps", () => {
    const config = buildGameConfig("test");
    expect(config.fps).toMatchObject({ target: 60, limit: 60 });
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

  it("calls destroy(true) to remove canvas from DOM", () => {
    const game = createGame("test");
    const spy = vi.spyOn(game, "destroy");
    destroyGame();
    expect(spy).toHaveBeenCalledWith(true);
  });

  it("creates a game even when parent element does not exist in DOM", () => {
    // No DOM element with id "nonexistent" — createGame should still succeed
    expect(() => createGame("nonexistent")).not.toThrow();
    expect(getGame()).not.toBeNull();
  });
});

describe("event bus accessors", () => {
  afterEach(() => {
    // Ensure bus is cleared even if destroyGame was not called
    setActiveBus(null);
  });

  it("getActiveBus returns null before any bus is set", () => {
    expect(getActiveBus()).toBeNull();
  });

  it("setActiveBus makes getActiveBus return the bus", () => {
    const bus = createGameEventBus();
    setActiveBus(bus);
    expect(getActiveBus()).toBe(bus);
  });

  it("destroyGame clears activeBus", () => {
    const container = document.createElement("div");
    container.id = "bus-test";
    document.body.appendChild(container);

    createGame("bus-test");
    setActiveBus(createGameEventBus());
    expect(getActiveBus()).not.toBeNull();

    destroyGame();
    expect(getActiveBus()).toBeNull();

    container.remove();
  });
});

describe("seed accessors", () => {
  afterEach(() => {
    setActiveSeed(null);
  });

  it("getActiveSeed returns null before any seed is set", () => {
    expect(getActiveSeed()).toBeNull();
  });

  it("setActiveSeed makes getActiveSeed return the seed", () => {
    setActiveSeed("test-seed-abc");
    expect(getActiveSeed()).toBe("test-seed-abc");
  });

  it("setActiveSeed(null) clears the seed", () => {
    setActiveSeed("some-seed");
    setActiveSeed(null);
    expect(getActiveSeed()).toBeNull();
  });

  it("destroyGame clears activeSeed", () => {
    const container = document.createElement("div");
    container.id = "seed-test";
    document.body.appendChild(container);

    createGame("seed-test");
    setActiveSeed("run-seed-123");
    expect(getActiveSeed()).toBe("run-seed-123");

    destroyGame();
    expect(getActiveSeed()).toBeNull();

    container.remove();
  });
});
