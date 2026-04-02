/**
 * Programmatic pixel-art sprite generators for interactive world objects.
 *
 * Each generator draws a distinct silhouette in white/gray on a transparent
 * canvas. Colours come from `setTint()` at runtime using the object's
 * category colour (furniture = brown, loot = gold, container = slate, debris
 * = dark gray). All shapes use `fillRect()` only for pixel-perfect tinting.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import type { EntitySpriteGenerator } from "./entity-sprites";

// ---------------------------------------------------------------------------
// Colour constants (white/gray palette for tint-compatible drawing)
// ---------------------------------------------------------------------------

const WHITE = "#ffffff";
const LIGHT = "#dddddd";
const MID = "#cccccc";
const SHADOW = "#aaaaaa";

// ---------------------------------------------------------------------------
// Furniture — 0x8b4513 saddle brown via tint
// ---------------------------------------------------------------------------

/** Bookshelf (32×32 immovable): rectangle with horizontal shelf lines. */
function drawBookshelf(ctx: CanvasRenderingContext2D): void {
  // Outer frame
  ctx.fillStyle = WHITE;
  ctx.fillRect(4, 2, 24, 28);

  // Side panels
  ctx.fillStyle = MID;
  ctx.fillRect(4, 2, 2, 28);
  ctx.fillRect(26, 2, 2, 28);

  // Shelf lines (4 shelves)
  ctx.fillRect(6, 8, 20, 1);
  ctx.fillRect(6, 14, 20, 1);
  ctx.fillRect(6, 20, 20, 1);
  ctx.fillRect(6, 26, 20, 1);

  // Book shapes on shelves
  ctx.fillStyle = LIGHT;
  ctx.fillRect(7, 3, 3, 5);
  ctx.fillRect(11, 4, 2, 4);
  ctx.fillRect(14, 3, 4, 5);
  ctx.fillRect(7, 9, 4, 5);
  ctx.fillRect(13, 10, 3, 4);
  ctx.fillRect(18, 9, 3, 5);
  ctx.fillRect(8, 15, 5, 5);
  ctx.fillRect(15, 16, 4, 4);
  ctx.fillRect(8, 21, 3, 5);
  ctx.fillRect(13, 22, 4, 4);
  ctx.fillRect(19, 21, 4, 5);
}

/** Wooden chair (16×16 movable): seat square with backrest. */
function drawWoodenChair(ctx: CanvasRenderingContext2D): void {
  // Backrest
  ctx.fillStyle = WHITE;
  ctx.fillRect(3, 1, 10, 3);

  // Backrest detail
  ctx.fillStyle = MID;
  ctx.fillRect(5, 2, 2, 1);
  ctx.fillRect(9, 2, 2, 1);

  // Seat
  ctx.fillStyle = WHITE;
  ctx.fillRect(3, 5, 10, 7);

  // Seat shadow
  ctx.fillStyle = LIGHT;
  ctx.fillRect(4, 6, 8, 5);

  // Legs
  ctx.fillStyle = MID;
  ctx.fillRect(3, 12, 2, 3);
  ctx.fillRect(11, 12, 2, 3);
}

/** Table (16×16 movable): wide tabletop with leg supports. */
function drawTable(ctx: CanvasRenderingContext2D): void {
  // Tabletop
  ctx.fillStyle = WHITE;
  ctx.fillRect(1, 3, 14, 5);

  // Tabletop edge
  ctx.fillStyle = LIGHT;
  ctx.fillRect(1, 7, 14, 1);

  // Legs
  ctx.fillStyle = MID;
  ctx.fillRect(2, 8, 2, 6);
  ctx.fillRect(12, 8, 2, 6);

  // Cross brace
  ctx.fillStyle = SHADOW;
  ctx.fillRect(4, 11, 8, 1);
}

/** Sofa (32×32 immovable): wide cushioned shape with armrests. */
function drawSofa(ctx: CanvasRenderingContext2D): void {
  // Back cushion
  ctx.fillStyle = MID;
  ctx.fillRect(2, 4, 28, 6);

  // Seat cushions
  ctx.fillStyle = WHITE;
  ctx.fillRect(5, 10, 22, 10);

  // Cushion divider
  ctx.fillStyle = LIGHT;
  ctx.fillRect(15, 10, 2, 10);

  // Left armrest
  ctx.fillStyle = MID;
  ctx.fillRect(2, 4, 4, 18);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(3, 5, 2, 16);

  // Right armrest
  ctx.fillStyle = MID;
  ctx.fillRect(26, 4, 4, 18);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(27, 5, 2, 16);

  // Feet
  ctx.fillStyle = SHADOW;
  ctx.fillRect(4, 22, 3, 3);
  ctx.fillRect(25, 22, 3, 3);
}

/** Bed (32×32 immovable): rectangle with pillow area. */
function drawBed(ctx: CanvasRenderingContext2D): void {
  // Frame
  ctx.fillStyle = MID;
  ctx.fillRect(3, 2, 26, 26);

  // Mattress
  ctx.fillStyle = WHITE;
  ctx.fillRect(5, 4, 22, 22);

  // Pillow
  ctx.fillStyle = LIGHT;
  ctx.fillRect(6, 5, 9, 6);
  ctx.fillRect(17, 5, 9, 6);

  // Pillow detail
  ctx.fillStyle = WHITE;
  ctx.fillRect(7, 6, 7, 4);
  ctx.fillRect(18, 6, 7, 4);

  // Blanket fold line
  ctx.fillStyle = MID;
  ctx.fillRect(5, 12, 22, 1);

  // Blanket texture
  ctx.fillStyle = LIGHT;
  ctx.fillRect(6, 14, 20, 2);
  ctx.fillRect(6, 18, 20, 2);
  ctx.fillRect(6, 22, 20, 2);

  // Headboard
  ctx.fillStyle = SHADOW;
  ctx.fillRect(3, 2, 26, 2);
}

// ---------------------------------------------------------------------------
// Loot — 0xffd700 gold via tint
// ---------------------------------------------------------------------------

/** Gas can (16×16 movable): body with nozzle protrusion. */
function drawGasCan(ctx: CanvasRenderingContext2D): void {
  // Body
  ctx.fillStyle = WHITE;
  ctx.fillRect(3, 5, 10, 10);

  // Body detail
  ctx.fillStyle = LIGHT;
  ctx.fillRect(4, 6, 8, 8);

  // Handle
  ctx.fillStyle = MID;
  ctx.fillRect(5, 2, 6, 2);
  ctx.fillRect(5, 2, 1, 3);
  ctx.fillRect(10, 2, 1, 3);

  // Nozzle
  ctx.fillStyle = WHITE;
  ctx.fillRect(11, 3, 3, 2);
  ctx.fillRect(13, 1, 2, 4);

  // Label line
  ctx.fillStyle = SHADOW;
  ctx.fillRect(5, 10, 6, 1);
}

/** Car battery (16×16 movable): body with terminal posts. */
function drawCarBattery(ctx: CanvasRenderingContext2D): void {
  // Body
  ctx.fillStyle = WHITE;
  ctx.fillRect(2, 5, 12, 9);

  // Body detail
  ctx.fillStyle = LIGHT;
  ctx.fillRect(3, 6, 10, 7);

  // Ridge on top
  ctx.fillStyle = MID;
  ctx.fillRect(2, 5, 12, 1);

  // Terminals (+ and -)
  ctx.fillStyle = WHITE;
  ctx.fillRect(4, 2, 2, 3);
  ctx.fillRect(10, 2, 2, 3);

  // Terminal markers
  ctx.fillStyle = SHADOW;
  ctx.fillRect(4, 2, 2, 1);
  ctx.fillRect(10, 2, 2, 1);

  // Label
  ctx.fillStyle = MID;
  ctx.fillRect(5, 9, 6, 2);
}

/** Wire spool (16×16 movable): pixel-art circular spool shape. */
function drawWireSpool(ctx: CanvasRenderingContext2D): void {
  // Outer circle (pixel approximation)
  ctx.fillStyle = WHITE;
  ctx.fillRect(5, 1, 6, 1);   // top
  ctx.fillRect(3, 2, 10, 1);
  ctx.fillRect(2, 3, 12, 1);
  ctx.fillRect(1, 4, 14, 8);  // middle rows
  ctx.fillRect(2, 12, 12, 1);
  ctx.fillRect(3, 13, 10, 1);
  ctx.fillRect(5, 14, 6, 1);  // bottom

  // Inner hole (centre)
  ctx.fillStyle = MID;
  ctx.fillRect(6, 6, 4, 4);

  // Wire wrapping detail
  ctx.fillStyle = LIGHT;
  ctx.fillRect(3, 5, 3, 1);
  ctx.fillRect(10, 5, 3, 1);
  ctx.fillRect(3, 10, 3, 1);
  ctx.fillRect(10, 10, 3, 1);

  // Centre hub
  ctx.fillStyle = SHADOW;
  ctx.fillRect(7, 7, 2, 2);
}

/** Wooden plank (16×16 movable): horizontal narrow plank. */
function drawWoodenPlank(ctx: CanvasRenderingContext2D): void {
  // Main plank body
  ctx.fillStyle = WHITE;
  ctx.fillRect(1, 5, 14, 5);

  // Wood grain lines
  ctx.fillStyle = LIGHT;
  ctx.fillRect(2, 7, 12, 1);
  ctx.fillRect(3, 9, 10, 1);

  // End grain
  ctx.fillStyle = MID;
  ctx.fillRect(1, 5, 1, 5);
  ctx.fillRect(14, 5, 1, 5);

  // Nail hole detail
  ctx.fillStyle = SHADOW;
  ctx.fillRect(4, 6, 1, 1);
  ctx.fillRect(11, 8, 1, 1);
}

/** Metal sheet (16×16 movable): flat sheet with bent corner. */
function drawMetalSheet(ctx: CanvasRenderingContext2D): void {
  // Main sheet
  ctx.fillStyle = WHITE;
  ctx.fillRect(2, 3, 12, 10);

  // Surface sheen
  ctx.fillStyle = LIGHT;
  ctx.fillRect(3, 4, 10, 8);

  // Bent corner (top-right)
  ctx.fillStyle = MID;
  ctx.fillRect(11, 3, 3, 1);
  ctx.fillRect(12, 4, 2, 1);
  ctx.fillRect(13, 5, 1, 1);

  // Edge highlight
  ctx.fillStyle = MID;
  ctx.fillRect(2, 3, 12, 1);
  ctx.fillRect(2, 12, 12, 1);

  // Rivet detail
  ctx.fillStyle = SHADOW;
  ctx.fillRect(4, 5, 1, 1);
  ctx.fillRect(10, 5, 1, 1);
  ctx.fillRect(4, 10, 1, 1);
  ctx.fillRect(10, 10, 1, 1);
}

// ---------------------------------------------------------------------------
// Containers — 0x708090 slate gray via tint
// ---------------------------------------------------------------------------

/** Fridge (32×32 immovable): tall body with handle and door line. */
function drawFridge(ctx: CanvasRenderingContext2D): void {
  // Body
  ctx.fillStyle = WHITE;
  ctx.fillRect(5, 2, 22, 28);

  // Door line (vertical split)
  ctx.fillStyle = MID;
  ctx.fillRect(15, 2, 1, 28);

  // Freezer compartment line
  ctx.fillRect(5, 10, 22, 1);

  // Handle (right side)
  ctx.fillStyle = SHADOW;
  ctx.fillRect(18, 12, 2, 8);

  // Handle highlight
  ctx.fillStyle = WHITE;
  ctx.fillRect(18, 13, 1, 6);

  // Top surface
  ctx.fillStyle = LIGHT;
  ctx.fillRect(5, 2, 22, 2);

  // Bottom surface
  ctx.fillRect(5, 28, 22, 2);

  // Freezer interior detail
  ctx.fillStyle = LIGHT;
  ctx.fillRect(7, 4, 7, 5);
}

/** Metal shelving (32×32 immovable): open frame with shelf bars. */
function drawMetalShelving(ctx: CanvasRenderingContext2D): void {
  // Vertical side columns
  ctx.fillStyle = MID;
  ctx.fillRect(4, 2, 2, 28);
  ctx.fillRect(26, 2, 2, 28);

  // Cross braces
  ctx.fillStyle = SHADOW;
  ctx.fillRect(4, 2, 24, 2);
  ctx.fillRect(4, 28, 24, 2);

  // Shelf bars (4 shelves)
  ctx.fillStyle = WHITE;
  ctx.fillRect(6, 8, 20, 2);
  ctx.fillRect(6, 14, 20, 2);
  ctx.fillRect(6, 20, 20, 2);
  ctx.fillRect(6, 26, 20, 2);

  // Shelf surface detail
  ctx.fillStyle = LIGHT;
  ctx.fillRect(7, 9, 18, 1);
  ctx.fillRect(7, 15, 18, 1);
  ctx.fillRect(7, 21, 18, 1);
}

/** Cardboard box (16×16 movable): square with flap lines. */
function drawCardboardBox(ctx: CanvasRenderingContext2D): void {
  // Box body
  ctx.fillStyle = WHITE;
  ctx.fillRect(2, 5, 12, 9);

  // Body detail
  ctx.fillStyle = LIGHT;
  ctx.fillRect(3, 6, 10, 7);

  // Top flaps
  ctx.fillStyle = WHITE;
  ctx.fillRect(2, 3, 5, 2);
  ctx.fillRect(9, 3, 5, 2);

  // Flap fold lines
  ctx.fillStyle = MID;
  ctx.fillRect(7, 3, 2, 2);

  // Tape line down centre
  ctx.fillStyle = MID;
  ctx.fillRect(7, 5, 2, 9);

  // Bottom edge
  ctx.fillStyle = SHADOW;
  ctx.fillRect(2, 13, 12, 1);
}

/** Trash can (16×16 movable): trapezoidal can shape. */
function drawTrashCan(ctx: CanvasRenderingContext2D): void {
  // Lid
  ctx.fillStyle = MID;
  ctx.fillRect(3, 1, 10, 2);

  // Lid handle
  ctx.fillStyle = SHADOW;
  ctx.fillRect(7, 0, 2, 1);

  // Can body (trapezoidal via stacked rects)
  ctx.fillStyle = WHITE;
  ctx.fillRect(4, 3, 8, 2);
  ctx.fillRect(3, 5, 10, 4);
  ctx.fillRect(3, 9, 10, 4);
  ctx.fillRect(4, 13, 8, 2);

  // Body ridges
  ctx.fillStyle = LIGHT;
  ctx.fillRect(4, 6, 8, 1);
  ctx.fillRect(4, 9, 8, 1);
  ctx.fillRect(4, 12, 8, 1);

  // Base
  ctx.fillStyle = MID;
  ctx.fillRect(4, 14, 8, 1);
}

// ---------------------------------------------------------------------------
// Debris — 0x555555 dark gray via tint
// ---------------------------------------------------------------------------

/** Tire (16×16 movable): pixel-art circular outline with inner hole. */
function drawTire(ctx: CanvasRenderingContext2D): void {
  // Outer ring (pixel circle)
  ctx.fillStyle = WHITE;
  ctx.fillRect(5, 1, 6, 1);   // top
  ctx.fillRect(3, 2, 10, 1);
  ctx.fillRect(2, 3, 12, 1);
  ctx.fillRect(1, 4, 14, 2);
  ctx.fillRect(1, 6, 14, 4);  // middle
  ctx.fillRect(1, 10, 14, 2);
  ctx.fillRect(2, 12, 12, 1);
  ctx.fillRect(3, 13, 10, 1);
  ctx.fillRect(5, 14, 6, 1);  // bottom

  // Inner hole
  ctx.fillStyle = MID;
  ctx.fillRect(6, 5, 4, 1);
  ctx.fillRect(5, 6, 6, 4);
  ctx.fillRect(6, 10, 4, 1);

  // Tread detail
  ctx.fillStyle = LIGHT;
  ctx.fillRect(2, 4, 2, 1);
  ctx.fillRect(12, 4, 2, 1);
  ctx.fillRect(1, 7, 1, 2);
  ctx.fillRect(14, 7, 1, 2);
  ctx.fillRect(2, 11, 2, 1);
  ctx.fillRect(12, 11, 2, 1);

  // Hub
  ctx.fillStyle = SHADOW;
  ctx.fillRect(7, 7, 2, 2);
}

// ---------------------------------------------------------------------------
// Generator registry
// ---------------------------------------------------------------------------

const GENERATORS: Readonly<Record<string, EntitySpriteGenerator>> = {
  // Furniture
  bookshelf:     { draw: drawBookshelf,     width: 32, height: 32, frameCount: 1, frameWidth: 32 },
  wooden_chair:  { draw: drawWoodenChair,   width: 16, height: 16, frameCount: 1, frameWidth: 16 },
  table:         { draw: drawTable,         width: 16, height: 16, frameCount: 1, frameWidth: 16 },
  sofa:          { draw: drawSofa,          width: 32, height: 32, frameCount: 1, frameWidth: 32 },
  bed:           { draw: drawBed,           width: 32, height: 32, frameCount: 1, frameWidth: 32 },
  // Loot
  gas_can:       { draw: drawGasCan,        width: 16, height: 16, frameCount: 1, frameWidth: 16 },
  car_battery:   { draw: drawCarBattery,    width: 16, height: 16, frameCount: 1, frameWidth: 16 },
  wire_spool:    { draw: drawWireSpool,     width: 16, height: 16, frameCount: 1, frameWidth: 16 },
  wooden_plank:  { draw: drawWoodenPlank,   width: 16, height: 16, frameCount: 1, frameWidth: 16 },
  metal_sheet:   { draw: drawMetalSheet,    width: 16, height: 16, frameCount: 1, frameWidth: 16 },
  // Containers
  fridge:        { draw: drawFridge,        width: 32, height: 32, frameCount: 1, frameWidth: 32 },
  metal_shelving:{ draw: drawMetalShelving, width: 32, height: 32, frameCount: 1, frameWidth: 32 },
  cardboard_box: { draw: drawCardboardBox,  width: 16, height: 16, frameCount: 1, frameWidth: 16 },
  trash_can:     { draw: drawTrashCan,      width: 16, height: 16, frameCount: 1, frameWidth: 16 },
  // Debris
  tire:          { draw: drawTire,          width: 16, height: 16, frameCount: 1, frameWidth: 16 },
};

/**
 * Look up a sprite generator for a world object key.
 *
 * Returns `null` for keys that are not world objects (entities, unknown keys).
 */
export function getObjectSpriteGenerator(
  spriteKey: string,
): EntitySpriteGenerator | null {
  return GENERATORS[spriteKey] ?? null;
}

/** All object type keys that have custom generators. */
export function getObjectGeneratorKeys(): string[] {
  return Object.keys(GENERATORS);
}
