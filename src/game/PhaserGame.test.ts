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
  setActiveError,
  getActiveError,
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
        debug: false,
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

  it("binds keyboard events to window", () => {
    const config = buildGameConfig("test");
    expect(config.input).toEqual({
      keyboard: {
        target: window,
      },
    });
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

describe("error accessors", () => {
  afterEach(() => {
    setActiveError(null);
  });

  it("getActiveError returns null before any error is set", () => {
    expect(getActiveError()).toBeNull();
  });

  it("setActiveError makes getActiveError return the error", () => {
    const err = new Error("test error");
    setActiveError(err);
    expect(getActiveError()).toBe(err);
  });

  it("setActiveError(null) clears the error", () => {
    setActiveError(new Error("will be cleared"));
    setActiveError(null);
    expect(getActiveError()).toBeNull();
  });

  it("destroyGame clears activeError", () => {
    const container = document.createElement("div");
    container.id = "error-test";
    document.body.appendChild(container);

    createGame("error-test");
    setActiveError(new Error("boot failure"));
    expect(getActiveError()).not.toBeNull();

    destroyGame();
    expect(getActiveError()).toBeNull();

    container.remove();
  });
});

describe("boot/loading error listeners", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    container.id = "err-listener-test";
    document.body.appendChild(container);
  });

  afterEach(() => {
    destroyGame();
    container.remove();
  });

  it("captures boot-error emitted on game.events", () => {
    const game = createGame("err-listener-test");
    expect(getActiveError()).toBeNull();

    const err = new Error("tileset generation failed");
    game.events.emit("boot-error", err);

    expect(getActiveError()).toBe(err);
  });

  it("captures generation-error emitted on game.events", () => {
    const game = createGame("err-listener-test");
    expect(getActiveError()).toBeNull();

    const err = new Error("world generation failed");
    game.events.emit("generation-error", err);

    expect(getActiveError()).toBe(err);
  });

  it("wraps non-Error values in an Error", () => {
    const game = createGame("err-listener-test");

    game.events.emit("boot-error", "string error");

    const captured = getActiveError();
    expect(captured).toBeInstanceOf(Error);
    expect(captured!.message).toBe("string error");
  });

  it("captures game-crash emitted on game.events", () => {
    const game = createGame("err-listener-test");
    expect(getActiveError()).toBeNull();

    // GameScene wraps errors with "Game loop crashed:" prefix before emitting
    const raw = new Error("physics exploded");
    const wrapped = new Error(`Game loop crashed: ${raw.message}`, { cause: raw });
    game.events.emit("game-crash", wrapped);

    expect(getActiveError()).toBe(wrapped);
    expect(getActiveError()!.message).toBe("Game loop crashed: physics exploded");
  });

  it("last error wins when multiple errors fire", () => {
    const game = createGame("err-listener-test");

    game.events.emit("boot-error", new Error("first"));
    game.events.emit("generation-error", new Error("second"));

    expect(getActiveError()!.message).toBe("second");
  });
});
