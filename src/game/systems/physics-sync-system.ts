import type { SystemFn } from "./system-runner";
import type { SceneContext } from "./scene-context";
import { movingEntities, physicsBodies } from "@/game/ecs/queries";

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

  /** Look up a body by id, logging a warning (once) when missing. */
  function resolveBody(
    bodyId: number,
    context: string,
  ): MatterJS.BodyType | undefined {
    const body = ctx.bodyRegistry.get(bodyId);
    if (!body && !warnedMissing.has(bodyId)) {
      warnedMissing.add(bodyId);
      console.warn(
        `[PhysicsSyncSystem] No body found for bodyId=${bodyId}. ${context}`,
      );
    }
    return body;
  }

  return (dt: number): void => {
    const matterWorld = ctx.scene.matter.world;

    // 1. Write: ECS velocity → Matter.js body velocity
    for (const entity of movingEntities) {
      if (!entity.physicsBody) continue;
      const body = resolveBody(
        entity.physicsBody.bodyId,
        "Entity will not receive velocity updates.",
      );
      if (!body) continue;

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
      const body = resolveBody(
        entity.physicsBody.bodyId,
        "Entity position will not update.",
      );
      if (!body) continue;

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
