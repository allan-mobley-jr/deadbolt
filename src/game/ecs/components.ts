import type { ObjectCategory } from '@/types/procgen';
import type { SizeCategory } from '@/game/procgen/object-defs';

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

/** Marks an entity as interactable by the player. */
export interface Interactable {
  /** What kind of interaction is available. */
  interactionType: 'pickup' | 'open' | 'push' | 'search';
  /** Whether the entity is currently highlighted (player in range). */
  highlighted: boolean;
}

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

// ---------------------------------------------------------------------------
// Barricade components (issue #22)
// ---------------------------------------------------------------------------

/**
 * Marks an entity as a barricade anchored to a door/window frame.
 *
 * Stores the Matter.js constraint IDs that anchor the object to wall
 * anchor bodies, the entry point being defended, and material-derived
 * durability. The Health component is also present on barricade entities
 * and tracks the same HP pool (max = maxDurability).
 */
export interface Barricade {
  /** Matter.js constraint IDs anchoring this object to the wall frame. */
  constraintIds: number[];
  /** Index into the safehouse's entryPointsToDefend array. */
  entryPointIndex: number;
  /** Source object type key (for visual feedback and post-destruction restore). */
  sourceObjectType: string;
  /** Maximum durability HP derived from ObjectDefinition.physics.durability. */
  maxDurability: number;
  /** Current durability HP. When 0, constraints break. */
  currentDurability: number;
}

// ---------------------------------------------------------------------------
// Zombie AI components (issue #23)
// ---------------------------------------------------------------------------

/** AI state machine state names. */
export type AIStateName = 'idle' | 'pathing' | 'attacking' | 'staggered' | 'dead';

/**
 * Zombie AI state machine — holds the current state and all state-specific data.
 *
 * The state machine runs in the ZombieAISystem. States transition:
 *   idle → pathing → attacking ↔ pathing
 *                    staggered → pathing
 *                    dead (terminal, entity removed)
 *
 * Any state can transition to dead when health <= 0.
 * Pathing or attacking transitions to staggered when health decreases.
 * Stagger is not refreshed while already staggered.
 */
export interface AIState {
  /** Current state machine state. */
  state: AIStateName;
  /** Next waypoint in world pixels, or null if no path. */
  targetPosition: { x: number; y: number } | null;
  /** Remaining A* path in tile coordinates. */
  path: Array<{ x: number; y: number }>;
  /** Index into path array — the next waypoint to walk toward. */
  pathIndex: number;
  /** Tick counter for staggering pathfinding recalculations. */
  ticksSinceLastPathCalc: number;
  /** Seconds until next attack. */
  attackCooldownRemaining: number;
  /** Seconds remaining in stagger state. */
  staggerTimeRemaining: number;
  /** Body ID of the entity being attacked (barricade or player), or null. */
  attackTargetBodyId: number | null;
  /** Previous health value for damage detection. */
  previousHealth: number;
}

/** All zombie variant identifiers. */
export type ZombieVariant = 'shambler' | 'runner' | 'brute' | 'horde';

/**
 * Zombie variant definition — holds all per-type tunable stats.
 *
 * Each archetype (shambler, runner, brute, horde) is a ZombieType with
 * different stat values. The AI system reads these values to parameterise
 * all behaviour, making the state machine fully data-driven.
 */
export interface ZombieType {
  /** Variant identifier. */
  variant: ZombieVariant;
  /** Maximum movement speed in pixels per second. */
  moveSpeed: number;
  /** Damage dealt per attack hit. */
  attackDamage: number;
  /** Seconds between attacks. */
  attackCooldown: number;
  /** Ticks between A* path recalculations. */
  pathRecalcInterval: number;
  /** Seconds the zombie is stunned after taking damage. */
  staggerDuration: number;
  /**
   * Multiplier applied to attackDamage when hitting barricades.
   * Shambler/runner/horde = 1, brute = 3.
   */
  barricadeDamageMultiplier: number;
  /**
   * Barricade durability threshold for the vault mechanic.
   * When a barricade's currentDurability is at or below this value,
   * the zombie ignores it instead of attacking. 0 = no vaulting.
   */
  vaultDurabilityThreshold: number;
  /**
   * Physics body size in pixels for this variant.
   * Used when creating the Matter.js body and for visual sizing.
   */
  bodySize: number;
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
