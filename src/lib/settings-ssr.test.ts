// @vitest-environment node
/**
 * SSR/SSG safety tests for settings persistence.
 *
 * Runs in a Node environment (no localStorage) to verify that
 * loadSettings and saveSettings handle missing localStorage gracefully
 * without throwing or logging warnings.
 */
import { describe, it, expect } from "vitest";
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from "./settings";

describe("settings — SSR/SSG safety", () => {
  it("loadSettings returns defaults when localStorage is unavailable", () => {
    const result = loadSettings();
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it("saveSettings is a silent no-op when localStorage is unavailable", () => {
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
  });
});
