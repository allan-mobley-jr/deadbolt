/**
 * Camera system — smooth follow, screen shake, zoom, and phase effects.
 *
 * Runs as a render-phase system (once per display frame) so camera
 * movement interpolates at the monitor's refresh rate, not the fixed
 * 60 Hz physics tick rate. Must run BEFORE RenderSyncSystem and
 * LightingSystem so downstream systems read the final camera position.
 *
 * Replaces Phaser's built-in startFollow with custom follow logic
 * that supports look-ahead, phase-dependent zoom, and queued shake.
 *
 * NO React imports — this is pure game-side TypeScript.
 */

import type { SceneContext } from "./scene-context";
import type { SystemFn } from "./system-runner";
import { CAMERA } from "./camera-constants";
import { playerEntities } from "@/game/ecs/queries";

// ---------------------------------------------------------------------------
// System factory
// ---------------------------------------------------------------------------

export function createCameraSystem(ctx: SceneContext): SystemFn {
  const cam = ctx.scene.cameras.main;
  if (!cam) {
    // No camera available — return a no-op system
    return () => {};
  }
  const cameraRng = ctx.rng?.derive("camera");
  const rngFloat = cameraRng ? () => cameraRng.float() : Math.random;

  // --- Settings ---
  let screenShakeEnabled = true;

  // --- Shake state ---
  let shakeIntensity = 0;

  // --- Look-ahead state ---
  let lookAheadX = 0;
  let lookAheadY = 0;

  // --- Zoom state ---
  let userZoom: number = CAMERA.DEFAULT_ZOOM;
  let currentZoom: number = CAMERA.DEFAULT_ZOOM;
  let nightZoomBonus = 0;
  let targetNightBonus = 0;

  // --- Zoom key state (edge detection) ---
  let plusKey: Phaser.Input.Keyboard.Key | null = null;
  let minusKey: Phaser.Input.Keyboard.Key | null = null;
  let prevPlusDown = false;
  let prevMinusDown = false;

  // Capture +/- keys for zoom
  const kb = ctx.scene.input?.keyboard;
  if (kb) {
    try {
      plusKey = kb.addKey("PLUS");
      minusKey = kb.addKey("MINUS");
    } catch {
      // Key capture may fail in test environments
    }
  }

  // --- Scroll wheel zoom ---
  if (ctx.scene.input && typeof ctx.scene.input.on === "function") {
    ctx.scene.input.on("wheel", (_pointer: unknown, _gameObjects: unknown, _deltaX: number, deltaY: number) => {
      if (deltaY > 0) {
        userZoom = Math.max(CAMERA.MIN_ZOOM, userZoom - CAMERA.ZOOM_STEP);
      } else if (deltaY < 0) {
        userZoom = Math.min(CAMERA.MAX_ZOOM, userZoom + CAMERA.ZOOM_STEP);
      }
    });
  }

  // --- First frame flag ---
  let firstFrame = true;

  // =========================================================================
  // Event listeners
  // =========================================================================

  // --- Screen shake triggers ---

  ctx.eventBus.on("explosion-detonated", (e) => {
    const intensity = CAMERA.EXPLOSION_SHAKE_INTENSITY * e.explosivePotential;
    shakeIntensity = Math.max(shakeIntensity, intensity);
  });

  ctx.eventBus.on("player-hit", () => {
    shakeIntensity = Math.max(shakeIntensity, CAMERA.PLAYER_HIT_SHAKE_INTENSITY);
  });

  ctx.eventBus.on("barricade-broken", () => {
    shakeIntensity = Math.max(shakeIntensity, CAMERA.BARRICADE_BREAK_SHAKE_INTENSITY);
  });

  // --- Phase change → night zoom ---

  ctx.eventBus.on("phase-change", (e) => {
    if (e.phase === "night" || e.phase === "dusk") {
      targetNightBonus = CAMERA.NIGHT_ZOOM_BONUS;
    } else {
      targetNightBonus = 0;
    }
  });

  // --- Settings ---

  let reducedMotionEnabled = false;

  ctx.eventBus.on("cmd:settings-changed", (e) => {
    if (e.key === "screenShake" && typeof e.value === "boolean") {
      screenShakeEnabled = e.value;
    }
    if (e.key === "reducedMotion" && typeof e.value === "boolean") {
      reducedMotionEnabled = e.value;
      if (e.value) screenShakeEnabled = false;
    }
  });

  // =========================================================================
  // Per-frame function (render phase)
  // =========================================================================

  return function cameraSystem(dt: number): void {
    // --- Get player position ---
    const players = playerEntities.entities;
    if (players.length === 0) return;

    const player = players[0];
    const playerX = player.position.x;
    const playerY = player.position.y;

    // --- First frame: snap camera to player (no lerp) ---
    if (firstFrame) {
      cam.centerOn(playerX, playerY);
      firstFrame = false;
    }

    // --- Look-ahead offset based on movement input ---
    if (reducedMotionEnabled) {
      // Reduced motion: no look-ahead, instant camera snap
      lookAheadX = 0;
      lookAheadY = 0;
    } else {
      const targetLAX = ctx.inputState.moveX * CAMERA.LOOK_AHEAD_DISTANCE;
      const targetLAY = ctx.inputState.moveY * CAMERA.LOOK_AHEAD_DISTANCE;
      lookAheadX += (targetLAX - lookAheadX) * CAMERA.LOOK_AHEAD_LERP;
      lookAheadY += (targetLAY - lookAheadY) * CAMERA.LOOK_AHEAD_LERP;
    }

    // --- Follow target ---
    const targetX = playerX + lookAheadX;
    const targetY = playerY + lookAheadY;

    // Lerp camera toward target (reduced motion: snap instantly)
    const followLerp = reducedMotionEnabled ? 1.0 : CAMERA.FOLLOW_LERP;
    const camCenterX = cam.scrollX + cam.width * 0.5 / currentZoom;
    const camCenterY = cam.scrollY + cam.height * 0.5 / currentZoom;
    cam.scrollX += (targetX - camCenterX) * followLerp;
    cam.scrollY += (targetY - camCenterY) * followLerp;

    // --- Zoom: keyboard edge detection ---
    if (plusKey) {
      const down = plusKey.isDown;
      if (down && !prevPlusDown) {
        userZoom = Math.min(CAMERA.MAX_ZOOM, userZoom + CAMERA.ZOOM_STEP);
      }
      prevPlusDown = down;
    }
    if (minusKey) {
      const down = minusKey.isDown;
      if (down && !prevMinusDown) {
        userZoom = Math.max(CAMERA.MIN_ZOOM, userZoom - CAMERA.ZOOM_STEP);
      }
      prevMinusDown = down;
    }

    // --- Zoom: night bonus lerp ---
    nightZoomBonus += (targetNightBonus - nightZoomBonus) * CAMERA.PHASE_ZOOM_LERP;

    // --- Zoom: apply ---
    const targetZoom = Math.max(
      CAMERA.MIN_ZOOM,
      Math.min(CAMERA.MAX_ZOOM, userZoom + nightZoomBonus),
    );
    currentZoom += (targetZoom - currentZoom) * CAMERA.ZOOM_LERP;
    cam.setZoom(currentZoom);

    // --- Screen shake ---
    if (shakeIntensity > CAMERA.SHAKE_MIN_THRESHOLD && screenShakeEnabled) {
      const offsetX = (rngFloat() - 0.5) * 2 * shakeIntensity;
      const offsetY = (rngFloat() - 0.5) * 2 * shakeIntensity;
      cam.scrollX += offsetX;
      cam.scrollY += offsetY;
    }

    // Decay shake
    if (shakeIntensity > 0) {
      shakeIntensity *= Math.exp(-CAMERA.SHAKE_DECAY_RATE * dt);
      if (shakeIntensity < CAMERA.SHAKE_MIN_THRESHOLD) {
        shakeIntensity = 0;
      }
    }
  };
}
