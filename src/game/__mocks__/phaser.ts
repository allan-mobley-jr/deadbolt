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
    constructor(config: unknown) {
      this.config = config;
    }
    destroy() {}
  },
};

export default Phaser;
export { MockScene as Scene };
