import { World } from "miniplex";
import type { Entity } from "./entity";

/**
 * The single ECS world for the current game session.
 *
 * Unlike the Phaser singleton (create/destroy lifecycle), the Miniplex world
 * is a lightweight module-level constant. Queries register against it lazily,
 * so importing `world` in other modules and calling `world.with(...)` works
 * at any point.
 *
 * Between runs (permadeath restart), call {@link resetWorld} to clear all
 * entities while preserving query subscriptions.
 */
const world = new World<Entity>();

export { world };

/**
 * Remove all entities from the world. Intended for run boundaries
 * (permadeath restart) and test cleanup.
 *
 * Uses `world.clear()` rather than recreating the World instance so that
 * query references held by system modules remain valid.
 */
export function resetWorld(): void {
  world.clear();
}
