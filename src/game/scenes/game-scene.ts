import Phaser from "phaser";

/**
 * Main gameplay scene. For now it renders a colored background to confirm
 * the engine is running. Will eventually host the ECS loop, tilemap,
 * player entity, and all gameplay systems.
 */
export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#1a1a2e");

    this.add
      .text(this.scale.width / 2, this.scale.height / 2, "Deadbolt", {
        fontFamily: "monospace",
        fontSize: "24px",
        color: "#4ade80",
      })
      .setOrigin(0.5);
  }
}
