/**
 * Pure utility functions for slot-based inventory management.
 *
 * All functions mutate the Inventory component in place (standard ECS
 * pattern) and return a boolean or value indicating the operation result.
 * This module has ZERO React imports.
 */

import type { Inventory, InventorySlotData } from "@/game/ecs/components";
import { getObjectDef, getSizeSlots } from "@/game/procgen/object-defs";
import type { InventorySlot } from "@/game/events/event-bus";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Total number of inventory slots. */
export const INVENTORY_SIZE = 8;

/** Number of slots bound to quick-select keys (1-5). */
export const QUICK_SELECT_COUNT = 5;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create an empty inventory with the given max carry weight. */
export function createEmptyInventory(maxCarryWeight: number): Inventory {
  return {
    slots: new Array<InventorySlotData | null>(INVENTORY_SIZE).fill(null),
    activeSlot: -1,
    carryWeight: 0,
    maxCarryWeight,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Check whether an item of the given type can be added to the inventory.
 * Returns false for large items (not carryable) or when no consecutive
 * free slot run of the required size exists.
 */
export function canAddItem(
  inventory: Inventory,
  objectType: string,
): boolean {
  const def = getObjectDef(objectType);
  if (!def) return false;

  if (def.sizeCategory === "large") return false;

  const slotsNeeded = getSizeSlots(def.sizeCategory);
  return findFreeRun(inventory.slots, slotsNeeded) !== -1;
}

/**
 * Return the object type in the active quick-select slot, or null
 * if the slot is empty or activeSlot is -1.
 */
export function getActiveItem(inventory: Inventory): string | null {
  if (inventory.activeSlot < 0) return null;
  const slot = inventory.slots[inventory.activeSlot];
  if (!slot || !slot.primary) return null;
  return slot.objectType;
}

/**
 * Recompute carry weight from slot contents by summing masses from
 * object definitions. Useful for validation and deserialization.
 */
export function recomputeCarryWeight(inventory: Inventory): number {
  let total = 0;
  for (const slot of inventory.slots) {
    if (slot && slot.primary) {
      const def = getObjectDef(slot.objectType);
      if (def) total += def.physics.mass;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Add an item to the first available slot(s). Mutates inventory in place.
 * Returns true on success, false if no space or invalid item.
 */
export function addItem(
  inventory: Inventory,
  objectType: string,
): boolean {
  const def = getObjectDef(objectType);
  if (!def) return false;

  if (def.sizeCategory === "large") return false;

  const slotsNeeded = getSizeSlots(def.sizeCategory);
  const startIndex = findFreeRun(inventory.slots, slotsNeeded);
  if (startIndex === -1) return false;

  // Fill slot(s)
  inventory.slots[startIndex] = {
    objectType,
    sizeCategory: def.sizeCategory,
    primary: true,
  };

  for (let i = 1; i < slotsNeeded; i++) {
    inventory.slots[startIndex + i] = {
      objectType,
      sizeCategory: def.sizeCategory,
      primary: false,
    };
  }

  inventory.carryWeight += def.physics.mass;
  return true;
}

/**
 * Remove the item at the given slot index. If the slot is part of a
 * multi-slot item, all slots for that item are cleared.
 *
 * Returns the objectType that was removed, or null if the slot was empty.
 * Mutates inventory in place.
 */
export function removeItem(
  inventory: Inventory,
  slotIndex: number,
): string | null {
  if (slotIndex < 0 || slotIndex >= inventory.slots.length) return null;

  const slot = inventory.slots[slotIndex];
  if (!slot) return null;

  const { objectType, sizeCategory } = slot;

  // Find the primary slot index
  const primaryIndex = slot.primary
    ? slotIndex
    : findPrimarySlot(inventory.slots, slotIndex, objectType);

  if (primaryIndex === -1) return null;

  // Clear all slots for this item
  const slotsUsed = getSizeSlots(sizeCategory);
  for (let i = 0; i < slotsUsed; i++) {
    inventory.slots[primaryIndex + i] = null;
  }

  // Update carry weight
  const def = getObjectDef(objectType);
  if (def) {
    inventory.carryWeight = Math.max(0, inventory.carryWeight - def.physics.mass);
  }

  return objectType;
}

/**
 * Remove the first occurrence of an item by type.
 * Returns true if an item was removed, false otherwise.
 */
export function removeItemByType(
  inventory: Inventory,
  objectType: string,
): boolean {
  for (let i = 0; i < inventory.slots.length; i++) {
    const slot = inventory.slots[i];
    if (slot && slot.primary && slot.objectType === objectType) {
      return removeItem(inventory, i) !== null;
    }
  }
  return false;
}

/**
 * Swap the items at two slot indices. For multi-slot items, all
 * associated slots move together.
 *
 * Returns true if the swap succeeded, false if invalid (out of bounds,
 * medium item would overflow, etc.).
 */
export function swapItems(
  inventory: Inventory,
  slotA: number,
  slotB: number,
): boolean {
  if (slotA === slotB) return true;
  if (slotA < 0 || slotA >= inventory.slots.length) return false;
  if (slotB < 0 || slotB >= inventory.slots.length) return false;

  // Resolve to primary slots
  const a = resolvePrimary(inventory.slots, slotA);
  const b = resolvePrimary(inventory.slots, slotB);

  // Both empty — nothing to do
  if (a === null && b === null) return true;

  // Extract item data
  const itemA = a !== null ? inventory.slots[a] : null;
  const itemB = b !== null ? inventory.slots[b] : null;

  const slotsA = itemA ? getSizeSlots(itemA.sizeCategory) : 0;
  const slotsB = itemB ? getSizeSlots(itemB.sizeCategory) : 0;

  // Check bounds after swap
  if (itemA && b !== null && b + slotsA > inventory.slots.length) return false;
  if (itemB && a !== null && a + slotsB > inventory.slots.length) return false;

  // For simplicity and correctness with medium items, extract both,
  // clear their slots, then place them in swapped positions.
  // First, clear both items' slots
  if (a !== null && itemA) {
    for (let i = 0; i < slotsA; i++) inventory.slots[a + i] = null;
  }
  if (b !== null && itemB) {
    for (let i = 0; i < slotsB; i++) inventory.slots[b + i] = null;
  }

  // Check that destination slots are free (they should be after clearing,
  // but verify for overlapping ranges)
  const targetA = b ?? slotB; // Where item A goes
  const targetB = a ?? slotA; // Where item B goes

  // Verify no overlap conflicts
  if (itemA) {
    for (let i = 0; i < slotsA; i++) {
      if (inventory.slots[targetA + i] !== null) {
        // Rollback: restore original positions
        restoreItem(inventory.slots, a!, itemA, slotsA);
        if (itemB) restoreItem(inventory.slots, b!, itemB, slotsB);
        return false;
      }
    }
  }
  if (itemB) {
    // Temporarily place itemA to check for conflicts
    if (itemA) restoreItem(inventory.slots, targetA, itemA, slotsA);
    for (let i = 0; i < slotsB; i++) {
      if (inventory.slots[targetB + i] !== null) {
        // Rollback
        if (itemA) {
          for (let j = 0; j < slotsA; j++) inventory.slots[targetA + j] = null;
          restoreItem(inventory.slots, a!, itemA, slotsA);
        }
        if (itemB) restoreItem(inventory.slots, b!, itemB, slotsB);
        return false;
      }
    }
    // Clear the temp placement
    if (itemA) {
      for (let i = 0; i < slotsA; i++) inventory.slots[targetA + i] = null;
    }
  }

  // Place items in swapped positions
  if (itemA) restoreItem(inventory.slots, targetA, itemA, slotsA);
  if (itemB) restoreItem(inventory.slots, targetB, itemB, slotsB);

  return true;
}

// ---------------------------------------------------------------------------
// Event bridge helper
// ---------------------------------------------------------------------------

/**
 * Build an InventorySlot array from the slot-based inventory for
 * the inventory-changed event. Only includes primary slots.
 */
export function buildEventSlots(inventory: Inventory): InventorySlot[] {
  const result: InventorySlot[] = [];
  for (let i = 0; i < inventory.slots.length; i++) {
    const slot = inventory.slots[i];
    if (slot && slot.primary) {
      result.push({
        itemType: slot.objectType,
        slotIndex: i,
        sizeCategory: slot.sizeCategory,
        primary: true,
      });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Find the first run of `count` consecutive null slots.
 * Returns the start index, or -1 if no run is found.
 */
function findFreeRun(
  slots: Array<InventorySlotData | null>,
  count: number,
): number {
  let run = 0;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] === null) {
      run++;
      if (run >= count) return i - count + 1;
    } else {
      run = 0;
    }
  }
  return -1;
}

/**
 * Find the primary slot for a continuation slot by searching backwards.
 */
function findPrimarySlot(
  slots: Array<InventorySlotData | null>,
  fromIndex: number,
  objectType: string,
): number {
  for (let i = fromIndex - 1; i >= 0; i--) {
    const s = slots[i];
    if (s && s.objectType === objectType && s.primary) return i;
    if (!s || s.objectType !== objectType) break;
  }
  return -1;
}

/**
 * Resolve a slot index to the primary slot index for the item at that
 * position. Returns null if the slot is empty.
 */
function resolvePrimary(
  slots: Array<InventorySlotData | null>,
  index: number,
): number | null {
  const slot = slots[index];
  if (!slot) return null;
  if (slot.primary) return index;
  return findPrimarySlot(slots, index, slot.objectType);
}

/** Place an item's slot data starting at a given index. */
function restoreItem(
  slots: Array<InventorySlotData | null>,
  startIndex: number,
  primarySlot: InventorySlotData,
  slotsUsed: number,
): void {
  slots[startIndex] = {
    objectType: primarySlot.objectType,
    sizeCategory: primarySlot.sizeCategory,
    primary: true,
  };
  for (let i = 1; i < slotsUsed; i++) {
    slots[startIndex + i] = {
      objectType: primarySlot.objectType,
      sizeCategory: primarySlot.sizeCategory,
      primary: false,
    };
  }
}
