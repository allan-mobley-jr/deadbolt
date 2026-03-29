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
import { useGameStore } from "@/stores/useGameStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useUIStore } from "@/stores/useUIStore";

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
    useGameStore.getState().setTotalKills(e.totalKills);
    useGameStore.getState().incrementKillsByType(e.variant);
  });

  onBus("player-hit", (e) => {
    useUIStore.getState().addNotification({
      id: `hit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      message: `Took ${Math.abs(e.damage)} damage!`,
      type: "danger",
      timestamp: Date.now(),
    });
  });

  onBus("player-died", () => {
    usePlayerStore.getState().setDead();
    useUIStore.getState().openMenu("death");
  });

  onBus("active-slot-changed", (e) => {
    usePlayerStore.getState().updateActiveSlot(e.activeSlot);
  });

  onBus("inventory-full", (e) => {
    useUIStore.getState().addNotification({
      id: `inv-full-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      message: `Inventory full — cannot pick up ${e.displayName}`,
      type: "warning",
      timestamp: Date.now(),
    });
  });

  onBus("item-picked-up", (e) => {
    useUIStore.getState().addNotification({
      id: `pickup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      message: `Picked up ${e.quantity}x ${e.itemType}`,
      type: "info",
      timestamp: Date.now(),
    });
  });

  onBus("barricade-placed", () => {
    useUIStore.getState().addNotification({
      id: `barricade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      message: "Barricade placed",
      type: "success",
      timestamp: Date.now(),
    });
  });

  onBus("barricade-broken", () => {
    useUIStore.getState().addNotification({
      id: `barricade-broken-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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

  onBus("object-examined", (e) => {
    useUIStore.getState().addNotification({
      id: `examine-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      message: `${e.displayName}: Durability ${Math.round(e.properties.durability * 100)}%, ${e.properties.immovable ? "Immovable" : "Movable"}`,
      type: "info",
      timestamp: Date.now(),
    });
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
