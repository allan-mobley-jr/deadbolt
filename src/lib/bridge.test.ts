import { describe, it, expect, beforeEach, vi } from "vitest";
import { createGameEventBus, safeEmit } from "@/game/events/event-bus";
import type { GameEventBus } from "@/game/events/event-bus";
import { connectBridge } from "./bridge";
import { useGameStore } from "@/stores/useGameStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useUIStore } from "@/stores/useUIStore";

describe("bridge", () => {
  let bus: GameEventBus;

  beforeEach(() => {
    bus = createGameEventBus();
    useGameStore.getState().reset();
    usePlayerStore.getState().reset();
    useUIStore.getState().reset();
  });

  // -------------------------------------------------------------------------
  // Game → Zustand (store updates from bus events)
  // -------------------------------------------------------------------------

  describe("Game → Zustand", () => {
    it("updates gameStore on clock-tick", () => {
      const bridge = connectBridge(bus);

      safeEmit(bus, "clock-tick", {
        phase: "dusk",
        dayNumber: 2,
        timeRemainingInPhase: 10,
        phaseDuration: 15,
        elapsedTotal: 590,
      });

      const state = useGameStore.getState();
      expect(state.phase).toBe("dusk");
      expect(state.dayNumber).toBe(2);
      expect(state.timeRemainingInPhase).toBe(10);
      expect(state.phaseDuration).toBe(15);
      expect(state.elapsedTotal).toBe(590);

      bridge.disconnect();
    });

    it("updates gameStore on phase-change", () => {
      const bridge = connectBridge(bus);

      safeEmit(bus, "phase-change", {
        phase: "night",
        previousPhase: "dusk",
        dayNumber: 1,
        timeRemainingInPhase: 90,
      });

      const state = useGameStore.getState();
      expect(state.phase).toBe("night");
      expect(state.dayNumber).toBe(1);
      expect(state.timeRemainingInPhase).toBe(90);

      bridge.disconnect();
    });

    it("updates playerStore on player-health-changed", () => {
      const bridge = connectBridge(bus);

      safeEmit(bus, "player-health-changed", {
        current: 75,
        max: 100,
        delta: -25,
      });

      const state = usePlayerStore.getState();
      expect(state.health).toBe(75);
      expect(state.maxHealth).toBe(100);

      bridge.disconnect();
    });

    it("updates playerStore on inventory-changed", () => {
      const bridge = connectBridge(bus);

      const slots = [
        { itemType: "wood", slotIndex: 0, sizeCategory: "small" as const, primary: true },
        { itemType: "nails", slotIndex: 1, sizeCategory: "small" as const, primary: true },
      ];
      safeEmit(bus, "inventory-changed", {
        slots,
        carryWeight: 15,
        maxCarryWeight: 50,
      });

      const state = usePlayerStore.getState();
      expect(state.inventory).toEqual(slots);
      expect(state.carryWeight).toBe(15);

      bridge.disconnect();
    });

    it("updates playerStore activeSlot on active-slot-changed", () => {
      const bridge = connectBridge(bus);

      safeEmit(bus, "active-slot-changed", {
        activeSlot: 2,
        itemType: "wooden_plank",
      });

      expect(usePlayerStore.getState().activeSlot).toBe(2);

      bridge.disconnect();
    });

    it("adds notification on inventory-full", () => {
      const bridge = connectBridge(bus);

      safeEmit(bus, "inventory-full", {
        attemptedItemType: "gas_can",
        displayName: "Gas Can",
      });

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].message).toContain("Gas Can");
      expect(notifications[0].type).toBe("warning");

      bridge.disconnect();
    });

    it("updates gameStore on wave-started", () => {
      const bridge = connectBridge(bus);

      safeEmit(bus, "wave-started", {
        waveNumber: 2,
        zombieCount: 15,
        dayNumber: 1,
      });

      const state = useGameStore.getState();
      expect(state.waveActive).toBe(true);
      expect(state.waveNumber).toBe(2);
      expect(state.zombiesInWave).toBe(15);

      bridge.disconnect();
    });

    it("updates gameStore on wave-ended", () => {
      const bridge = connectBridge(bus);

      safeEmit(bus, "wave-started", {
        waveNumber: 1,
        zombieCount: 10,
        dayNumber: 1,
      });
      safeEmit(bus, "wave-ended", {
        waveNumber: 1,
        zombiesKilled: 10,
        dayNumber: 1,
      });

      expect(useGameStore.getState().waveActive).toBe(false);

      bridge.disconnect();
    });

    it("sets authoritative totalKills on zombie-killed", () => {
      const bridge = connectBridge(bus);

      safeEmit(bus, "zombie-killed", {
        position: { x: 100, y: 200 },
        totalKills: 5,
      });

      expect(useGameStore.getState().totalKills).toBe(5);

      // Authoritative — overwrites, does not accumulate
      safeEmit(bus, "zombie-killed", {
        position: { x: 150, y: 250 },
        totalKills: 6,
      });

      expect(useGameStore.getState().totalKills).toBe(6);

      bridge.disconnect();
    });

    it("marks player dead and opens death menu on player-died", () => {
      const bridge = connectBridge(bus);

      safeEmit(bus, "player-died", {
        dayNumber: 3,
        totalKills: 42,
        survivalTime: 600,
        cause: "zombie",
      });

      expect(usePlayerStore.getState().alive).toBe(false);
      expect(useUIStore.getState().activeMenu).toBe("death");

      bridge.disconnect();
    });

    it("adds notification on item-picked-up", () => {
      const bridge = connectBridge(bus);

      safeEmit(bus, "item-picked-up", {
        itemType: "medkit",
        quantity: 1,
      });

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].message).toContain("medkit");
      expect(notifications[0].type).toBe("info");

      bridge.disconnect();
    });

    it("adds notification on barricade-placed", () => {
      const bridge = connectBridge(bus);

      safeEmit(bus, "barricade-placed", {
        position: { x: 100, y: 200 },
        health: 50,
        maxHealth: 50,
      });

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].message).toContain("Barricade placed");
      expect(notifications[0].type).toBe("success");

      bridge.disconnect();
    });

    it("adds notification on barricade-broken", () => {
      const bridge = connectBridge(bus);

      safeEmit(bus, "barricade-broken", {
        position: { x: 100, y: 200 },
      });

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].message).toContain("destroyed");
      expect(notifications[0].type).toBe("danger");

      bridge.disconnect();
    });

    it("sets interactionPrompt on interaction-prompt event", () => {
      const bridge = connectBridge(bus);

      safeEmit(bus, "interaction-prompt", {
        objectType: "wooden_plank",
        displayName: "Wooden Plank",
        interactionType: "pickup",
        immovable: false,
        worldX: 100,
        worldY: 200,
      });

      const prompt = useUIStore.getState().interactionPrompt;
      expect(prompt).toEqual({
        objectType: "wooden_plank",
        displayName: "Wooden Plank",
        interactionType: "pickup",
        immovable: false,
        worldX: 100,
        worldY: 200,
      });

      bridge.disconnect();
    });

    it("clears interactionPrompt on interaction-prompt-clear event", () => {
      const bridge = connectBridge(bus);

      // First set a prompt
      safeEmit(bus, "interaction-prompt", {
        objectType: "wooden_plank",
        displayName: "Wooden Plank",
        interactionType: "pickup",
        immovable: false,
        worldX: 100,
        worldY: 200,
      });
      expect(useUIStore.getState().interactionPrompt).not.toBeNull();

      // Clear it
      safeEmit(bus, "interaction-prompt-clear", {});

      expect(useUIStore.getState().interactionPrompt).toBeNull();

      bridge.disconnect();
    });

    it("adds notification on object-examined event", () => {
      const bridge = connectBridge(bus);

      safeEmit(bus, "object-examined", {
        objectType: "bookshelf",
        displayName: "Bookshelf",
        category: "Furniture",
        properties: {
          durability: 0.5,
          flammability: 0.9,
          conductivity: 0,
          lootValue: 1,
          immovable: true,
        },
      });

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].message).toContain("Bookshelf");
      expect(notifications[0].message).toContain("50%");
      expect(notifications[0].message).toContain("Immovable");
      expect(notifications[0].type).toBe("info");

      bridge.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // Zustand → Game (command events from store changes)
  // -------------------------------------------------------------------------

  describe("Zustand → Game", () => {
    it("emits cmd:pause when paused changes to true", () => {
      const bridge = connectBridge(bus);
      const handler = vi.fn();
      bus.on("cmd:pause", handler);

      useGameStore.getState().setPaused(true);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ source: "ui" });

      bridge.disconnect();
    });

    it("emits cmd:resume when paused changes to false", () => {
      const bridge = connectBridge(bus);

      // First pause so we can resume
      useGameStore.getState().setPaused(true);

      const handler = vi.fn();
      bus.on("cmd:resume", handler);

      useGameStore.getState().setPaused(false);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ source: "ui" });

      bridge.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // Disconnect behaviour
  // -------------------------------------------------------------------------

  describe("disconnect", () => {
    it("stops updating stores after disconnect", () => {
      const bridge = connectBridge(bus);
      bridge.disconnect();

      safeEmit(bus, "player-health-changed", {
        current: 50,
        max: 100,
        delta: -50,
      });

      // Health should remain at initial value (100)
      expect(usePlayerStore.getState().health).toBe(100);
    });

    it("stops emitting commands after disconnect", () => {
      const bridge = connectBridge(bus);
      bridge.disconnect();

      const handler = vi.fn();
      bus.on("cmd:pause", handler);

      useGameStore.getState().setPaused(true);

      expect(handler).not.toHaveBeenCalled();
    });

    it("is safe to call disconnect multiple times", () => {
      const bridge = connectBridge(bus);
      bridge.disconnect();
      expect(() => bridge.disconnect()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Resilience
  // -------------------------------------------------------------------------

  describe("resilience", () => {
    it("a throwing store action does not block handlers for other events", () => {
      const bridge = connectBridge(bus);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Monkey-patch updateClock to throw, simulating a store failure
      const original = useGameStore.getState().updateClock;
      useGameStore.setState({
        updateClock: () => {
          throw new Error("store action blew up");
        },
      });

      // Emit clock-tick (hits the broken handler) via safeEmit —
      // the bridge registered its handler via bus.on(), and the game
      // scene calls safeEmit, which isolates each listener in try/catch.
      safeEmit(bus, "clock-tick", {
        phase: "day",
        dayNumber: 1,
        timeRemainingInPhase: 200,
        phaseDuration: 300,
        elapsedTotal: 100,
      });

      // Now emit player-health-changed — should still work
      safeEmit(bus, "player-health-changed", {
        current: 60,
        max: 100,
        delta: -40,
      });

      expect(usePlayerStore.getState().health).toBe(60);
      expect(errorSpy).toHaveBeenCalled();

      // Restore and clean up
      useGameStore.setState({ updateClock: original });
      errorSpy.mockRestore();
      bridge.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // Round-trip integration
  // -------------------------------------------------------------------------

  describe("round-trip", () => {
    it("game event → store update → verifiable state", () => {
      const bridge = connectBridge(bus);

      // Simulate a full game tick sequence
      safeEmit(bus, "clock-tick", {
        phase: "day",
        dayNumber: 1,
        timeRemainingInPhase: 250,
        phaseDuration: 300,
        elapsedTotal: 50,
      });

      safeEmit(bus, "player-health-changed", {
        current: 85,
        max: 100,
        delta: -15,
      });

      safeEmit(bus, "item-picked-up", {
        itemType: "wood",
        quantity: 3,
      });

      // Verify all stores updated correctly
      expect(useGameStore.getState().timeRemainingInPhase).toBe(250);
      expect(usePlayerStore.getState().health).toBe(85);
      expect(useUIStore.getState().notifications).toHaveLength(1);

      bridge.disconnect();
    });
  });
});
