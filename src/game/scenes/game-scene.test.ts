import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import GameScene from "@/game/scenes/game-scene";
import { resetWorld, world } from "@/game/ecs/world";
import { TEST_MAP_WIDTH, TEST_MAP_HEIGHT, PLAYER_SPAWN } from "@/game/tiles/test-map";
import { TILE_SIZE, TileType } from "@/game/tiles/tile-types";

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

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

/** Create a mock Phaser Rectangle game object. */
function createMockRect() {
  return { x: 0, y: 0, destroy: vi.fn() };
}

/** Unique auto-incrementing body id. */
let nextBodyId = 1;

/** Create a mock Matter.js body. */
function createMockBody(
  x: number,
  y: number,
  opts?: { isStatic?: boolean },
) {
  const id = nextBodyId++;
  return {
    id,
    position: { x, y },
    velocity: { x: 0, y: 0 },
    speed: 0,
    angularVelocity: 0,
    inertia: 0,
    inverseInertia: 0,
    isStatic: opts?.isStatic ?? false,
  };
}

/** Create mock key objects for the keyboard. */
function createMockKeys() {
  const mkKey = () => ({ isDown: false });
  return {
    W: mkKey(),
    A: mkKey(),
    S: mkKey(),
    D: mkKey(),
    UP: mkKey(),
    DOWN: mkKey(),
    LEFT: mkKey(),
    RIGHT: mkKey(),
  };
}

/** Create a mock tilemap returned by this.make.tilemap(). */
function createMockTilemap() {
  const mockLayer = { id: "layer-0" };
  const mockTileset = { name: "tileset" };
  return {
    addTilesetImage: vi.fn().mockReturnValue(mockTileset),
    createLayer: vi.fn().mockReturnValue(mockLayer),
    setCollision: vi.fn(),
    _mockLayer: mockLayer,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("GameScene", () => {
  let scene: GameScene;
  let setBackgroundColor: ReturnType<typeof vi.fn>;
  let setBounds: ReturnType<typeof vi.fn>;
  let fpsText: ReturnType<typeof createMockText>;
  let keydownHandler: ((event: unknown) => void) | undefined;
  let mockKeys: ReturnType<typeof createMockKeys>;
  let worldStep: ReturnType<typeof vi.fn>;
  let convertTilemapLayer: ReturnType<typeof vi.fn>;
  let mockTilemap: ReturnType<typeof createMockTilemap>;

  beforeEach(() => {
    nextBodyId = 1;
    keydownHandler = undefined;
    scene = new GameScene();
    setBackgroundColor = vi.fn();
    setBounds = vi.fn();
    fpsText = createMockText();
    mockKeys = createMockKeys();
    worldStep = vi.fn();
    convertTilemapLayer = vi.fn();
    mockTilemap = createMockTilemap();

    let textCallCount = 0;

    scene.cameras = {
      main: {
        setBackgroundColor,
        setBounds,
        getWorldPoint: vi.fn((x: number, y: number) => ({ x, y })),
        startFollow: vi.fn(),
        width: 1280,
        height: 720,
      },
    } as unknown as Phaser.Cameras.Scene2D.CameraManager;

    scene.add = {
      text: vi.fn().mockImplementation(() => {
        textCallCount++;
        return textCallCount === 1 ? fpsText : createMockText();
      }),
      rectangle: vi.fn().mockImplementation(() => createMockRect()),
      graphics: vi.fn().mockImplementation(() => ({
        clear: vi.fn(),
        lineStyle: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        strokePath: vi.fn(),
      })),
    } as unknown as Phaser.GameObjects.GameObjectFactory;

    scene.make = {
      tilemap: vi.fn().mockReturnValue(mockTilemap),
    } as unknown as Phaser.GameObjects.GameObjectCreator;

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
        addKeys: vi.fn().mockReturnValue(mockKeys),
      },
      activePointer: { x: 640, y: 360 },
    } as unknown as Phaser.Input.InputPlugin;

    scene.matter = {
      world: {
        autoUpdate: true,
        step: worldStep,
        convertTilemapLayer,
      },
      add: {
        rectangle: vi.fn().mockImplementation(
          (x: number, y: number, _w: number, _h: number, opts?: Record<string, unknown>) =>
            createMockBody(x, y, opts as { isStatic?: boolean }),
        ),
      },
    } as unknown as Phaser.Physics.Matter.MatterPhysics;
  });

  afterEach(() => {
    resetWorld();
  });

  it("registers with the key 'GameScene'", () => {
    expect((scene as unknown as { key: string }).key).toBe("GameScene");
  });

  it("sets a non-black background color on create", () => {
    scene.create();
    expect(setBackgroundColor).toHaveBeenCalledWith("#1a1a2e");
  });

  it("disables Matter.js auto-update", () => {
    scene.create();
    expect(scene.matter.world.autoUpdate).toBe(false);
  });

  it("spawns a player entity in the ECS world", () => {
    scene.create();
    const entities = world.entities;
    const player = entities.find((e) => e.playerControlled !== undefined);
    expect(player).toBeDefined();
    expect(player!.position).toBeDefined();
    expect(player!.velocity).toBeDefined();
    expect(player!.renderable).toBeDefined();
    expect(player!.physicsBody).toBeDefined();
    expect(player!.health).toBeDefined();
  });

  it("resets the ECS world on create to support re-entry", () => {
    // Add a dummy entity before create
    world.add({ position: { x: 99, y: 99 } });
    expect(world.entities.length).toBe(1);

    scene.create();
    // The dummy should be gone; only the player should remain
    const player = world.entities.find((e) => e.playerControlled !== undefined);
    expect(player).toBeDefined();
    // No entity with position (99, 99)
    const dummy = world.entities.find(
      (e) => e.position?.x === 99 && e.position?.y === 99,
    );
    expect(dummy).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Tilemap integration
  // -----------------------------------------------------------------------

  describe("tilemap", () => {
    it("creates a tilemap from test data with correct tile dimensions", () => {
      scene.create();
      const makeTilemap = scene.make.tilemap as ReturnType<typeof vi.fn>;
      expect(makeTilemap).toHaveBeenCalledWith(
        expect.objectContaining({
          tileWidth: TILE_SIZE,
          tileHeight: TILE_SIZE,
        }),
      );
    });

    it("sets camera bounds to tilemap pixel dimensions", () => {
      scene.create();
      const expectedWidth = TEST_MAP_WIDTH * TILE_SIZE;
      const expectedHeight = TEST_MAP_HEIGHT * TILE_SIZE;
      expect(setBounds).toHaveBeenCalledWith(0, 0, expectedWidth, expectedHeight);
    });

    it("sets collision on Wall and Window tile types", () => {
      scene.create();
      const collisionArgs = mockTilemap.setCollision.mock.calls[0][0] as TileType[];
      expect(collisionArgs).toContain(TileType.Wall);
      expect(collisionArgs).toContain(TileType.Window);
      expect(collisionArgs).not.toContain(TileType.Door);
      expect(collisionArgs).not.toContain(TileType.Floor);
      expect(collisionArgs).not.toContain(TileType.Road);
      expect(collisionArgs).not.toContain(TileType.Grass);
    });

    it("converts colliding tiles to Matter.js static bodies", () => {
      scene.create();
      expect(convertTilemapLayer).toHaveBeenCalledWith(mockTilemap._mockLayer);
    });

    it("spawns player at the correct pixel position from PLAYER_SPAWN", () => {
      scene.create();
      const expectedX = PLAYER_SPAWN.x * TILE_SIZE + TILE_SIZE / 2;
      const expectedY = PLAYER_SPAWN.y * TILE_SIZE + TILE_SIZE / 2;
      const addRect = scene.matter.add.rectangle as ReturnType<typeof vi.fn>;
      // Player rectangle is created at spawn position
      expect(addRect).toHaveBeenCalledWith(
        expectedX,
        expectedY,
        24,
        24,
        expect.objectContaining({ friction: 0 }),
      );
    });

    it("door tiles are excluded from the collision set", () => {
      scene.create();
      const collisionArgs = mockTilemap.setCollision.mock.calls[0][0] as TileType[];
      expect(collisionArgs).not.toContain(TileType.Door);
    });
  });

  // -----------------------------------------------------------------------
  // Game loop integration
  // -----------------------------------------------------------------------

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
    });

    it("converts Phaser ms delta to seconds before calling gameLoop.tick", () => {
      scene.create();
      const gameLoop = (
        scene as unknown as { gameLoop: { tick: (dt: number) => void } }
      ).gameLoop;
      const tickSpy = vi.spyOn(gameLoop, "tick");

      scene.update(0, 16.67);

      expect(tickSpy).toHaveBeenCalledTimes(1);
      expect(tickSpy).toHaveBeenCalledWith(expect.closeTo(0.01667, 4));
    });

    it("calls render systems after gameLoop.tick", () => {
      scene.create();
      const renderSystems = (
        scene as unknown as { renderSystems: Array<(dt: number) => void> }
      ).renderSystems;
      expect(renderSystems.length).toBeGreaterThan(0);

      // Spy on first render system
      const spy = vi.fn();
      (scene as unknown as { renderSystems: Array<(dt: number) => void> })
        .renderSystems[0] = spy;

      scene.update(0, 16.67);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // FPS debug overlay
  // -----------------------------------------------------------------------

  describe("FPS debug overlay", () => {
    it("creates the FPS text on create and hides it by default", () => {
      scene.create();
      expect(scene.add.text).toHaveBeenCalled();
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

      keydownHandler!({});
      expect(fpsText.setVisible).toHaveBeenCalledWith(true);

      fpsText.setVisible.mockClear();

      keydownHandler!({});
      expect(fpsText.setVisible).toHaveBeenCalledWith(false);
    });

    it("updates FPS text content when debug is visible", () => {
      scene.create();

      keydownHandler!({});
      scene.update(0, 16.67);

      expect(fpsText.setText).toHaveBeenCalled();
      const text = fpsText.setText.mock.calls[0][0] as string;
      expect(text).toContain("FPS:");
      expect(text).toContain("Physics:");
      expect(text).toContain("Alpha:");
    });

    it("does not update FPS text when debug is hidden", () => {
      scene.create();
      scene.update(0, 16.67);
      expect(fpsText.setText).not.toHaveBeenCalled();
    });

    it("initializes without keyboard when keyboard is null", () => {
      scene.input = {
        keyboard: null,
        activePointer: { x: 0, y: 0 },
      } as unknown as Phaser.Input.InputPlugin;

      expect(() => scene.create()).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Crash recovery
  // -----------------------------------------------------------------------

  describe("update before create", () => {
    it("catches crash when update() is called before create()", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      scene.update(0, 16.67);

      expect(consoleSpy).toHaveBeenCalledWith(
        "[GameScene] Game loop crashed:",
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });

    it("create() resets the crashed flag so the scene can recover", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Trigger crash: update before create
      scene.update(0, 16.67);
      expect(consoleSpy).toHaveBeenCalledTimes(1);

      consoleSpy.mockClear();

      // create() should reset crashed flag
      scene.create();

      // Subsequent updates should work (not silently halted)
      scene.update(16.67, 16.67);
      scene.update(33.34, 16.67);
      expect(consoleSpy).not.toHaveBeenCalled();

      // Verify the game loop is ticking (not crashed)
      const gameLoop = (
        scene as unknown as { gameLoop: { tick: (dt: number) => void } }
      ).gameLoop;
      const tickSpy = vi.spyOn(gameLoop, "tick");
      scene.update(50, 16.67);
      expect(tickSpy).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
    });
  });

  describe("crash guard", () => {
    it("stops calling game loop after a system throws", () => {
      scene.create();

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

      scene.update(0, 16.67);
      expect(consoleSpy).toHaveBeenCalledWith(
        "[GameScene] Game loop crashed:",
        expect.any(Error),
      );

      scene.update(16.67, 16.67);
      scene.update(33.34, 16.67);
      expect(tickCalls).toBe(1);

      consoleSpy.mockRestore();
    });
  });
});
