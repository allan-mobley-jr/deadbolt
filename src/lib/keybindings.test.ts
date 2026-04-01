// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DEFAULT_KEYBINDINGS,
  loadKeybindings,
  saveKeybindings,
  findConflict,
  ACTION_META,
  type ActionId,
  type KeyBindingMap,
} from "./keybindings";

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

describe("keybindings", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it("loadKeybindings returns defaults when nothing stored", () => {
    const bindings = loadKeybindings();
    expect(bindings).toEqual(DEFAULT_KEYBINDINGS);
  });

  it("saveKeybindings persists to localStorage", () => {
    const custom: KeyBindingMap = { ...DEFAULT_KEYBINDINGS, attack: "X" };
    saveKeybindings(custom);
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      "deadbolt-keybindings",
      expect.any(String),
    );
  });

  it("loadKeybindings restores saved bindings", () => {
    const custom: KeyBindingMap = { ...DEFAULT_KEYBINDINGS, interact: "F" };
    saveKeybindings(custom);
    const loaded = loadKeybindings();
    expect(loaded.interact).toBe("F");
  });

  it("loadKeybindings fills missing keys with defaults", () => {
    store.set("deadbolt-keybindings", JSON.stringify({ moveUp: "I" }));
    const loaded = loadKeybindings();
    expect(loaded.moveUp).toBe("I");
    expect(loaded.moveDown).toBe(DEFAULT_KEYBINDINGS.moveDown);
    expect(loaded.attack).toBe(DEFAULT_KEYBINDINGS.attack);
  });

  it("loadKeybindings handles corrupt data gracefully", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    store.set("deadbolt-keybindings", "not-json");
    const loaded = loadKeybindings();
    expect(loaded).toEqual(DEFAULT_KEYBINDINGS);
    expect(warnSpy).toHaveBeenCalledWith(
      "[Keybindings] Failed to load keybindings, using defaults:",
      expect.any(SyntaxError),
    );
    warnSpy.mockRestore();
  });

  it("findConflict detects duplicate key bindings", () => {
    const bindings: KeyBindingMap = { ...DEFAULT_KEYBINDINGS };
    // "W" is bound to moveUp by default
    const conflict = findConflict(bindings, "attack", "W");
    expect(conflict).toBe("moveUp");
  });

  it("findConflict returns null when no conflict exists", () => {
    const bindings: KeyBindingMap = { ...DEFAULT_KEYBINDINGS };
    const conflict = findConflict(bindings, "attack", "X");
    expect(conflict).toBeNull();
  });

  it("findConflict ignores self-reassignment", () => {
    const bindings: KeyBindingMap = { ...DEFAULT_KEYBINDINGS };
    const conflict = findConflict(bindings, "moveUp", "W");
    expect(conflict).toBeNull();
  });

  it("every action has metadata", () => {
    for (const key of Object.keys(DEFAULT_KEYBINDINGS) as ActionId[]) {
      expect(ACTION_META[key]).toBeDefined();
      expect(ACTION_META[key].label).toBeTruthy();
      expect(ACTION_META[key].category).toBeTruthy();
    }
  });

  it("saveKeybindings logs unexpected setItem errors", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockLocalStorage.setItem.mockImplementationOnce(() => {
      throw new TypeError("unexpected");
    });
    saveKeybindings(DEFAULT_KEYBINDINGS);
    expect(errorSpy).toHaveBeenCalledWith(
      "[Keybindings] Unexpected error saving keybindings:",
      expect.any(TypeError),
    );
    errorSpy.mockRestore();
  });

  it("saveKeybindings silences QuotaExceededError", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockLocalStorage.setItem.mockImplementationOnce(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    expect(() => saveKeybindings(DEFAULT_KEYBINDINGS)).not.toThrow();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("default keybindings have no conflicts", () => {
    const seen = new Set<string>();
    for (const [, key] of Object.entries(DEFAULT_KEYBINDINGS)) {
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
