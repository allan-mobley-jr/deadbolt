// Game state (clock, phase, waves, kills)
export { useGameStore } from "./useGameStore";
export type { GameStoreState, GameStoreActions } from "./useGameStore";

// Player state (health, inventory)
export { usePlayerStore } from "./usePlayerStore";
export type { PlayerStoreState, PlayerStoreActions } from "./usePlayerStore";

// UI state (menus, overlays, notifications)
export { useUIStore } from "./useUIStore";
export type {
  UIStoreState,
  UIStoreActions,
  MenuId,
  Notification,
} from "./useUIStore";

// Minimap state (entity positions, map bounds)
export { useMinimapStore } from "./useMinimapStore";
export type { MinimapStoreState, MinimapStoreActions } from "./useMinimapStore";
