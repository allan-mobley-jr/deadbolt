/**
 * Physics-sync system — copies Matter.js body positions back to ECS.
 *
 * After the Matter.js physics step resolves collisions, each entity's
 * ECS position must be updated to reflect the body's actual position.
 * This keeps the ECS world as the canonical source of game state while
 * letting Matter.js handle collision resolution.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import type { Queries } from '../ecs/world';

export type PhysicsSyncSystem = () => void;

/**
 * Create a physics-sync system.
 *
 * Iterates all entities that have both a position and a sprite, reads
 * the Matter.js body position from the Phaser game object, and writes
 * it back to the ECS position component.
 */
export function createPhysicsSyncSystem(queries: Queries): PhysicsSyncSystem {
  return () => {
    for (const entity of queries.spriteEntities) {
      const gameObject = entity.sprite.gameObject as Phaser.Physics.Matter.Image;
      if (!gameObject?.body) continue;

      entity.position.x = gameObject.x;
      entity.position.y = gameObject.y;
    }
  };
}
