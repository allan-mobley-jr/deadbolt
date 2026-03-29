import type {
  Position,
  Velocity,
  Renderable,
  PlayerControlled,
  PhysicsBody,
  Health,
  Inventory,
  Interactable,
  ObjectProperties,
  Barricade,
  AIState,
  ZombieType,
} from "./components";

/**
 * Master entity type for the Deadbolt ECS world.
 *
 * Every component is optional — Miniplex queries use `world.with("position")`
 * to narrow to entities where those components are guaranteed present.
 *
 * Add new component properties here as the game grows. This interface is
 * the single source of truth for what an entity can contain.
 */
export interface Entity {
  position?: Position;
  /** Previous-tick position for render interpolation. */
  previousPosition?: Position;
  velocity?: Velocity;
  renderable?: Renderable;
  playerControlled?: PlayerControlled;
  physicsBody?: PhysicsBody;
  health?: Health;
  inventory?: Inventory;
  interactable?: Interactable;
  objectProperties?: ObjectProperties;
  barricade?: Barricade;
  aiState?: AIState;
  zombieType?: ZombieType;
}
