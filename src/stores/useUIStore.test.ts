import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "./useUIStore";

describe("useUIStore", () => {
  beforeEach(() => {
    useUIStore.getState().reset();
  });

  it("has correct initial state", () => {
    const state = useUIStore.getState();
    expect(state.activeMenu).toBe("none");
    expect(state.overlays).toEqual([]);
    expect(state.notifications).toEqual([]);
  });

  describe("menu actions", () => {
    it("opens a menu", () => {
      useUIStore.getState().openMenu("pause");
      expect(useUIStore.getState().activeMenu).toBe("pause");
    });

    it("replaces the current menu on openMenu", () => {
      useUIStore.getState().openMenu("pause");
      useUIStore.getState().openMenu("settings");
      expect(useUIStore.getState().activeMenu).toBe("settings");
    });

    it("closes the menu", () => {
      useUIStore.getState().openMenu("inventory");
      useUIStore.getState().closeMenu();
      expect(useUIStore.getState().activeMenu).toBe("none");
    });
  });

  describe("overlay actions", () => {
    it("pushes an overlay onto the stack", () => {
      useUIStore.getState().pushOverlay("tooltip-1");
      useUIStore.getState().pushOverlay("modal-1");
      expect(useUIStore.getState().overlays).toEqual(["tooltip-1", "modal-1"]);
    });

    it("pops the top overlay when no ID given", () => {
      useUIStore.getState().pushOverlay("a");
      useUIStore.getState().pushOverlay("b");
      useUIStore.getState().popOverlay();
      expect(useUIStore.getState().overlays).toEqual(["a"]);
    });

    it("removes a specific overlay by ID", () => {
      useUIStore.getState().pushOverlay("a");
      useUIStore.getState().pushOverlay("b");
      useUIStore.getState().pushOverlay("c");
      useUIStore.getState().popOverlay("b");
      expect(useUIStore.getState().overlays).toEqual(["a", "c"]);
    });
  });

  describe("notification actions", () => {
    it("adds a notification", () => {
      useUIStore.getState().addNotification({
        id: "n1",
        message: "Test notification",
        type: "info",
        timestamp: 1000,
      });
      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].message).toBe("Test notification");
    });

    it("dismisses a notification by ID", () => {
      useUIStore.getState().addNotification({
        id: "n1",
        message: "First",
        type: "info",
        timestamp: 1000,
      });
      useUIStore.getState().addNotification({
        id: "n2",
        message: "Second",
        type: "warning",
        timestamp: 2000,
      });

      useUIStore.getState().dismissNotification("n1");

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].id).toBe("n2");
    });
  });

  describe("reset", () => {
    it("returns all fields to initial values", () => {
      useUIStore.getState().openMenu("death");
      useUIStore.getState().pushOverlay("modal");
      useUIStore.getState().addNotification({
        id: "n1",
        message: "Test",
        type: "info",
        timestamp: 1000,
      });

      useUIStore.getState().reset();

      const state = useUIStore.getState();
      expect(state.activeMenu).toBe("none");
      expect(state.overlays).toEqual([]);
      expect(state.notifications).toEqual([]);
    });
  });
});
