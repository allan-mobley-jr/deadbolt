import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore, MAX_NOTIFICATIONS } from "./useUIStore";

describe("useUIStore", () => {
  beforeEach(() => {
    useUIStore.getState().reset();
  });

  it("has correct initial state", () => {
    const state = useUIStore.getState();
    expect(state.activeMenu).toBe("none");
    expect(state.overlays).toEqual([]);
    expect(state.notifications).toEqual([]);
    expect(state.interactionPrompt).toBeNull();
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

    it("caps notifications at MAX_NOTIFICATIONS, keeping newest", () => {
      for (let i = 0; i < MAX_NOTIFICATIONS + 10; i++) {
        useUIStore.getState().addNotification({
          id: `n${i}`,
          message: `Notification ${i}`,
          type: "info",
          timestamp: i * 1000,
        });
      }

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(MAX_NOTIFICATIONS);
      // Oldest entries (0-9) should have been evicted
      expect(notifications[0].id).toBe("n10");
      expect(notifications[notifications.length - 1].id).toBe(
        `n${MAX_NOTIFICATIONS + 9}`,
      );
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

  describe("interaction prompt actions", () => {
    it("stores prompt data via setInteractionPrompt", () => {
      useUIStore.getState().setInteractionPrompt({
        objectType: "gas_can",
        displayName: "Gas Can",
        interactionType: "pickup",
        immovable: false,
        worldX: 50,
        worldY: 75,
      });

      const prompt = useUIStore.getState().interactionPrompt;
      expect(prompt).toEqual({
        objectType: "gas_can",
        displayName: "Gas Can",
        interactionType: "pickup",
        immovable: false,
        worldX: 50,
        worldY: 75,
      });
    });

    it("clears prompt via clearInteractionPrompt", () => {
      useUIStore.getState().setInteractionPrompt({
        objectType: "gas_can",
        displayName: "Gas Can",
        interactionType: "pickup",
        immovable: false,
        worldX: 50,
        worldY: 75,
      });

      useUIStore.getState().clearInteractionPrompt();

      expect(useUIStore.getState().interactionPrompt).toBeNull();
    });

    it("replaces previous prompt when setInteractionPrompt is called again", () => {
      useUIStore.getState().setInteractionPrompt({
        objectType: "gas_can",
        displayName: "Gas Can",
        interactionType: "pickup",
        immovable: false,
        worldX: 50,
        worldY: 75,
      });

      useUIStore.getState().setInteractionPrompt({
        objectType: "bookshelf",
        displayName: "Bookshelf",
        interactionType: "push",
        immovable: true,
        worldX: 200,
        worldY: 300,
      });

      const prompt = useUIStore.getState().interactionPrompt;
      expect(prompt?.objectType).toBe("bookshelf");
      expect(prompt?.interactionType).toBe("push");
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
      useUIStore.getState().setInteractionPrompt({
        objectType: "gas_can",
        displayName: "Gas Can",
        interactionType: "pickup",
        immovable: false,
        worldX: 50,
        worldY: 75,
      });

      useUIStore.getState().reset();

      const state = useUIStore.getState();
      expect(state.activeMenu).toBe("none");
      expect(state.overlays).toEqual([]);
      expect(state.notifications).toEqual([]);
      expect(state.interactionPrompt).toBeNull();
    });
  });
});
