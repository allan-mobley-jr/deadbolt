import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createInteractionSystem,
  computeSpeedMultiplier,
  INTERACTION_RANGE,
  MIN_SPEED_MULTIPLIER,
  DROP_OFFSET,
} from "./interaction-system";
import { createInputState, createClockState } from "./scene-context";
import type { SceneContext } from "./scene-context";
import { BodyRegistry } from "./body-registry";
import { createGameEventBus, safeEmit } from "@/game/events/event-bus";
import type { GameEventBus } from "@/game/events/event-bus";
import { world, resetWorld } from "@/game/ecs/world";
import { createPlayerEntity, createObjectEntity } from "@/game/ecs/archetypes";
import { ObjectCategory } from "@/types/procgen";
import type { SystemFn } from "./system-runner";
import { addItem, INVENTORY_SIZE } from "./inventory-utils";

const DT = 1 / 60;

/** Deterministic counter for body IDs to avoid non-deterministic collisions. */
let nextBodyId = 100;

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Minimal Matter.js body-like object for testing. */
function createMockBody(id?: number, x = 0, y = 0): MatterJS.BodyType {
  const bodyId = id ?? nextBodyId++;
  return {
    id: bodyId,
    position: { x, y },
    velocity: { x: 0, y: 0 },
    force: { x: 0, y: 0 },
    speed: 0,
    angularVelocity: 0,
    inertia: Infinity,
    inverseInertia: 0,
  } as unknown as MatterJS.BodyType;
}

function createMockContext(bus?: GameEventBus): SceneContext {
  const bodyRegistry = new BodyRegistry();
  return {
    scene: {
      matter: {
        world: {
          remove: vi.fn(),
        },
        add: {
          rectangle: vi.fn(() => {
            const body = createMockBody();
            bodyRegistry.register(body);
            return body;
          }),
        },
      },
      input: {
        keyboard: null,
        activePointer: null,
      },
      cameras: { main: null },
    } as unknown as Phaser.Scene,
    bodyRegistry,
    inputState: createInputState(),
    getAlpha: () => 0,
    clockState: createClockState(),
    eventBus: bus ?? createGameEventBus(),
  };
}

/** Spawn a pickupable object entity at a given position. */
function spawnPickupable(
  ctx: SceneContext,
  x: number,
  y: number,
  objectType = "wooden_plank",
) {
  const body = createMockBody();
  ctx.bodyRegistry.register(body);
  return createObjectEntity(
    x,
    y,
    body.id,
    objectType,
    ObjectCategory.Loot,
    false,
    { durability: 0.3, flammability: 0.9, conductivity: 0 },
    3,
  );
}

/** Spawn an immovable object entity at a given position. */
function spawnImmovable(
  ctx: SceneContext,
  x: number,
  y: number,
  objectType = "bookshelf",
) {
  const body = createMockBody();
  ctx.bodyRegistry.register(body);
  return createObjectEntity(
    x,
    y,
    body.id,
    objectType,
    ObjectCategory.Furniture,
    true,
    { durability: 0.5, flammability: 0.9, conductivity: 0 },
    1,
  );
}

/** Count occupied primary slots in an inventory. */
function countItems(
  slots: Array<{ primary: boolean } | null>,
): number {
  return slots.filter((s) => s !== null && s.primary).length;
}

// ---------------------------------------------------------------------------
// computeSpeedMultiplier — pure function tests
// ---------------------------------------------------------------------------

describe("computeSpeedMultiplier", () => {
  it("returns 1.0 when carry weight is zero", () => {
    expect(computeSpeedMultiplier(0, 50)).toBe(1);
  });

  it("returns MIN_SPEED_MULTIPLIER when at max weight", () => {
    expect(computeSpeedMultiplier(50, 50)).toBeCloseTo(MIN_SPEED_MULTIPLIER);
  });

  it("returns value between MIN and 1.0 for partial weight", () => {
    const result = computeSpeedMultiplier(25, 50);
    expect(result).toBeGreaterThan(MIN_SPEED_MULTIPLIER);
    expect(result).toBeLessThan(1);
  });

  it("clamps to MIN_SPEED_MULTIPLIER when overweight", () => {
    expect(computeSpeedMultiplier(100, 50)).toBeCloseTo(MIN_SPEED_MULTIPLIER);
  });

  it("returns 1.0 when maxCarryWeight is zero", () => {
    expect(computeSpeedMultiplier(10, 0)).toBe(1);
  });

  it("scales linearly between 1.0 and MIN_SPEED_MULTIPLIER", () => {
    const half = computeSpeedMultiplier(25, 50);
    const expected = 1 - 0.5 * (1 - MIN_SPEED_MULTIPLIER);
    expect(half).toBeCloseTo(expected);
  });
});

// ---------------------------------------------------------------------------
// InteractionSystem — proximity detection
// ---------------------------------------------------------------------------

describe("InteractionSystem — proximity", () => {
  let ctx: SceneContext;
  let system: SystemFn;

  beforeEach(() => {
    ctx = createMockContext();
    system = createInteractionSystem(ctx);
    createPlayerEntity(100, 100, 1);
  });

  afterEach(() => {
    resetWorld();
  });

  it("highlights an object within INTERACTION_RANGE", () => {
    const obj = spawnPickupable(ctx, 100 + INTERACTION_RANGE - 1, 100);
    system(DT);
    expect(obj.interactable.highlighted).toBe(true);
  });

  it("does not highlight an object outside INTERACTION_RANGE", () => {
    const obj = spawnPickupable(ctx, 100 + INTERACTION_RANGE + 10, 100);
    system(DT);
    expect(obj.interactable.highlighted).toBe(false);
  });

  it("highlights only the nearest object when multiple are in range", () => {
    const near = spawnPickupable(ctx, 110, 100, "wooden_plank");
    const far = spawnPickupable(ctx, 140, 100, "metal_sheet");
    system(DT);
    expect(near.interactable.highlighted).toBe(true);
    expect(far.interactable.highlighted).toBe(false);
  });

  it("emits interaction-prompt when an object enters range", () => {
    const handler = vi.fn();
    ctx.eventBus.on("interaction-prompt", handler);

    spawnPickupable(ctx, 110, 100);
    system(DT);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        objectType: "wooden_plank",
        interactionType: "pickup",
        immovable: false,
      }),
    );
  });

  it("emits interaction-prompt-clear when player moves out of range", () => {
    const clearHandler = vi.fn();
    ctx.eventBus.on("interaction-prompt-clear", clearHandler);

    spawnPickupable(ctx, 110, 100);
    system(DT); // Object in range

    // Move player far away
    const player = world.entities.find((e) => e.playerControlled)!;
    player.position!.x = 1000;
    system(DT);

    expect(clearHandler).toHaveBeenCalledOnce();
  });

  it("does not re-emit prompt for the same entity on consecutive ticks", () => {
    const handler = vi.fn();
    ctx.eventBus.on("interaction-prompt", handler);

    spawnPickupable(ctx, 110, 100);
    system(DT);
    system(DT);
    system(DT);

    expect(handler).toHaveBeenCalledOnce();
  });

  it("does nothing when there is no player entity", () => {
    resetWorld(); // Remove all entities
    const handler = vi.fn();
    ctx.eventBus.on("interaction-prompt", handler);

    spawnPickupable(ctx, 110, 100);
    system(DT);

    expect(handler).not.toHaveBeenCalled();
  });

  it("emits new prompt when nearest object changes", () => {
    const handler = vi.fn();
    ctx.eventBus.on("interaction-prompt", handler);

    const farObj = spawnPickupable(ctx, 140, 100, "metal_sheet");
    const nearObj = spawnPickupable(ctx, 110, 100, "wooden_plank");

    system(DT);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ objectType: "wooden_plank" }),
    );

    // Move player closer to the far object
    const player = world.entities.find((e) => e.playerControlled)!;
    player.position!.x = 135;
    system(DT);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith(
      expect.objectContaining({ objectType: "metal_sheet" }),
    );
  });
});

// ---------------------------------------------------------------------------
// InteractionSystem — pickup
// ---------------------------------------------------------------------------

describe("InteractionSystem — pickup", () => {
  let ctx: SceneContext;
  let system: SystemFn;

  beforeEach(() => {
    ctx = createMockContext();
    system = createInteractionSystem(ctx);
    createPlayerEntity(100, 100, 1);
  });

  afterEach(() => {
    resetWorld();
  });

  it("picks up a nearby object when E is pressed", () => {
    const obj = spawnPickupable(ctx, 110, 100);
    const pickupHandler = vi.fn();
    ctx.eventBus.on("item-picked-up", pickupHandler);

    ctx.inputState.interactPressed = true;
    system(DT);

    // Entity should be removed from world
    expect(world.entities).not.toContain(obj);

    // Event should be emitted
    expect(pickupHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        itemType: "wooden_plank",
        quantity: 1,
      }),
    );
  });

  it("adds picked up item to a player inventory slot", () => {
    spawnPickupable(ctx, 110, 100, "gas_can");
    const player = world.entities.find((e) => e.playerControlled)!;

    ctx.inputState.interactPressed = true;
    system(DT);

    // First slot should contain the item
    expect(player.inventory!.slots[0]).toEqual(
      expect.objectContaining({ objectType: "gas_can", primary: true }),
    );
  });

  it("places each pickup in separate slots (no stacking)", () => {
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    ctx.inputState.interactPressed = true;
    system(DT);

    // Spawn another
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    ctx.inputState.interactPressed = true;
    system(DT);

    const player = world.entities.find((e) => e.playerControlled)!;
    // Both items should occupy separate slots
    expect(player.inventory!.slots[0]?.objectType).toBe("wooden_plank");
    expect(player.inventory!.slots[1]?.objectType).toBe("wooden_plank");
    expect(countItems(player.inventory!.slots)).toBe(2);
  });

  it("places medium items across two consecutive slots", () => {
    // car_battery is medium (2 slots)
    spawnPickupable(ctx, 110, 100, "car_battery");
    const player = world.entities.find((e) => e.playerControlled)!;

    ctx.inputState.interactPressed = true;
    system(DT);

    expect(player.inventory!.slots[0]).toEqual(
      expect.objectContaining({
        objectType: "car_battery",
        sizeCategory: "medium",
        primary: true,
      }),
    );
    expect(player.inventory!.slots[1]).toEqual(
      expect.objectContaining({
        objectType: "car_battery",
        sizeCategory: "medium",
        primary: false,
      }),
    );
  });

  it("increases carry weight after pickup", () => {
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    const player = world.entities.find((e) => e.playerControlled)!;
    const weightBefore = player.inventory!.carryWeight;

    ctx.inputState.interactPressed = true;
    system(DT);

    expect(player.inventory!.carryWeight).toBeGreaterThan(weightBefore);
  });

  it("emits inventory-changed after pickup", () => {
    const handler = vi.fn();
    ctx.eventBus.on("inventory-changed", handler);

    spawnPickupable(ctx, 110, 100);
    ctx.inputState.interactPressed = true;
    system(DT);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        slots: expect.arrayContaining([
          expect.objectContaining({ itemType: "wooden_plank" }),
        ]),
      }),
    );
  });

  it("unregisters physics body on pickup", () => {
    const obj = spawnPickupable(ctx, 110, 100);
    const bodyId = obj.physicsBody.bodyId;

    ctx.inputState.interactPressed = true;
    system(DT);

    expect(ctx.bodyRegistry.get(bodyId)).toBeUndefined();
  });

  it("clears interaction prompt after pickup", () => {
    const clearHandler = vi.fn();
    ctx.eventBus.on("interaction-prompt-clear", clearHandler);

    spawnPickupable(ctx, 110, 100);
    ctx.inputState.interactPressed = true;
    system(DT);

    expect(clearHandler).toHaveBeenCalled();
  });

  it("does not pick up when E is not pressed", () => {
    const obj = spawnPickupable(ctx, 110, 100);
    system(DT);

    expect(world.entities).toContain(obj);
  });

  it("does not pick up when no object is in range", () => {
    spawnPickupable(ctx, 1000, 1000);
    const player = world.entities.find((e) => e.playerControlled)!;

    ctx.inputState.interactPressed = true;
    system(DT);

    expect(countItems(player.inventory!.slots)).toBe(0);
  });

  it("calls Matter.world.remove with the correct body on pickup", () => {
    const obj = spawnPickupable(ctx, 110, 100);
    const body = ctx.bodyRegistry.get(obj.physicsBody.bodyId)!;
    const removeFn = ctx.scene.matter.world.remove as ReturnType<typeof vi.fn>;

    ctx.inputState.interactPressed = true;
    system(DT);

    expect(removeFn).toHaveBeenCalledOnce();
    expect(removeFn).toHaveBeenCalledWith(body);
  });
});

// ---------------------------------------------------------------------------
// InteractionSystem — inventory full
// ---------------------------------------------------------------------------

describe("InteractionSystem — inventory full", () => {
  let ctx: SceneContext;
  let system: SystemFn;

  beforeEach(() => {
    ctx = createMockContext();
    system = createInteractionSystem(ctx);
    createPlayerEntity(100, 100, 1);
  });

  afterEach(() => {
    resetWorld();
  });

  it("emits inventory-full when pickup fails due to no available slots", () => {
    const player = world.entities.find((e) => e.playerControlled)!;
    const inv = player.inventory!;
    // Fill all slots
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      addItem(inv, "wooden_plank");
    }

    const fullHandler = vi.fn();
    ctx.eventBus.on("inventory-full", fullHandler);

    const obj = spawnPickupable(ctx, 110, 100, "gas_can");
    ctx.inputState.interactPressed = true;
    system(DT);

    expect(fullHandler).toHaveBeenCalledOnce();
    expect(fullHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptedItemType: "gas_can",
      }),
    );
    // Entity should remain in world
    expect(world.entities).toContain(obj);
  });

  it("does not remove entity from world when inventory is full", () => {
    const player = world.entities.find((e) => e.playerControlled)!;
    const inv = player.inventory!;
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      addItem(inv, "wooden_plank");
    }

    const obj = spawnPickupable(ctx, 110, 100, "gas_can");
    ctx.inputState.interactPressed = true;
    system(DT);

    expect(world.entities).toContain(obj);
  });

  it("emits inventory-full for medium item when not enough consecutive slots", () => {
    const player = world.entities.find((e) => e.playerControlled)!;
    const inv = player.inventory!;
    // Fill slots in alternating pattern: occupied, empty, occupied, empty...
    // This leaves single empty slots but no consecutive pair for medium items
    for (let i = 0; i < INVENTORY_SIZE; i += 2) {
      addItem(inv, "wooden_plank");
    }
    // Now slots: [plank, null, plank, null, plank, null, plank, null]
    // Actually addItem fills first available, so:
    // slots 0-3 are filled, 4-7 empty. Let's fill differently.
    // Reset and fill alternating manually
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      inv.slots[i] = null;
    }
    inv.carryWeight = 0;
    // Fill even slots
    for (let i = 0; i < INVENTORY_SIZE; i += 2) {
      inv.slots[i] = {
        objectType: "wooden_plank",
        sizeCategory: "small",
        primary: true,
      };
    }
    inv.carryWeight = 12; // 4 planks * 3kg

    const fullHandler = vi.fn();
    ctx.eventBus.on("inventory-full", fullHandler);

    // Try to pick up a medium item (needs 2 consecutive slots)
    spawnPickupable(ctx, 110, 100, "car_battery");
    ctx.inputState.interactPressed = true;
    system(DT);

    expect(fullHandler).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// InteractionSystem — immovable objects (examine + push/drag)
// ---------------------------------------------------------------------------

describe("InteractionSystem — immovable objects", () => {
  let ctx: SceneContext;
  let system: SystemFn;

  beforeEach(() => {
    ctx = createMockContext();
    system = createInteractionSystem(ctx);
    createPlayerEntity(100, 100, 1);
  });

  afterEach(() => {
    resetWorld();
  });

  it("cannot pick up immovable objects", () => {
    const obj = spawnImmovable(ctx, 110, 100);

    ctx.inputState.interactPressed = true;
    system(DT);

    // Entity should still exist
    expect(world.entities).toContain(obj);
  });

  it("emits object-examined for immovable objects on E key", () => {
    const handler = vi.fn();
    ctx.eventBus.on("object-examined", handler);

    spawnImmovable(ctx, 110, 100, "bookshelf");
    ctx.inputState.interactPressed = true;
    system(DT);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        objectType: "bookshelf",
        properties: expect.objectContaining({
          immovable: true,
        }),
      }),
    );
  });

  it("applies force to immovable object when pointer is down", () => {
    const obj = spawnImmovable(ctx, 120, 100);
    const body = ctx.bodyRegistry.get(obj.physicsBody.bodyId)!;

    // Player near, pointer pointing to the right of the object
    ctx.inputState.pointerDown = true;
    ctx.inputState.pointerWorldX = 200;
    ctx.inputState.pointerWorldY = 100;

    system(DT);

    // Force should have been applied in the x direction
    expect(body.force.x).toBeGreaterThan(0);
  });

  it("emits noise when dragging an immovable object", () => {
    const handler = vi.fn();
    ctx.eventBus.on("noise-generated", handler);

    spawnImmovable(ctx, 120, 100);
    ctx.inputState.pointerDown = true;
    ctx.inputState.pointerWorldX = 200;
    ctx.inputState.pointerWorldY = 100;

    system(DT);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "drag",
      }),
    );
  });

  it("does not apply force to movable objects via drag", () => {
    const obj = spawnPickupable(ctx, 120, 100);
    const body = ctx.bodyRegistry.get(obj.physicsBody.bodyId)!;

    ctx.inputState.pointerDown = true;
    ctx.inputState.pointerWorldX = 200;
    ctx.inputState.pointerWorldY = 100;

    system(DT);

    // No force should be applied — drag is for immovable only
    expect(body.force.x).toBe(0);
    expect(body.force.y).toBe(0);
  });

  it("does not apply force when pointer overlaps object position", () => {
    const obj = spawnImmovable(ctx, 120, 100);
    const body = ctx.bodyRegistry.get(obj.physicsBody.bodyId)!;

    // Pointer exactly on the object
    ctx.inputState.pointerDown = true;
    ctx.inputState.pointerWorldX = 120;
    ctx.inputState.pointerWorldY = 100;

    system(DT);

    // Force should remain zero (dist <= 1 guard)
    expect(body.force.x).toBe(0);
    expect(body.force.y).toBe(0);
  });

  it("shows push interaction type for immovable objects", () => {
    const handler = vi.fn();
    ctx.eventBus.on("interaction-prompt", handler);

    spawnImmovable(ctx, 120, 100);
    system(DT);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        interactionType: "push",
        immovable: true,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// InteractionSystem — drop
// ---------------------------------------------------------------------------

describe("InteractionSystem — drop", () => {
  let ctx: SceneContext;
  let bus: GameEventBus;
  let system: SystemFn;

  beforeEach(() => {
    bus = createGameEventBus();
    ctx = createMockContext(bus);
    system = createInteractionSystem(ctx);
    createPlayerEntity(100, 100, 1);
  });

  afterEach(() => {
    resetWorld();
  });

  it("drops an item from inventory when cmd:drop-item is received", () => {
    // First pick up an item
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    ctx.inputState.interactPressed = true;
    system(DT);

    const player = world.entities.find((e) => e.playerControlled)!;
    expect(countItems(player.inventory!.slots)).toBe(1);

    // Now drop it
    ctx.inputState.interactPressed = false;
    ctx.inputState.aimX = 200;
    ctx.inputState.aimY = 100;
    safeEmit(bus, "cmd:drop-item", { objectType: "wooden_plank" });
    system(DT);

    expect(countItems(player.inventory!.slots)).toBe(0);
  });

  it("drops an item by slot index", () => {
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    ctx.inputState.interactPressed = true;
    system(DT);

    const player = world.entities.find((e) => e.playerControlled)!;
    expect(player.inventory!.slots[0]).not.toBeNull();

    ctx.inputState.interactPressed = false;
    safeEmit(bus, "cmd:drop-item", { slotIndex: 0 });
    system(DT);

    expect(player.inventory!.slots[0]).toBeNull();
  });

  it("emits object-dropped event", () => {
    const handler = vi.fn();
    bus.on("object-dropped", handler);

    // Pick up and drop
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    ctx.inputState.interactPressed = true;
    system(DT);

    ctx.inputState.interactPressed = false;
    safeEmit(bus, "cmd:drop-item", { objectType: "wooden_plank" });
    system(DT);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        objectType: "wooden_plank",
      }),
    );
  });

  it("spawns a new entity at drop position", () => {
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    ctx.inputState.interactPressed = true;
    system(DT);

    const entitiesBefore = world.entities.length;

    ctx.inputState.interactPressed = false;
    ctx.inputState.aimX = 200;
    ctx.inputState.aimY = 100;
    safeEmit(bus, "cmd:drop-item", { objectType: "wooden_plank" });
    system(DT);

    // Should have one more entity (the dropped object)
    expect(world.entities.length).toBe(entitiesBefore + 1);
  });

  it("decreases carry weight after drop", () => {
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    ctx.inputState.interactPressed = true;
    system(DT);

    const player = world.entities.find((e) => e.playerControlled)!;
    const weightAfterPickup = player.inventory!.carryWeight;

    ctx.inputState.interactPressed = false;
    safeEmit(bus, "cmd:drop-item", { objectType: "wooden_plank" });
    system(DT);

    expect(player.inventory!.carryWeight).toBeLessThan(weightAfterPickup);
    expect(player.inventory!.carryWeight).toBeCloseTo(0);
  });

  it("drops one item and leaves the other when two of the same type exist", () => {
    // Pick up two planks (separate slots, no stacking)
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    ctx.inputState.interactPressed = true;
    system(DT);

    spawnPickupable(ctx, 110, 100, "wooden_plank");
    ctx.inputState.interactPressed = true;
    system(DT);

    const player = world.entities.find((e) => e.playerControlled)!;
    expect(countItems(player.inventory!.slots)).toBe(2);

    // Drop one
    ctx.inputState.interactPressed = false;
    safeEmit(bus, "cmd:drop-item", { objectType: "wooden_plank" });
    system(DT);

    // One item should remain
    expect(countItems(player.inventory!.slots)).toBe(1);
    // The remaining slot should still be wooden_plank
    const remaining = player.inventory!.slots.find(
      (s) => s !== null && s.primary,
    );
    expect(remaining?.objectType).toBe("wooden_plank");
  });

  it("emits inventory-changed after drop", () => {
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    ctx.inputState.interactPressed = true;
    system(DT);

    const handler = vi.fn();
    bus.on("inventory-changed", handler);

    ctx.inputState.interactPressed = false;
    safeEmit(bus, "cmd:drop-item", { objectType: "wooden_plank" });
    system(DT);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        carryWeight: 0,
      }),
    );
  });

  it("ignores drop command for item not in inventory", () => {
    const handler = vi.fn();
    bus.on("object-dropped", handler);

    safeEmit(bus, "cmd:drop-item", { objectType: "nonexistent" });
    system(DT);

    expect(handler).not.toHaveBeenCalled();
  });

  it("drops at player y + DROP_OFFSET when aim overlaps player position", () => {
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    ctx.inputState.interactPressed = true;
    system(DT);

    // Aim exactly at the player position so aimDist <= 1
    ctx.inputState.interactPressed = false;
    ctx.inputState.aimX = 100;
    ctx.inputState.aimY = 100;
    safeEmit(bus, "cmd:drop-item", { objectType: "wooden_plank" });
    system(DT);

    const rectFn = ctx.scene.matter.add.rectangle as ReturnType<typeof vi.fn>;
    // Last call should be the drop call
    const lastCall = rectFn.mock.calls[rectFn.mock.calls.length - 1];
    expect(lastCall[0]).toBe(100); // dropX = px
    expect(lastCall[1]).toBe(100 + DROP_OFFSET); // dropY = py + DROP_OFFSET
  });

  it("processes two queued drops in the same tick", () => {
    // Pick up two different items
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    ctx.inputState.interactPressed = true;
    system(DT);

    spawnPickupable(ctx, 110, 100, "gas_can");
    ctx.inputState.interactPressed = true;
    system(DT);

    const player = world.entities.find((e) => e.playerControlled)!;
    expect(countItems(player.inventory!.slots)).toBe(2);

    // Queue two drops before the next tick
    ctx.inputState.interactPressed = false;
    const droppedHandler = vi.fn();
    bus.on("object-dropped", droppedHandler);

    safeEmit(bus, "cmd:drop-item", { objectType: "wooden_plank" });
    safeEmit(bus, "cmd:drop-item", { objectType: "gas_can" });
    system(DT);

    expect(droppedHandler).toHaveBeenCalledTimes(2);
    expect(countItems(player.inventory!.slots)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// InteractionSystem — pickup failure resilience
// ---------------------------------------------------------------------------

describe("InteractionSystem — pickup failure resilience", () => {
  let ctx: SceneContext;
  let system: SystemFn;

  beforeEach(() => {
    ctx = createMockContext();
    system = createInteractionSystem(ctx);
    createPlayerEntity(100, 100, 1);
  });

  afterEach(() => {
    resetWorld();
  });

  it("does not add item to inventory when Matter.world.remove throws", () => {
    const obj = spawnPickupable(ctx, 110, 100, "wooden_plank");
    const player = world.entities.find((e) => e.playerControlled)!;
    const removeFn = ctx.scene.matter.world.remove as ReturnType<typeof vi.fn>;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    removeFn.mockImplementationOnce(() => {
      throw new Error("physics engine error");
    });

    ctx.inputState.interactPressed = true;
    system(DT);

    // Inventory must NOT contain the item
    expect(countItems(player.inventory!.slots)).toBe(0);
    expect(player.inventory!.carryWeight).toBe(0);
    // Entity should remain in world since removal failed
    expect(world.entities).toContain(obj);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("does not emit item-picked-up when Matter.world.remove throws", () => {
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    const removeFn = ctx.scene.matter.world.remove as ReturnType<typeof vi.fn>;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const pickupHandler = vi.fn();
    ctx.eventBus.on("item-picked-up", pickupHandler);

    removeFn.mockImplementationOnce(() => {
      throw new Error("physics engine error");
    });

    ctx.inputState.interactPressed = true;
    system(DT);

    expect(pickupHandler).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("does not emit inventory-changed when pickup fails", () => {
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    const removeFn = ctx.scene.matter.world.remove as ReturnType<typeof vi.fn>;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invHandler = vi.fn();
    ctx.eventBus.on("inventory-changed", invHandler);

    removeFn.mockImplementationOnce(() => {
      throw new Error("physics engine error");
    });

    ctx.inputState.interactPressed = true;
    system(DT);

    expect(invHandler).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// InteractionSystem — drop failure resilience
// ---------------------------------------------------------------------------

describe("InteractionSystem — drop failure resilience", () => {
  let ctx: SceneContext;
  let bus: GameEventBus;
  let system: SystemFn;

  beforeEach(() => {
    bus = createGameEventBus();
    ctx = createMockContext(bus);
    system = createInteractionSystem(ctx);
    createPlayerEntity(100, 100, 1);
  });

  afterEach(() => {
    resetWorld();
  });

  it("re-adds item to inventory when matter.add.rectangle throws during drop", () => {
    // Pick up an item first
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    ctx.inputState.interactPressed = true;
    system(DT);

    const player = world.entities.find((e) => e.playerControlled)!;
    expect(countItems(player.inventory!.slots)).toBe(1);

    // Make rectangle throw on the next call (the drop)
    const rectFn = ctx.scene.matter.add.rectangle as ReturnType<typeof vi.fn>;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    rectFn.mockImplementationOnce(() => {
      throw new Error("body creation failed");
    });

    ctx.inputState.interactPressed = false;
    safeEmit(bus, "cmd:drop-item", { objectType: "wooden_plank" });
    system(DT);

    // Inventory must still contain the item (re-added after spawn failure)
    expect(countItems(player.inventory!.slots)).toBe(1);
    const slot = player.inventory!.slots.find(
      (s) => s !== null && s.primary,
    );
    expect(slot?.objectType).toBe("wooden_plank");
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("does not emit object-dropped when matter.add.rectangle throws", () => {
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    ctx.inputState.interactPressed = true;
    system(DT);

    const rectFn = ctx.scene.matter.add.rectangle as ReturnType<typeof vi.fn>;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    rectFn.mockImplementationOnce(() => {
      throw new Error("body creation failed");
    });

    const dropHandler = vi.fn();
    bus.on("object-dropped", dropHandler);

    ctx.inputState.interactPressed = false;
    safeEmit(bus, "cmd:drop-item", { objectType: "wooden_plank" });
    system(DT);

    expect(dropHandler).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("does not emit inventory-changed when matter.add.rectangle throws during drop", () => {
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    ctx.inputState.interactPressed = true;
    system(DT);

    const rectFn = ctx.scene.matter.add.rectangle as ReturnType<typeof vi.fn>;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    rectFn.mockImplementationOnce(() => {
      throw new Error("body creation failed");
    });

    const invHandler = vi.fn();
    bus.on("inventory-changed", invHandler);

    ctx.inputState.interactPressed = false;
    safeEmit(bus, "cmd:drop-item", { objectType: "wooden_plank" });
    system(DT);

    expect(invHandler).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
