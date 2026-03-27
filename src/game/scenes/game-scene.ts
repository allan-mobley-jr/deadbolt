/**
 * Main gameplay scene — tilemap rendering, player, physics, and game loop.
 *
 * Responsibilities:
 *   1. Build the tilemap from test data and configure collision.
 *   2. Spawn the player entity (ECS + Phaser Matter.js body).
 *   3. Run a fixed-timestep game loop (60 Hz) with spiral-of-death guard.
 *   4. Coordinate input → ECS velocity → Matter.js → ECS position sync.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import { createWorld, type WorldContext } from '../ecs/world';
import {
  createTestMap,
  TEST_MAP_WIDTH,
  TEST_MAP_HEIGHT,
  PLAYER_SPAWN,
  TILESET_KEY,
  TILE_SIZE,
  TileType,
  TILE_PROPERTIES,
} from '../tiles';
import { PLAYER_TEXTURE_KEY } from './boot-scene';
import { createInputManager, type InputManager } from '../input/input-state';
import { createMovementSystem, type MovementSystem } from '../systems/movement';
import {
  createPhysicsSyncSystem,
  type PhysicsSyncSystem,
} from '../systems/physics-sync';

// ---------------------------------------------------------------------------
// Fixed-timestep constants
// ---------------------------------------------------------------------------

/** Duration of one fixed-step tick in milliseconds (60 Hz). */
const FIXED_DT_MS = 1000 / 60;

/** Maximum physics steps per frame to prevent spiral of death. */
const MAX_STEPS_PER_FRAME = 5;

/** Scale factor to convert ECS velocity (px/s) to Matter.js velocity (px/tick). */
const VELOCITY_SCALE = FIXED_DT_MS / 1000;

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export class GameScene extends Phaser.Scene {
  // Systems & managers (initialised in create)
  private ctx!: WorldContext;
  private inputManager!: InputManager;
  private movementSystem!: MovementSystem;
  private physicsSyncSystem!: PhysicsSyncSystem;

  // Fixed-timestep accumulator
  private accumulator = 0;

  // Player body reference for velocity application
  private playerBody!: Phaser.Physics.Matter.Image;

  // Set to true if create() fails so update() bails out safely.
  private initFailed = false;

  constructor() {
    super({ key: 'GameScene' });
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  create(): void {
    try {
      // ECS world
      this.ctx = createWorld();

      // Tilemap
      this.buildTilemap();

      // Player
      this.spawnPlayer();

      // Input
      this.inputManager = createInputManager(this);

      // Systems
      this.movementSystem = createMovementSystem(
        this.ctx.queries,
        this.inputManager.state,
      );
      this.physicsSyncSystem = createPhysicsSyncSystem(this.ctx.queries);

      // Disable gravity (top-down game)
      this.matter.world.setGravity(0, 0);

      // Clean up on scene shutdown
      this.events.on('shutdown', this.onShutdown, this);
    } catch (err) {
      this.initFailed = true;
      console.error('[GameScene] Initialization failed:', err);
      this.game.events.emit('scene-error', err);
    }
  }

  update(_time: number, delta: number): void {
    if (this.initFailed) return;

    // Poll input
    this.inputManager.update();

    // Fixed-timestep loop with spiral-of-death guard
    this.accumulator += delta;
    let steps = 0;

    while (this.accumulator >= FIXED_DT_MS && steps < MAX_STEPS_PER_FRAME) {
      this.movementSystem();
      this.applyVelocityToBody();
      this.accumulator -= FIXED_DT_MS;
      steps++;
    }

    // Cap leftover accumulator to prevent runaway after long pauses
    if (this.accumulator > FIXED_DT_MS) {
      this.accumulator = 0;
    }

    // Sync physics results back to ECS
    this.physicsSyncSystem();
  }

  // -----------------------------------------------------------------------
  // Tilemap construction
  // -----------------------------------------------------------------------

  private buildTilemap(): void {
    const tileData = createTestMap();

    // Create tilemap from the 2D data array.
    const map = this.make.tilemap({
      data: tileData,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });

    // Add the programmatic tileset.  firstgid=1 means data value 1 → frame 0.
    const tileset = map.addTilesetImage(
      TILESET_KEY, // tileset name (matches the texture key)
      TILESET_KEY, // image key in texture manager
      TILE_SIZE,
      TILE_SIZE,
      0,           // margin
      0,           // spacing
    );

    if (!tileset) {
      throw new Error('Failed to add tileset image');
    }

    const layer = map.createLayer(0, tileset, 0, 0);
    if (!layer) {
      throw new Error('Failed to create tilemap layer');
    }

    // Mark colliding tile types.
    const collidingIndices = Object.values(TileType).filter(
      (v): v is TileType =>
        typeof v === 'number' && TILE_PROPERTIES[v as TileType].collides,
    );

    map.setCollision(collidingIndices);

    // Convert colliding tiles to Matter.js static bodies.
    this.matter.world.convertTilemapLayer(layer);

    // Camera bounds match map dimensions.
    const mapWidth = TEST_MAP_WIDTH * TILE_SIZE;
    const mapHeight = TEST_MAP_HEIGHT * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
  }

  // -----------------------------------------------------------------------
  // Player
  // -----------------------------------------------------------------------

  private spawnPlayer(): void {
    // Convert tile coords to pixel coords (centre of the tile).
    const px = PLAYER_SPAWN.x * TILE_SIZE + TILE_SIZE / 2;
    const py = PLAYER_SPAWN.y * TILE_SIZE + TILE_SIZE / 2;

    // Create a Matter.js-enabled image for the player.
    this.playerBody = this.matter.add.image(px, py, PLAYER_TEXTURE_KEY, undefined, {
      friction: 0,
      frictionStatic: 0,
      frictionAir: 0,
      label: 'player',
    });

    if (!this.playerBody?.body) {
      throw new Error(
        `Failed to create player physics body at (${px}, ${py}). ` +
        `Texture "${PLAYER_TEXTURE_KEY}" may be missing.`,
      );
    }

    // Prevent rotation (top-down character).
    this.playerBody.setFixedRotation();

    // Camera follows the player with slight smoothing.
    this.cameras.main.startFollow(this.playerBody, true, 0.1, 0.1);

    // Register as an ECS entity.
    this.ctx.world.add({
      position: { x: px, y: py },
      velocity: { x: 0, y: 0 },
      sprite: { gameObject: this.playerBody },
      player: true,
    });
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Apply ECS velocity to the Matter.js body.
   *
   * Matter.js setVelocity expects pixels per tick (at 60 fps).
   * Our ECS velocity is in pixels per second, so we scale by FIXED_DT_MS / 1000.
   */
  private applyVelocityToBody(): void {
    for (const entity of this.ctx.queries.players) {
      if (!this.playerBody?.body) continue;

      this.playerBody.setVelocity(
        entity.velocity.x * VELOCITY_SCALE,
        entity.velocity.y * VELOCITY_SCALE,
      );
    }
  }

  private onShutdown(): void {
    this.inputManager?.destroy();
    this.events.off('shutdown', this.onShutdown, this);
  }
}
