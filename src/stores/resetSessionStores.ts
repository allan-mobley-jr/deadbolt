/**
 * Reset all session-scoped Zustand stores to initial values.
 *
 * Call when a game session ends — on unmount, death-screen actions,
 * or pause-menu abandon.  Does NOT reset settings or persistence stores
 * (those survive across sessions).
 *
 * Important: disconnect the bridge BEFORE calling this to avoid
 * spurious cmd:resume events from the paused subscription.
 */

import { useUIStore } from "./useUIStore";
import { useGameStore } from "./useGameStore";
import { usePlayerStore } from "./usePlayerStore";
import { useMinimapStore } from "./useMinimapStore";

export function resetSessionStores(): void {
  useUIStore.getState().reset();
  useGameStore.getState().reset();
  usePlayerStore.getState().reset();
  useMinimapStore.getState().reset();
}
