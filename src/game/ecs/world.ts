/**
 * ECS world factory and pre-built queries.
 *
 * Each game session creates a fresh world via createWorld().  The queries
 * object provides typed views into common entity archetypes so systems
 * do not need to build ad-hoc queries on every tick.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import { World, type Query, type With } from 'miniplex';
import type { Entity } from './components';

// ---------------------------------------------------------------------------
// Query types (Miniplex narrows the Entity type automatically)
// ---------------------------------------------------------------------------

export interface Queries {
  /** Entities with player tag, position, and velocity — for movement logic. */
  players: Query<With<Entity, 'player' | 'position' | 'velocity'>>;
  /** Entities with a position and a sprite — anything that renders. */
  spriteEntities: Query<With<Entity, 'position' | 'sprite'>>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface WorldContext {
  world: World<Entity>;
  queries: Queries;
}

/**
 * Create a new ECS world and its associated queries.
 *
 * Call once per game session.  The returned world and queries share the
 * same underlying entity storage.
 */
export function createWorld(): WorldContext {
  const world = new World<Entity>();

  const queries: Queries = {
    players: world.with('player', 'position', 'velocity'),
    spriteEntities: world.with('position', 'sprite'),
  };

  return { world, queries };
}
