import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createInteractionSystem,
  computeSpeedMultiplier,
  INTERACTION_RANGE,
  MIN_SPEED_MULTIPLIER,
  DROP_OFFSET,
  DRAG_FORCE,
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

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Minimal Matter.js body-like object for testing. */
function createMockBody(id: number, x = 0, y = 0): MatterJS.BodyType {
  return {
    id,
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
          rectangle: vi.fn((_x: number, _y: number, _w: number, _h: number) => {
            const body = createMockBody(Math.floor(Math.random() * 10000));
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
  const body = createMockBody(Math.floor(Math.random() * 10000) + 100);
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
  const body = createMockBody(Math.floor(Math.random() * 10000) + 100);
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

  it("ignores drop command for item not in inventory", () => {
    const handler = vi.fn();
    bus.on("object-dropped", handler);

    safeEmit(bus, "cmd:drop-item", { objectType: "nonexistent" });
    system(DT);

    expect(handler).not.toHaveBeenCalled();
  });
});
