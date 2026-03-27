/**
 * Keyboard input state manager.
 *
 * Polls Phaser key objects each frame to produce a simple directional
 * state that movement systems can read without touching Phaser APIs.
 *
 * Supports both WASD and arrow keys simultaneously.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

interface KeyBindings {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  w: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
}

export interface InputManager {
  /** Current directional state — read this each tick. */
  state: InputState;
  /** Poll Phaser key objects and update state.  Call once per tick. */
  update(): void;
  /** Remove all key listeners.  Call on scene shutdown. */
  destroy(): void;
}

/**
 * Create an InputManager bound to the given scene's keyboard plugin.
 */
export function createInputManager(scene: Phaser.Scene): InputManager {
  const keyboard = scene.input.keyboard;
  if (!keyboard) {
    throw new Error('Keyboard plugin not available');
  }

  const keys = keyboard.addKeys({
    up: Phaser.Input.Keyboard.KeyCodes.UP,
    down: Phaser.Input.Keyboard.KeyCodes.DOWN,
    left: Phaser.Input.Keyboard.KeyCodes.LEFT,
    right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    w: Phaser.Input.Keyboard.KeyCodes.W,
    a: Phaser.Input.Keyboard.KeyCodes.A,
    s: Phaser.Input.Keyboard.KeyCodes.S,
    d: Phaser.Input.Keyboard.KeyCodes.D,
  }) as KeyBindings;

  const state: InputState = { left: false, right: false, up: false, down: false };

  return {
    state,
    update() {
      state.left = keys.left.isDown || keys.a.isDown;
      state.right = keys.right.isDown || keys.d.isDown;
      state.up = keys.up.isDown || keys.w.isDown;
      state.down = keys.down.isDown || keys.s.isDown;
    },
    destroy() {
      keyboard.removeKey(keys.up);
      keyboard.removeKey(keys.down);
      keyboard.removeKey(keys.left);
      keyboard.removeKey(keys.right);
      keyboard.removeKey(keys.w);
      keyboard.removeKey(keys.a);
      keyboard.removeKey(keys.s);
      keyboard.removeKey(keys.d);
    },
  };
}
