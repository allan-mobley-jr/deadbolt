import type { SystemFn } from "./system-runner";
import type { SceneContext } from "./scene-context";
import { playerEntities } from "@/game/ecs/queries";

/**
 * Factory that returns an InputSystem.
 *
 * The system samples keyboard and mouse state each fixed tick and writes
 * normalised values to the shared {@link SceneContext.inputState}.
 *
 * Supports both mouse and keyboard aiming (issue #44). When arrow keys
 * (or remapped aim keys) are pressed, the aim point is projected from
 * the player's position in the aim direction. Mouse overrides keyboard
 * aim when the pointer moves.
 *
 * Keyboard keys are captured once at factory time so we do not call
 * `addKeys` every tick.
 */
export function createInputSystem(ctx: SceneContext): SystemFn {
  // --- Capture key objects once (closure) ---
  const kb = ctx.scene.input.keyboard;

  // Key references — will be null when keyboard plugin is unavailable
  type KeyMap = Record<string, Phaser.Input.Keyboard.Key>;
  let keys: KeyMap | null = null;

  if (kb) {
    keys = kb.addKeys(
      "W,A,S,D,UP,DOWN,LEFT,RIGHT,E,ONE,TWO,THREE,FOUR,FIVE,SPACE",
    ) as KeyMap;
  }

  /** Track previous E key state for edge detection. */
  let prevInteractDown = false;

  /** Track previous pointer state for release edge detection. */
  let prevPointerDown = false;

  /** Track previous number key states for edge detection. */
  const prevNumDown = [false, false, false, false, false];

  /** Track previous SPACE key state for edge detection. */
  let prevAttackKeyDown = false;

  /** Keyboard aim angle (radians, 0 = right, pi/2 = down). */
  let kbAimAngle = 0;
  /** Whether keyboard aim is active (any aim key pressed this tick). */
  let kbAimActive = false;
  /** Track whether mouse has moved since last keyboard aim update. */
  let lastPointerX = 0;
  let lastPointerY = 0;
  /** Whether the player used mouse aim more recently than keyboard aim. */
  let mouseAimPriority = true;

  /** Distance from player to project keyboard aim point (pixels). */
  const AIM_DISTANCE = 64;

  return (_dt: number): void => {
    const { inputState, scene } = ctx;

    // ---- Movement axes ----
    let mx = 0;
    let my = 0;

    if (keys) {
      if (keys.A.isDown) mx -= 1;
      if (keys.D.isDown) mx += 1;
      if (keys.W.isDown) my -= 1;
      if (keys.S.isDown) my += 1;
    }

    // Normalise diagonal so speed is consistent
    const len = Math.sqrt(mx * mx + my * my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }

    inputState.moveX = mx;
    inputState.moveY = my;

    // ---- Interact key (E) — edge-triggered (rising edge only) ----
    const interactDown = keys?.E?.isDown ?? false;
    inputState.interactPressed = interactDown && !prevInteractDown;
    prevInteractDown = interactDown;

    // ---- Quick-select (number keys 1-5) — edge-triggered ----
    const numKeys = ["ONE", "TWO", "THREE", "FOUR", "FIVE"] as const;
    inputState.quickSelectPressed = -1;
    if (keys) {
      for (let i = 0; i < numKeys.length; i++) {
        const down = keys[numKeys[i]]?.isDown ?? false;
        if (down && !prevNumDown[i]) {
          inputState.quickSelectPressed = i;
        }
        prevNumDown[i] = down;
      }
    }

    // ---- Keyboard aim (arrow keys) ----
    let aimDx = 0;
    let aimDy = 0;
    if (keys) {
      if (keys.LEFT.isDown) aimDx -= 1;
      if (keys.RIGHT.isDown) aimDx += 1;
      if (keys.UP.isDown) aimDy -= 1;
      if (keys.DOWN.isDown) aimDy += 1;
    }

    kbAimActive = aimDx !== 0 || aimDy !== 0;
    if (kbAimActive) {
      kbAimAngle = Math.atan2(aimDy, aimDx);
      mouseAimPriority = false;
    }

    // ---- Keyboard attack (SPACE) — edge-triggered ----
    const attackKeyDown = keys?.SPACE?.isDown ?? false;
    const kbAttackPressed = attackKeyDown && !prevAttackKeyDown;
    prevAttackKeyDown = attackKeyDown;

    // ---- Mouse aim ----
    const pointer = scene.input.activePointer;
    let mouseAttackPressed = false;

    if (pointer && scene.cameras.main) {
      // Detect mouse movement to give mouse priority over keyboard aim
      if (pointer.x !== lastPointerX || pointer.y !== lastPointerY) {
        mouseAimPriority = true;
        lastPointerX = pointer.x;
        lastPointerY = pointer.y;
      }

      if (mouseAimPriority) {
        const worldPoint = scene.cameras.main.getWorldPoint(
          pointer.x,
          pointer.y,
        );
        inputState.aimX = worldPoint.x;
        inputState.aimY = worldPoint.y;
      }

      // ---- Pointer / drag state ----
      const currentPointerDown = pointer.isDown;
      mouseAttackPressed = currentPointerDown && !prevPointerDown;
      inputState.pointerDown = currentPointerDown;
      inputState.pointerReleased = !currentPointerDown && prevPointerDown;
      prevPointerDown = currentPointerDown;

      if (mouseAimPriority) {
        const worldPoint = scene.cameras.main.getWorldPoint(
          pointer.x,
          pointer.y,
        );
        inputState.pointerWorldX = worldPoint.x;
        inputState.pointerWorldY = worldPoint.y;
      }
    } else {
      inputState.pointerDown = false;
      inputState.pointerReleased = false;
    }

    // ---- Apply keyboard aim if mouse isn't active ----
    if (!mouseAimPriority) {
      const player = playerEntities.entities[0];
      if (player) {
        inputState.aimX =
          player.position.x + Math.cos(kbAimAngle) * AIM_DISTANCE;
        inputState.aimY =
          player.position.y + Math.sin(kbAimAngle) * AIM_DISTANCE;
        inputState.pointerWorldX = inputState.aimX;
        inputState.pointerWorldY = inputState.aimY;
      }
    }

    // ---- Attack: mouse click OR space key ----
    inputState.attackPressed = mouseAttackPressed || kbAttackPressed;
  };
}
