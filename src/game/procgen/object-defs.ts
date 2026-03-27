/**
 * Central object definition table for all interactive world objects.
 *
 * Each definition describes an object type's physical properties, category,
 * and gameplay characteristics. Systems reference these definitions by the
 * `type` key (which matches PlacedObject.objectType in the procgen pipeline).
 *
 * Physical properties drive gameplay in M3 (barricading) and M4 (traps):
 *   - mass: Matter.js body mass and push/drag threshold
 *   - durability: structural hit points (0 = fragile, 1 = indestructible)
 *   - flammability: fire spread rate (0 = fireproof, 1 = instant ignition)
 *   - conductivity: electricity propagation (0 = insulator, 1 = perfect conductor)
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import { ObjectCategory } from '@/types/procgen';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Physical properties for an object type. */
export interface ObjectPhysicalProperties {
  /** Mass in kg. Drives Matter.js body mass and push/drag threshold. */
  mass: number;
  /** Structural durability (0 = fragile, 1 = indestructible). */
  durability: number;
  /** How easily this object catches fire (0 = fireproof, 1 = instant ignition). */
  flammability: number;
  /** Electrical conductivity (0 = insulator, 1 = perfect conductor). */
  conductivity: number;
}

/** Full definition for a placeable object type. */
export interface ObjectDefinition {
  /** Unique string key matching PlacedObject.objectType. */
  type: string;
  /** Human-readable name for UI tooltips. */
  displayName: string;
  /** Which ObjectCategory this belongs to. */
  category: ObjectCategory;
  /** Physical properties for Matter.js and gameplay systems. */
  physics: ObjectPhysicalProperties;
  /** Whether this object blocks tile walkability. */
  blocksMovement: boolean;
  /** Whether this object is too large/heavy to carry (push/drag only). */
  immovable: boolean;
  /** Loot value tier (0-10). Higher = rarer, placed farther from safehouse. */
  lootValue: number;
  /** Placeholder render color (hex) for the colored-shape renderer. */
  renderColor: number;
}

// ---------------------------------------------------------------------------
// Render colors by category
// ---------------------------------------------------------------------------

const COLOR = {
  FURNITURE: 0x8b4513,  // saddle brown
  LOOT: 0xffd700,       // gold
  CONTAINER: 0x708090,  // slate gray
  DEBRIS: 0x555555,     // dark gray
} as const;

// ---------------------------------------------------------------------------
// Object definition table
// ---------------------------------------------------------------------------

const OBJECT_DEFS: readonly ObjectDefinition[] = [
  // --- Furniture ---
  {
    type: 'bookshelf',
    displayName: 'Bookshelf',
    category: ObjectCategory.Furniture,
    physics: { mass: 45, durability: 0.5, flammability: 0.9, conductivity: 0.0 },
    blocksMovement: true,
    immovable: true,
    lootValue: 1,
    renderColor: COLOR.FURNITURE,
  },
  {
    type: 'wooden_chair',
    displayName: 'Wooden Chair',
    category: ObjectCategory.Furniture,
    physics: { mass: 5, durability: 0.3, flammability: 0.8, conductivity: 0.0 },
    blocksMovement: false,
    immovable: false,
    lootValue: 0,
    renderColor: COLOR.FURNITURE,
  },
  {
    type: 'table',
    displayName: 'Table',
    category: ObjectCategory.Furniture,
    physics: { mass: 25, durability: 0.5, flammability: 0.7, conductivity: 0.0 },
    blocksMovement: true,
    immovable: false,
    lootValue: 0,
    renderColor: COLOR.FURNITURE,
  },
  {
    type: 'sofa',
    displayName: 'Sofa',
    category: ObjectCategory.Furniture,
    physics: { mass: 40, durability: 0.4, flammability: 0.7, conductivity: 0.0 },
    blocksMovement: true,
    immovable: true,
    lootValue: 0,
    renderColor: COLOR.FURNITURE,
  },
  {
    type: 'bed',
    displayName: 'Bed',
    category: ObjectCategory.Furniture,
    physics: { mass: 35, durability: 0.3, flammability: 0.6, conductivity: 0.0 },
    blocksMovement: true,
    immovable: true,
    lootValue: 0,
    renderColor: COLOR.FURNITURE,
  },

  // --- Loot (crafting components) ---
  {
    type: 'gas_can',
    displayName: 'Gas Can',
    category: ObjectCategory.Loot,
    physics: { mass: 3, durability: 0.2, flammability: 1.0, conductivity: 0.1 },
    blocksMovement: false,
    immovable: false,
    lootValue: 6,
    renderColor: COLOR.LOOT,
  },
  {
    type: 'car_battery',
    displayName: 'Car Battery',
    category: ObjectCategory.Loot,
    physics: { mass: 15, durability: 0.7, flammability: 0.0, conductivity: 0.9 },
    blocksMovement: false,
    immovable: false,
    lootValue: 7,
    renderColor: COLOR.LOOT,
  },
  {
    type: 'wire_spool',
    displayName: 'Wire Spool',
    category: ObjectCategory.Loot,
    physics: { mass: 8, durability: 0.4, flammability: 0.1, conductivity: 1.0 },
    blocksMovement: false,
    immovable: false,
    lootValue: 5,
    renderColor: COLOR.LOOT,
  },
  {
    type: 'wooden_plank',
    displayName: 'Wooden Plank',
    category: ObjectCategory.Loot,
    physics: { mass: 3, durability: 0.3, flammability: 0.9, conductivity: 0.0 },
    blocksMovement: false,
    immovable: false,
    lootValue: 3,
    renderColor: COLOR.LOOT,
  },
  {
    type: 'metal_sheet',
    displayName: 'Metal Sheet',
    category: ObjectCategory.Loot,
    physics: { mass: 10, durability: 0.8, flammability: 0.0, conductivity: 0.6 },
    blocksMovement: false,
    immovable: false,
    lootValue: 4,
    renderColor: COLOR.LOOT,
  },

  // --- Containers ---
  {
    type: 'fridge',
    displayName: 'Fridge',
    category: ObjectCategory.Container,
    physics: { mass: 80, durability: 0.8, flammability: 0.05, conductivity: 0.7 },
    blocksMovement: true,
    immovable: true,
    lootValue: 3,
    renderColor: COLOR.CONTAINER,
  },
  {
    type: 'metal_shelving',
    displayName: 'Metal Shelving',
    category: ObjectCategory.Container,
    physics: { mass: 35, durability: 0.9, flammability: 0.0, conductivity: 0.8 },
    blocksMovement: true,
    immovable: true,
    lootValue: 2,
    renderColor: COLOR.CONTAINER,
  },
  {
    type: 'cardboard_box',
    displayName: 'Cardboard Box',
    category: ObjectCategory.Container,
    physics: { mass: 1, durability: 0.1, flammability: 0.95, conductivity: 0.0 },
    blocksMovement: false,
    immovable: false,
    lootValue: 1,
    renderColor: COLOR.CONTAINER,
  },
  {
    type: 'trash_can',
    displayName: 'Trash Can',
    category: ObjectCategory.Container,
    physics: { mass: 5, durability: 0.5, flammability: 0.1, conductivity: 0.4 },
    blocksMovement: false,
    immovable: false,
    lootValue: 1,
    renderColor: COLOR.CONTAINER,
  },

  // --- Debris ---
  {
    type: 'tire',
    displayName: 'Tire',
    category: ObjectCategory.Debris,
    physics: { mass: 10, durability: 0.6, flammability: 0.4, conductivity: 0.0 },
    blocksMovement: false,
    immovable: false,
    lootValue: 2,
    renderColor: COLOR.DEBRIS,
  },
] as const;

// ---------------------------------------------------------------------------
// Lookup map
// ---------------------------------------------------------------------------

const OBJECT_DEF_MAP = new Map<string, ObjectDefinition>(
  OBJECT_DEFS.map((def) => [def.type, def]),
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up an object definition by its type key.
 *
 * @returns The definition, or undefined if the type is unknown.
 */
export function getObjectDef(type: string): ObjectDefinition | undefined {
  return OBJECT_DEF_MAP.get(type);
}

/** Get all registered object definitions. */
export function getAllObjectDefs(): readonly ObjectDefinition[] {
  return OBJECT_DEFS;
}

/** Get all registered object type keys. */
export function getAllObjectTypes(): string[] {
  return OBJECT_DEFS.map((def) => def.type);
}
