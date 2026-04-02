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
 * Walk cycle frames shift limb positions by 1-2px from the idle frame to
 * create a two-step walk cycle animation.
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
// Player sprite (12 frames: 3 per direction × 4 directions)
// ---------------------------------------------------------------------------

/**
 * Frame layout: 3 per direction (idle, walk1, walk2).
 *   0-2:  South (idle, walk1, walk2)
 *   3-5:  East  (idle, walk1, walk2)
 *   6-8:  North (idle, walk1, walk2)
 *   9-11: West  (idle, walk1, walk2)
 */
const PLAYER_FRAME_SIZE = 24;
const PLAYER_FRAMES_PER_DIR = 3;
const PLAYER_DIRECTIONS = 4;
const PLAYER_FRAME_COUNT = PLAYER_FRAMES_PER_DIR * PLAYER_DIRECTIONS; // 12

// --- Shared player head/torso drawing helpers ---

function drawPlayerHeadSouth(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, cy + 1, 4, 1);
  ctx.fillRect(cx - 3, cy + 2, 6, 4);
  ctx.fillRect(cx - 2, cy + 6, 4, 1);
  ctx.fillStyle = SHADOW;
  ctx.fillRect(cx - 2, cy + 3, 1, 1);
  ctx.fillRect(cx + 1, cy + 3, 1, 1);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 1, cy + 7, 2, 1);
}

function drawPlayerTorsoSouth(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 3, cy + 8, 6, 6);
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 3, cy + 13, 6, 1);
}

function drawPlayerHeadEast(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, cy + 1, 4, 1);
  ctx.fillRect(cx - 2, cy + 2, 5, 4);
  ctx.fillRect(cx - 2, cy + 6, 4, 1);
  ctx.fillStyle = SHADOW;
  ctx.fillRect(cx + 1, cy + 3, 1, 1);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 1, cy + 7, 2, 1);
}

function drawPlayerTorsoEast(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, cy + 8, 4, 6);
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 2, cy + 13, 4, 1);
}

function drawPlayerHeadNorth(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, cy + 1, 4, 1);
  ctx.fillRect(cx - 3, cy + 2, 6, 4);
  ctx.fillRect(cx - 2, cy + 6, 4, 1);
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 2, cy + 2, 4, 1);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 1, cy + 7, 2, 1);
}

function drawPlayerTorsoNorth(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 3, cy + 8, 6, 6);
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 2, cy + 9, 4, 3);
  ctx.fillRect(cx - 3, cy + 13, 6, 1);
}

function drawPlayerHeadWest(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, cy + 1, 4, 1);
  ctx.fillRect(cx - 3, cy + 2, 5, 4);
  ctx.fillRect(cx - 2, cy + 6, 4, 1);
  ctx.fillStyle = SHADOW;
  ctx.fillRect(cx - 2, cy + 3, 1, 1);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 1, cy + 7, 2, 1);
}

// --- South frames ---

function drawPlayerSouth(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const cx = ox + 12, cy = oy;
  drawPlayerHeadSouth(ctx, cx, cy);
  drawPlayerTorsoSouth(ctx, cx, cy);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 5, cy + 8, 2, 5);
  ctx.fillRect(cx + 3, cy + 8, 2, 5);
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 3, cy + 14, 2, 5);
  ctx.fillRect(cx + 1, cy + 14, 2, 5);
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 3, cy + 19, 2, 1);
  ctx.fillRect(cx + 1, cy + 19, 2, 1);
}

function drawPlayerSouthWalk1(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const cx = ox + 12, cy = oy;
  drawPlayerHeadSouth(ctx, cx, cy);
  drawPlayerTorsoSouth(ctx, cx, cy);
  // Arms swing: left forward, right back
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 5, cy + 7, 2, 5);  // left arm forward (1px up)
  ctx.fillRect(cx + 3, cy + 9, 2, 5);  // right arm back (1px down)
  // Legs: left forward, right back
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 3, cy + 13, 2, 5); // left leg forward (1px up)
  ctx.fillRect(cx + 1, cy + 15, 2, 5); // right leg back (1px down)
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 3, cy + 18, 2, 1);
  ctx.fillRect(cx + 1, cy + 20, 2, 1);
}

function drawPlayerSouthWalk2(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const cx = ox + 12, cy = oy;
  drawPlayerHeadSouth(ctx, cx, cy);
  drawPlayerTorsoSouth(ctx, cx, cy);
  // Arms swing: right forward, left back (mirror of walk1)
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 5, cy + 9, 2, 5);
  ctx.fillRect(cx + 3, cy + 7, 2, 5);
  // Legs: right forward, left back
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 3, cy + 15, 2, 5);
  ctx.fillRect(cx + 1, cy + 13, 2, 5);
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 3, cy + 20, 2, 1);
  ctx.fillRect(cx + 1, cy + 18, 2, 1);
}

// --- East frames ---

function drawPlayerEast(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const cx = ox + 12, cy = oy;
  drawPlayerHeadEast(ctx, cx, cy);
  drawPlayerTorsoEast(ctx, cx, cy);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx + 2, cy + 9, 3, 2);
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 3, cy + 9, 1, 3);
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 1, cy + 14, 2, 5);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx + 1, cy + 15, 2, 4);
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 1, cy + 19, 2, 1);
}

function drawPlayerEastWalk1(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const cx = ox + 12, cy = oy;
  drawPlayerHeadEast(ctx, cx, cy);
  drawPlayerTorsoEast(ctx, cx, cy);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx + 2, cy + 8, 3, 2);  // front arm up
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 3, cy + 10, 1, 3); // back arm down
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 1, cy + 13, 2, 5); // front leg forward
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx + 1, cy + 16, 2, 4); // back leg back
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 1, cy + 18, 2, 1);
}

function drawPlayerEastWalk2(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const cx = ox + 12, cy = oy;
  drawPlayerHeadEast(ctx, cx, cy);
  drawPlayerTorsoEast(ctx, cx, cy);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx + 2, cy + 10, 3, 2); // front arm down
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 3, cy + 8, 1, 3);  // back arm up
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 1, cy + 15, 2, 5); // front leg back
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx + 1, cy + 14, 2, 4); // back leg forward
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 1, cy + 20, 2, 1);
}

// --- North frames ---

function drawPlayerNorth(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const cx = ox + 12, cy = oy;
  drawPlayerHeadNorth(ctx, cx, cy);
  drawPlayerTorsoNorth(ctx, cx, cy);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 5, cy + 8, 2, 5);
  ctx.fillRect(cx + 3, cy + 8, 2, 5);
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 3, cy + 14, 2, 5);
  ctx.fillRect(cx + 1, cy + 14, 2, 5);
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 3, cy + 19, 2, 1);
  ctx.fillRect(cx + 1, cy + 19, 2, 1);
}

function drawPlayerNorthWalk1(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const cx = ox + 12, cy = oy;
  drawPlayerHeadNorth(ctx, cx, cy);
  drawPlayerTorsoNorth(ctx, cx, cy);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 5, cy + 7, 2, 5);
  ctx.fillRect(cx + 3, cy + 9, 2, 5);
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 3, cy + 13, 2, 5);
  ctx.fillRect(cx + 1, cy + 15, 2, 5);
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 3, cy + 18, 2, 1);
  ctx.fillRect(cx + 1, cy + 20, 2, 1);
}

function drawPlayerNorthWalk2(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const cx = ox + 12, cy = oy;
  drawPlayerHeadNorth(ctx, cx, cy);
  drawPlayerTorsoNorth(ctx, cx, cy);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 5, cy + 9, 2, 5);
  ctx.fillRect(cx + 3, cy + 7, 2, 5);
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 3, cy + 15, 2, 5);
  ctx.fillRect(cx + 1, cy + 13, 2, 5);
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 3, cy + 20, 2, 1);
  ctx.fillRect(cx + 1, cy + 18, 2, 1);
}

// --- West frames ---

function drawPlayerWest(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const cx = ox + 12, cy = oy;
  drawPlayerHeadWest(ctx, cx, cy);
  drawPlayerTorsoEast(ctx, cx, cy); // same torso as East
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 5, cy + 9, 3, 2);
  ctx.fillStyle = MID;
  ctx.fillRect(cx + 2, cy + 9, 1, 3);
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 1, cy + 14, 2, 5);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 3, cy + 15, 2, 4);
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 1, cy + 19, 2, 1);
}

function drawPlayerWestWalk1(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const cx = ox + 12, cy = oy;
  drawPlayerHeadWest(ctx, cx, cy);
  drawPlayerTorsoEast(ctx, cx, cy);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 5, cy + 8, 3, 2);
  ctx.fillStyle = MID;
  ctx.fillRect(cx + 2, cy + 10, 1, 3);
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 1, cy + 13, 2, 5);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 3, cy + 16, 2, 4);
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 1, cy + 18, 2, 1);
}

function drawPlayerWestWalk2(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const cx = ox + 12, cy = oy;
  drawPlayerHeadWest(ctx, cx, cy);
  drawPlayerTorsoEast(ctx, cx, cy);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 5, cy + 10, 3, 2);
  ctx.fillStyle = MID;
  ctx.fillRect(cx + 2, cy + 8, 1, 3);
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 1, cy + 15, 2, 5);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 3, cy + 14, 2, 4);
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 1, cy + 20, 2, 1);
}

/** Draw the full 12-frame player sprite strip. */
function drawPlayerStrip(ctx: CanvasRenderingContext2D): void {
  const fw = PLAYER_FRAME_SIZE;
  // South: frames 0-2
  drawPlayerSouth(ctx, 0, 0);
  drawPlayerSouthWalk1(ctx, fw, 0);
  drawPlayerSouthWalk2(ctx, 2 * fw, 0);
  // East: frames 3-5
  drawPlayerEast(ctx, 3 * fw, 0);
  drawPlayerEastWalk1(ctx, 4 * fw, 0);
  drawPlayerEastWalk2(ctx, 5 * fw, 0);
  // North: frames 6-8
  drawPlayerNorth(ctx, 6 * fw, 0);
  drawPlayerNorthWalk1(ctx, 7 * fw, 0);
  drawPlayerNorthWalk2(ctx, 8 * fw, 0);
  // West: frames 9-11
  drawPlayerWest(ctx, 9 * fw, 0);
  drawPlayerWestWalk1(ctx, 10 * fw, 0);
  drawPlayerWestWalk2(ctx, 11 * fw, 0);
}

// ---------------------------------------------------------------------------
// Zombie sprites (2 frames each: idle + walk alternate)
// ---------------------------------------------------------------------------

/** Shambler — hunched zombie. 20×20, 2 frames. */
function drawShamblerStrip(ctx: CanvasRenderingContext2D): void {
  const sz = 20;
  // Frame 0: idle (right arm reaching, left dragging)
  drawShamblerFrame(ctx, 0, true);
  // Frame 1: walk alternate (swap arms, shift legs)
  drawShamblerFrame(ctx, sz, false);
}

function drawShamblerFrame(ctx: CanvasRenderingContext2D, ox: number, rightReach: boolean): void {
  const cx = ox + 10;
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, 1, 5, 1);
  ctx.fillRect(cx - 3, 2, 6, 3);
  ctx.fillRect(cx - 2, 5, 5, 1);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 4, 6, 8, 2);
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 3, 8, 6, 4);
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 3, 11, 2, 1);
  ctx.fillRect(cx + 2, 10, 1, 2);

  if (rightReach) {
    ctx.fillStyle = LIGHT;
    ctx.fillRect(cx + 3, 7, 2, 4);
    ctx.fillRect(cx + 4, 11, 1, 1);
    ctx.fillStyle = MID;
    ctx.fillRect(cx - 5, 8, 2, 3);
    ctx.fillStyle = WHITE;
    ctx.fillRect(cx - 3, 12, 2, 5);
    ctx.fillRect(cx + 1, 13, 2, 4);
  } else {
    // Swap: left arm reaching, right dragging; shift legs
    ctx.fillStyle = LIGHT;
    ctx.fillRect(cx - 5, 7, 2, 4);
    ctx.fillRect(cx - 5, 11, 1, 1);
    ctx.fillStyle = MID;
    ctx.fillRect(cx + 3, 8, 2, 3);
    ctx.fillStyle = WHITE;
    ctx.fillRect(cx - 3, 13, 2, 4);
    ctx.fillRect(cx + 1, 12, 2, 5);
  }

  ctx.fillStyle = MID;
  ctx.fillRect(cx - 3, 17, 3, 1);
  ctx.fillRect(cx + 1, 17, 2, 1);
}

/** Runner — lean angular zombie. 18×18, 2 frames. */
function drawRunnerStrip(ctx: CanvasRenderingContext2D): void {
  const sz = 18;
  drawRunnerFrame(ctx, 0, false);
  drawRunnerFrame(ctx, sz, true);
}

function drawRunnerFrame(ctx: CanvasRenderingContext2D, ox: number, alternate: boolean): void {
  const cx = ox + 9;
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, 0, 4, 1);
  ctx.fillRect(cx - 2, 1, 4, 3);
  ctx.fillRect(cx - 1, 4, 2, 1);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 1, 5, 2, 1);
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, 6, 4, 5);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 3, 6, 1, 2);
  ctx.fillRect(cx + 2, 6, 1, 2);

  if (!alternate) {
    ctx.fillStyle = LIGHT;
    ctx.fillRect(cx - 4, 7, 1, 3);
    ctx.fillRect(cx - 5, 9, 1, 2);
    ctx.fillRect(cx + 3, 7, 1, 3);
    ctx.fillRect(cx + 4, 8, 1, 2);
    ctx.fillStyle = WHITE;
    ctx.fillRect(cx - 2, 11, 2, 5);
    ctx.fillRect(cx, 12, 2, 4);
  } else {
    // Alternate: arms and legs swap sides
    ctx.fillStyle = LIGHT;
    ctx.fillRect(cx + 3, 7, 1, 3);
    ctx.fillRect(cx + 4, 9, 1, 2);
    ctx.fillRect(cx - 4, 7, 1, 3);
    ctx.fillRect(cx - 5, 8, 1, 2);
    ctx.fillStyle = WHITE;
    ctx.fillRect(cx - 2, 12, 2, 4);
    ctx.fillRect(cx, 11, 2, 5);
  }

  ctx.fillStyle = MID;
  ctx.fillRect(cx - 3, 15, 1, 1);
  ctx.fillRect(cx - 2, 16, 2, 1);
  ctx.fillRect(cx + 1, 16, 2, 1);
}

/** Brute — wide imposing zombie. 28×28, 2 frames. */
function drawBruteStrip(ctx: CanvasRenderingContext2D): void {
  const sz = 28;
  drawBruteFrame(ctx, 0, false);
  drawBruteFrame(ctx, sz, true);
}

function drawBruteFrame(ctx: CanvasRenderingContext2D, ox: number, alternate: boolean): void {
  const cx = ox + 14;
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, 1, 4, 1);
  ctx.fillRect(cx - 3, 2, 6, 4);
  ctx.fillRect(cx - 2, 6, 4, 1);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 6, 7, 12, 2);
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 6, 9, 12, 7);
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 4, 10, 3, 3);
  ctx.fillRect(cx + 1, 10, 3, 3);

  const armShift = alternate ? 1 : 0;
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 9, 8 + armShift, 3, 7);
  ctx.fillRect(cx + 6, 8 - armShift, 3, 7);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(cx - 9, 15 + armShift, 3, 2);
  ctx.fillRect(cx + 6, 15 - armShift, 3, 2);

  ctx.fillStyle = MID;
  ctx.fillRect(cx - 6, 16, 12, 1);

  const legShift = alternate ? 1 : 0;
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 5, 17 - legShift, 4, 7);
  ctx.fillRect(cx + 1, 17 + legShift, 4, 7);
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 6, 24 - legShift, 5, 2);
  ctx.fillRect(cx + 1, 24 + legShift, 5, 2);
}

/** Horde member — tiny blob. 12×12, 2 frames. */
function drawHordeStrip(ctx: CanvasRenderingContext2D): void {
  const sz = 12;
  drawHordeFrame(ctx, 0, false);
  drawHordeFrame(ctx, sz, true);
}

function drawHordeFrame(ctx: CanvasRenderingContext2D, ox: number, alternate: boolean): void {
  const cx = ox + 6;
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, 1, 4, 1);
  ctx.fillRect(cx - 3, 2, 6, 4);
  ctx.fillRect(cx - 2, 6, 4, 1);

  // Arm nubs alternate sides
  ctx.fillStyle = LIGHT;
  if (!alternate) {
    ctx.fillRect(cx - 4, 3, 1, 2);
    ctx.fillRect(cx + 3, 3, 1, 2);
  } else {
    ctx.fillRect(cx - 4, 4, 1, 2);
    ctx.fillRect(cx + 3, 2, 1, 2);
  }

  // Legs shift
  const legShift = alternate ? 1 : 0;
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 2, 7 - legShift, 2, 3);
  ctx.fillRect(cx, 7 + legShift, 2, 3);
  ctx.fillStyle = MID;
  ctx.fillRect(cx - 2, 10 - legShift, 2, 1);
  ctx.fillRect(cx, 10 + legShift, 2, 1);
}

// ---------------------------------------------------------------------------
// Bullet sprite (single-frame)
// ---------------------------------------------------------------------------

function drawBullet(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = WHITE;
  ctx.fillRect(2, 0, 2, 1);
  ctx.fillRect(1, 1, 4, 1);
  ctx.fillRect(0, 2, 6, 2);
  ctx.fillRect(1, 4, 4, 1);
  ctx.fillRect(2, 5, 2, 1);
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
    draw: drawShamblerStrip,
    width: 20 * 2,
    height: 20,
    frameCount: 2,
    frameWidth: 20,
  },
  zombie_runner: {
    draw: drawRunnerStrip,
    width: 18 * 2,
    height: 18,
    frameCount: 2,
    frameWidth: 18,
  },
  zombie_brute: {
    draw: drawBruteStrip,
    width: 28 * 2,
    height: 28,
    frameCount: 2,
    frameWidth: 28,
  },
  zombie_horde: {
    draw: drawHordeStrip,
    width: 12 * 2,
    height: 12,
    frameCount: 2,
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

export function getEntitySpriteGenerator(
  spriteKey: string,
): EntitySpriteGenerator | null {
  return GENERATORS[spriteKey] ?? null;
}

export function getGeneratorKeys(): string[] {
  return Object.keys(GENERATORS);
}
