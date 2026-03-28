import { describe, it, expect } from "vitest";
import {
  INVENTORY_SIZE,
  QUICK_SELECT_COUNT,
  createEmptyInventory,
  canAddItem,
  addItem,
  removeItem,
  removeItemByType,
  swapItems,
  getActiveItem,
  recomputeCarryWeight,
  buildEventSlots,
} from "./inventory-utils";

// ---------------------------------------------------------------------------
// createEmptyInventory
// ---------------------------------------------------------------------------

describe("createEmptyInventory", () => {
  it("creates an inventory with INVENTORY_SIZE null slots", () => {
    const inv = createEmptyInventory(50);
    expect(inv.slots).toHaveLength(INVENTORY_SIZE);
    expect(inv.slots.every((s) => s === null)).toBe(true);
  });

  it("sets activeSlot to -1", () => {
    const inv = createEmptyInventory(50);
    expect(inv.activeSlot).toBe(-1);
  });

  it("sets carryWeight to 0", () => {
    const inv = createEmptyInventory(50);
    expect(inv.carryWeight).toBe(0);
  });

  it("sets maxCarryWeight from argument", () => {
    const inv = createEmptyInventory(75);
    expect(inv.maxCarryWeight).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// canAddItem
// ---------------------------------------------------------------------------

describe("canAddItem", () => {
  it("returns true for a small item in an empty inventory", () => {
    const inv = createEmptyInventory(50);
    expect(canAddItem(inv, "wooden_plank")).toBe(true);
  });

  it("returns true for a medium item in an empty inventory", () => {
    const inv = createEmptyInventory(50);
    expect(canAddItem(inv, "car_battery")).toBe(true);
  });

  it("returns false for a large (immovable) item", () => {
    const inv = createEmptyInventory(50);
    expect(canAddItem(inv, "bookshelf")).toBe(false);
  });

  it("returns false for an unknown item type", () => {
    const inv = createEmptyInventory(50);
    expect(canAddItem(inv, "nonexistent")).toBe(false);
  });

  it("returns false when all slots are occupied", () => {
    const inv = createEmptyInventory(50);
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      addItem(inv, "wooden_plank");
    }
    expect(canAddItem(inv, "wooden_plank")).toBe(false);
  });

  it("returns false for medium item when no consecutive pair exists", () => {
    const inv = createEmptyInventory(50);
    // Fill alternating slots manually
    for (let i = 0; i < INVENTORY_SIZE; i += 2) {
      inv.slots[i] = {
        objectType: "wooden_plank",
        sizeCategory: "small",
        primary: true,
      };
    }
    expect(canAddItem(inv, "car_battery")).toBe(false);
  });

  it("returns true for medium item when consecutive pair available", () => {
    const inv = createEmptyInventory(50);
    // Fill first slot, leave 1-2 empty
    inv.slots[0] = {
      objectType: "wooden_plank",
      sizeCategory: "small",
      primary: true,
    };
    expect(canAddItem(inv, "car_battery")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// addItem
// ---------------------------------------------------------------------------

describe("addItem", () => {
  it("adds a small item to the first slot", () => {
    const inv = createEmptyInventory(50);
    const result = addItem(inv, "wooden_plank");

    expect(result).toBe(true);
    expect(inv.slots[0]).toEqual(
      expect.objectContaining({
        objectType: "wooden_plank",
        sizeCategory: "small",
        primary: true,
      }),
    );
  });

  it("adds a medium item across two consecutive slots", () => {
    const inv = createEmptyInventory(50);
    const result = addItem(inv, "car_battery");

    expect(result).toBe(true);
    expect(inv.slots[0]).toEqual(
      expect.objectContaining({
        objectType: "car_battery",
        sizeCategory: "medium",
        primary: true,
      }),
    );
    expect(inv.slots[1]).toEqual(
      expect.objectContaining({
        objectType: "car_battery",
        sizeCategory: "medium",
        primary: false,
      }),
    );
  });

  it("fills slots sequentially", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "wooden_plank");
    addItem(inv, "gas_can");

    expect(inv.slots[0]?.objectType).toBe("wooden_plank");
    expect(inv.slots[1]?.objectType).toBe("gas_can");
  });

  it("increases carry weight by item mass", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "wooden_plank"); // 3 kg
    expect(inv.carryWeight).toBeCloseTo(3);

    addItem(inv, "car_battery"); // 15 kg
    expect(inv.carryWeight).toBeCloseTo(18);
  });

  it("returns false for large items", () => {
    const inv = createEmptyInventory(50);
    expect(addItem(inv, "bookshelf")).toBe(false);
    expect(inv.slots.every((s) => s === null)).toBe(true);
  });

  it("returns false for unknown items", () => {
    const inv = createEmptyInventory(50);
    expect(addItem(inv, "nonexistent")).toBe(false);
  });

  it("returns false when inventory is full", () => {
    const inv = createEmptyInventory(500); // High capacity to avoid weight limit
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      addItem(inv, "wooden_plank");
    }
    expect(addItem(inv, "wooden_plank")).toBe(false);
  });

  it("finds consecutive gap for medium item between occupied slots", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "wooden_plank"); // slot 0
    addItem(inv, "gas_can"); // slot 1
    addItem(inv, "wire_spool"); // slot 2

    // Remove middle two to create a gap
    removeItem(inv, 1);
    removeItem(inv, 2);
    // slots: [plank, null, null, ...]

    addItem(inv, "car_battery"); // medium, needs 2 consecutive
    expect(inv.slots[1]?.objectType).toBe("car_battery");
    expect(inv.slots[1]?.primary).toBe(true);
    expect(inv.slots[2]?.objectType).toBe("car_battery");
    expect(inv.slots[2]?.primary).toBe(false);
  });

  it("fills gap after removal", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "wooden_plank");
    addItem(inv, "gas_can");
    addItem(inv, "wire_spool");

    // Remove the middle item
    removeItem(inv, 1);
    expect(inv.slots[1]).toBeNull();

    // New item should fill the gap
    addItem(inv, "cardboard_box");
    expect(inv.slots[1]?.objectType).toBe("cardboard_box");
  });
});

// ---------------------------------------------------------------------------
// removeItem
// ---------------------------------------------------------------------------

describe("removeItem", () => {
  it("removes a small item and returns its type", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "wooden_plank");

    const result = removeItem(inv, 0);
    expect(result).toBe("wooden_plank");
    expect(inv.slots[0]).toBeNull();
  });

  it("removes both slots of a medium item when given primary slot", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "car_battery");

    const result = removeItem(inv, 0);
    expect(result).toBe("car_battery");
    expect(inv.slots[0]).toBeNull();
    expect(inv.slots[1]).toBeNull();
  });

  it("removes both slots of a medium item when given continuation slot", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "car_battery");

    const result = removeItem(inv, 1);
    expect(result).toBe("car_battery");
    expect(inv.slots[0]).toBeNull();
    expect(inv.slots[1]).toBeNull();
  });

  it("decreases carry weight by item mass", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "wooden_plank"); // 3 kg
    expect(inv.carryWeight).toBeCloseTo(3);

    removeItem(inv, 0);
    expect(inv.carryWeight).toBeCloseTo(0);
  });

  it("returns null for an empty slot", () => {
    const inv = createEmptyInventory(50);
    expect(removeItem(inv, 0)).toBeNull();
  });

  it("returns null for out-of-bounds index", () => {
    const inv = createEmptyInventory(50);
    expect(removeItem(inv, -1)).toBeNull();
    expect(removeItem(inv, INVENTORY_SIZE)).toBeNull();
  });

  it("does not affect other items", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "wooden_plank");
    addItem(inv, "gas_can");

    removeItem(inv, 0);
    expect(inv.slots[0]).toBeNull();
    expect(inv.slots[1]?.objectType).toBe("gas_can");
  });
});

// ---------------------------------------------------------------------------
// removeItemByType
// ---------------------------------------------------------------------------

describe("removeItemByType", () => {
  it("removes the first occurrence of the given type", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "wooden_plank");
    addItem(inv, "gas_can");
    addItem(inv, "wooden_plank");

    const result = removeItemByType(inv, "wooden_plank");
    expect(result).toBe(true);
    expect(inv.slots[0]).toBeNull(); // First plank removed
    expect(inv.slots[2]?.objectType).toBe("wooden_plank"); // Second remains
  });

  it("returns false when type not found", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "wooden_plank");
    expect(removeItemByType(inv, "gas_can")).toBe(false);
  });

  it("removes medium item by type", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "car_battery");

    expect(removeItemByType(inv, "car_battery")).toBe(true);
    expect(inv.slots[0]).toBeNull();
    expect(inv.slots[1]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// swapItems
// ---------------------------------------------------------------------------

describe("swapItems", () => {
  it("swaps two small items", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "wooden_plank");
    addItem(inv, "gas_can");

    const result = swapItems(inv, 0, 1);
    expect(result).toBe(true);
    expect(inv.slots[0]?.objectType).toBe("gas_can");
    expect(inv.slots[1]?.objectType).toBe("wooden_plank");
  });

  it("returns true for same-index swap (no-op)", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "wooden_plank");
    expect(swapItems(inv, 0, 0)).toBe(true);
  });

  it("returns true for two empty slots (no-op)", () => {
    const inv = createEmptyInventory(50);
    expect(swapItems(inv, 0, 1)).toBe(true);
  });

  it("swaps item with empty slot", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "wooden_plank");

    const result = swapItems(inv, 0, 3);
    expect(result).toBe(true);
    expect(inv.slots[0]).toBeNull();
    expect(inv.slots[3]?.objectType).toBe("wooden_plank");
  });

  it("returns false for out-of-bounds", () => {
    const inv = createEmptyInventory(50);
    expect(swapItems(inv, -1, 0)).toBe(false);
    expect(swapItems(inv, 0, INVENTORY_SIZE)).toBe(false);
  });

  it("does not change carry weight", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "wooden_plank");
    addItem(inv, "gas_can");
    const weight = inv.carryWeight;

    swapItems(inv, 0, 1);
    expect(inv.carryWeight).toBeCloseTo(weight);
  });

  it("swaps a medium item with a small item", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "car_battery"); // slots 0-1 (medium)
    addItem(inv, "wooden_plank"); // slot 2 (small)

    const result = swapItems(inv, 0, 2);
    expect(result).toBe(true);
    expect(inv.slots[2]?.objectType).toBe("car_battery");
    expect(inv.slots[2]?.primary).toBe(true);
    expect(inv.slots[3]?.objectType).toBe("car_battery");
    expect(inv.slots[3]?.primary).toBe(false);
    expect(inv.slots[0]?.objectType).toBe("wooden_plank");
    expect(inv.slots[0]?.primary).toBe(true);
    expect(inv.slots[1]).toBeNull();
  });

  it("swaps two medium items", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "car_battery"); // slots 0-1
    addItem(inv, "metal_sheet"); // slots 2-3

    const result = swapItems(inv, 0, 2);
    expect(result).toBe(true);
    expect(inv.slots[0]?.objectType).toBe("metal_sheet");
    expect(inv.slots[1]?.objectType).toBe("metal_sheet");
    expect(inv.slots[2]?.objectType).toBe("car_battery");
    expect(inv.slots[3]?.objectType).toBe("car_battery");
  });

  it("returns false when medium item would overflow end of array", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "wooden_plank"); // slot 0
    // Try to swap small item at 0 with empty slot at 7 —
    // the small item can go to 7, but medium cannot go to 7 (overflow at 8)
    inv.slots[0] = null;
    inv.carryWeight = 0;
    addItem(inv, "car_battery"); // slots 0-1 (medium)

    // Swap medium at 0 to slot 7 — would need slots 7-8 but only 0-7 exist
    const result = swapItems(inv, 0, 7);
    expect(result).toBe(false);
    // Original positions preserved
    expect(inv.slots[0]).toEqual(
      expect.objectContaining({ objectType: "car_battery", primary: true }),
    );
    expect(inv.slots[1]).toEqual(
      expect.objectContaining({ objectType: "car_battery", primary: false }),
    );
  });
});

// ---------------------------------------------------------------------------
// getActiveItem
// ---------------------------------------------------------------------------

describe("getActiveItem", () => {
  it("returns null when activeSlot is -1", () => {
    const inv = createEmptyInventory(50);
    expect(getActiveItem(inv)).toBeNull();
  });

  it("returns null when active slot is empty", () => {
    const inv = createEmptyInventory(50);
    inv.activeSlot = 0;
    expect(getActiveItem(inv)).toBeNull();
  });

  it("returns the item type when active slot is occupied", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "wooden_plank");
    inv.activeSlot = 0;
    expect(getActiveItem(inv)).toBe("wooden_plank");
  });

  it("returns null when pointing at a continuation slot", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "car_battery");
    inv.activeSlot = 1; // continuation slot
    expect(getActiveItem(inv)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// recomputeCarryWeight
// ---------------------------------------------------------------------------

describe("recomputeCarryWeight", () => {
  it("returns 0 for empty inventory", () => {
    const inv = createEmptyInventory(50);
    expect(recomputeCarryWeight(inv)).toBe(0);
  });

  it("sums masses of all primary slots", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "wooden_plank"); // 3 kg
    addItem(inv, "gas_can"); // 3 kg
    expect(recomputeCarryWeight(inv)).toBeCloseTo(6);
  });

  it("counts medium items once (only primary slot)", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "car_battery"); // 15 kg, 2 slots
    expect(recomputeCarryWeight(inv)).toBeCloseTo(15);
  });
});

// ---------------------------------------------------------------------------
// buildEventSlots
// ---------------------------------------------------------------------------

describe("buildEventSlots", () => {
  it("returns empty array for empty inventory", () => {
    const inv = createEmptyInventory(50);
    expect(buildEventSlots(inv)).toEqual([]);
  });

  it("returns only primary slots", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "wooden_plank");
    addItem(inv, "car_battery"); // medium, spans 2 slots

    const slots = buildEventSlots(inv);
    expect(slots).toHaveLength(2); // plank + battery (primary only)
    expect(slots[0].itemType).toBe("wooden_plank");
    expect(slots[0].slotIndex).toBe(0);
    expect(slots[1].itemType).toBe("car_battery");
    expect(slots[1].slotIndex).toBe(1);
    expect(slots[1].sizeCategory).toBe("medium");
  });

  it("preserves correct slotIndex values after removals create gaps", () => {
    const inv = createEmptyInventory(50);
    addItem(inv, "wooden_plank"); // slot 0
    addItem(inv, "gas_can"); // slot 1
    addItem(inv, "wire_spool"); // slot 2

    removeItem(inv, 1); // Remove gas_can from slot 1

    const slots = buildEventSlots(inv);
    expect(slots).toHaveLength(2);
    expect(slots[0].slotIndex).toBe(0);
    expect(slots[0].itemType).toBe("wooden_plank");
    expect(slots[1].slotIndex).toBe(2);
    expect(slots[1].itemType).toBe("wire_spool");
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("constants", () => {
  it("INVENTORY_SIZE is 8", () => {
    expect(INVENTORY_SIZE).toBe(8);
  });

  it("QUICK_SELECT_COUNT is 5", () => {
    expect(QUICK_SELECT_COUNT).toBe(5);
  });
});
