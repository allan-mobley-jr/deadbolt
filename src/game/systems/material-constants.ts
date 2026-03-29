/**
 * Material system constants and assignment table.
 *
 * Defines tuning parameters for spatial queries (fire spread radius,
 * thresholds) and the material category + explosive potential for every
 * interactive object type in the game.
 *
 * NO React imports — this is pure TypeScript.
 */

import type { MaterialCategory } from '@/game/ecs/components';

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

export const MATERIAL = {
  /** Default radius (pixels) for "nearby flammable" spatial queries. */
  FIRE_SPREAD_RADIUS: 64,
  /** Default radius (pixels) for "nearby explosive" spatial queries. */
  EXPLOSION_RADIUS: 96,
  /** Threshold: objects with flammability >= this are considered flammable. */
  FLAMMABILITY_THRESHOLD: 0.1,
  /** Threshold: objects with conductivity >= this are considered conductive. */
  CONDUCTIVITY_THRESHOLD: 0.1,
  /** Threshold: objects with explosivePotential >= this are considered explosive. */
  EXPLOSIVE_THRESHOLD: 0.1,
} as const;

// ---------------------------------------------------------------------------
// Per-object-type material assignments
// ---------------------------------------------------------------------------

export interface MaterialAssignment {
  /** Material classification for interaction rules. */
  category: MaterialCategory;
  /** Explosion potential (0 = inert, 1 = maximum blast). */
  explosivePotential: number;
}

/**
 * Material assignments for all interactive object types.
 *
 * Category rationale:
 *   wood        — solid wood items (flammable, insulating)
 *   metal       — metal items (fireproof, conductive)
 *   fabric      — soft/textile/cardboard items (highly flammable, insulating)
 *   fuel        — combustible liquids/materials (extremely flammable, explosive)
 *   electronic  — items with wiring or batteries (conductive, slightly flammable)
 */
export const MATERIAL_ASSIGNMENTS: Readonly<Partial<Record<string, MaterialAssignment>>> = {
  // Furniture
  bookshelf:      { category: 'wood',       explosivePotential: 0.0 },
  wooden_chair:   { category: 'wood',       explosivePotential: 0.0 },
  table:          { category: 'wood',       explosivePotential: 0.0 },
  sofa:           { category: 'fabric',     explosivePotential: 0.0 },
  bed:            { category: 'fabric',     explosivePotential: 0.0 },

  // Loot (crafting components)
  gas_can:        { category: 'fuel',       explosivePotential: 0.9 },
  car_battery:    { category: 'electronic', explosivePotential: 0.3 },
  wire_spool:     { category: 'electronic', explosivePotential: 0.0 },
  wooden_plank:   { category: 'wood',       explosivePotential: 0.0 },
  metal_sheet:    { category: 'metal',      explosivePotential: 0.0 },

  // Containers
  fridge:         { category: 'electronic', explosivePotential: 0.1 },
  metal_shelving: { category: 'metal',      explosivePotential: 0.0 },
  cardboard_box:  { category: 'fabric',     explosivePotential: 0.0 },
  trash_can:      { category: 'metal',      explosivePotential: 0.0 },

  // Debris
  tire:           { category: 'fuel',       explosivePotential: 0.2 },
};
