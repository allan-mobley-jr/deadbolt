import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from "./settings";

// Mock localStorage
const store: Record<string, string> = {};

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);

  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
  });
});

describe("loadSettings", () => {
  it("returns defaults when nothing is stored", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("returns defaults when stored value is invalid JSON", () => {
    store["deadbolt-settings"] = "not-json{{{";
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("returns defaults when stored value is not an object", () => {
    store["deadbolt-settings"] = '"string"';
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("merges partial stored settings with defaults", () => {
    store["deadbolt-settings"] = JSON.stringify({
      masterVolume: 0.5,
      screenShake: false,
    });
    const result = loadSettings();
    expect(result.masterVolume).toBe(0.5);
    expect(result.screenShake).toBe(false);
    // Remaining fields should be defaults
    expect(result.sfxVolume).toBe(DEFAULT_SETTINGS.sfxVolume);
    expect(result.musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
    expect(result.showFps).toBe(DEFAULT_SETTINGS.showFps);
    expect(result.graphicsQuality).toBe(DEFAULT_SETTINGS.graphicsQuality);
  });

  it("clamps volume values to 0-1 range", () => {
    store["deadbolt-settings"] = JSON.stringify({
      masterVolume: 1.5,
      sfxVolume: -0.5,
    });
    const result = loadSettings();
    expect(result.masterVolume).toBe(1);
    expect(result.sfxVolume).toBe(0);
  });

  it("ignores invalid graphicsQuality values", () => {
    store["deadbolt-settings"] = JSON.stringify({
      graphicsQuality: "ultra",
    });
    expect(loadSettings().graphicsQuality).toBe(DEFAULT_SETTINGS.graphicsQuality);
  });

  it("ignores non-boolean screenShake values", () => {
    store["deadbolt-settings"] = JSON.stringify({
      screenShake: "yes",
    });
    expect(loadSettings().screenShake).toBe(DEFAULT_SETTINGS.screenShake);
  });
});

describe("saveSettings", () => {
  it("persists settings to localStorage", () => {
    saveSettings(DEFAULT_SETTINGS);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "deadbolt-settings",
      JSON.stringify(DEFAULT_SETTINGS),
    );
  });

  it("does not throw when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new Error("QuotaExceededError");
      }),
    });
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
  });
});
