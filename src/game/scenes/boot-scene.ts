import Phaser from "phaser";

/**
 * First scene in the lifecycle. Handles one-time setup before gameplay begins.
 * Currently transitions immediately to GameScene; will eventually manage
 * asset preloading, splash screen, and ECS world initialization.
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  create(): void {
    this.scene.start("GameScene");
  }
}
