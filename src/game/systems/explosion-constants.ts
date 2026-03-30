/**
 * Explosion system constants and tuning parameters.
 *
 * All timing values are in seconds unless noted otherwise.
 * Distance values are in pixels unless noted otherwise.
 *
 * NO React imports -- this is pure TypeScript.
 */

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

export const EXPLOSION = {
  // --- Blast ---

  /** Radius (pixels) for explosion damage and force application. */
  BLAST_RADIUS: 96,

  /** Base damage at blast center (scaled by source explosivePotential). */
  BASE_DAMAGE: 80,

  /**
   * Damage multiplier at blast edge (linear falloff from 1.0 at center).
   * A gas can (0.9) at the edge deals 80 * 0.9 * 0.2 = 14.4 damage.
   */
  DAMAGE_FALLOFF: 0.2,

  // --- Force ---

  /**
   * Base radial force magnitude at blast center (Matter.js force units).
   * Scaled by source explosivePotential and distance falloff.
   */
  BASE_FORCE: 0.08,

  /** Force multiplier at blast edge (linear falloff from 1.0 at center). */
  FORCE_FALLOFF: 0.1,

  // --- Barricade damage ---

  /**
   * Base durability damage to barricades within blast radius.
   * Scaled by source explosivePotential and distance falloff.
   */
  BARRICADE_DAMAGE: 60,

  // --- Wall destruction ---

  /**
   * Radius (in tiles) around blast center to check for destructible walls.
   * Only interior walls (floor on opposing sides) are destroyed.
   */
  WALL_DESTROY_RADIUS_TILES: 2,

  // --- Chain detonation ---

  /**
   * Maximum BFS depth for chain detonations within a single tick.
   * Prevents runaway infinite loops if explosive objects are densely packed.
   */
  MAX_CHAIN_DEPTH: 8,

  // --- Zombie stagger ---

  /** Duration of explosion-induced stagger on zombies (seconds). */
  STAGGER_DURATION: 1.0,

  // --- Visual feedback ---

  /** Screen shake duration in milliseconds. */
  SCREEN_SHAKE_DURATION: 200,

  /** Screen shake intensity (fraction of camera dimensions). */
  SCREEN_SHAKE_INTENSITY: 0.01,

  /** White flash duration in milliseconds. */
  FLASH_DURATION: 100,

  /** Expanding circle max radius (pixels). */
  CIRCLE_MAX_RADIUS: 96,

  /** Expanding circle animation duration (milliseconds). */
  CIRCLE_DURATION: 300,
} as const;
