import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import GameScene from "@/game/scenes/game-scene";
import { resetWorld, world } from "@/game/ecs/world";
import { TILE_SIZE, TileType } from "@/game/tiles/tile-types";
import type { WorldData } from "@/types/world";
import { TileType as ProcgenTileType } from "@/types/procgen";
import { setActiveBus, getActiveBus, getActiveSeed, getActiveMinimapInit } from "@/game/PhaserGame";
import { safeEmit } from "@/game/events/event-bus";

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

/** Tile grid dimensions for mock world data. */
const MOCK_MAP_WIDTH = 32;
const MOCK_MAP_HEIGHT = 32;

/** Player spawn position in mock world (safehouse center). */
const MOCK_PLAYER_SPAWN = { x: 16, y: 16 };

/** Create mock WorldData for testing. */
function createMockWorldData(): WorldData {
  // Build a simple tile grid
  const tiles: ProcgenTileType[][] = [];
  for (let y = 0; y < MOCK_MAP_HEIGHT; y++) {
    const row: ProcgenTileType[] = [];
    for (let x = 0; x < MOCK_MAP_WIDTH; x++) {
      if (x === 0 || y === 0 || x === MOCK_MAP_WIDTH - 1 || y === MOCK_MAP_HEIGHT - 1) {
        row.push(ProcgenTileType.Wall);
      } else {
        row.push(ProcgenTileType.Floor);
      }
    }
    tiles.push(row);
  }

  return {
    layout: {
      widthTiles: MOCK_MAP_WIDTH,
      heightTiles: MOCK_MAP_HEIGHT,
      tiles,
      buildings: [],
      seed: 'test-seed',
    },
    buildingClasses: new Map(),
    safehouse: {
      building: {
        id: 'building-0',
        origin: { x: 10, y: 10 },
        width: 12,
        height: 12,
        rooms: [],
        entryPoints: [],
        objects: [],
      },
      buildingIndex: 0,
      scoreBreakdown: {
        entryPointScore: 0,
        lootProximityScore: 0,
        buildingSizeScore: 0,
        objectDensityScore: 0,
        totalScore: 0,
      },
      entryPointsToDefend: [],
      minimapPosition: MOCK_PLAYER_SPAWN,
      usedFallback: false,
    },
    pathfinding: {
      width: MOCK_MAP_WIDTH,
      height: MOCK_MAP_HEIGHT,
    } as WorldData['pathfinding'],
    spawnZones: [],
    config: { seed: 'test-seed', difficulty: 2, targetMinutes: 15 },
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
  let mockWorldData: WorldData;

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
    mockWorldData = createMockWorldData();

    let textCallCount = 0;

    scene.cameras = {
      main: {
        setBackgroundColor,
        setBounds,
        getWorldPoint: vi.fn((x: number, y: number) => ({ x, y })),
        startFollow: vi.fn(),
        centerOn: vi.fn(),
        setZoom: vi.fn(),
        scrollX: 0,
        scrollY: 0,
        zoom: 1,
        width: 1280,
        height: 720,
      },
    } as unknown as Phaser.Cameras.Scene2D.CameraManager;

    const mockRenderTexture = {
      setScrollFactor: vi.fn().mockReturnThis(),
      setDepth: vi.fn().mockReturnThis(),
      setVisible: vi.fn().mockReturnThis(),
      setAlpha: vi.fn().mockReturnThis(),
      fill: vi.fn().mockReturnThis(),
      erase: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
    };

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
        setDepth: vi.fn().mockReturnThis(),
        fillStyle: vi.fn(),
        fillRect: vi.fn(),
      })),
      renderTexture: vi.fn().mockReturnValue(mockRenderTexture),
    } as unknown as Phaser.GameObjects.GameObjectFactory;

    scene.make = {
      tilemap: vi.fn().mockReturnValue(mockTilemap),
    } as unknown as Phaser.GameObjects.GameObjectCreator;

    scene.scale = {
      width: 1280,
      height: 720,
    } as unknown as Phaser.Scale.ScaleManager;

    scene.textures = {
      exists: vi.fn().mockReturnValue(false),
      createCanvas: vi.fn().mockReturnValue({
        context: {
          createRadialGradient: vi.fn().mockReturnValue({
            addColorStop: vi.fn(),
          }),
          fillRect: vi.fn(),
        },
        refresh: vi.fn(),
      }),
    } as unknown as Phaser.Textures.TextureManager;

    scene.input = {
      keyboard: {
        on: vi.fn().mockImplementation((event: string, handler: () => void) => {
          if (event === "keydown-F3") {
            keydownHandler = handler;
          }
        }),
        addKeys: vi.fn().mockReturnValue(mockKeys),
        addKey: vi.fn().mockReturnValue({ isDown: false }),
      },
      activePointer: { x: 640, y: 360 },
      on: vi.fn(),
    } as unknown as Phaser.Input.InputPlugin;

    scene.sound = {
      play: vi.fn(),
      add: vi.fn().mockReturnValue({
        play: vi.fn(),
        stop: vi.fn(),
        setVolume: vi.fn(),
        destroy: vi.fn(),
        isPlaying: false,
      }),
      volume: 1,
      mute: false,
      locked: false,
      pauseAll: vi.fn(),
      resumeAll: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as Phaser.Sound.WebAudioSoundManager;

    scene.matter = {
      world: {
        autoUpdate: true,
        step: worldStep,
        convertTilemapLayer,
        removeConstraint: vi.fn(),
      },
      add: {
        rectangle: vi.fn().mockImplementation(
          (x: number, y: number, _w: number, _h: number, opts?: Record<string, unknown>) =>
            createMockBody(x, y, opts as { isStatic?: boolean }),
        ),
        constraint: vi.fn().mockImplementation(() => ({
          id: Math.floor(Math.random() * 100000),
          bodyA: null,
          bodyB: null,
          stiffness: 0.8,
          length: 0,
        })),
      },
    } as unknown as Phaser.Physics.Matter.MatterPhysics;

    scene.game = {
      events: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
    } as unknown as Phaser.Game;

    scene.events = {
      on: vi.fn(),
      once: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    } as unknown as Phaser.Events.EventEmitter;

    // Provide world data before create
    scene.init(mockWorldData);
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

  it("publishes the event bus via setActiveBus on create", () => {
    // Clear any prior bus to verify create() sets a fresh one
    setActiveBus(null);
    expect(getActiveBus()).toBeNull();

    scene.create();

    const bus = getActiveBus();
    expect(bus).not.toBeNull();
    expect(bus!.emit).toBeTypeOf("function");

    // Clean up to avoid leaking into other tests
    setActiveBus(null);
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
          data: mockWorldData.layout.tiles,
          tileWidth: TILE_SIZE,
          tileHeight: TILE_SIZE,
        }),
      );
    });

    it("sets camera bounds to tilemap pixel dimensions", () => {
      scene.create();
      const expectedWidth = MOCK_MAP_WIDTH * TILE_SIZE;
      const expectedHeight = MOCK_MAP_HEIGHT * TILE_SIZE;
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

    it("spawns player at the safehouse minimap position", () => {
      scene.create();
      const expectedX = MOCK_PLAYER_SPAWN.x * TILE_SIZE + TILE_SIZE / 2;
      const expectedY = MOCK_PLAYER_SPAWN.y * TILE_SIZE + TILE_SIZE / 2;
      const addRect = scene.matter.add.rectangle as ReturnType<typeof vi.fn>;
      // Player rectangle is created at safehouse center
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

    it("sidewalk tiles are excluded from the collision set", () => {
      scene.create();
      const collisionArgs = mockTilemap.setCollision.mock.calls[0][0] as TileType[];
      expect(collisionArgs).not.toContain(TileType.Sidewalk);
    });

    it("throws when addTilesetImage returns null", () => {
      mockTilemap.addTilesetImage.mockReturnValue(null);
      expect(() => scene.create()).toThrow("Failed to add tileset image");
    });

    it("throws when createLayer returns null", () => {
      mockTilemap.createLayer.mockReturnValue(null);
      expect(() => scene.create()).toThrow("Failed to create tilemap layer");
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

  describe("world data requirement", () => {
    it("throws when create() is called without init()", () => {
      const freshScene = new GameScene();
      // Attach minimal mocks
      freshScene.cameras = scene.cameras;
      freshScene.add = scene.add;
      freshScene.make = scene.make;
      freshScene.scale = scene.scale;
      freshScene.input = scene.input;
      freshScene.matter = scene.matter;

      expect(() => freshScene.create()).toThrow("No world data received");
    });
  });

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

    it("emits game-crash on this.game.events with wrapped message", () => {
      scene.create();

      const gameLoop = (
        scene as unknown as { gameLoop: { tick: (dt: number) => void } }
      ).gameLoop;
      gameLoop.tick = () => {
        throw new Error("physics exploded");
      };

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      scene.update(0, 16.67);

      expect(scene.game.events.emit).toHaveBeenCalledWith(
        "game-crash",
        expect.objectContaining({ message: "Game loop crashed: physics exploded" }),
      );

      // Verify the original error is preserved as cause
      const emitMock = scene.game.events.emit as ReturnType<typeof vi.fn>;
      const crashCall = emitMock.mock.calls.find(
        (args: unknown[]) => args[0] === "game-crash",
      )!;
      const emittedError = crashCall[1] as Error;
      expect(emittedError.cause).toBeInstanceOf(Error);
      expect((emittedError.cause as Error).message).toBe("physics exploded");

      consoleSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // Frozen flag (permadeath)
  // -----------------------------------------------------------------------

  describe("frozen flag (permadeath)", () => {
    it("freezes the game loop when player-died is emitted", () => {
      scene.create();
      const bus = getActiveBus()!;

      const gameLoop = (
        scene as unknown as { gameLoop: { tick: (dt: number) => void } }
      ).gameLoop;
      const tickSpy = vi.spyOn(gameLoop, "tick");

      // Emit player-died to trigger freeze
      safeEmit(bus, "player-died", {
        dayNumber: 3,
        totalKills: 42,
        survivalTime: 600,
        cause: "zombie",
      });

      // Subsequent updates should be no-ops
      tickSpy.mockClear();
      scene.update(0, 16.67);
      scene.update(16.67, 16.67);
      expect(tickSpy).not.toHaveBeenCalled();

      setActiveBus(null);
    });

    it("create() resets the frozen flag so the scene can be reused", () => {
      scene.create();
      const bus = getActiveBus()!;

      // Freeze via death
      safeEmit(bus, "player-died", {
        dayNumber: 1,
        totalKills: 0,
        survivalTime: 10,
        cause: "zombie",
      });

      // Verify frozen
      const gameLoopBefore = (
        scene as unknown as { gameLoop: { tick: (dt: number) => void } }
      ).gameLoop;
      const spyBefore = vi.spyOn(gameLoopBefore, "tick");
      scene.update(0, 16.67);
      expect(spyBefore).not.toHaveBeenCalled();

      // Re-create (simulates remount via runKey)
      scene.init(mockWorldData);
      scene.create();

      // Should work again after re-create
      const gameLoopAfter = (
        scene as unknown as { gameLoop: { tick: (dt: number) => void } }
      ).gameLoop;
      const spyAfter = vi.spyOn(gameLoopAfter, "tick");
      scene.update(0, 16.67);
      expect(spyAfter).toHaveBeenCalledTimes(1);

      setActiveBus(null);
    });
  });

  // -----------------------------------------------------------------------
  // Seed publishing
  // -----------------------------------------------------------------------

  describe("seed publishing", () => {
    it("publishes the run seed via setActiveSeed on create", () => {
      scene.create();

      expect(getActiveSeed()).toBe("test-seed");

      setActiveBus(null);
    });
  });

  // -----------------------------------------------------------------------
  // Shutdown cleanup
  // -----------------------------------------------------------------------

  describe("shutdown cleanup", () => {
    /** Extract and invoke the shutdown handler registered via events.once. */
    function triggerShutdown(): void {
      const onceMock = scene.events.once as ReturnType<typeof vi.fn>;
      const call = onceMock.mock.calls.find(
        (args: unknown[]) => args[0] === "shutdown",
      );
      expect(call).toBeDefined();
      (call![1] as () => void)();
    }

    it("registers a shutdown listener in create()", () => {
      scene.create();

      expect(scene.events.once).toHaveBeenCalledWith(
        "shutdown",
        expect.any(Function),
      );

      setActiveBus(null);
    });

    it("clears activeBus on shutdown", () => {
      scene.create();
      expect(getActiveBus()).not.toBeNull();

      triggerShutdown();

      expect(getActiveBus()).toBeNull();
    });

    it("clears activeSeed on shutdown", () => {
      scene.create();
      expect(getActiveSeed()).toBe("test-seed");

      triggerShutdown();

      expect(getActiveSeed()).toBeNull();
    });

    it("clears activeMinimapInit on shutdown", () => {
      scene.create();
      expect(getActiveMinimapInit()).not.toBeNull();

      triggerShutdown();

      expect(getActiveMinimapInit()).toBeNull();
    });

    it("singletons are re-set after shutdown and re-create", () => {
      scene.create();
      triggerShutdown();

      expect(getActiveBus()).toBeNull();
      expect(getActiveSeed()).toBeNull();
      expect(getActiveMinimapInit()).toBeNull();

      // Re-enter: init + create should restore singletons
      scene.init(mockWorldData);
      scene.create();

      expect(getActiveBus()).not.toBeNull();
      expect(getActiveSeed()).toBe("test-seed");
      expect(getActiveMinimapInit()).not.toBeNull();

      setActiveBus(null);
    });
  });
});
