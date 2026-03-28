import Phaser from "phaser";
import BootScene from "@/game/scenes/boot-scene";
import LoadingScene from "@/game/scenes/loading-scene";
import GameScene from "@/game/scenes/game-scene";
import type { GameEventBus } from "@/game/events/event-bus";

/** Module-scoped singleton — one Phaser.Game instance at a time. */
let instance: Phaser.Game | null = null;

/**
 * Module-scoped reference to the active game event bus.
 * Set by GameScene.create(), cleared by destroyGame().
 * The React layer reads this to connect the bridge.
 */
let activeBus: GameEventBus | null = null;

/**
 * Build the Phaser game configuration without creating an instance.
 * Exported so tests can validate the config without needing a real canvas.
 */
export function buildGameConfig(
  parentId: string,
): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent: parentId,
    backgroundColor: "#000000",
    banner: false,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 1280,
      height: 720,
    },
    physics: {
      default: "matter",
      matter: {
        gravity: { x: 0, y: 0 },
        debug: true,
      },
    },
    fps: {
      target: 60,
      limit: 60,
    },
    scene: [BootScene, LoadingScene, GameScene],
  };
}

/**
 * Create the Phaser game and attach it to the given DOM element.
 * Returns the existing instance if one is already running (singleton guard).
 *
 * The guard prevents double-init caused by:
 *  - React Strict Mode (dev) — mount, unmount, remount
 *  - Turbopack HMR — module re-evaluation
 */
export function createGame(parentId: string): Phaser.Game {
  if (instance !== null) {
    return instance;
  }

  // Defensive: remove any stale canvas left behind by HMR module replacement
  // that bypassed React's cleanup cycle.
  const parent = document.getElementById(parentId);
  if (parent) {
    const staleCanvas = parent.querySelector("canvas");
    if (staleCanvas) {
      console.warn(
        `[PhaserGame] Removing stale canvas from #${parentId}. ` +
          "Expected during HMR but may indicate a cleanup bug in production.",
      );
      staleCanvas.remove();
    }
  }

  instance = new Phaser.Game(buildGameConfig(parentId));
  return instance;
}

/** Destroy the running Phaser instance and free all resources. */
export function destroyGame(): void {
  if (instance === null) {
    return;
  }
  // Clear singletons FIRST so a failed destroy() never leaves broken
  // references that the singleton guard would return on the next createGame().
  const ref = instance;
  instance = null;
  activeBus = null;
  try {
    ref.destroy(true);
  } catch (err) {
    console.error("[PhaserGame] Error during game destruction:", err);
  }
}

/** Read-only accessor for the current Phaser.Game (or null). */
export function getGame(): Phaser.Game | null {
  return instance;
}

// ---------------------------------------------------------------------------
// Event bus accessors — used by the bridge and useGameEvent hook
// ---------------------------------------------------------------------------

/** Called by GameScene.create() to publish the session's event bus. */
export function setActiveBus(bus: GameEventBus | null): void {
  activeBus = bus;
}

/** Read-only accessor for the current event bus (or null). */
export function getActiveBus(): GameEventBus | null {
  return activeBus;
}
