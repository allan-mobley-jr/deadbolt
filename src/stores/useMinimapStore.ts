/**
 * Zustand store for minimap display state.
 *
 * Holds entity positions and map bounds relayed from the game engine
 * at ~2 Hz for efficient minimap rendering. This is UI display state
 * only — the authoritative positions live in ECS components.
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface MinimapStoreState {
  /** Player position in pixel space. */
  playerPosition: { x: number; y: number };
  /** Zombie positions in pixel space (updated at ~2 Hz). */
  zombiePositions: Array<{ x: number; y: number }>;
  /** Safehouse center in pixel space. */
  safehouseCenter: { x: number; y: number };
  /** Map width in pixels. */
  mapWidth: number;
  /** Map height in pixels. */
  mapHeight: number;
  /** Whether map bounds have been initialised. */
  initialised: boolean;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface MinimapStoreActions {
  /** Update entity positions from a minimap-update event. */
  updatePositions: (
    playerPosition: { x: number; y: number },
    zombiePositions: Array<{ x: number; y: number }>,
  ) => void;
  /** Set the map bounds and safehouse position (called once at run start). */
  setMapBounds: (
    mapWidth: number,
    mapHeight: number,
    safehouseCenter: { x: number; y: number },
  ) => void;
  /** Reset to initial state between game sessions. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: MinimapStoreState = {
  playerPosition: { x: 0, y: 0 },
  zombiePositions: [],
  safehouseCenter: { x: 0, y: 0 },
  mapWidth: 0,
  mapHeight: 0,
  initialised: false,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useMinimapStore = create<MinimapStoreState & MinimapStoreActions>()(
  subscribeWithSelector((set) => ({
    ...initialState,

    updatePositions: (playerPosition, zombiePositions) =>
      set({ playerPosition, zombiePositions: [...zombiePositions] }),

    setMapBounds: (mapWidth, mapHeight, safehouseCenter) =>
      set({ mapWidth, mapHeight, safehouseCenter, initialised: true }),

    reset: () => set(initialState),
  })),
);
