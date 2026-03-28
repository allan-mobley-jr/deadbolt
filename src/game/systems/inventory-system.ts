/**
 * Inventory system — processes quick-select input and maintains
 * inventory state consistency.
 *
 * Runs each fixed tick after InputSystem, before InteractionSystem.
 * Reads quick-select key presses from InputState and updates the
 * active slot on the player entity's inventory.
 *
 * NO React imports — this is pure game-side TypeScript.
 */

import type { SceneContext } from "./scene-context";
import type { SystemFn } from "./system-runner";
import { inventoryEntities } from "@/game/ecs/queries";
import { safeEmit } from "@/game/events/event-bus";
import { getActiveItem, QUICK_SELECT_COUNT } from "./inventory-utils";

// ---------------------------------------------------------------------------
// System factory
// ---------------------------------------------------------------------------

/**
 * Create the inventory system.
 *
 * Responsibilities:
 * 1. Process quick-select key presses (number keys 1-5)
 * 2. Emit active-slot-changed events for UI bridging
 */
export function createInventorySystem(ctx: SceneContext): SystemFn {
  return (_dt: number): void => {
    const player = inventoryEntities.entities[0];
    if (!player) return;

    const inv = player.inventory;
    const { quickSelectPressed } = ctx.inputState;

    // --- Quick-select key handling ---
    if (
      quickSelectPressed >= 0 &&
      quickSelectPressed < QUICK_SELECT_COUNT
    ) {
      inv.activeSlot = quickSelectPressed;

      safeEmit(ctx.eventBus, "active-slot-changed", {
        activeSlot: inv.activeSlot,
        itemType: getActiveItem(inv),
      });
    }
  };
}
