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
 * Intended constraint: `0 <= current <= max`. Systems that modify health
 * (damage, healing) should maintain this constraint — no runtime enforcement
 * is provided at the component level, so data may temporarily violate it.
 */
export interface Health {
  current: number;
  max: number;
}

// ---------------------------------------------------------------------------
// Object placement components (issue #15)
// ---------------------------------------------------------------------------

import type { ObjectCategory } from '@/types/procgen';

/** Marks an entity as interactable by the player. */
export interface Interactable {
  /** What kind of interaction is available. */
  interactionType: 'pickup' | 'open' | 'push' | 'search';
  /** Whether the entity is currently highlighted (player in range). */
  highlighted: boolean;
}

import type { SizeCategory } from "@/game/procgen/object-defs";

/**
 * Data for a single occupied inventory slot.
 *
 * Medium items span two consecutive slots: the first has `primary: true`,
 * the second has `primary: false` with the same objectType. Only the
 * primary slot counts for display and weight calculations.
 */
export interface InventorySlotData {
  /** Object type key matching ObjectDefinition.type. */
  objectType: string;
  /** Size category from the object definition. */
  sizeCategory: SizeCategory;
  /** True for the first slot of a multi-slot item, false for continuation. */
  primary: boolean;
}

/**
 * Player inventory — authoritative game state for carried items.
 *
 * Fixed-size slot array where each object occupies 1 or 2 consecutive
 * slots based on its size category. The Zustand PlayerStore mirrors
 * this for React display; the ECS component is the source of truth
 * during gameplay. Systems read carryWeight to compute speed penalties.
 */
export interface Inventory {
  /** Fixed-size slot array: null = empty, InventorySlotData = occupied. */
  slots: Array<InventorySlotData | null>;
  /** Index of the active quick-select slot (0-4), or -1 for none. */
  activeSlot: number;
  /** Sum of carried item masses in kg. */
  carryWeight: number;
  /** Maximum carry capacity in kg. */
  maxCarryWeight: number;
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
