import type { SystemFn } from "./system-runner";
import type { SceneContext } from "./scene-context";

/**
 * Factory that returns an InputSystem.
 *
 * The system samples keyboard and mouse state each fixed tick and writes
 * normalised values to the shared {@link SceneContext.inputState}.
 *
 * Keyboard keys are captured once at factory time so we do not call
 * `addKeys` every tick.
 */
export function createInputSystem(ctx: SceneContext): SystemFn {
  // --- Capture key objects once (closure) ---
  const kb = ctx.scene.input.keyboard;

  // Key references — will be null when keyboard plugin is unavailable
  // (e.g. on mobile, or when input.keyboard is null).
  type KeyMap = Record<string, Phaser.Input.Keyboard.Key>;
  let keys: KeyMap | null = null;

  if (kb) {
    keys = kb.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,E,ONE,TWO,THREE,FOUR,FIVE") as KeyMap;
  }

  /** Track previous E key state for edge detection. */
  let prevInteractDown = false;

  /** Track previous pointer state for release edge detection. */
  let prevPointerDown = false;

  /** Track previous number key states for edge detection. */
  const prevNumDown = [false, false, false, false, false];

  return (_dt: number): void => {
    const { inputState, scene } = ctx;

    // ---- Movement axes ----
    let mx = 0;
    let my = 0;

    if (keys) {
      if (keys.A.isDown || keys.LEFT.isDown) mx -= 1;
      if (keys.D.isDown || keys.RIGHT.isDown) mx += 1;
      if (keys.W.isDown || keys.UP.isDown) my -= 1;
      if (keys.S.isDown || keys.DOWN.isDown) my += 1;
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

    // ---- Aim (mouse) ----
    const pointer = scene.input.activePointer;
    if (pointer && scene.cameras.main) {
      const worldPoint = scene.cameras.main.getWorldPoint(
        pointer.x,
        pointer.y,
      );
      inputState.aimX = worldPoint.x;
      inputState.aimY = worldPoint.y;

      // ---- Pointer / drag state ----
      const currentPointerDown = pointer.isDown;
      inputState.pointerDown = currentPointerDown;
      inputState.pointerReleased = !currentPointerDown && prevPointerDown;
      prevPointerDown = currentPointerDown;
      inputState.pointerWorldX = worldPoint.x;
      inputState.pointerWorldY = worldPoint.y;
    } else {
      inputState.pointerDown = false;
      inputState.pointerReleased = false;
    }
  };
}
