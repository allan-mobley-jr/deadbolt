import { describe, it, expect } from 'vitest';
import { createWorld } from './world';

describe('createWorld', () => {
  it('creates a fresh empty world', () => {
    const { world } = createWorld();
    expect(world.entities).toHaveLength(0);
  });

  it('provides a players query that matches player archetypes', () => {
    const { world, queries } = createWorld();

    // Entity without player tag should not appear in players query.
    world.add({ position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } });
    expect([...queries.players]).toHaveLength(0);

    // Entity with player tag + position + velocity should appear.
    world.add({
      position: { x: 1, y: 1 },
      velocity: { x: 0, y: 0 },
      player: true,
    });
    expect([...queries.players]).toHaveLength(1);
  });

  it('provides a spriteEntities query that matches renderable archetypes', () => {
    const { world, queries } = createWorld();

    // Entity with position only — not in spriteEntities.
    world.add({ position: { x: 0, y: 0 } });
    expect([...queries.spriteEntities]).toHaveLength(0);

    // Entity with position + sprite — in spriteEntities.
    world.add({
      position: { x: 1, y: 1 },
      sprite: { gameObject: {} },
    });
    expect([...queries.spriteEntities]).toHaveLength(1);
  });

  it('returns independent worlds on each call', () => {
    const a = createWorld();
    const b = createWorld();
    a.world.add({ position: { x: 0, y: 0 } });
    expect(a.world.entities).toHaveLength(1);
    expect(b.world.entities).toHaveLength(0);
  });
});
