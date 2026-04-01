/**
 * Keybinding system — configurable input mappings.
 *
 * Defines all game actions and their default key bindings. Bindings are
 * persisted to localStorage independently from GameSettings.
 *
 * Pure TypeScript — no React imports.
 */

// ---------------------------------------------------------------------------
// Action identifiers
// ---------------------------------------------------------------------------

export type ActionId =
  | "moveUp"
  | "moveDown"
  | "moveLeft"
  | "moveRight"
  | "aimUp"
  | "aimDown"
  | "aimLeft"
  | "aimRight"
  | "attack"
  | "interact"
  | "quickSlot1"
  | "quickSlot2"
  | "quickSlot3"
  | "quickSlot4"
  | "quickSlot5"
  | "pause";

/** Human-readable metadata for each action. */
export interface ActionMeta {
  label: string;
  category: "movement" | "combat" | "interaction" | "menu";
}

export const ACTION_META: Record<ActionId, ActionMeta> = {
  moveUp: { label: "Move Up", category: "movement" },
  moveDown: { label: "Move Down", category: "movement" },
  moveLeft: { label: "Move Left", category: "movement" },
  moveRight: { label: "Move Right", category: "movement" },
  aimUp: { label: "Aim Up", category: "combat" },
  aimDown: { label: "Aim Down", category: "combat" },
  aimLeft: { label: "Aim Left", category: "combat" },
  aimRight: { label: "Aim Right", category: "combat" },
  attack: { label: "Attack", category: "combat" },
  interact: { label: "Interact", category: "interaction" },
  quickSlot1: { label: "Quick Slot 1", category: "interaction" },
  quickSlot2: { label: "Quick Slot 2", category: "interaction" },
  quickSlot3: { label: "Quick Slot 3", category: "interaction" },
  quickSlot4: { label: "Quick Slot 4", category: "interaction" },
  quickSlot5: { label: "Quick Slot 5", category: "interaction" },
  pause: { label: "Pause", category: "menu" },
};

// ---------------------------------------------------------------------------
// Key binding map
// ---------------------------------------------------------------------------

/** Maps each action to a Phaser key name (e.g., "W", "SPACE", "E"). */
export type KeyBindingMap = Record<ActionId, string>;

export const DEFAULT_KEYBINDINGS: KeyBindingMap = {
  moveUp: "W",
  moveDown: "S",
  moveLeft: "A",
  moveRight: "D",
  aimUp: "UP",
  aimDown: "DOWN",
  aimLeft: "LEFT",
  aimRight: "RIGHT",
  attack: "SPACE",
  interact: "E",
  quickSlot1: "ONE",
  quickSlot2: "TWO",
  quickSlot3: "THREE",
  quickSlot4: "FOUR",
  quickSlot5: "FIVE",
  pause: "ESC",
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "deadbolt-keybindings";

/** Load keybindings from localStorage, merging with defaults. */
export function loadKeybindings(): KeyBindingMap {
  if (typeof localStorage === "undefined") return { ...DEFAULT_KEYBINDINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_KEYBINDINGS };

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return { ...DEFAULT_KEYBINDINGS };
    }

    const obj = parsed as Record<string, unknown>;
    const result = { ...DEFAULT_KEYBINDINGS };

    // Only override keys that exist in the default map and have string values
    for (const key of Object.keys(DEFAULT_KEYBINDINGS) as ActionId[]) {
      if (typeof obj[key] === "string" && obj[key] !== "") {
        result[key] = obj[key] as string;
      }
    }

    return result;
  } catch (err) {
    console.warn("[Keybindings] Failed to load keybindings, using defaults:", err);
    return { ...DEFAULT_KEYBINDINGS };
  }
}

/** Persist keybindings to localStorage. */
export function saveKeybindings(bindings: KeyBindingMap): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch (err) {
    // QuotaExceededError and SecurityError are expected in restricted environments.
    const name = err instanceof DOMException ? err.name : "";
    if (name !== "QuotaExceededError" && name !== "SecurityError") {
      console.error("[Keybindings] Unexpected error saving keybindings:", err);
    }
  }
}

/**
 * Check if a key is already bound to another action.
 * Returns the conflicting action ID, or null if no conflict.
 */
export function findConflict(
  bindings: KeyBindingMap,
  actionId: ActionId,
  newKey: string,
): ActionId | null {
  for (const [id, key] of Object.entries(bindings)) {
    if (id !== actionId && key === newKey) {
      return id as ActionId;
    }
  }
  return null;
}
