import type { SystemFn } from "./system-runner";
import type { SceneContext } from "./scene-context";
import { physicsBodies } from "@/game/ecs/queries";
import { movingEntities } from "@/game/ecs/queries";

/**
 * Factory that returns a PhysicsSyncSystem.
 *
 * The system bridges ECS state and the Matter.js physics world in three
 * phases per fixed tick:
 *
 *  1. **Write** — copy ECS velocities to Matter.js body velocities.
 *  2. **Step** — advance the Matter.js simulation by one fixed timestep.
 *  3. **Read** — copy resolved body positions back to ECS, saving the
 *     previous position for render interpolation.
 *
 * Matter.js `Body.setVelocity` sets displacement-per-engine-step.
 * Our ECS stores velocity in pixels/second, so we multiply by `dt`
 * (the fixed timestep duration) to convert.
 */
export function createPhysicsSyncSystem(ctx: SceneContext): SystemFn {
  /** Track body IDs that have already been warned about to avoid 60 Hz spam. */
  const warnedMissing = new Set<number>();

  return (dt: number): void => {
    const { bodyRegistry, scene } = ctx;
    const matterWorld = (
      scene as unknown as { matter: { world: { step: (delta: number) => void } } }
    ).matter.world;

    // 1. Write: ECS velocity → Matter.js body velocity
    for (const entity of movingEntities) {
      if (!entity.physicsBody) continue;
      const body = bodyRegistry.get(entity.physicsBody.bodyId);
      if (!body) {
        if (!warnedMissing.has(entity.physicsBody.bodyId)) {
          warnedMissing.add(entity.physicsBody.bodyId);
          console.warn(
            `[PhysicsSyncSystem] No body found for bodyId=${entity.physicsBody.bodyId}. Entity will not receive velocity updates.`,
          );
        }
        continue;
      }

      // Matter.js velocity = displacement per step (pixels per step)
      const stepVx = entity.velocity.vx * dt;
      const stepVy = entity.velocity.vy * dt;

      body.velocity.x = stepVx;
      body.velocity.y = stepVy;

      // Also update speed/angle fields that some collision checks use
      body.speed = Math.sqrt(stepVx * stepVx + stepVy * stepVy);
      body.angularVelocity = 0;
    }

    // 2. Step: advance physics by one fixed timestep (ms)
    matterWorld.step(dt * 1000);

    // 3. Read: Matter.js body position → ECS position
    for (const entity of physicsBodies) {
      const body = bodyRegistry.get(entity.physicsBody.bodyId);
      if (!body) {
        if (!warnedMissing.has(entity.physicsBody.bodyId)) {
          warnedMissing.add(entity.physicsBody.bodyId);
          console.warn(
            `[PhysicsSyncSystem] No body found for bodyId=${entity.physicsBody.bodyId}. Entity position will not update.`,
          );
        }
        continue;
      }

      // Store previous position for render interpolation
      entity.previousPosition = {
        x: entity.position.x,
        y: entity.position.y,
      };

      entity.position.x = body.position.x;
      entity.position.y = body.position.y;
    }
  };
}
