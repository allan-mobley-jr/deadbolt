/**
 * Zustand store for user-configurable game settings.
 *
 * Loads initial state from localStorage on creation and persists
 * every change back. Settings survive across game sessions (unlike
 * game/player stores which reset between runs).
 *
 * Uses subscribeWithSelector so the bridge can forward individual
 * setting changes to the game event bus.
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import {
  type GameSettings,
  type GraphicsQuality,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
} from "@/lib/settings";

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface SettingsStoreActions {
  /** Set master volume (0-1). */
  setMasterVolume: (v: number) => void;
  /** Set sound effects volume (0-1). */
  setSfxVolume: (v: number) => void;
  /** Set music volume (0-1). */
  setMusicVolume: (v: number) => void;
  /** Toggle screen shake. */
  setScreenShake: (enabled: boolean) => void;
  /** Toggle FPS counter. */
  setShowFps: (enabled: boolean) => void;
  /** Set graphics quality preset. */
  setGraphicsQuality: (q: GraphicsQuality) => void;
  /** Toggle color-blind mode (shape indicators for zombie types). */
  setColorBlindMode: (enabled: boolean) => void;
  /** Toggle reduced motion (disables shake, particles, camera lerp). */
  setReducedMotion: (enabled: boolean) => void;
  /** Toggle high contrast mode (stronger borders, interactive distinction). */
  setHighContrast: (enabled: boolean) => void;
  /** Reset all settings to defaults and persist. */
  resetToDefaults: () => void;
}

// ---------------------------------------------------------------------------
// Persist helper
// ---------------------------------------------------------------------------

/** Update a single field and persist the entire settings object. */
function updateAndPersist(
  set: (updater: (state: GameSettings) => Partial<GameSettings>) => void,
  get: () => GameSettings & SettingsStoreActions,
  field: Partial<GameSettings>,
): void {
  set(() => field);
  // Persist after update — extract only the settings fields
  const state = get();
  saveSettings({
    masterVolume: state.masterVolume,
    sfxVolume: state.sfxVolume,
    musicVolume: state.musicVolume,
    screenShake: state.screenShake,
    showFps: state.showFps,
    graphicsQuality: state.graphicsQuality,
    colorBlindMode: state.colorBlindMode,
    reducedMotion: state.reducedMotion,
    highContrast: state.highContrast,
  });
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSettingsStore = create<GameSettings & SettingsStoreActions>()(
  subscribeWithSelector((set, get) => ({
    ...loadSettings(),

    setMasterVolume: (v) =>
      updateAndPersist(set, get, { masterVolume: Math.max(0, Math.min(1, v)) }),

    setSfxVolume: (v) =>
      updateAndPersist(set, get, { sfxVolume: Math.max(0, Math.min(1, v)) }),

    setMusicVolume: (v) =>
      updateAndPersist(set, get, { musicVolume: Math.max(0, Math.min(1, v)) }),

    setScreenShake: (enabled) =>
      updateAndPersist(set, get, { screenShake: enabled }),

    setShowFps: (enabled) =>
      updateAndPersist(set, get, { showFps: enabled }),

    setGraphicsQuality: (q) =>
      updateAndPersist(set, get, { graphicsQuality: q }),

    setColorBlindMode: (enabled) =>
      updateAndPersist(set, get, { colorBlindMode: enabled }),

    setReducedMotion: (enabled) =>
      updateAndPersist(set, get, { reducedMotion: enabled }),

    setHighContrast: (enabled) =>
      updateAndPersist(set, get, { highContrast: enabled }),

    resetToDefaults: () => {
      set(() => ({ ...DEFAULT_SETTINGS }));
      saveSettings(DEFAULT_SETTINGS);
    },
  })),
);
