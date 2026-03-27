/**
 * ECS component type definitions for the Miniplex World.
 *
 * Every component is an optional property on the Entity interface. Systems
 * query entities by the presence of specific components via Miniplex's
 * `.with(...)` method.
 *
 * This file defines types only — the actual World<Entity> instantiation
 * lives elsewhere (created when the game scene boots).
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import type { ObjectCategory } from '@/types/procgen';

// ---------------------------------------------------------------------------
// Component interfaces
// ---------------------------------------------------------------------------

/** Position in tile space. Updated by physics sync each tick. */
export interface Position {
  x: number;
  y: number;
}

/** Visual representation for the placeholder renderer. */
export interface Renderable {
  /** Hex color for the placeholder shape. */
  color: number;
  /** Width in tiles. */
  width: number;
  /** Height in tiles. */
  height: number;
  /** Visual layer for depth sorting. */
  layer: 'ground' | 'object' | 'character' | 'overhead';
}

/** Marks an entity as interactable by the player. */
export interface Interactable {
  /** What kind of interaction is available. */
  interactionType: 'pickup' | 'open' | 'push' | 'search';
  /** Whether the entity is currently highlighted (player in range). */
  highlighted: boolean;
}

/**
 * Physics body properties mapped to a Matter.js body at spawn time.
 *
 * The actual Matter.js body reference is stored on the Phaser sprite;
 * this component holds the configuration values.
 */
export interface PhysicsBody {
  /** Mass in kg. */
  mass: number;
  /** Whether the body is static (immovable) or dynamic. */
  isStatic: boolean;
  /** Friction coefficient for push/drag. */
  friction: number;
  /** Width in pixels for the physics shape. */
  width: number;
  /** Height in pixels for the physics shape. */
  height: number;
}

/** Properties specific to placed world objects. */
export interface ObjectProperties {
  /** Object type key (matches ObjectDefinition.type). */
  objectType: string;
  /** Object category for gameplay classification. */
  category: ObjectCategory;
  /** Structural hit points (0 = fragile, 1 = indestructible). */
  durability: number;
  /** Fire spread susceptibility (0 = fireproof, 1 = instant ignition). */
  flammability: number;
  /** Electrical conductivity (0 = insulator, 1 = perfect conductor). */
  conductivity: number;
  /** Loot value tier (0-10). */
  lootValue: number;
  /** Whether this object can only be pushed/dragged, not carried. */
  immovable: boolean;
}

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/**
 * The unified entity type for the Miniplex World.
 *
 * Every property is optional — entities only carry the components that
 * are relevant to them. Miniplex queries filter by component presence.
 *
 * Future issues will extend this interface with additional components
 * (health, velocity, inventory, AI state, etc.).
 */
export interface Entity {
  position?: Position;
  renderable?: Renderable;
  interactable?: Interactable;
  physicsBody?: PhysicsBody;
  objectProperties?: ObjectProperties;
}
