// @vitest-environment node
/**
 * SSR/SSG safety tests for keybindings persistence.
 *
 * Runs in a Node environment (no localStorage) to verify that
 * loadKeybindings and saveKeybindings handle missing localStorage
 * gracefully without throwing.
 */
import { describe, it, expect } from "vitest";
import {
  loadKeybindings,
  saveKeybindings,
  DEFAULT_KEYBINDINGS,
} from "./keybindings";

describe("keybindings — SSR/SSG safety", () => {
  it("loadKeybindings returns defaults when localStorage is unavailable", () => {
    const result = loadKeybindings();
    expect(result).toEqual(DEFAULT_KEYBINDINGS);
  });

  it("saveKeybindings is a silent no-op when localStorage is unavailable", () => {
    expect(() => saveKeybindings(DEFAULT_KEYBINDINGS)).not.toThrow();
  });
});
