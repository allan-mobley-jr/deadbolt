// Components
export type {
  Position,
  Velocity,
  Renderable,
  PlayerControlled,
  PhysicsBody,
  Health,
} from "./components";

// Entity
export type { Entity } from "./entity";

// World
export { world, resetWorld } from "./world";

// Archetypes
export {
  createPlayerEntity,
  createZombieEntity,
  createBarricadeEntity,
  createProjectileEntity,
} from "./archetypes";
export type {
  PlayerEntity,
  ZombieEntity,
  BarricadeEntity,
  ProjectileEntity,
} from "./archetypes";

// Queries
export {
  movingEntities,
  renderableEntities,
  playerEntities,
  physicsBodies,
  damageableEntities,
} from "./queries";
