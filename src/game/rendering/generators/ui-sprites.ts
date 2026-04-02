/**
 * Simplified 16×16 inventory icon generators for all world objects.
 *
 * Each icon captures the essential silhouette of its corresponding object
 * sprite at 16×16 scale for display in the inventory bar HUD. Objects that
 * are already 16×16 in the world reuse their world sprite drawing function.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import type { EntitySpriteGenerator } from "./entity-sprites";
import { getObjectSpriteGenerator } from "./object-sprites";

// ---------------------------------------------------------------------------
// Colour constants
// ---------------------------------------------------------------------------

const WHITE = "#ffffff";
const LIGHT = "#dddddd";
const MID = "#cccccc";
const SHADOW = "#aaaaaa";

// ---------------------------------------------------------------------------
// Simplified 16×16 icons for 32×32 immovable objects
// ---------------------------------------------------------------------------

/** Bookshelf icon — simplified shelves with books. */
function drawBookshelfIcon(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = WHITE;
  ctx.fillRect(2, 1, 12, 14);

  ctx.fillStyle = MID;
  ctx.fillRect(2, 1, 1, 14);
  ctx.fillRect(13, 1, 1, 14);
  ctx.fillRect(3, 5, 10, 1);
  ctx.fillRect(3, 9, 10, 1);
  ctx.fillRect(3, 13, 10, 1);

  ctx.fillStyle = LIGHT;
  ctx.fillRect(4, 2, 2, 3);
  ctx.fillRect(7, 2, 3, 3);
  ctx.fillRect(4, 6, 3, 3);
  ctx.fillRect(9, 6, 2, 3);
  ctx.fillRect(5, 10, 4, 3);
}

/** Sofa icon — wide shape with armrests. */
function drawSofaIcon(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = MID;
  ctx.fillRect(1, 3, 14, 3);

  ctx.fillStyle = WHITE;
  ctx.fillRect(3, 6, 10, 5);

  ctx.fillStyle = LIGHT;
  ctx.fillRect(7, 6, 1, 5);

  ctx.fillStyle = MID;
  ctx.fillRect(1, 3, 2, 9);
  ctx.fillRect(13, 3, 2, 9);

  ctx.fillStyle = SHADOW;
  ctx.fillRect(2, 12, 2, 2);
  ctx.fillRect(12, 12, 2, 2);
}

/** Bed icon — rectangle with pillow. */
function drawBedIcon(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = MID;
  ctx.fillRect(2, 1, 12, 13);

  ctx.fillStyle = WHITE;
  ctx.fillRect(3, 3, 10, 10);

  ctx.fillStyle = LIGHT;
  ctx.fillRect(3, 3, 4, 3);
  ctx.fillRect(9, 3, 4, 3);

  ctx.fillStyle = MID;
  ctx.fillRect(3, 7, 10, 1);

  ctx.fillStyle = LIGHT;
  ctx.fillRect(4, 9, 8, 1);
  ctx.fillRect(4, 11, 8, 1);

  ctx.fillStyle = SHADOW;
  ctx.fillRect(2, 1, 12, 1);
}

/** Fridge icon — tall body with handle. */
function drawFridgeIcon(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = WHITE;
  ctx.fillRect(3, 1, 10, 14);

  ctx.fillStyle = MID;
  ctx.fillRect(7, 1, 1, 14);
  ctx.fillRect(3, 5, 10, 1);

  ctx.fillStyle = SHADOW;
  ctx.fillRect(9, 7, 1, 4);

  ctx.fillStyle = LIGHT;
  ctx.fillRect(3, 1, 10, 1);
  ctx.fillRect(3, 14, 10, 1);
}

/** Metal shelving icon — open frame with shelves. */
function drawMetalShelvingIcon(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = MID;
  ctx.fillRect(2, 1, 1, 14);
  ctx.fillRect(13, 1, 1, 14);

  ctx.fillStyle = SHADOW;
  ctx.fillRect(2, 1, 12, 1);
  ctx.fillRect(2, 14, 12, 1);

  ctx.fillStyle = WHITE;
  ctx.fillRect(3, 5, 10, 1);
  ctx.fillRect(3, 9, 10, 1);
  ctx.fillRect(3, 13, 10, 1);
}

// ---------------------------------------------------------------------------
// Generator registry
// ---------------------------------------------------------------------------

/**
 * Icon generators for immovable objects that need 32→16 simplification.
 * Movable objects already render at 16×16 — their world sprite is the icon.
 */
const ICON_OVERRIDES: Readonly<Record<string, (ctx: CanvasRenderingContext2D) => void>> = {
  bookshelf: drawBookshelfIcon,
  sofa: drawSofaIcon,
  bed: drawBedIcon,
  fridge: drawFridgeIcon,
  metal_shelving: drawMetalShelvingIcon,
};

/**
 * Look up a UI icon generator for an object key.
 *
 * For immovable objects (normally 32×32), returns a simplified 16×16 icon.
 * For movable objects (already 16×16), delegates to the world object generator.
 * Returns `null` for unknown keys.
 */
export function getUiSpriteGenerator(
  spriteKey: string,
): EntitySpriteGenerator | null {
  const override = ICON_OVERRIDES[spriteKey];
  if (override) {
    return {
      draw: override,
      width: 16,
      height: 16,
      frameCount: 1,
      frameWidth: 16,
    };
  }

  // For 16×16 movable objects, the world sprite IS the icon
  const worldGen = getObjectSpriteGenerator(spriteKey);
  if (worldGen && worldGen.width === 16 && worldGen.height === 16) {
    return worldGen;
  }

  return null;
}

/** All object type keys that have UI icon generators. */
export function getUiGeneratorKeys(): string[] {
  // All object keys that have either an override or a 16×16 world sprite
  const keys = new Set(Object.keys(ICON_OVERRIDES));
  // Import is deferred to avoid circular deps — iterate known 16×16 keys
  const worldKeys = [
    "wooden_chair", "table",
    "gas_can", "car_battery", "wire_spool", "wooden_plank", "metal_sheet",
    "cardboard_box", "trash_can", "tire",
  ];
  for (const k of worldKeys) keys.add(k);
  return [...keys];
}
