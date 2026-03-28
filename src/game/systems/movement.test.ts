import { describe, it, expect } from 'vitest';
import { createWorld } from '../ecs/world';
import type { InputState } from '../input/input-state';
import { createMovementSystem, PLAYER_SPEED } from './movement';

const INV_SQRT2 = 1 / Math.sqrt(2);

describe('movement system', () => {
  // Create a fresh world and player entity for each test.
  function setup() {
    const { world, queries } = createWorld();
    const inputState: InputState = { left: false, right: false, up: false, down: false };
    const runMovement = createMovementSystem(queries, inputState);

    const entity = world.add({
      position: { x: 100, y: 100 },
      velocity: { x: 0, y: 0 },
      player: true,
    });

    return { world, queries, entity, inputState, runMovement };
  }

  it('sets zero velocity when no input is pressed', () => {
    const { entity, runMovement } = setup();
    runMovement();
    expect(entity.velocity!.x).toBe(0);
    expect(entity.velocity!.y).toBe(0);
  });

  it('sets positive x velocity when right is pressed', () => {
    const { entity, inputState, runMovement } = setup();
    inputState.right = true;
    runMovement();
    expect(entity.velocity!.x).toBe(PLAYER_SPEED);
    expect(entity.velocity!.y).toBe(0);
  });

  it('sets negative x velocity when left is pressed', () => {
    const { entity, inputState, runMovement } = setup();
    inputState.left = true;
    runMovement();
    expect(entity.velocity!.x).toBe(-PLAYER_SPEED);
    expect(entity.velocity!.y).toBe(0);
  });

  it('sets negative y velocity when up is pressed', () => {
    const { entity, inputState, runMovement } = setup();
    inputState.up = true;
    runMovement();
    expect(entity.velocity!.x).toBe(0);
    expect(entity.velocity!.y).toBe(-PLAYER_SPEED);
  });

  it('sets positive y velocity when down is pressed', () => {
    const { entity, inputState, runMovement } = setup();
    inputState.down = true;
    runMovement();
    expect(entity.velocity!.x).toBe(0);
    expect(entity.velocity!.y).toBe(PLAYER_SPEED);
  });

  it('normalises diagonal movement so it is not faster than cardinal', () => {
    const { entity, inputState, runMovement } = setup();
    inputState.right = true;
    inputState.down = true;
    runMovement();

    const magnitude = Math.sqrt(
      entity.velocity!.x ** 2 + entity.velocity!.y ** 2,
    );
    expect(magnitude).toBeCloseTo(PLAYER_SPEED, 5);
    expect(entity.velocity!.x).toBeCloseTo(PLAYER_SPEED * INV_SQRT2, 5);
    expect(entity.velocity!.y).toBeCloseTo(PLAYER_SPEED * INV_SQRT2, 5);
  });

  it('normalises left+up diagonal with correct sign', () => {
    const { entity, inputState, runMovement } = setup();
    inputState.left = true;
    inputState.up = true;
    runMovement();

    const magnitude = Math.sqrt(
      entity.velocity!.x ** 2 + entity.velocity!.y ** 2,
    );
    expect(magnitude).toBeCloseTo(PLAYER_SPEED, 5);
    expect(entity.velocity!.x).toBeCloseTo(-PLAYER_SPEED * INV_SQRT2, 5);
    expect(entity.velocity!.y).toBeCloseTo(-PLAYER_SPEED * INV_SQRT2, 5);
  });

  it('cancels velocity when opposing keys are pressed', () => {
    const { entity, inputState, runMovement } = setup();
    inputState.left = true;
    inputState.right = true;
    runMovement();
    expect(entity.velocity!.x).toBe(0);
    expect(entity.velocity!.y).toBe(0);
  });

  it('processes zero players without error', () => {
    const { queries } = createWorld();
    const inputState: InputState = { left: true, right: false, up: false, down: false };
    const runMovement = createMovementSystem(queries, inputState);
    // Should not throw when no player entities exist.
    expect(() => runMovement()).not.toThrow();
  });
});
