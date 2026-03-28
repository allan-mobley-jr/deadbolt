/**
 * Zustand store for player display state.
 *
 * Holds health and inventory data derived from game events.
 * This is UI display state only — the authoritative player state
 * lives in ECS Health and (future) Inventory components.
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { InventorySlot } from "@/game/events/event-bus";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface PlayerStoreState {
  /** Current health points. */
  health: number;
  /** Maximum health points. */
  maxHealth: number;
  /** Whether the player is alive. */
  alive: boolean;

  /** Inventory slots with item type and quantity. */
  inventory: InventorySlot[];
  /** Current carry weight. */
  carryWeight: number;
  /** Maximum carry weight. */
  maxCarryWeight: number;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface PlayerStoreActions {
  /** Update health display from a player-health-changed event. */
  updateHealth: (current: number, max: number) => void;
  /** Update inventory display from an inventory-changed event. */
  updateInventory: (
    slots: InventorySlot[],
    carryWeight: number,
    maxCarryWeight: number,
  ) => void;
  /** Mark the player as dead. */
  setDead: () => void;
  /** Reset to initial state between game sessions. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: PlayerStoreState = {
  health: 100,
  maxHealth: 100,
  alive: true,
  inventory: [],
  carryWeight: 0,
  maxCarryWeight: 50,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePlayerStore = create<PlayerStoreState & PlayerStoreActions>()(
  subscribeWithSelector((set) => ({
    ...initialState,

    updateHealth: (current, max) => set({ health: current, maxHealth: max }),

    updateInventory: (slots, carryWeight, maxCarryWeight) =>
      set({ inventory: slots, carryWeight, maxCarryWeight }),

    setDead: () => set({ alive: false }),

    reset: () => set(initialState),
  })),
);
