import Phaser from "phaser";
import BootScene from "@/game/scenes/boot-scene";
import LoadingScene from "@/game/scenes/loading-scene";
import GameScene from "@/game/scenes/game-scene";
import type { GameEventBus, MinimapInitEvent } from "@/game/events/event-bus";

/** Module-scoped singleton — one Phaser.Game instance at a time. */
let instance: Phaser.Game | null = null;

/**
 * Module-scoped reference to the active game event bus.
 * Set by GameScene.create(), cleared by destroyGame().
 * The React layer reads this to connect the bridge.
 */
let activeBus: GameEventBus | null = null;

/**
 * Module-scoped run seed for the current session.
 * Set by GameScene.create(), read by GameContainer after bridge connects.
 *
 * Stored here because the `run-started` event fires synchronously in
 * GameScene.create(), before the React bridge has connected via its
 * requestAnimationFrame polling loop. This pull-based approach guarantees
 * the seed is available when the bridge connects.
 */
let activeSeed: string | null = null;

/**
 * Module-scoped minimap initialisation data for the current session.
 * Set by GameScene.create(), read by the bridge after it connects.
 *
 * Stored here because the `minimap-init` event fires synchronously in
 * GameScene.create(), before the React bridge has connected. This
 * pull-based approach mirrors the seed pattern.
 */
let activeMinimapInit: MinimapInitEvent | null = null;

/**
 * Module-scoped error captured from BootScene or LoadingScene.
 * These errors fire on Phaser's native `game.events` emitter — before
 * the typed GameEventBus exists — so they cannot flow through the
 * bridge.  Stored here for the React layer to poll via getActiveError().
 */
let activeError: Error | null = null;

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

  // Listen for errors emitted on Phaser's native event system.
  // boot-error and generation-error fire before the typed GameEventBus exists;
  // game-crash fires during gameplay when a system throws in GameScene.update().
  // All three are captured in module scope for the React layer to poll.
  instance.events.on("boot-error", (err: unknown) => {
    activeError = err instanceof Error ? err : new Error(String(err));
  });
  instance.events.on("generation-error", (err: unknown) => {
    activeError = err instanceof Error ? err : new Error(String(err));
  });
  instance.events.on("game-crash", (err: unknown) => {
    activeError = err instanceof Error ? err : new Error(String(err));
  });

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
  activeSeed = null;
  activeMinimapInit = null;
  activeError = null;
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

/** Called by GameScene.create() to store the run seed for UI access. */
export function setActiveSeed(seed: string | null): void {
  activeSeed = seed;
}

/** Read-only accessor for the current run seed (or null). */
export function getActiveSeed(): string | null {
  return activeSeed;
}

/** Called by GameScene.create() to store minimap init data for UI access. */
export function setActiveMinimapInit(data: MinimapInitEvent | null): void {
  activeMinimapInit = data;
}

/** Read-only accessor for minimap init data (or null). */
export function getActiveMinimapInit(): MinimapInitEvent | null {
  return activeMinimapInit;
}

// ---------------------------------------------------------------------------
// Error accessors — pre-bus errors from BootScene / LoadingScene
// ---------------------------------------------------------------------------

/** Called internally when boot-error or generation-error fires. Exported for tests. */
export function setActiveError(error: Error | null): void {
  activeError = error;
}

/** Read-only accessor for the first boot/loading error (or null). */
export function getActiveError(): Error | null {
  return activeError;
}

