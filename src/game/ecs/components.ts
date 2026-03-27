/**
 * ECS component type definitions.
 *
 * Every piece of game state lives as a component on a Miniplex entity.
 * Components are plain data objects — no methods, no Phaser imports.
 * The Entity interface uses optional properties so Miniplex queries can
 * narrow to only the components a system needs.
 *
 * Future issues will extend this file with health, inventory, AI state,
 * physics-body metadata, and more.  Keep each component small and focused.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

// ---------------------------------------------------------------------------
// Component interfaces
// ---------------------------------------------------------------------------

/** Position in pixel space (not tile space). */
export interface Position {
  x: number;
  y: number;
}

/** Velocity in pixels per second. */
export interface Velocity {
  x: number;
  y: number;
}

/**
 * Reference to the Phaser game object that visually represents this entity.
 *
 * Typed as `unknown` to avoid importing Phaser types into the ECS layer.
 * Systems that work with sprites cast to the concrete Phaser type they need.
 */
export interface Sprite {
  gameObject: unknown;
}

// ---------------------------------------------------------------------------
// Tag components (presence-only, no data)
// ---------------------------------------------------------------------------

/** Marks an entity as the player-controlled character. */
export type Player = true;

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/**
 * Union entity type consumed by Miniplex.
 *
 * All properties are optional so that entities can carry any subset of
 * components.  Miniplex queries narrow the type to only the required ones.
 */
export interface Entity {
  position?: Position;
  velocity?: Velocity;
  sprite?: Sprite;
  player?: Player;
}
