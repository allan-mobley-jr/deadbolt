/**
 * Centralised colour palette for all game visuals.
 *
 * Every colour constant lives here — sprite entity colours, UI indicator
 * colours, health bar tiers, damage text colours, and object category colours.
 * Systems import from this module instead of defining local hex values.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import { getObjectDef } from "@/game/procgen/object-defs";

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

/** Master palette. All game colours are defined here. */
export const PALETTE = {
  /** Entity sprite colours by spriteKey (temporary until real sprites exist). */
  sprite: {
    player: 0x4ade80, // green
    zombie: 0xef4444, // red (shambler)
    zombie_runner: 0xf97316, // orange
    zombie_brute: 0x7c3aed, // purple
    zombie_horde: 0xa3e635, // lime green
    barricade: 0x94a3b8, // slate
    bullet: 0xfacc15, // yellow
    fallback: 0xffffff, // white
  },

  /** Object category colours (used in ObjectDefinition.renderColor). */
  category: {
    FURNITURE: 0x8b4513, // saddle brown
    LOOT: 0xffd700, // gold
    CONTAINER: 0x708090, // slate gray
    DEBRIS: 0x555555, // dark gray
  },

  /** Barricade health bar fill colours by HP fraction tier. */
  healthBar: {
    good: 0x4ade80, // green
    warning: 0xf59e0b, // amber
    danger: 0xef4444, // red
    bg: 0x1a1a2e, // dark background
  },

  /** Barricade damage tint colours by HP fraction tier. */
  barricadeTint: {
    good: 0x94a3b8, // slate (default barricade colour)
    warning: 0xf59e0b, // amber
    danger: 0xef4444, // red
  },

  /** UI indicator colours. */
  ui: {
    snap: 0x60a5fa, // blue-400 (snap zone indicator)
    swingArc: 0xffffff, // white (melee swing arc)
    aim: 0xffffff, // white (aim direction line)
    highContrastBorder: 0xffffff, // white (high contrast borders)
  },

  /** Damage number text colours (CSS hex for Phaser Text objects). */
  damageText: {
    melee: "#ef4444", // red
    fire: "#ff6b00", // orange
    electricity: "#4488ff", // blue
  },
} as const;

// ---------------------------------------------------------------------------
// Colour resolution
// ---------------------------------------------------------------------------

/** Sprite colour lookup table built from the palette (avoids manual duplication). */
const SPRITE_COLOR_MAP: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(PALETTE.sprite).filter(([k]) => k !== "fallback"),
);

/**
 * Resolve a spriteKey to its display colour.
 *
 * 1. Known entity keys (player, zombies, barricade, bullet)
 * 2. Object definition renderColor (world objects)
 * 3. Fallback white
 */
export function resolveColor(spriteKey: string): number {
  const mapped = SPRITE_COLOR_MAP[spriteKey];
  if (mapped !== undefined) return mapped;

  const def = getObjectDef(spriteKey);
  if (def) return def.renderColor;

  return PALETTE.sprite.fallback;
}

// ---------------------------------------------------------------------------
// Colour utilities
// ---------------------------------------------------------------------------

/** Pick a colour from a three-tier palette based on HP fraction. */
export function colorByHpTier(
  hpFraction: number,
  good: number,
  warning: number,
  danger: number,
): number {
  if (hpFraction <= 0.33) return danger;
  if (hpFraction <= 0.66) return warning;
  return good;
}
