import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoadingScene from '@/game/scenes/loading-scene';
import { generateWorld } from '@/game/procgen/world-generator';
import { generateSeed } from '@/lib/rng';
import { GenerationStage } from '@/types/world';

// ---------------------------------------------------------------------------
// Mock the world generator to avoid running the full procgen pipeline
// ---------------------------------------------------------------------------

const mockWorldData = {
  layout: { widthTiles: 256, heightTiles: 256, tiles: [[]], buildings: [], seed: 'mock' },
  buildingClasses: new Map(),
  safehouse: { building: { id: 'b-0' }, buildingIndex: 0 },
  pathfinding: { width: 256, height: 256 },
  spawnZones: [],
  config: { seed: 'mock-seed', difficulty: 2, targetMinutes: 15 },
};

vi.mock('@/game/procgen/world-generator', () => ({
  generateWorld: vi.fn().mockImplementation(function* () {
    yield { stage: 'city_layout', message: 'Generating city layout...', progress: 0 };
    yield { stage: 'building_interiors', message: 'Building interiors...', progress: 0.2 };
    yield { stage: 'safehouse_selection', message: 'Selecting safehouse...', progress: 0.4 };
    yield { stage: 'object_placement', message: 'Placing objects...', progress: 0.6 };
    yield { stage: 'navigation_grid', message: 'Preparing navigation...', progress: 0.8 };
    return mockWorldData;
  }),
}));

vi.mock('@/lib/rng', () => ({
  generateSeed: vi.fn().mockReturnValue('test-seed-abc'),
}));

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockText() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text: Record<string, any> = {};
  text.setOrigin = vi.fn().mockReturnValue(text);
  text.setText = vi.fn().mockReturnValue(text);
  text.setScrollFactor = vi.fn().mockReturnValue(text);
  text.setDepth = vi.fn().mockReturnValue(text);
  text.setVisible = vi.fn().mockReturnValue(text);
  text.text = '';
  return text;
}

function createMockGraphics() {
  const gfx: Record<string, ReturnType<typeof vi.fn>> = {};
  gfx.clear = vi.fn().mockReturnValue(gfx);
  gfx.fillStyle = vi.fn().mockReturnValue(gfx);
  gfx.fillRect = vi.fn().mockReturnValue(gfx);
  return gfx;
}

function createMockScene() {
  const scene = new LoadingScene();

  const textInstances: ReturnType<typeof createMockText>[] = [];

  scene.cameras = {
    main: {
      setBackgroundColor: vi.fn(),
    },
  } as unknown as Phaser.Cameras.Scene2D.CameraManager;

  scene.scale = {
    width: 1280,
    height: 720,
  } as unknown as Phaser.Scale.ScaleManager;

  const mockGraphics = createMockGraphics();

  scene.add = {
    text: vi.fn().mockImplementation(() => {
      const t = createMockText();
      textInstances.push(t);
      return t;
    }),
    graphics: vi.fn().mockReturnValue(mockGraphics),
  } as unknown as Phaser.GameObjects.GameObjectFactory;

  scene.scene = {
    start: vi.fn(),
  } as unknown as Phaser.Scenes.ScenePlugin;

  scene.game = {
    events: {
      emit: vi.fn(),
    },
  } as unknown as Phaser.Game;

  return { scene, textInstances, mockGraphics };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LoadingScene', () => {
  let scene: LoadingScene;
  let textInstances: ReturnType<typeof createMockText>[];
  let mockGraphics: ReturnType<typeof createMockGraphics>;

  beforeEach(() => {
    ({ scene, textInstances, mockGraphics } = createMockScene());
  });

  it("registers with the key 'LoadingScene'", () => {
    expect((scene as unknown as { key: string }).key).toBe('LoadingScene');
  });

  it('sets a dark background color on create', () => {
    scene.create();
    expect(scene.cameras.main.setBackgroundColor).toHaveBeenCalledWith('#0a0a0a');
  });

  it('creates title, status, and seed text elements', () => {
    scene.create();
    // Title ("DEADBOLT"), status ("Initializing..."), seed ("Seed: ...")
    expect(scene.add.text).toHaveBeenCalledTimes(3);
  });

  it('displays the seed in the seed text', () => {
    scene.create();
    // Check that it was created with the seed
    const seedCall = (scene.add.text as ReturnType<typeof vi.fn>).mock.calls[2];
    expect(seedCall[2]).toBe('Seed: test-seed-abc');
  });

  it('creates a progress bar graphics object', () => {
    scene.create();
    expect(scene.add.graphics).toHaveBeenCalled();
  });

  it('advances the generator on each update call', () => {
    scene.create();

    // First update: yields city_layout progress
    scene.update();
    const statusText = textInstances[1]; // second text is status
    expect(statusText.setText).toHaveBeenCalledWith('Generating city layout...');
  });

  it('updates progress message on each subsequent update', () => {
    scene.create();
    const statusText = textInstances[1];

    scene.update(); // city_layout
    expect(statusText.setText).toHaveBeenLastCalledWith('Generating city layout...');

    scene.update(); // building_interiors
    expect(statusText.setText).toHaveBeenLastCalledWith('Building interiors...');

    scene.update(); // safehouse_selection
    expect(statusText.setText).toHaveBeenLastCalledWith('Selecting safehouse...');

    scene.update(); // object_placement
    expect(statusText.setText).toHaveBeenLastCalledWith('Placing objects...');

    scene.update(); // navigation_grid
    expect(statusText.setText).toHaveBeenLastCalledWith('Preparing navigation...');
  });

  it('transitions to GameScene with world data after all stages complete', () => {
    scene.create();

    // 5 yields + 1 final update that gets the return value
    for (let i = 0; i < 5; i++) {
      scene.update();
    }
    // This update should get the final return value
    scene.update();

    expect(scene.scene.start).toHaveBeenCalledWith('GameScene', mockWorldData);
  });

  it('does not call scene.start before generation is complete', () => {
    scene.create();

    // Only advance through 3 stages
    scene.update();
    scene.update();
    scene.update();

    expect(scene.scene.start).not.toHaveBeenCalled();
  });

  it('stops advancing after generation completes', () => {
    scene.create();

    // Complete all stages
    for (let i = 0; i < 6; i++) {
      scene.update();
    }
    expect(scene.scene.start).toHaveBeenCalledTimes(1);

    // Additional updates should be no-ops (generator is null)
    scene.update();
    scene.update();
    expect(scene.scene.start).toHaveBeenCalledTimes(1);
  });

  it('draws the progress bar on create', () => {
    scene.create();
    // Graphics.clear and fillRect should be called during initial bar draw
    expect(mockGraphics.clear).toHaveBeenCalled();
    expect(mockGraphics.fillRect).toHaveBeenCalled();
  });

  it('redraws the progress bar on each update', () => {
    scene.create();
    const initialClearCount = mockGraphics.clear.mock.calls.length;

    scene.update();
    expect(mockGraphics.clear.mock.calls.length).toBeGreaterThan(initialClearCount);
  });

  it('is safe to call update before create (no generator)', () => {
    expect(() => scene.update()).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('displays error message when generator throws mid-stage', () => {
      vi.mocked(generateWorld).mockImplementation(function* () {
        yield { stage: GenerationStage.CityLayout, message: 'Generating city layout...', progress: 0 };
        throw new Error('BSP failed: no rooms generated');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      scene.create();

      scene.update(); // first yield OK
      scene.update(); // should catch the throw

      const statusText = textInstances[1];
      expect(statusText.setText).toHaveBeenCalledWith('Generation failed. Refresh to retry.');
      expect(scene.scene.start).not.toHaveBeenCalled();
      expect(scene.game.events.emit).toHaveBeenCalledWith(
        'generation-error',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });

    it('stops the generator after an error occurs', () => {
      vi.mocked(generateWorld).mockImplementation(function* () {
        throw new Error('Immediate failure');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      scene.create();

      scene.update(); // catches error

      // Subsequent updates should be no-ops (generator nulled)
      scene.update();
      scene.update();
      expect(scene.scene.start).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('emits generation-error event when create() fails', () => {
      vi.mocked(generateSeed).mockImplementation(() => {
        throw new Error('Crypto unavailable');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      scene.create();

      expect(scene.game.events.emit).toHaveBeenCalledWith(
        'generation-error',
        expect.any(Error),
      );
      consoleSpy.mockRestore();

      // Restore the mock for other tests
      vi.mocked(generateSeed).mockReturnValue('test-seed-abc');
    });
  });
});
