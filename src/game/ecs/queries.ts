import { world } from "./world";

/** Entities that move: have both position and velocity. */
export const movingEntities = world.with("position", "velocity");

/** Entities that need rendering: have position and a renderable sprite key. */
export const renderableEntities = world.with("position", "renderable");

/** The player entity (or entities, if co-op is ever added). */
export const playerEntities = world.with(
  "playerControlled",
  "position",
  "velocity",
);

/** Entities with physics bodies that need sync with Matter.js. */
export const physicsBodies = world.with("position", "physicsBody");

/** Entities that can take damage. */
export const damageableEntities = world.with("health");

/** Entities the player can interact with. */
export const interactableEntities = world.with(
  "position",
  "interactable",
  "objectProperties",
);

/** Player entities with inventory (for carry weight checks). */
export const inventoryEntities = world.with(
  "playerControlled",
  "position",
  "inventory",
);
