import { describe, it, expect, vi } from 'vitest';
import { createWorld } from '../ecs/world';
import { createPhysicsSyncSystem } from './physics-sync';

describe('physics-sync system', () => {
  /**
   * Create a world with a sprite entity whose gameObject is a plain mock.
   * The mock has `x`, `y`, and a truthy `body` to simulate a Phaser
   * Matter.js Image with an active physics body.
   */
  function setup(bodyX = 50, bodyY = 75) {
    const { world, queries } = createWorld();
    const mockGameObject = { x: bodyX, y: bodyY, body: {} };

    const entity = world.add({
      position: { x: 0, y: 0 },
      sprite: { gameObject: mockGameObject as unknown },
    });

    const runSync = createPhysicsSyncSystem(queries);
    return { world, queries, entity, mockGameObject, runSync };
  }

  it('copies gameObject position to ECS position', () => {
    const { entity, runSync } = setup(120, 80);
    runSync();
    expect(entity.position.x).toBe(120);
    expect(entity.position.y).toBe(80);
  });

  it('updates position each tick as body moves', () => {
    const { entity, mockGameObject, runSync } = setup(10, 20);
    runSync();
    expect(entity.position.x).toBe(10);
    expect(entity.position.y).toBe(20);

    // Simulate body moving after a physics step.
    mockGameObject.x = 30;
    mockGameObject.y = 40;
    runSync();
    expect(entity.position.x).toBe(30);
    expect(entity.position.y).toBe(40);
  });

  it('skips entities with no physics body without throwing', () => {
    const { world, queries } = createWorld();
    world.add({
      position: { x: 5, y: 5 },
      sprite: { gameObject: { x: 99, y: 99, body: null } as unknown },
    });

    const runSync = createPhysicsSyncSystem(queries);
    expect(() => runSync()).not.toThrow();
  });

  it('warns once per bodyless entity, not on every tick', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { world, queries } = createWorld();
    world.add({
      position: { x: 0, y: 0 },
      sprite: { gameObject: { x: 0, y: 0, body: null } as unknown },
    });

    const runSync = createPhysicsSyncSystem(queries);
    runSync();
    runSync();
    runSync();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no physics body'),
    );

    warnSpy.mockRestore();
  });

  it('does not update position for bodyless entities', () => {
    const { world, queries } = createWorld();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const entity = world.add({
      position: { x: 5, y: 10 },
      sprite: { gameObject: { x: 99, y: 99, body: null } as unknown },
    });

    const runSync = createPhysicsSyncSystem(queries);
    runSync();

    // Position should remain unchanged since the body is missing.
    expect(entity.position.x).toBe(5);
    expect(entity.position.y).toBe(10);

    vi.restoreAllMocks();
  });

  it('processes zero sprite entities without error', () => {
    const { queries } = createWorld();
    const runSync = createPhysicsSyncSystem(queries);
    expect(() => runSync()).not.toThrow();
  });
});
