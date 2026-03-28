/** 2D position in world space (pixels, not tiles). */
export interface Position {
  x: number;
  y: number;
}

/** 2D velocity vector (pixels per second). */
export interface Velocity {
  vx: number;
  vy: number;
}

/**
 * Marks an entity as visible. Holds a sprite key that the render sync
 * system maps to a Phaser GameObject. Never stores a Phaser reference
 * directly — this preserves the game-boundary separation.
 */
export interface Renderable {
  spriteKey: string;
}

/**
 * Marks an entity as controlled by the player.
 * The `active` flag allows temporarily disabling input (stun, cutscene)
 * without removing and re-adding the component.
 */
export interface PlayerControlled {
  active: boolean;
}

/**
 * Links an entity to a Matter.js physics body via numeric ID.
 * The physics sync system resolves IDs to actual Matter.Body references.
 * Never stores a Matter.Body directly — this preserves the game-boundary
 * separation.
 */
export interface PhysicsBody {
  bodyId: number;
}

/**
 * Entity health pool with current and maximum values.
 *
 * Invariant: `0 <= current <= max`. Systems that modify health (damage,
 * healing) must maintain this invariant — no runtime enforcement is provided
 * at the component level.
 */
export interface Health {
  current: number;
  max: number;
}
