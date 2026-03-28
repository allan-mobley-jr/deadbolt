import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createInventorySystem } from "./inventory-system";
import { createInputState, createClockState } from "./scene-context";
import type { SceneContext } from "./scene-context";
import { BodyRegistry } from "./body-registry";
import { createGameEventBus } from "@/game/events/event-bus";
import type { GameEventBus } from "@/game/events/event-bus";
import { world, resetWorld } from "@/game/ecs/world";
import { createPlayerEntity } from "@/game/ecs/archetypes";
import { addItem } from "./inventory-utils";
import type { SystemFn } from "./system-runner";

const DT = 1 / 60;

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockContext(bus?: GameEventBus): SceneContext {
  return {
    scene: {
      matter: {
        world: { remove: vi.fn() },
        add: { rectangle: vi.fn() },
      },
      input: { keyboard: null, activePointer: null },
      cameras: { main: null },
    } as unknown as Phaser.Scene,
    bodyRegistry: new BodyRegistry(),
    inputState: createInputState(),
    getAlpha: () => 0,
    clockState: createClockState(),
    eventBus: bus ?? createGameEventBus(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InventorySystem — quick-select", () => {
  let ctx: SceneContext;
  let system: SystemFn;

  beforeEach(() => {
    ctx = createMockContext();
    system = createInventorySystem(ctx);
    createPlayerEntity(100, 100, 1);
  });

  afterEach(() => {
    resetWorld();
  });

  it("sets activeSlot when number key 1 is pressed", () => {
    const player = getPlayer();
    ctx.inputState.quickSelectPressed = 0;
    system(DT);

    expect(player.inventory!.activeSlot).toBe(0);
  });

  it("sets activeSlot when number key 3 is pressed", () => {
    const player = getPlayer();
    ctx.inputState.quickSelectPressed = 2;
    system(DT);

    expect(player.inventory!.activeSlot).toBe(2);
  });

  it("emits active-slot-changed event", () => {
    const handler = vi.fn();
    ctx.eventBus.on("active-slot-changed", handler);

    getPlayer();
    ctx.inputState.quickSelectPressed = 1;
    system(DT);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        activeSlot: 1,
      }),
    );
  });

  it("reports the item in the active slot", () => {
    const handler = vi.fn();
    ctx.eventBus.on("active-slot-changed", handler);

    const player = getPlayer();
    addItem(player.inventory!, "wooden_plank");

    ctx.inputState.quickSelectPressed = 0;
    system(DT);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        activeSlot: 0,
        itemType: "wooden_plank",
      }),
    );
  });

  it("reports null itemType when active slot is empty", () => {
    const handler = vi.fn();
    ctx.eventBus.on("active-slot-changed", handler);

    getPlayer();
    ctx.inputState.quickSelectPressed = 3;
    system(DT);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        activeSlot: 3,
        itemType: null,
      }),
    );
  });

  it("does nothing when no quick-select key is pressed", () => {
    const handler = vi.fn();
    ctx.eventBus.on("active-slot-changed", handler);

    getPlayer();
    ctx.inputState.quickSelectPressed = -1;
    system(DT);

    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores quick-select keys beyond QUICK_SELECT_COUNT", () => {
    const handler = vi.fn();
    ctx.eventBus.on("active-slot-changed", handler);

    getPlayer();
    ctx.inputState.quickSelectPressed = 5; // Only 0-4 valid
    system(DT);

    expect(handler).not.toHaveBeenCalled();
  });

  it("does nothing when no player entity exists", () => {
    resetWorld();
    const handler = vi.fn();
    ctx.eventBus.on("active-slot-changed", handler);

    ctx.inputState.quickSelectPressed = 0;
    system(DT);

    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPlayer() {
  return world.entities.find(
    (e) => e.playerControlled !== undefined,
  )!;
}
