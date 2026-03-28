import { describe, it, expect, vi, beforeEach } from "vitest";
import GameScene from "@/game/scenes/game-scene";

/** Create a mock Phaser Text object that supports chaining. */
function createMockText() {
  const text: Record<string, ReturnType<typeof vi.fn>> = {};
  text.setOrigin = vi.fn().mockReturnValue(text);
  text.setScrollFactor = vi.fn().mockReturnValue(text);
  text.setDepth = vi.fn().mockReturnValue(text);
  text.setVisible = vi.fn().mockReturnValue(text);
  text.setText = vi.fn().mockReturnValue(text);
  return text;
}

describe("GameScene", () => {
  let scene: GameScene;
  let setBackgroundColor: ReturnType<typeof vi.fn>;
  let titleText: ReturnType<typeof createMockText>;
  let fpsText: ReturnType<typeof createMockText>;
  let keydownHandler: ((event: unknown) => void) | undefined;

  beforeEach(() => {
    scene = new GameScene();
    setBackgroundColor = vi.fn();
    titleText = createMockText();
    fpsText = createMockText();

    let textCallCount = 0;
    scene.cameras = {
      main: { setBackgroundColor },
    } as unknown as Phaser.Cameras.Scene2D.CameraManager;

    scene.add = {
      text: vi.fn().mockImplementation(() => {
        textCallCount++;
        // First call is the title text, second is the FPS overlay
        return textCallCount === 1 ? titleText : fpsText;
      }),
    } as unknown as Phaser.GameObjects.GameObjectFactory;

    scene.scale = {
      width: 1280,
      height: 720,
    } as unknown as Phaser.Scale.ScaleManager;

    scene.input = {
      keyboard: {
        on: vi.fn().mockImplementation((event: string, handler: () => void) => {
          if (event === "keydown-F3") {
            keydownHandler = handler;
          }
        }),
      },
    } as unknown as Phaser.Input.InputPlugin;
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
    expect(titleText.setOrigin).toHaveBeenCalledWith(0.5);
  });

  describe("game loop integration", () => {
    it("does not throw when update is called after create", () => {
      scene.create();
      expect(() => scene.update(0, 16.67)).not.toThrow();
    });

    it("processes multiple frames without error", () => {
      scene.create();
      for (let i = 0; i < 100; i++) {
        scene.update(i * 16.67, 16.67);
      }
      // No throw = success
    });

    it("converts Phaser ms delta to seconds before calling gameLoop.tick", () => {
      scene.create();
      const gameLoop = (
        scene as unknown as { gameLoop: { tick: (dt: number) => void } }
      ).gameLoop;
      const tickSpy = vi.spyOn(gameLoop, "tick");

      scene.update(0, 16.67);

      expect(tickSpy).toHaveBeenCalledTimes(1);
      expect(tickSpy).toHaveBeenCalledWith(
        expect.closeTo(0.01667, 4),
      );
    });

    it("does not pass raw milliseconds to gameLoop.tick", () => {
      scene.create();
      const gameLoop = (
        scene as unknown as { gameLoop: { tick: (dt: number) => void } }
      ).gameLoop;
      const tickSpy = vi.spyOn(gameLoop, "tick");

      // 500ms simulating a tab-return spike
      scene.update(0, 500);

      expect(tickSpy).toHaveBeenCalledWith(0.5);
    });
  });

  describe("FPS debug overlay", () => {
    it("creates the FPS text on create and hides it by default", () => {
      scene.create();

      // FPS text should be created (second text call)
      expect(scene.add.text).toHaveBeenCalledTimes(2);
      expect(fpsText.setVisible).toHaveBeenCalledWith(false);
    });

    it("pins FPS text to camera and sets it on top", () => {
      scene.create();

      expect(fpsText.setScrollFactor).toHaveBeenCalledWith(0);
      expect(fpsText.setDepth).toHaveBeenCalledWith(Number.MAX_SAFE_INTEGER);
    });

    it("registers F3 keydown handler", () => {
      scene.create();

      expect(scene.input.keyboard!.on).toHaveBeenCalledWith(
        "keydown-F3",
        expect.any(Function),
      );
    });

    it("toggles FPS text visibility on F3", () => {
      scene.create();
      fpsText.setVisible.mockClear();

      // First toggle: show
      keydownHandler!({});
      expect(fpsText.setVisible).toHaveBeenCalledWith(true);

      fpsText.setVisible.mockClear();

      // Second toggle: hide
      keydownHandler!({});
      expect(fpsText.setVisible).toHaveBeenCalledWith(false);
    });

    it("updates FPS text content when debug is visible", () => {
      scene.create();

      // Enable debug
      keydownHandler!({});

      // Run a frame
      scene.update(0, 16.67);

      expect(fpsText.setText).toHaveBeenCalled();
      const text = fpsText.setText.mock.calls[0][0] as string;
      expect(text).toContain("FPS:");
      expect(text).toContain("Physics:");
      expect(text).toContain("Alpha:");
    });

    it("does not update FPS text when debug is hidden", () => {
      scene.create();

      // Debug is off by default — run a frame
      scene.update(0, 16.67);

      expect(fpsText.setText).not.toHaveBeenCalled();
    });

    it("initializes without keyboard when keyboard is null", () => {
      scene.input = {
        keyboard: null,
      } as unknown as Phaser.Input.InputPlugin;

      expect(() => scene.create()).not.toThrow();
    });
  });

  describe("update before create", () => {
    it("catches crash when update() is called before create()", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // update() before create() — gameLoop is uninitialized
      scene.update(0, 16.67);

      expect(consoleSpy).toHaveBeenCalledWith(
        "[GameScene] Game loop crashed:",
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });

    it("scene remains permanently halted after update-before-create crash", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Trigger crash: update before create
      scene.update(0, 16.67);
      expect(consoleSpy).toHaveBeenCalledTimes(1);

      consoleSpy.mockClear();

      // Now create properly — but crashed flag is already set
      scene.create();

      // Subsequent updates should be no-ops (crashed = true)
      scene.update(16.67, 16.67);
      scene.update(33.34, 16.67);
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("crash guard", () => {
    it("stops calling game loop after a system throws", () => {
      scene.create();

      // Replace tick with one that throws on first call
      const gameLoop = (
        scene as unknown as { gameLoop: { tick: (dt: number) => void } }
      ).gameLoop;
      let tickCalls = 0;
      gameLoop.tick = () => {
        tickCalls++;
        throw new Error("system crash");
      };

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // First call — triggers crash, logs error
      scene.update(0, 16.67);
      expect(consoleSpy).toHaveBeenCalledWith(
        "[GameScene] Game loop crashed:",
        expect.any(Error),
      );

      // Subsequent calls — should be no-ops (crashed flag set)
      scene.update(16.67, 16.67);
      scene.update(33.34, 16.67);
      expect(tickCalls).toBe(1);

      consoleSpy.mockRestore();
    });
  });
});
