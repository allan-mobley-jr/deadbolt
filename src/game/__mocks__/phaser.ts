/**
 * Minimal Phaser mock for Vitest.
 *
 * Real Phaser probes canvas capabilities on import, which crashes in jsdom.
 * This mock provides only the constants and base classes our game code needs
 * so tests can run without a real canvas.
 */

class MockScene {
  key: string;
  scene: unknown;
  cameras: unknown;
  add: unknown;
  scale: unknown;
  input: unknown;
  matter: unknown;
  sound: unknown;

  constructor(config: string | { key: string }) {
    this.key = typeof config === "string" ? config : config.key;
  }
}

const Phaser = {
  AUTO: 0,
  HEADLESS: 3,
  Scene: MockScene,
  Scale: {
    FIT: 1,
    CENTER_BOTH: 3,
  },
  Game: class MockGame {
    config: unknown;
    events: {
      on: (event: string, fn: (...args: unknown[]) => void) => void;
      off: (event: string, fn: (...args: unknown[]) => void) => void;
      emit: (event: string, ...args: unknown[]) => void;
    };
    constructor(config: unknown) {
      this.config = config;
      const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
      this.events = {
        on(event: string, fn: (...args: unknown[]) => void) {
          (listeners[event] ??= []).push(fn);
        },
        off(event: string, fn: (...args: unknown[]) => void) {
          const arr = listeners[event];
          if (arr) {
            const idx = arr.indexOf(fn);
            if (idx !== -1) arr.splice(idx, 1);
          }
        },
        emit(event: string, ...args: unknown[]) {
          for (const fn of listeners[event] ?? []) {
            fn(...args);
          }
        },
      };
    }
    destroy() {}
  },
};

export default Phaser;
export { MockScene as Scene };
