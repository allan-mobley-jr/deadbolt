// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from "./settings";

// Mock localStorage
const store = new Map<string, string>();
const mockLocalStorage = {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => store.set(key, value)),
  removeItem: vi.fn((key: string) => store.delete(key)),
  clear: vi.fn(() => store.clear()),
  get length() { return store.size; },
  key: vi.fn(() => null),
};

Object.defineProperty(globalThis, "localStorage", { value: mockLocalStorage });

describe("settings accessibility fields", () => {
  beforeEach(() => {
    store.clear();
  });

  it("default settings include colorBlindMode, reducedMotion, highContrast", () => {
    expect(DEFAULT_SETTINGS.colorBlindMode).toBe(false);
    expect(DEFAULT_SETTINGS.reducedMotion).toBe(false);
    expect(DEFAULT_SETTINGS.highContrast).toBe(false);
  });

  it("loadSettings returns defaults for new accessibility fields when not stored", () => {
    // Old settings without a11y fields
    store.set(
      "deadbolt-settings",
      JSON.stringify({
        masterVolume: 0.5,
        sfxVolume: 0.7,
        musicVolume: 0.3,
        screenShake: false,
        showFps: true,
        graphicsQuality: "high",
      }),
    );

    const settings = loadSettings();
    expect(settings.colorBlindMode).toBe(false);
    expect(settings.reducedMotion).toBe(false);
    expect(settings.highContrast).toBe(false);
    // Existing fields preserved
    expect(settings.masterVolume).toBe(0.5);
    expect(settings.screenShake).toBe(false);
  });

  it("loadSettings restores saved accessibility settings", () => {
    saveSettings({
      ...DEFAULT_SETTINGS,
      colorBlindMode: true,
      reducedMotion: true,
      highContrast: true,
    });

    const settings = loadSettings();
    expect(settings.colorBlindMode).toBe(true);
    expect(settings.reducedMotion).toBe(true);
    expect(settings.highContrast).toBe(true);
  });

  it("reducedMotion defaults to false when matchMedia unavailable", () => {
    // In Node.js test environment, window.matchMedia is unavailable
    // loadSettings should fall back to DEFAULT_SETTINGS.reducedMotion (false)
    const settings = loadSettings();
    expect(settings.reducedMotion).toBe(false);
  });

  it("stored reducedMotion value is preserved on reload", () => {
    saveSettings({ ...DEFAULT_SETTINGS, reducedMotion: true });
    const settings = loadSettings();
    expect(settings.reducedMotion).toBe(true);
  });
});
