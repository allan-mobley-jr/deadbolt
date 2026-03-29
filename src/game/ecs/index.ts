// Components
export type {
  Position,
  Velocity,
  Renderable,
  PlayerControlled,
  PhysicsBody,
  Health,
  InventorySlotData,
  Inventory,
  Interactable,
  ObjectProperties,
  AIState,
  AIStateName,
  ZombieType,
  CombatState,
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
  createObjectEntity,
} from "./archetypes";
export type {
  PlayerEntity,
  ZombieEntity,
  BarricadeEntity,
  ProjectileEntity,
  ObjectEntity,
} from "./archetypes";

// Queries
export {
  movingEntities,
  renderableEntities,
  playerEntities,
  physicsBodies,
  damageableEntities,
  interactableEntities,
  inventoryEntities,
  combatPlayerEntities,
  barricadeEntities,
  zombieEntities,
} from "./queries";
