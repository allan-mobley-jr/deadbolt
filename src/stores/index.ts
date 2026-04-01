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

// Settings (persisted to localStorage, survives across runs)
export { useSettingsStore } from "./useSettingsStore";
export type { SettingsStoreActions } from "./useSettingsStore";

// Persistence (IndexedDB — run history, leaderboard, lifetime stats)
export { usePersistenceStore } from "./usePersistenceStore";
export type { PersistenceStoreState, PersistenceStoreActions } from "./usePersistenceStore";
