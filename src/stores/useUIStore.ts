/**
 * Zustand store for UI-only transient state.
 *
 * Holds active menu, overlay stack, and notification queue.
 * None of this state belongs in the ECS — it is purely about
 * what the React UI layer is showing.
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The set of menus the UI can be in. */
export type MenuId = "none" | "pause" | "inventory" | "settings" | "death";

/** A timed notification shown in the HUD. */
export interface Notification {
  id: string;
  message: string;
  type: "info" | "warning" | "danger" | "success";
  timestamp: number;
}

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface UIStoreState {
  /** Which full-screen menu is currently open ("none" = gameplay). */
  activeMenu: MenuId;
  /** Stack of active overlay IDs (modals, tooltips, etc.). */
  overlays: string[];
  /** Queue of HUD notifications (newest last). */
  notifications: Notification[];
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface UIStoreActions {
  /** Open a menu (replaces any currently open menu). */
  openMenu: (menu: MenuId) => void;
  /** Close the current menu (returns to "none"). */
  closeMenu: () => void;
  /** Push an overlay onto the stack. */
  pushOverlay: (overlayId: string) => void;
  /** Pop the top overlay (or a specific one) off the stack. */
  popOverlay: (overlayId?: string) => void;
  /** Add a notification to the queue. */
  addNotification: (notification: Notification) => void;
  /** Dismiss a notification by ID. */
  dismissNotification: (id: string) => void;
  /** Reset to initial state between game sessions. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: UIStoreState = {
  activeMenu: "none",
  overlays: [],
  notifications: [],
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useUIStore = create<UIStoreState & UIStoreActions>()(
  subscribeWithSelector((set) => ({
    ...initialState,

    openMenu: (menu) => set({ activeMenu: menu }),

    closeMenu: () => set({ activeMenu: "none" }),

    pushOverlay: (overlayId) =>
      set((state) => ({ overlays: [...state.overlays, overlayId] })),

    popOverlay: (overlayId) =>
      set((state) => ({
        overlays: overlayId
          ? state.overlays.filter((id) => id !== overlayId)
          : state.overlays.slice(0, -1),
      })),

    addNotification: (notification) =>
      set((state) => ({
        notifications: [...state.notifications, notification],
      })),

    dismissNotification: (id) =>
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      })),

    reset: () => set(initialState),
  })),
);
