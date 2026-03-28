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

  it("adds picked up item to player inventory", () => {
    spawnPickupable(ctx, 110, 100, "gas_can");
    const player = world.entities.find((e) => e.playerControlled)!;

    ctx.inputState.interactPressed = true;
    system(DT);

    expect(player.inventory!.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ objectType: "gas_can", quantity: 1 }),
      ]),
    );
  });

  it("stacks items of the same type in inventory", () => {
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    ctx.inputState.interactPressed = true;
    system(DT);

    // Spawn another
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    ctx.inputState.interactPressed = true;
    system(DT);

    const player = world.entities.find((e) => e.playerControlled)!;
    const plankSlot = player.inventory!.items.find(
      (i) => i.objectType === "wooden_plank",
    );
    expect(plankSlot?.quantity).toBe(2);
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

    expect(player.inventory!.items).toHaveLength(0);
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
    expect(player.inventory!.items).toHaveLength(1);

    // Now drop it
    ctx.inputState.interactPressed = false;
    ctx.inputState.aimX = 200;
    ctx.inputState.aimY = 100;
    safeEmit(bus, "cmd:drop-item", { objectType: "wooden_plank" });
    system(DT);

    expect(player.inventory!.items).toHaveLength(0);
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

  it("decrements quantity when dropping one item from a stack", () => {
    // Pick up two planks
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    ctx.inputState.interactPressed = true;
    system(DT);

    spawnPickupable(ctx, 110, 100, "wooden_plank");
    ctx.inputState.interactPressed = true;
    system(DT);

    const player = world.entities.find((e) => e.playerControlled)!;
    expect(player.inventory!.items[0].quantity).toBe(2);

    // Drop one
    ctx.inputState.interactPressed = false;
    safeEmit(bus, "cmd:drop-item", { objectType: "wooden_plank" });
    system(DT);

    // Slot should remain with quantity 1
    expect(player.inventory!.items).toHaveLength(1);
    expect(player.inventory!.items[0].quantity).toBe(1);
    expect(player.inventory!.items[0].objectType).toBe("wooden_plank");
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
    expect(player.inventory!.items).toHaveLength(2);

    // Queue two drops before the next tick
    ctx.inputState.interactPressed = false;
    const droppedHandler = vi.fn();
    bus.on("object-dropped", droppedHandler);

    safeEmit(bus, "cmd:drop-item", { objectType: "wooden_plank" });
    safeEmit(bus, "cmd:drop-item", { objectType: "gas_can" });
    system(DT);

    expect(droppedHandler).toHaveBeenCalledTimes(2);
    expect(player.inventory!.items).toHaveLength(0);
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
    expect(player.inventory!.items).toHaveLength(0);
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

  it("does not decrement inventory when matter.add.rectangle throws during drop", () => {
    // Pick up an item first
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    ctx.inputState.interactPressed = true;
    system(DT);

    const player = world.entities.find((e) => e.playerControlled)!;
    const weightAfterPickup = player.inventory!.carryWeight;
    expect(player.inventory!.items).toHaveLength(1);

    // Make rectangle throw on the next call (the drop)
    const rectFn = ctx.scene.matter.add.rectangle as ReturnType<typeof vi.fn>;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    rectFn.mockImplementationOnce(() => {
      throw new Error("body creation failed");
    });

    ctx.inputState.interactPressed = false;
    safeEmit(bus, "cmd:drop-item", { objectType: "wooden_plank" });
    system(DT);

    // Inventory must be unchanged — item NOT lost
    expect(player.inventory!.items).toHaveLength(1);
    expect(player.inventory!.items[0].objectType).toBe("wooden_plank");
    expect(player.inventory!.items[0].quantity).toBe(1);
    expect(player.inventory!.carryWeight).toBe(weightAfterPickup);
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

// ---------------------------------------------------------------------------
// InteractionSystem — drop with undefined object definition
// ---------------------------------------------------------------------------

describe("InteractionSystem — drop with undefined object definition", () => {
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

  it("skips drop and warns when getObjectDef returns undefined for item type", () => {
    const player = world.entities.find((e) => e.playerControlled)!;
    // Inject a fabricated item type with no definition
    player.inventory!.items.push({ objectType: "ghost_item", quantity: 1 });
    player.inventory!.carryWeight = 5;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const dropHandler = vi.fn();
    bus.on("object-dropped", dropHandler);

    safeEmit(bus, "cmd:drop-item", { objectType: "ghost_item" });
    system(DT);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("ghost_item"),
    );
    // Inventory unchanged — item NOT lost
    expect(player.inventory!.items).toHaveLength(1);
    expect(player.inventory!.carryWeight).toBe(5);
    expect(dropHandler).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("continues processing remaining drops after one has undefined def", () => {
    // Pick up a real item
    spawnPickupable(ctx, 110, 100, "wooden_plank");
    ctx.inputState.interactPressed = true;
    system(DT);

    const player = world.entities.find((e) => e.playerControlled)!;
    // Also inject a ghost item
    player.inventory!.items.push({ objectType: "ghost_item", quantity: 1 });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const dropHandler = vi.fn();
    bus.on("object-dropped", dropHandler);

    // pendingDrops uses pop() (LIFO), so push ghost_item first, plank second
    // plank will be processed first (last pushed, first popped)
    ctx.inputState.interactPressed = false;
    safeEmit(bus, "cmd:drop-item", { objectType: "ghost_item" });
    safeEmit(bus, "cmd:drop-item", { objectType: "wooden_plank" });
    system(DT);

    // Plank should have been dropped successfully
    expect(dropHandler).toHaveBeenCalledOnce();
    expect(dropHandler).toHaveBeenCalledWith(
      expect.objectContaining({ objectType: "wooden_plank" }),
    );
    // Ghost item should still be in inventory, plank should be gone
    expect(player.inventory!.items).toHaveLength(1);
    expect(player.inventory!.items[0].objectType).toBe("ghost_item");
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
