/**
 * Programmatic pixel-art sprite generators for game entities.
 *
 * Each generator draws a recognizable white/gray silhouette on a transparent
 * canvas. White fill is critical — `Sprite.setTint(color)` multiplies each
 * pixel's color, so white × green = green (correct), but blue × green = dark
 * (wrong). Detail is added with lighter grays (#cccccc, #dddddd) for depth.
 *
 * All shapes use `fillRect()` exclusively (no `arc()`) for pixel-perfect
 * edges that tint cleanly without anti-aliasing artifacts.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Describes a sprite generator for a specific entity type. */
export interface EntitySpriteGenerator {
  /** Draw the sprite onto the provided canvas context. */
  draw: (ctx: CanvasRenderingContext2D) => void;
  /** Total canvas width (may be wider than frameWidth for multi-frame strips). */
  width: number;
  /** Canvas height. */
  height: number;
  /** Number of frames in this strip (1 for single-frame sprites). */
  frameCount: number;
  /** Width of each individual frame. */
  frameWidth: number;
}

// ---------------------------------------------------------------------------
// Colour constants (white/gray palette for tint-compatible drawing)
// ---------------------------------------------------------------------------

const WHITE = "#ffffff";
const LIGHT = "#dddddd";
const MID = "#cccccc";
const SHADOW = "#aaaaaa";

// ---------------------------------------------------------------------------
// Player sprite (4 directional frames)
// ---------------------------------------------------------------------------

/** Frame order: S=0, E=1, N=2, W=3 */
const PLAYER_FRAME_SIZE = 24;
const PLAYER_FRAME_COUNT = 4;

/**
 * Draw the player facing South (front view).
 * Top-down humanoid: head circle (pixel approximation), torso, arms, legs.
 */
function drawPlayerSouth(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const cx = ox + 12; // center x
  const cy = oy;      // top

  // Head (6×6 rounded with pixel corners)
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, cy + 1, 4, 1);   // top
  ctx.fillRect(cx - 3, cy + 2, 6, 4);   // middle
  ctx.fillRect(cx - 2, cy + 6, 4, 1);   // bottom

  // Eyes (two dark dots on the face)
  ctx.fillStyle = SHADOW;
  ctx.fillRect(cx - 2, cy + 3, 1, 1);
  ctx.fillRect(cx + 1, cy + 3, 1, 1);

  // Neck
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 1, cy + 7, 2, 1);

  // Torso (6×6)
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 3, cy + 8, 6, 6);

  // Belt/detail
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 3, cy + 13, 6, 1);

  // Arms (2×5 each, beside torso)
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 5, cy + 8, 2, 5);
  ctx.fillRect(cx + 3, cy + 8, 2, 5);

  // Legs (2×5 each, below torso)
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 3, cy + 14, 2, 5);
  ctx.fillRect(cx + 1, cy + 14, 2, 5);

  // Shoes
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 3, cy + 19, 2, 1);
  ctx.fillRect(cx + 1, cy + 19, 2, 1);
}

/**
 * Draw the player facing East (right side profile).
 */
function drawPlayerEast(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const cx = ox + 12;
  const cy = oy;

  // Head (5×6 side view)
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, cy + 1, 4, 1);
  ctx.fillRect(cx - 2, cy + 2, 5, 4);
  ctx.fillRect(cx - 2, cy + 6, 4, 1);

  // Eye (single dot, right side)
  ctx.fillStyle = SHADOW;
  ctx.fillRect(cx + 1, cy + 3, 1, 1);

  // Neck
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 1, cy + 7, 2, 1);

  // Torso (4×6, slightly narrower in profile)
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, cy + 8, 4, 6);

  // Arm (forward-reaching, 4×2)
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx + 2, cy + 9, 3, 2);

  // Back arm (partially hidden)
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 3, cy + 9, 1, 3);

  // Belt
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 2, cy + 13, 4, 1);

  // Legs (staggered for walking appearance)
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 1, cy + 14, 2, 5);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx + 1, cy + 15, 2, 4);

  // Shoes
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 1, cy + 19, 2, 1);
}

/**
 * Draw the player facing North (back view).
 */
function drawPlayerNorth(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const cx = ox + 12;
  const cy = oy;

  // Head (6×6, no face details — back of head)
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, cy + 1, 4, 1);
  ctx.fillRect(cx - 3, cy + 2, 6, 4);
  ctx.fillRect(cx - 2, cy + 6, 4, 1);

  // Hair detail on back
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 2, cy + 2, 4, 1);

  // Neck
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 1, cy + 7, 2, 1);

  // Torso (6×6)
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 3, cy + 8, 6, 6);

  // Backpack/detail line
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 2, cy + 9, 4, 3);

  // Arms
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 5, cy + 8, 2, 5);
  ctx.fillRect(cx + 3, cy + 8, 2, 5);

  // Belt
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 3, cy + 13, 6, 1);

  // Legs
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 3, cy + 14, 2, 5);
  ctx.fillRect(cx + 1, cy + 14, 2, 5);

  // Shoes
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 3, cy + 19, 2, 1);
  ctx.fillRect(cx + 1, cy + 19, 2, 1);
}

/**
 * Draw the player facing West (left side profile — mirror of East).
 */
function drawPlayerWest(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const cx = ox + 12;
  const cy = oy;

  // Head (5×6 side view, mirrored)
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, cy + 1, 4, 1);
  ctx.fillRect(cx - 3, cy + 2, 5, 4);
  ctx.fillRect(cx - 2, cy + 6, 4, 1);

  // Eye (single dot, left side)
  ctx.fillStyle = SHADOW;
  ctx.fillRect(cx - 2, cy + 3, 1, 1);

  // Neck
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 1, cy + 7, 2, 1);

  // Torso (4×6)
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, cy + 8, 4, 6);

  // Arm (forward-reaching, mirrored)
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 5, cy + 9, 3, 2);

  // Back arm
  ctx.fillStyle = MID;
  ctx.fillRect(cx + 2, cy + 9, 1, 3);

  // Belt
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 2, cy + 13, 4, 1);

  // Legs (staggered, mirrored)
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 1, cy + 14, 2, 5);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 3, cy + 15, 2, 4);

  // Shoes
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 1, cy + 19, 2, 1);
}

/** Draw the full 4-frame player sprite strip. */
function drawPlayerStrip(ctx: CanvasRenderingContext2D): void {
  const fw = PLAYER_FRAME_SIZE;
  drawPlayerSouth(ctx, 0 * fw, 0);  // Frame 0: South
  drawPlayerEast(ctx, 1 * fw, 0);   // Frame 1: East
  drawPlayerNorth(ctx, 2 * fw, 0);  // Frame 2: North
  drawPlayerWest(ctx, 3 * fw, 0);   // Frame 3: West
}

// ---------------------------------------------------------------------------
// Zombie sprites (single-frame each)
// ---------------------------------------------------------------------------

/**
 * Shambler — baseline zombie. Hunched posture, ragged silhouette.
 * 20×20 visual size.
 */
function drawZombieShambler(ctx: CanvasRenderingContext2D): void {
  const cx = 10; // center

  // Head (tilted slightly — asymmetric)
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, 1, 5, 1);
  ctx.fillRect(cx - 3, 2, 6, 3);
  ctx.fillRect(cx - 2, 5, 5, 1);

  // Hunched neck/shoulders (wide, slouching)
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 4, 6, 8, 2);

  // Torso (slightly hunched forward)
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 3, 8, 6, 4);

  // Ragged detail (torn clothing)
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 3, 11, 2, 1);
  ctx.fillRect(cx + 2, 10, 1, 2);

  // Arms (one forward-reaching, one at side — asymmetric)
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx + 3, 7, 2, 4);   // right arm reaching
  ctx.fillRect(cx + 4, 11, 1, 1);  // right hand
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 5, 8, 2, 3);   // left arm dragging

  // Legs (shuffling stance)
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 3, 12, 2, 5);
  ctx.fillRect(cx + 1, 13, 2, 4);

  // Feet
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 3, 17, 3, 1);
  ctx.fillRect(cx + 1, 17, 2, 1);
}

/**
 * Runner — fast, lean, angular zombie.
 * 18×18 visual size.
 */
function drawZombieRunner(ctx: CanvasRenderingContext2D): void {
  const cx = 9; // center

  // Small angular head
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, 0, 4, 1);
  ctx.fillRect(cx - 2, 1, 4, 3);
  ctx.fillRect(cx - 1, 4, 2, 1);

  // Thin neck
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 1, 5, 2, 1);

  // Lean torso (narrow, angular)
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, 6, 4, 5);

  // Angular shoulders
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 3, 6, 1, 2);
  ctx.fillRect(cx + 2, 6, 1, 2);

  // Arms (swept back, running posture)
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 4, 7, 1, 3);
  ctx.fillRect(cx - 5, 9, 1, 2);
  ctx.fillRect(cx + 3, 7, 1, 3);
  ctx.fillRect(cx + 4, 8, 1, 2);

  // Legs (long, sprint stance)
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, 11, 2, 5);
  ctx.fillRect(cx, 12, 2, 4);

  // Clawed feet
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 3, 15, 1, 1);
  ctx.fillRect(cx - 2, 16, 2, 1);
  ctx.fillRect(cx + 1, 16, 2, 1);
}

/**
 * Brute — wide, imposing, heavy zombie.
 * 28×28 visual size.
 */
function drawZombieBrute(ctx: CanvasRenderingContext2D): void {
  const cx = 14; // center

  // Small head relative to body
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, 1, 4, 1);
  ctx.fillRect(cx - 3, 2, 6, 4);
  ctx.fillRect(cx - 2, 6, 4, 1);

  // Massive neck/shoulders
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 6, 7, 12, 2);

  // Broad torso
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 6, 9, 12, 7);

  // Chest detail (armour/muscles)
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 4, 10, 3, 3);
  ctx.fillRect(cx + 1, 10, 3, 3);

  // Thick arms
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 9, 8, 3, 7);
  ctx.fillRect(cx + 6, 8, 3, 7);

  // Fists
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 9, 15, 3, 2);
  ctx.fillRect(cx + 6, 15, 3, 2);

  // Belt/waist
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 6, 16, 12, 1);

  // Thick legs
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 5, 17, 4, 7);
  ctx.fillRect(cx + 1, 17, 4, 7);

  // Feet
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 6, 24, 5, 2);
  ctx.fillRect(cx + 1, 24, 5, 2);
}

/**
 * Horde member — tiny, individually weak blob.
 * 12×12 visual size.
 */
function drawZombieHorde(ctx: CanvasRenderingContext2D): void {
  const cx = 6; // center

  // Small round head-body blob
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, 1, 4, 1);
  ctx.fillRect(cx - 3, 2, 6, 4);
  ctx.fillRect(cx - 2, 6, 4, 1);

  // Tiny arm nubs
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 4, 3, 1, 2);
  ctx.fillRect(cx + 3, 3, 1, 2);

  // Stubby legs
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, 7, 2, 3);
  ctx.fillRect(cx, 7, 2, 3);

  // Feet dots
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 2, 10, 2, 1);
  ctx.fillRect(cx, 10, 2, 1);
}

// ---------------------------------------------------------------------------
// Bullet sprite
// ---------------------------------------------------------------------------

/**
 * Bullet — bright diamond/streak shape.
 * 6×6 visual size.
 */
function drawBullet(ctx: CanvasRenderingContext2D): void {
  // Diamond shape
  ctx.fillStyle = WHITE;
  ctx.fillRect(2, 0, 2, 1);  // top
  ctx.fillRect(1, 1, 4, 1);  // upper
  ctx.fillRect(0, 2, 6, 2);  // middle (wide)
  ctx.fillRect(1, 4, 4, 1);  // lower
  ctx.fillRect(2, 5, 2, 1);  // bottom

  // Bright center
  ctx.fillRect(2, 2, 2, 2);
}

// ---------------------------------------------------------------------------
// Generator registry
// ---------------------------------------------------------------------------

const GENERATORS: Readonly<Record<string, EntitySpriteGenerator>> = {
  player: {
    draw: drawPlayerStrip,
    width: PLAYER_FRAME_SIZE * PLAYER_FRAME_COUNT,
    height: PLAYER_FRAME_SIZE,
    frameCount: PLAYER_FRAME_COUNT,
    frameWidth: PLAYER_FRAME_SIZE,
  },
  zombie: {
    draw: drawZombieShambler,
    width: 20,
    height: 20,
    frameCount: 1,
    frameWidth: 20,
  },
  zombie_runner: {
    draw: drawZombieRunner,
    width: 18,
    height: 18,
    frameCount: 1,
    frameWidth: 18,
  },
  zombie_brute: {
    draw: drawZombieBrute,
    width: 28,
    height: 28,
    frameCount: 1,
    frameWidth: 28,
  },
  zombie_horde: {
    draw: drawZombieHorde,
    width: 12,
    height: 12,
    frameCount: 1,
    frameWidth: 12,
  },
  bullet: {
    draw: drawBullet,
    width: 6,
    height: 6,
    frameCount: 1,
    frameWidth: 6,
  },
};

/**
 * Look up a sprite generator for an entity key.
 *
 * Returns `null` for keys without custom generators (e.g. world objects),
 * which should use the default white-rectangle fallback.
 */
export function getEntitySpriteGenerator(
  spriteKey: string,
): EntitySpriteGenerator | null {
  return GENERATORS[spriteKey] ?? null;
}

/** All sprite keys that have custom generators. */
export function getGeneratorKeys(): string[] {
  return Object.keys(GENERATORS);
}
