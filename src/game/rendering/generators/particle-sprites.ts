/**
 * Programmatic particle texture generators.
 *
 * Each generator draws a purpose-shaped white particle on a tiny canvas.
 * Particles are tinted at emission time, so white base textures are
 * required. Shapes use `fillRect()` exclusively for pixel-perfect
 * edges at 2-5px scales.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Fire ember — 4×4 diamond shape.
 * Bright centre with slightly dimmer edges for depth.
 */
export function drawFireEmber(ctx: CanvasRenderingContext2D): void {
  // Diamond shape (rotated square)
  ctx.fillStyle = "#dddddd";
  ctx.fillRect(1, 0, 2, 1); // top
  ctx.fillRect(0, 1, 4, 2); // middle (full width)
  ctx.fillRect(1, 3, 2, 1); // bottom

  // Bright centre
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(1, 1, 2, 2);
}

/**
 * Blood drop — 3×3 irregular blob.
 * Asymmetric shape distinguishable from circles.
 */
export function drawBloodDrop(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 2, 1); // top-left wider
  ctx.fillRect(0, 1, 3, 1); // middle full
  ctx.fillRect(1, 2, 2, 1); // bottom-right offset

  // Highlight pixel
  ctx.fillStyle = "#dddddd";
  ctx.fillRect(2, 0, 1, 1);
}

/**
 * Electric spark — 4×4 cross/star shape.
 * Four arms extending from a bright centre.
 */
export function drawElectricSpark(ctx: CanvasRenderingContext2D): void {
  // Centre
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(1, 1, 2, 2);

  // Arms
  ctx.fillStyle = "#dddddd";
  ctx.fillRect(1, 0, 2, 1); // top
  ctx.fillRect(1, 3, 2, 1); // bottom
  ctx.fillRect(0, 1, 1, 2); // left
  ctx.fillRect(3, 1, 1, 2); // right
}

/**
 * Wood splinter — 2×5 elongated rectangle.
 * Tall narrow shape that reads as debris.
 */
export function drawWoodSplinter(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 2, 5);

  // Slight shading on one edge
  ctx.fillStyle = "#cccccc";
  ctx.fillRect(1, 1, 1, 3);
}

/**
 * Dust puff — 3×3 soft-edged circle.
 * Semi-transparent appearance via lighter fills on edges.
 */
export function drawDustPuff(ctx: CanvasRenderingContext2D): void {
  // Outer ring (dimmer for soft edge)
  ctx.fillStyle = "#aaaaaa";
  ctx.fillRect(1, 0, 1, 1); // top
  ctx.fillRect(0, 1, 1, 1); // left
  ctx.fillRect(2, 1, 1, 1); // right
  ctx.fillRect(1, 2, 1, 1); // bottom

  // Centre (brighter)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(1, 1, 1, 1);
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Maps particle texture keys to their drawing specs. */
export const PARTICLE_GENERATORS: Readonly<Record<string, {
  draw: (ctx: CanvasRenderingContext2D) => void;
  width: number;
  height: number;
}>> = {
  "particle-ember":   { draw: drawFireEmber,    width: 4, height: 4 },
  "particle-blood":   { draw: drawBloodDrop,    width: 3, height: 3 },
  "particle-spark":   { draw: drawElectricSpark, width: 4, height: 4 },
  "particle-splinter":{ draw: drawWoodSplinter,  width: 2, height: 5 },
  "particle-dust":    { draw: drawDustPuff,      width: 3, height: 3 },
};
