/**
 * Event bus ↔ Zustand store bridge.
 *
 * Subscribes to GameEventBus events and writes into Zustand stores
 * (Game → UI direction). Also subscribes to Zustand store changes
 * and emits command events back to the bus (UI → Game direction).
 *
 * This module lives in src/lib/ (not src/game/) because it imports
 * Zustand stores. It does NOT import React.
 *
 * Lifecycle:
 *   const bridge = connectBridge(bus);  // in GameContainer mount
 *   bridge.disconnect();                // in GameContainer unmount
 */

import type { GameEventBus, GameEventMap } from "@/game/events/event-bus";
import { safeEmit } from "@/game/events/event-bus";
import { getRunStats } from "@/game/systems/stats-system";
import { NOISE } from "@/game/systems/noise-constants";
import { useGameStore } from "@/stores/useGameStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useUIStore } from "@/stores/useUIStore";
import { useMinimapStore } from "@/stores/useMinimapStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { generateEphemeralId } from "@/lib/ids";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BridgeConnection {
  /** Remove all listeners and subscriptions. Call on scene shutdown. */
  disconnect: () => void;
}

// ---------------------------------------------------------------------------
// Bridge factory
// ---------------------------------------------------------------------------

/**
 * Wire up bidirectional communication between the game event bus
 * and the Zustand UI stores.
 *
 * Returns a BridgeConnection whose `disconnect()` must be called
 * when the game session ends or the React component unmounts.
 */
export function connectBridge(bus: GameEventBus): BridgeConnection {
  const cleanups: Array<() => void> = [];

  // --- Helpers ---------------------------------------------------------------

  /** Subscribe to a bus event and track cleanup. */
  function onBus<K extends keyof GameEventMap>(
    event: K,
    handler: (payload: GameEventMap[K][0]) => void,
  ): void {
    bus.on(event, handler);
    cleanups.push(() => bus.off(event, handler));
  }

  // --- Game → Zustand (store updates from game events) ----------------------

  onBus("clock-tick", (e) => {
    useGameStore.getState().updateClock(
      e.phase,
      e.dayNumber,
      e.timeRemainingInPhase,
      e.phaseDuration,
      e.elapsedTotal,
    );
  });

  onBus("phase-change", (e) => {
    // Phase-change delivers an immediate update (clock-tick is throttled).
    useGameStore.setState({
      phase: e.phase,
      dayNumber: e.dayNumber,
      timeRemainingInPhase: e.timeRemainingInPhase,
    });
  });

  onBus("run-started", (e) => {
    useGameStore.getState().setSeed(e.seed);
  });

  onBus("player-health-changed", (e) => {
    usePlayerStore.getState().updateHealth(e.current, e.max);
  });

  onBus("inventory-changed", (e) => {
    usePlayerStore
      .getState()
      .updateInventory(e.slots, e.carryWeight, e.maxCarryWeight);
  });

  onBus("wave-started", (e) => {
    useGameStore.getState().setWaveStarted(e.waveNumber, e.zombieCount);
  });

  onBus("wave-ended", () => {
    useGameStore.getState().setWaveEnded();
  });

  onBus("zombie-killed", (e) => {
    const store = useGameStore.getState();
    store.setTotalKills(e.totalKills);
    store.incrementKillsByType(e.variant);
    if (store.waveActive) {
      store.decrementZombiesRemaining();
    }
  });

  onBus("player-hit", (e) => {
    useUIStore.getState().addNotification({
      id: generateEphemeralId("hit"),
      message: `Took ${e.damage} damage!`,
      type: "danger",
      timestamp: Date.now(),
    });
  });

  onBus("player-died", () => {
    // Snapshot final run stats from the game-side stats system
    const stats = getRunStats();
    useGameStore
      .getState()
      .setRunStats(stats.barricadesBuilt, stats.distanceTraveled, stats.objectsUsed);

    usePlayerStore.getState().setDead();
    useUIStore.getState().openMenu("death");
  });

  onBus("active-slot-changed", (e) => {
    usePlayerStore.getState().updateActiveSlot(e.activeSlot);
  });

  onBus("inventory-full", (e) => {
    useUIStore.getState().addNotification({
      id: generateEphemeralId("inv-full"),
      message: `Inventory full — cannot pick up ${e.displayName}`,
      type: "warning",
      timestamp: Date.now(),
    });
  });

  onBus("item-picked-up", (e) => {
    useUIStore.getState().addNotification({
      id: generateEphemeralId("pickup"),
      message: `Picked up ${e.quantity}x ${e.itemType}`,
      type: "info",
      timestamp: Date.now(),
    });
  });

  onBus("barricade-placed", () => {
    useGameStore.getState().incrementBarricadesBuilt();
    useUIStore.getState().addNotification({
      id: generateEphemeralId("barricade"),
      message: "Barricade placed",
      type: "success",
      timestamp: Date.now(),
    });
  });

  onBus("barricade-broken", () => {
    useUIStore.getState().addNotification({
      id: generateEphemeralId("barricade-broken"),
      message: "A barricade was destroyed!",
      type: "danger",
      timestamp: Date.now(),
    });
  });

  onBus("interaction-prompt", (e) => {
    useUIStore.getState().setInteractionPrompt({
      objectType: e.objectType,
      displayName: e.displayName,
      interactionType: e.interactionType,
      immovable: e.immovable,
      worldX: e.worldX,
      worldY: e.worldY,
    });
  });

  onBus("interaction-prompt-clear", () => {
    useUIStore.getState().clearInteractionPrompt();
  });

  onBus("noise-generated", (e) => {
    // Only forward significant noise to the UI (skip footsteps, drag)
    if (e.intensity >= NOISE.UI_INTENSITY_THRESHOLD) {
      useUIStore.getState().addNoiseIndicator({
        id: generateEphemeralId("noise"),
        position: e.position,
        intensity: e.intensity,
        source: e.source,
        timestamp: Date.now(),
      });
    }
  });

  onBus("object-examined", (e) => {
    useUIStore.getState().addNotification({
      id: generateEphemeralId("examine"),
      message: `${e.displayName}: Durability ${Math.round(e.properties.durability * 100)}%, ${e.properties.immovable ? "Immovable" : "Movable"}`,
      type: "info",
      timestamp: Date.now(),
    });
  });

  // --- Minimap data (issue #33) ---------------------------------------------

  onBus("minimap-init", (e) => {
    useMinimapStore.getState().setMapBounds(e.mapWidth, e.mapHeight, e.safehouseCenter);
  });

  onBus("minimap-update", (e) => {
    useMinimapStore.getState().updatePositions(e.playerPosition, e.zombiePositions);
  });

  // --- Zustand → Game (command events from UI actions) ----------------------
  //
  // The bridge subscribes to store changes using subscribeWithSelector
  // and emits command events when relevant state changes. This keeps
  // stores pure (no bus reference needed) and the bridge is the single
  // integration point.

  const unsubPause = useGameStore.subscribe(
    (state) => state.paused,
    (paused) => {
      safeEmit(
        bus,
        paused ? "cmd:pause" : "cmd:resume",
        { source: "ui" },
      );
    },
  );
  cleanups.push(unsubPause);

  // --- Settings → Game (forward setting changes to game systems) ------------

  const settingsKeys = [
    "masterVolume", "sfxVolume", "musicVolume",
    "screenShake", "showFps", "graphicsQuality",
    "colorBlindMode", "reducedMotion", "highContrast",
  ] as const;

  for (const key of settingsKeys) {
    const unsub = useSettingsStore.subscribe(
      (state) => state[key],
      (value) => {
        safeEmit(bus, "cmd:settings-changed", { key, value });
      },
    );
    cleanups.push(unsub);
  }

  // ---------------------------------------------------------------------------
  // Disconnect
  // ---------------------------------------------------------------------------

  return {
    disconnect() {
      for (const cleanup of cleanups) {
        try {
          cleanup();
        } catch (err) {
          console.error("[Bridge] Cleanup failed during disconnect:", err);
        }
      }
      cleanups.length = 0;
    },
  };
}
