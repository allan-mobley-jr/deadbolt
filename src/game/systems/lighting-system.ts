/**
 * Lighting render system — applies visual darkness and fog-of-war
 * effects based on the current day/night phase.
 *
 * Runs once per render frame (not per fixed tick). Reads clock state
 * from ctx.clockState and the player position from the ECS world.
 *
 * Visual approach:
 *   - A full-screen RenderTexture filled each frame with the dark tint
 *     color at the target alpha.
 *   - During night/dusk/dawn, a soft-edged circle is erased at the
 *     player's screen-space position to create a visibility radius.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import type Phaser from "phaser";
import type { SystemFn } from "./system-runner";
import type { SceneContext } from "./scene-context";
import { LIGHTING, type DayPhase } from "./day-night-constants";
import { playerEntities } from "@/game/ecs/queries";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Linear interpolation.
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Compute the phase progress ratio (0 → 1) from time remaining and duration.
 */
function phaseProgress(timeRemaining: number, duration: number): number {
  if (duration <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - timeRemaining / duration));
}

/**
 * Unpack a 0xRRGGBB integer into [r, g, b] each in 0..255.
 */
function unpackRgb(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

/**
 * Pack [r, g, b] (0..255) into a 0xRRGGBB integer.
 */
function packRgb(r: number, g: number, b: number): number {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

/**
 * Lerp between two packed RGB colours.
 */
function lerpColor(a: number, b: number, t: number): number {
  const [ar, ag, ab] = unpackRgb(a);
  const [br, bg, bb] = unpackRgb(b);
  return packRgb(
    Math.round(lerp(ar, br, t)),
    Math.round(lerp(ag, bg, t)),
    Math.round(lerp(ab, bb, t)),
  );
}

/**
 * Get the target overlay alpha and tint for a given phase and progress.
 */
export function getOverlayParams(
  phase: DayPhase,
  progress: number,
): { alpha: number; tint: number } {
  switch (phase) {
    case "day":
      return {
        alpha: LIGHTING.DAY_OVERLAY_ALPHA,
        tint: 0x000000,
      };
    case "dusk":
      return {
        alpha: lerp(LIGHTING.DAY_OVERLAY_ALPHA, LIGHTING.NIGHT_OVERLAY_ALPHA, progress),
        tint: lerpColor(LIGHTING.DUSK_TINT, LIGHTING.NIGHT_TINT, progress),
      };
    case "night":
      return {
        alpha: LIGHTING.NIGHT_OVERLAY_ALPHA,
        tint: LIGHTING.NIGHT_TINT,
      };
    case "dawn":
      return {
        alpha: lerp(LIGHTING.NIGHT_OVERLAY_ALPHA, LIGHTING.DAY_OVERLAY_ALPHA, progress),
        tint: lerpColor(LIGHTING.NIGHT_TINT, LIGHTING.DAWN_TINT, progress),
      };
  }
}

// ---------------------------------------------------------------------------
// Soft circle texture generation
// ---------------------------------------------------------------------------

/** Key used to cache the radial gradient texture in Phaser's texture manager. */
const VISIBILITY_TEXTURE_KEY = "__daynight_visibility";

/**
 * Create or retrieve a soft-edged circle texture for the visibility mask.
 *
 * The texture has an opaque white center that fades to transparent at the
 * edges, sized to `VISIBILITY_RADIUS * 2`. When "erased" from the
 * RenderTexture it punches a soft hole in the darkness.
 */
function getVisibilityTexture(scene: Phaser.Scene): string | null {
  if (scene.textures.exists(VISIBILITY_TEXTURE_KEY)) {
    return VISIBILITY_TEXTURE_KEY;
  }

  const diameter = (LIGHTING.VISIBILITY_RADIUS + LIGHTING.VISIBILITY_EDGE_SOFTNESS) * 2;
  const canvas = scene.textures.createCanvas(VISIBILITY_TEXTURE_KEY, diameter, diameter);
  if (!canvas) {
    console.error(
      "[LightingSystem] Failed to create visibility gradient canvas texture. " +
        "Player visibility circle will be disabled.",
    );
    return null;
  }

  const ctx2d = canvas.context;
  const cx = diameter / 2;
  const cy = diameter / 2;

  // Radial gradient: opaque center → transparent edge
  const innerRadius = LIGHTING.VISIBILITY_RADIUS - LIGHTING.VISIBILITY_EDGE_SOFTNESS;
  const outerRadius = LIGHTING.VISIBILITY_RADIUS + LIGHTING.VISIBILITY_EDGE_SOFTNESS;
  const gradient = ctx2d.createRadialGradient(cx, cy, Math.max(0, innerRadius), cx, cy, outerRadius);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx2d.fillStyle = gradient;
  ctx2d.fillRect(0, 0, diameter, diameter);
  canvas.refresh();

  return VISIBILITY_TEXTURE_KEY;
}

// ---------------------------------------------------------------------------
// System factory
// ---------------------------------------------------------------------------

/**
 * Create the lighting render system.
 *
 * Manages a full-screen darkness overlay with a visibility hole around
 * the player during non-day phases. The overlay is a Phaser
 * RenderTexture that is filled and erased each frame.
 */
export function createLightingSystem(ctx: SceneContext): SystemFn {
  let overlay: Phaser.GameObjects.RenderTexture | null = null;
  /** undefined = not attempted, null = attempted and failed, string = ready. */
  let visibilityTextureKey: string | null | undefined = undefined;

  /** Tracked viewport dimensions so we can resize the overlay. */
  let lastWidth = 0;
  let lastHeight = 0;

  return (_dt: number): void => {
    const { scene, clockState } = ctx;
    const cam = scene.cameras.main;
    if (!cam) return;

    const { phase, timeRemainingInPhase, phaseDuration } = clockState;
    const progress = phaseProgress(timeRemainingInPhase, phaseDuration);
    const { alpha: targetAlpha, tint } = getOverlayParams(phase, progress);

    // During full daylight, hide overlay and skip work.
    if (targetAlpha <= 0) {
      if (overlay) overlay.setVisible(false);
      return;
    }

    const viewWidth = cam.width;
    const viewHeight = cam.height;

    // Create or resize the overlay RenderTexture.
    if (!overlay || lastWidth !== viewWidth || lastHeight !== viewHeight) {
      if (overlay) overlay.destroy();
      const created = scene.add.renderTexture(0, 0, viewWidth, viewHeight);
      if (!created) {
        console.error(
          "[LightingSystem] Failed to create darkness overlay. " +
            "Lighting effects will be disabled this frame.",
        );
        return;
      }
      overlay = created;
      overlay.setScrollFactor(0);
      overlay.setDepth(LIGHTING.OVERLAY_DEPTH);
      lastWidth = viewWidth;
      lastHeight = viewHeight;
    }

    overlay.setVisible(true);

    // Fill the overlay with the tint at full opacity — the alpha is
    // controlled on the game object itself.
    overlay.fill(tint, 1);
    overlay.setAlpha(targetAlpha);

    // Erase a soft circle at the player position to create a visibility
    // hole in the darkness. We only reach this point when targetAlpha > 0,
    // which means the phase is dusk, night, or dawn (never day).

    // Ensure the visibility gradient texture exists (only attempt once).
    if (visibilityTextureKey === undefined) {
      visibilityTextureKey = getVisibilityTexture(scene);
    }

    const player = playerEntities.entities[0];
    if (player?.position && visibilityTextureKey) {
      const screenX = player.position.x - cam.scrollX;
      const screenY = player.position.y - cam.scrollY;

      const diameter = (LIGHTING.VISIBILITY_RADIUS + LIGHTING.VISIBILITY_EDGE_SOFTNESS) * 2;
      overlay.erase(
        visibilityTextureKey,
        screenX - diameter / 2,
        screenY - diameter / 2,
      );
    }
  };
}
