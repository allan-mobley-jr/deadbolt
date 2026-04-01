/**
 * Game settings type definitions and localStorage persistence.
 *
 * Pure TypeScript with no React or Zustand imports — game systems
 * can import types from here without crossing the game boundary.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Graphics quality presets. */
export type GraphicsQuality = "low" | "medium" | "high";

/** All user-configurable game settings. */
export interface GameSettings {
  /** Master volume multiplier (0-1). */
  masterVolume: number;
  /** Sound effects volume multiplier (0-1). */
  sfxVolume: number;
  /** Music volume multiplier (0-1). */
  musicVolume: number;
  /** Whether camera screen shake is enabled. */
  screenShake: boolean;
  /** Whether the FPS debug counter is visible. */
  showFps: boolean;
  /** Graphics quality preset. */
  graphicsQuality: GraphicsQuality;
  /** Color-blind mode: adds shape indicators to zombie types and health states. */
  colorBlindMode: boolean;
  /** Reduced motion: disables shake, reduces particles, snaps camera. */
  reducedMotion: boolean;
  /** High contrast: stronger borders, distinct interactive objects. */
  highContrast: boolean;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.8,
  sfxVolume: 0.8,
  musicVolume: 0.6,
  screenShake: true,
  showFps: false,
  graphicsQuality: "medium",
  colorBlindMode: false,
  reducedMotion: false,
  highContrast: false,
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "deadbolt-settings";

/**
 * Load settings from localStorage, merging with defaults for any
 * missing or corrupt fields. Returns defaults if nothing is stored.
 */
export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return { ...DEFAULT_SETTINGS };
    }

    const obj = parsed as Record<string, unknown>;

    // Default reducedMotion from OS preference when no stored value exists
    let reducedMotionDefault = DEFAULT_SETTINGS.reducedMotion;
    if (obj.reducedMotion === undefined) {
      try {
        if (typeof window !== "undefined" && window.matchMedia) {
          reducedMotionDefault = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        }
      } catch {
        // matchMedia unavailable (SSR, restricted env)
      }
    }

    return {
      masterVolume: clampVolume(obj.masterVolume, DEFAULT_SETTINGS.masterVolume),
      sfxVolume: clampVolume(obj.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
      musicVolume: clampVolume(obj.musicVolume, DEFAULT_SETTINGS.musicVolume),
      screenShake: typeof obj.screenShake === "boolean" ? obj.screenShake : DEFAULT_SETTINGS.screenShake,
      showFps: typeof obj.showFps === "boolean" ? obj.showFps : DEFAULT_SETTINGS.showFps,
      graphicsQuality: isGraphicsQuality(obj.graphicsQuality) ? obj.graphicsQuality : DEFAULT_SETTINGS.graphicsQuality,
      colorBlindMode: typeof obj.colorBlindMode === "boolean" ? obj.colorBlindMode : DEFAULT_SETTINGS.colorBlindMode,
      reducedMotion: typeof obj.reducedMotion === "boolean" ? obj.reducedMotion : reducedMotionDefault,
      highContrast: typeof obj.highContrast === "boolean" ? obj.highContrast : DEFAULT_SETTINGS.highContrast,
    };
  } catch (err) {
    console.warn("[Settings] Failed to load settings, using defaults:", err);
    return { ...DEFAULT_SETTINGS };
  }
}

/** Persist settings to localStorage. */
export function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    // QuotaExceededError and SecurityError are expected in restricted environments.
    const name = err instanceof DOMException ? err.name : "";
    if (name !== "QuotaExceededError" && name !== "SecurityError") {
      console.error("[Settings] Unexpected error saving settings:", err);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampVolume(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function isGraphicsQuality(value: unknown): value is GraphicsQuality {
  return value === "low" || value === "medium" || value === "high";
}
