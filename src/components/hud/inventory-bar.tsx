"use client";

import { usePlayerStore } from "@/stores/usePlayerStore";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import type { InventorySlot } from "@/game/events/event-bus";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of quick-select slots (bound to keys 1-5). */
const QUICK_SELECT_COUNT = 5;

/** Map size category to a placeholder color for the slot icon. */
function slotColor(sizeCategory: string): string {
  switch (sizeCategory) {
    case "small":
      return "bg-emerald-600";
    case "medium":
      return "bg-sky-600";
    case "large":
      return "bg-purple-600";
    default:
      return "bg-zinc-600";
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InventorySlotCell({
  slot,
  index,
  isActive,
}: {
  slot: InventorySlot | null;
  index: number;
  isActive: boolean;
}) {
  const isQuickSelect = index < QUICK_SELECT_COUNT;

  return (
    <div
      className={`relative flex h-10 w-10 items-center justify-center rounded border ${
        isActive
          ? "border-amber-400 ring-1 ring-amber-400/50"
          : "border-zinc-700"
      } bg-zinc-900/80`}
      data-testid={`inventory-slot-${index}`}
    >
      {/* Item placeholder */}
      {slot ? (
        <div
          className={`h-6 w-6 rounded-sm ${slotColor(slot.sizeCategory)} ${
            !slot.primary ? "opacity-40" : ""
          }`}
          title={slot.itemType}
        />
      ) : null}

      {/* Quick-select key number */}
      {isQuickSelect && (
        <span className="absolute -top-0.5 left-0.5 font-mono text-[9px] leading-none text-zinc-500">
          {index + 1}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Inventory bar — bottom-center HUD element showing backpack slots,
 * active slot highlight, and carry weight meter.
 *
 * Slots are keyed by index. The first 5 slots support quick-select (1-5).
 * Items show colored placeholder squares based on size category.
 */
export function InventoryBar() {
  const inventory = usePlayerStore((s) => s.inventory);
  const activeSlot = usePlayerStore((s) => s.activeSlot);
  const carryWeight = usePlayerStore((s) => s.carryWeight);
  const maxCarryWeight = usePlayerStore((s) => s.maxCarryWeight);

  const weightPercent =
    maxCarryWeight > 0 ? (carryWeight / maxCarryWeight) * 100 : 0;
  const isOverweight = weightPercent > 80;

  // Build a fixed-size slot array — inventory may not cover all slots
  // if events haven't fired yet. Default to 8 slots per INVENTORY_SIZE.
  const SLOT_COUNT = 8;
  const slots: Array<InventorySlot | null> = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const found = inventory.find((s) => s.slotIndex === i);
    slots.push(found ?? null);
  }

  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2"
      data-testid="hud-inventory-bar"
    >
      {/* Slot row */}
      <div className="flex gap-1">
        {slots.map((slot, i) => (
          <InventorySlotCell
            key={i}
            slot={slot}
            index={i}
            isActive={i === activeSlot}
          />
        ))}
      </div>

      {/* Weight meter */}
      <div className="mt-1.5 flex items-center gap-2">
        <Progress value={weightPercent}>
          <ProgressTrack className="h-1 w-full bg-zinc-800">
            <ProgressIndicator
              className={`transition-colors duration-300 ${
                isOverweight ? "bg-amber-500" : "bg-zinc-500"
              }`}
            />
          </ProgressTrack>
        </Progress>
        <span
          className={`font-mono text-[10px] whitespace-nowrap ${
            isOverweight ? "text-amber-400" : "text-zinc-500"
          }`}
        >
          {carryWeight.toFixed(1)}/{maxCarryWeight}kg
        </span>
      </div>
    </div>
  );
}
