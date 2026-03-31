import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSettingsStore } from "./useSettingsStore";
import { DEFAULT_SETTINGS } from "@/lib/settings";

// Mock localStorage for store persistence
const store: Record<string, string> = {};

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);

  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn(),
  });

  useSettingsStore.getState().resetToDefaults();
});

describe("useSettingsStore", () => {
  it("has correct default state", () => {
    const state = useSettingsStore.getState();
    expect(state.masterVolume).toBe(DEFAULT_SETTINGS.masterVolume);
    expect(state.sfxVolume).toBe(DEFAULT_SETTINGS.sfxVolume);
    expect(state.musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
    expect(state.screenShake).toBe(DEFAULT_SETTINGS.screenShake);
    expect(state.showFps).toBe(DEFAULT_SETTINGS.showFps);
    expect(state.graphicsQuality).toBe(DEFAULT_SETTINGS.graphicsQuality);
  });

  describe("volume setters", () => {
    it("setMasterVolume updates and persists", () => {
      useSettingsStore.getState().setMasterVolume(0.5);
      expect(useSettingsStore.getState().masterVolume).toBe(0.5);
      expect(localStorage.setItem).toHaveBeenCalled();
    });

    it("setSfxVolume updates value", () => {
      useSettingsStore.getState().setSfxVolume(0.3);
      expect(useSettingsStore.getState().sfxVolume).toBe(0.3);
    });

    it("setMusicVolume updates value", () => {
      useSettingsStore.getState().setMusicVolume(0.1);
      expect(useSettingsStore.getState().musicVolume).toBe(0.1);
    });

    it("clamps volume to 0-1 range", () => {
      useSettingsStore.getState().setMasterVolume(1.5);
      expect(useSettingsStore.getState().masterVolume).toBe(1);

      useSettingsStore.getState().setMasterVolume(-0.5);
      expect(useSettingsStore.getState().masterVolume).toBe(0);
    });
  });

  describe("toggle setters", () => {
    it("setScreenShake toggles value", () => {
      useSettingsStore.getState().setScreenShake(false);
      expect(useSettingsStore.getState().screenShake).toBe(false);

      useSettingsStore.getState().setScreenShake(true);
      expect(useSettingsStore.getState().screenShake).toBe(true);
    });

    it("setShowFps toggles value", () => {
      useSettingsStore.getState().setShowFps(true);
      expect(useSettingsStore.getState().showFps).toBe(true);
    });
  });

  describe("graphics quality", () => {
    it("setGraphicsQuality changes preset", () => {
      useSettingsStore.getState().setGraphicsQuality("high");
      expect(useSettingsStore.getState().graphicsQuality).toBe("high");

      useSettingsStore.getState().setGraphicsQuality("low");
      expect(useSettingsStore.getState().graphicsQuality).toBe("low");
    });
  });

  describe("resetToDefaults", () => {
    it("resets all fields to default values", () => {
      useSettingsStore.getState().setMasterVolume(0.1);
      useSettingsStore.getState().setScreenShake(false);
      useSettingsStore.getState().setGraphicsQuality("high");

      useSettingsStore.getState().resetToDefaults();

      const state = useSettingsStore.getState();
      expect(state.masterVolume).toBe(DEFAULT_SETTINGS.masterVolume);
      expect(state.screenShake).toBe(DEFAULT_SETTINGS.screenShake);
      expect(state.graphicsQuality).toBe(DEFAULT_SETTINGS.graphicsQuality);
    });
  });

  describe("subscribeWithSelector", () => {
    it("notifies when master volume changes", () => {
      const values: number[] = [];
      const unsub = useSettingsStore.subscribe(
        (s) => s.masterVolume,
        (v) => values.push(v),
      );

      useSettingsStore.getState().setMasterVolume(0.5);
      useSettingsStore.getState().setMasterVolume(0.3);

      expect(values).toEqual([0.5, 0.3]);
      unsub();
    });
  });
});
