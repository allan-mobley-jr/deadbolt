import { describe, it, expect, beforeEach } from "vitest";
import { usePlayerStore } from "./usePlayerStore";

describe("usePlayerStore", () => {
  beforeEach(() => {
    usePlayerStore.getState().reset();
  });

  it("has correct initial state", () => {
    const state = usePlayerStore.getState();
    expect(state.health).toBe(100);
    expect(state.maxHealth).toBe(100);
    expect(state.alive).toBe(true);
    expect(state.inventory).toEqual([]);
    expect(state.activeSlot).toBe(-1);
    expect(state.carryWeight).toBe(0);
    expect(state.maxCarryWeight).toBe(50);
  });

  describe("updateHealth", () => {
    it("updates health and maxHealth", () => {
      usePlayerStore.getState().updateHealth(75, 100);
      const state = usePlayerStore.getState();
      expect(state.health).toBe(75);
      expect(state.maxHealth).toBe(100);
    });
  });

  describe("updateInventory", () => {
    it("updates inventory slots and weight", () => {
      const slots = [
        { itemType: "wood", slotIndex: 0, sizeCategory: "small" as const, primary: true },
        { itemType: "nails", slotIndex: 1, sizeCategory: "small" as const, primary: true },
      ];
      usePlayerStore.getState().updateInventory(slots, 15, 50);

      const state = usePlayerStore.getState();
      expect(state.inventory).toEqual(slots);
      expect(state.carryWeight).toBe(15);
      expect(state.maxCarryWeight).toBe(50);
    });
  });

  describe("updateActiveSlot", () => {
    it("updates the active slot index", () => {
      usePlayerStore.getState().updateActiveSlot(3);
      expect(usePlayerStore.getState().activeSlot).toBe(3);
    });
  });

  describe("setDead", () => {
    it("marks the player as dead", () => {
      usePlayerStore.getState().setDead();
      expect(usePlayerStore.getState().alive).toBe(false);
    });
  });

  describe("reset", () => {
    it("returns all fields to initial values", () => {
      usePlayerStore.getState().updateHealth(25, 100);
      usePlayerStore.getState().setDead();
      usePlayerStore.getState().updateActiveSlot(2);
      usePlayerStore.getState().updateInventory(
        [{ itemType: "wood", slotIndex: 0, sizeCategory: "small" as const, primary: true }],
        10,
        50,
      );

      usePlayerStore.getState().reset();

      const state = usePlayerStore.getState();
      expect(state.health).toBe(100);
      expect(state.alive).toBe(true);
      expect(state.inventory).toEqual([]);
      expect(state.activeSlot).toBe(-1);
      expect(state.carryWeight).toBe(0);
    });
  });
});
