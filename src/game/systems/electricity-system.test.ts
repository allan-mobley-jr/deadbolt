import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElectricitySystem } from "./electricity-system";
import { MaterialRegistry } from "./material-system";
import { createInputState, createClockState } from "./scene-context";
import type { SceneContext } from "./scene-context";
import { BodyRegistry } from "./body-registry";
import { ConstraintRegistry } from "./constraint-registry";
import { createGameEventBus, type GameEventBus } from "@/game/events/event-bus";
import { world, resetWorld } from "@/game/ecs/world";
import {
  createObjectEntity,
  createZombieEntity,
  createPlayerEntity,
} from "@/game/ecs/archetypes";
import { BRUTE_STATS, BRUTE_HEALTH } from "@/game/systems/zombie-ai-constants";
import { ObjectCategory } from "@/types/procgen";
import { ELECTRICITY } from "./electricity-constants";

const DT = 1 / 60;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let nextBodyId = 2000;

function createMockContext(
  overrides: Partial<SceneContext> = {},
): SceneContext {
  const bodyRegistry = new BodyRegistry();
  const materialRegistry = new MaterialRegistry();
  const constraintRegistry = new ConstraintRegistry();

  return {
    scene: {
      matter: {
        world: {
          remove: vi.fn(),
          removeConstraint: vi.fn(),
          engine: {
            pairs: {
              get list() {
                return [];
              },
            },
          },
        },
        add: {
          rectangle: vi.fn(),
        },
      },
    } as unknown as Phaser.Scene,
    bodyRegistry,
    inputState: createInputState(),
    getAlpha: () => 0,
    clockState: createClockState(),
    eventBus: createGameEventBus(),
    materialRegistry,
    constraintRegistry,
    ...overrides,
  };
}

function registerMockBody(ctx: SceneContext): number {
  const id = nextBodyId++;
  const mockBody = {
    id,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    speed: 0,
    angularVelocity: 0,
    force: { x: 0, y: 0 },
    inertia: Infinity,
    inverseInertia: 0,
  };
  ctx.bodyRegistry.register(mockBody as unknown as MatterJS.BodyType);
  return id;
}

/** Spawn a car_battery entity (conductivity 0.9, gets Battery component). */
function spawnCarBattery(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx);
  return createObjectEntity(
    x, y, bodyId,
    "car_battery", ObjectCategory.Loot, false,
    { durability: 0.7, flammability: 0.0, conductivity: 0.9 },
    7,
  );
}

/** Spawn a wire_spool entity (conductivity 1.0). */
function spawnWireSpool(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx);
  return createObjectEntity(
    x, y, bodyId,
    "wire_spool", ObjectCategory.Loot, false,
    { durability: 0.4, flammability: 0.1, conductivity: 1.0 },
    5,
  );
}

/** Spawn a metal_sheet entity (conductivity 0.6). */
function spawnMetalSheet(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx);
  return createObjectEntity(
    x, y, bodyId,
    "metal_sheet", ObjectCategory.Loot, false,
    { durability: 0.8, flammability: 0.0, conductivity: 0.6 },
    4,
  );
}

/** Spawn a wooden_plank entity (conductivity 0.0 — insulator). */
function spawnWoodenPlank(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx);
  return createObjectEntity(
    x, y, bodyId,
    "wooden_plank", ObjectCategory.Loot, false,
    { durability: 0.3, flammability: 0.9, conductivity: 0.0 },
    3,
  );
}

/** Spawn a metal_shelving entity (conductivity 0.8, immovable). */
function spawnMetalShelving(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx);
  return createObjectEntity(
    x, y, bodyId,
    "metal_shelving", ObjectCategory.Furniture, true,
    { durability: 0.9, flammability: 0.0, conductivity: 0.8 },
    2,
  );
}

function spawnZombie(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx);
  return createZombieEntity(x, y, bodyId);
}

function spawnBrute(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx);
  return createZombieEntity(x, y, bodyId, { ...BRUTE_STATS }, 0, BRUTE_HEALTH);
}

function spawnPlayer(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx);
  return createPlayerEntity(x, y, bodyId);
}

/**
 * Simulate a collision pair between two physics entities.
 * Rebuilds the material registry with the given pairs.
 */
function setCollisionPairs(
  ctx: SceneContext,
  pairs: Array<{ bodyA: { id: number }; bodyB: { id: number } }>,
): void {
  ctx.materialRegistry!.rebuildBodyLookup();
  ctx.materialRegistry!.updateAdjacency(pairs);
}

/**
 * Create a collision pair between two entities with physicsBody.
 */
function pair(
  entityA: { physicsBody: { bodyId: number } },
  entityB: { physicsBody: { bodyId: number } },
) {
  return {
    bodyA: { id: entityA.physicsBody.bodyId },
    bodyB: { id: entityB.physicsBody.bodyId },
  };
}

/** Tick with material registry update and collision pairs. */
function tickWithPairs(
  ctx: SceneContext,
  system: (dt: number) => void,
  pairs: Array<{ bodyA: { id: number }; bodyB: { id: number } }>,
): void {
  setCollisionPairs(ctx, pairs);
  system(DT);
}

/** Tick N times with the same collision pairs. */
function tickN(
  ctx: SceneContext,
  system: (dt: number) => void,
  pairs: Array<{ bodyA: { id: number }; bodyB: { id: number } }>,
  n: number,
): void {
  for (let i = 0; i < n; i++) {
    tickWithPairs(ctx, system, pairs);
  }
}

/** Collect events of a given type emitted on the bus. */
function collectEvents<T>(bus: GameEventBus, eventName: string): T[] {
  const events: T[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (bus as any).on(eventName, (e: T) => {
    events.push(e);
  });
  return events;
}

beforeEach(() => {
  nextBodyId = 2000;
});

afterEach(() => {
  resetWorld();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Chain detection
// ---------------------------------------------------------------------------

describe("ElectricitySystem — chain detection", () => {
  it("battery alone is not electrified (no chain formed)", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);

    // No collision pairs — battery is isolated
    tickN(ctx, system, [], ELECTRICITY.CHAIN_RECALC_INTERVAL);

    expect(battery.material.state).toBe("inert");
    expect(battery.battery!.active).toBe(false);
  });

  it("battery touching wire spool forms a 2-entity chain", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);

    const pairs = [pair(battery, wire)];
    tickN(ctx, system, pairs, ELECTRICITY.CHAIN_RECALC_INTERVAL);

    expect(battery.material.state).toBe("electrified");
    expect(wire.material.state).toBe("electrified");
    expect(battery.battery!.active).toBe(true);
  });

  it("traces a chain through multiple conductive objects", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);
    const sheet = spawnMetalSheet(ctx, 132, 100);

    // battery ↔ wire ↔ sheet (linear chain)
    const pairs = [pair(battery, wire), pair(wire, sheet)];
    tickN(ctx, system, pairs, ELECTRICITY.CHAIN_RECALC_INTERVAL);

    expect(battery.material.state).toBe("electrified");
    expect(wire.material.state).toBe("electrified");
    expect(sheet.material.state).toBe("electrified");
  });

  it("wooden object breaks the chain (non-conductive)", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wood = spawnWoodenPlank(ctx, 116, 100);
    const sheet = spawnMetalSheet(ctx, 132, 100);

    // battery ↔ wood ↔ sheet
    // Wood has conductivity 0.0 — below threshold, so it won't appear
    // in getConductiveNeighbors. The chain stops at the battery.
    const pairs = [pair(battery, wood), pair(wood, sheet)];
    tickN(ctx, system, pairs, ELECTRICITY.CHAIN_RECALC_INTERVAL);

    // Battery alone — no chain, not electrified
    expect(battery.material.state).toBe("inert");
    expect(wood.material.state).toBe("inert");
    expect(sheet.material.state).toBe("inert");
  });

  it("gap in contact breaks the chain", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);
    // Sheet is far away, not touching wire
    const sheet = spawnMetalSheet(ctx, 300, 300);

    // Only battery ↔ wire are in contact
    const pairs = [pair(battery, wire)];
    tickN(ctx, system, pairs, ELECTRICITY.CHAIN_RECALC_INTERVAL);

    expect(battery.material.state).toBe("electrified");
    expect(wire.material.state).toBe("electrified");
    expect(sheet.material.state).toBe("inert"); // Not in chain
  });

  it("multiple batteries form independent chains", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery1 = spawnCarBattery(ctx, 100, 100);
    const wire1 = spawnWireSpool(ctx, 116, 100);
    const battery2 = spawnCarBattery(ctx, 300, 300);
    const sheet2 = spawnMetalSheet(ctx, 316, 300);

    const pairs = [pair(battery1, wire1), pair(battery2, sheet2)];
    tickN(ctx, system, pairs, ELECTRICITY.CHAIN_RECALC_INTERVAL);

    expect(battery1.material.state).toBe("electrified");
    expect(wire1.material.state).toBe("electrified");
    expect(battery2.material.state).toBe("electrified");
    expect(sheet2.material.state).toBe("electrified");
  });

  it("emits material-state-changed when entities become electrified", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);

    const stateChanges = collectEvents(ctx.eventBus, "material-state-changed");
    const pairs = [pair(battery, wire)];
    tickN(ctx, system, pairs, ELECTRICITY.CHAIN_RECALC_INTERVAL);

    // Both battery and wire should have state-changed events
    expect(stateChanges.length).toBeGreaterThanOrEqual(2);
    expect(stateChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ newState: "electrified", objectType: "car_battery" }),
        expect.objectContaining({ newState: "electrified", objectType: "wire_spool" }),
      ]),
    );
  });

  it("emits electricity-chain-formed event with chain size", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);

    const chainEvents = collectEvents(ctx.eventBus, "electricity-chain-formed");
    const pairs = [pair(battery, wire)];
    tickN(ctx, system, pairs, ELECTRICITY.CHAIN_RECALC_INTERVAL);

    expect(chainEvents.length).toBeGreaterThanOrEqual(1);
    expect(chainEvents[0]).toMatchObject({ chainSize: 2 });
  });

  it("chain deactivates when entities are no longer in contact", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);

    // First: form chain
    const pairs = [pair(battery, wire)];
    tickN(ctx, system, pairs, ELECTRICITY.CHAIN_RECALC_INTERVAL);
    expect(battery.material.state).toBe("electrified");
    expect(wire.material.state).toBe("electrified");

    // Then: break contact (empty pairs)
    tickN(ctx, system, [], ELECTRICITY.CHAIN_RECALC_INTERVAL);
    expect(battery.material.state).toBe("inert");
    expect(wire.material.state).toBe("inert");
  });

  it("burning entity breaks the chain", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);
    const sheet = spawnMetalSheet(ctx, 132, 100);

    // Set wire to burning (fire system would do this)
    wire.material.state = "burning";

    const pairs = [pair(battery, wire), pair(wire, sheet)];
    tickN(ctx, system, pairs, ELECTRICITY.CHAIN_RECALC_INTERVAL);

    // Battery can't chain through burning wire
    expect(battery.material.state).toBe("inert");
    // Wire stays burning (not overwritten by electricity)
    expect(wire.material.state).toBe("burning");
    expect(sheet.material.state).toBe("inert");
  });
});

// ---------------------------------------------------------------------------
// Battery drain
// ---------------------------------------------------------------------------

describe("ElectricitySystem — battery drain", () => {
  it("drains battery charge when chain is active", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);
    const initialCharge = battery.battery!.charge;

    const pairs = [pair(battery, wire)];
    // Tick enough to form chain and drain for 1 second (60 ticks)
    tickN(ctx, system, pairs, 60);

    expect(battery.battery!.charge).toBeLessThan(initialCharge);
    expect(battery.battery!.charge).toBeGreaterThan(0);
  });

  it("does not drain when battery is alone (no chain)", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const initialCharge = battery.battery!.charge;

    tickN(ctx, system, [], 60);

    expect(battery.battery!.charge).toBe(initialCharge);
  });

  it("drains faster with more connected objects", () => {
    const ctx1 = createMockContext();
    const system1 = createElectricitySystem(ctx1);
    const battery1 = spawnCarBattery(ctx1, 100, 100);
    const wire1 = spawnWireSpool(ctx1, 116, 100);
    const pairs1 = [pair(battery1, wire1)];

    const ctx2 = createMockContext();
    const system2 = createElectricitySystem(ctx2);
    const battery2 = spawnCarBattery(ctx2, 100, 100);
    const wire2 = spawnWireSpool(ctx2, 116, 100);
    const sheet2 = spawnMetalSheet(ctx2, 132, 100);
    const shelving2 = spawnMetalShelving(ctx2, 148, 100);
    const pairs2 = [
      pair(battery2, wire2),
      pair(wire2, sheet2),
      pair(sheet2, shelving2),
    ];

    // Tick both for 60 ticks
    tickN(ctx1, system1, pairs1, 60);
    tickN(ctx2, system2, pairs2, 60);

    // Battery with more objects should have less charge
    expect(battery2.battery!.charge).toBeLessThan(battery1.battery!.charge);
  });

  it("deactivates chain when battery is depleted", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);

    // Set battery to nearly depleted
    battery.battery!.charge = 0.01;

    const pairs = [pair(battery, wire)];

    // Tick until chain forms and battery depletes
    tickN(ctx, system, pairs, ELECTRICITY.CHAIN_RECALC_INTERVAL * 5);

    expect(battery.battery!.charge).toBe(0);
    expect(battery.battery!.active).toBe(false);
  });

  it("emits electricity-depleted event when battery runs out", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);

    battery.battery!.charge = 0.01;

    const depletedEvents = collectEvents(ctx.eventBus, "electricity-depleted");
    const pairs = [pair(battery, wire)];
    tickN(ctx, system, pairs, ELECTRICITY.CHAIN_RECALC_INTERVAL * 5);

    expect(depletedEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("charge never goes negative", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);

    battery.battery!.charge = 0.001;

    const pairs = [pair(battery, wire)];
    tickN(ctx, system, pairs, 120);

    expect(battery.battery!.charge).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Contact damage
// ---------------------------------------------------------------------------

describe("ElectricitySystem — contact damage", () => {
  it("damages zombie in contact with electrified object", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);
    // Zombie at wire position (within contact radius)
    const zombie = spawnZombie(ctx, 116, 100);
    const initialHP = zombie.health.current;

    const pairs = [pair(battery, wire)];
    // Need enough ticks for chain recalc AND damage tick
    const ticksNeeded = Math.max(
      ELECTRICITY.CHAIN_RECALC_INTERVAL,
      ELECTRICITY.DAMAGE_TICK_INTERVAL,
    );
    tickN(ctx, system, pairs, ticksNeeded + 1);

    expect(zombie.health.current).toBeLessThan(initialHP);
  });

  it("staggers zombie on electrification damage", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);
    const zombie = spawnZombie(ctx, 116, 100);

    // Put zombie in pathing state (default is idle, which doesn't stagger)
    zombie.aiState.state = "pathing";

    const pairs = [pair(battery, wire)];
    const ticksNeeded = Math.max(
      ELECTRICITY.CHAIN_RECALC_INTERVAL,
      ELECTRICITY.DAMAGE_TICK_INTERVAL,
    );
    tickN(ctx, system, pairs, ticksNeeded + 1);

    expect(zombie.aiState.state).toBe("staggered");
    expect(zombie.aiState.staggerTimeRemaining).toBeGreaterThan(0);
  });

  it("updates previousHealth to prevent double-stagger", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);
    const zombie = spawnZombie(ctx, 116, 100);
    zombie.aiState.state = "pathing";

    const pairs = [pair(battery, wire)];
    const ticksNeeded = Math.max(
      ELECTRICITY.CHAIN_RECALC_INTERVAL,
      ELECTRICITY.DAMAGE_TICK_INTERVAL,
    );
    tickN(ctx, system, pairs, ticksNeeded + 1);

    // previousHealth should match current health after damage
    expect(zombie.aiState.previousHealth).toBe(zombie.health.current);
  });

  it("damages player in contact with electrified object", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);
    const player = spawnPlayer(ctx, 116, 100);
    const initialHP = player.health.current;

    const pairs = [pair(battery, wire)];
    const ticksNeeded = Math.max(
      ELECTRICITY.CHAIN_RECALC_INTERVAL,
      ELECTRICITY.DAMAGE_TICK_INTERVAL,
    );
    tickN(ctx, system, pairs, ticksNeeded + 1);

    expect(player.health.current).toBeLessThan(initialHP);
  });

  it("respects player i-frames (no damage during invulnerability)", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);
    const player = spawnPlayer(ctx, 116, 100);

    // Give player i-frames
    player.combatState.iFramesRemaining = 5.0;
    const initialHP = player.health.current;

    const pairs = [pair(battery, wire)];
    const ticksNeeded = Math.max(
      ELECTRICITY.CHAIN_RECALC_INTERVAL,
      ELECTRICITY.DAMAGE_TICK_INTERVAL,
    );
    tickN(ctx, system, pairs, ticksNeeded + 1);

    expect(player.health.current).toBe(initialHP);
  });

  it("does not damage zombies outside contact radius", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);
    // Zombie far away from all electrified objects
    const zombie = spawnZombie(ctx, 500, 500);
    const initialHP = zombie.health.current;

    const pairs = [pair(battery, wire)];
    tickN(ctx, system, pairs, 60);

    expect(zombie.health.current).toBe(initialHP);
  });

  it("does not damage when battery is depleted", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);
    const zombie = spawnZombie(ctx, 116, 100);

    // Deplete battery
    battery.battery!.charge = 0;

    const pairs = [pair(battery, wire)];
    tickN(ctx, system, pairs, 60);

    // Zombie should not be damaged
    expect(zombie.health.current).toBe(zombie.health.max);
  });

  it("emits electricity-damage event", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);
    spawnZombie(ctx, 116, 100);

    const damageEvents = collectEvents(ctx.eventBus, "electricity-damage");
    const pairs = [pair(battery, wire)];
    const ticksNeeded = Math.max(
      ELECTRICITY.CHAIN_RECALC_INTERVAL,
      ELECTRICITY.DAMAGE_TICK_INTERVAL,
    );
    tickN(ctx, system, pairs, ticksNeeded + 1);

    expect(damageEvents.length).toBeGreaterThanOrEqual(1);
    expect(damageEvents[0]).toMatchObject({ targetType: "zombie" });
  });

  it("syncs player combatState.previousHealth after damage", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);
    const player = spawnPlayer(ctx, 116, 100);

    const pairs = [pair(battery, wire)];
    const ticksNeeded = Math.max(
      ELECTRICITY.CHAIN_RECALC_INTERVAL,
      ELECTRICITY.DAMAGE_TICK_INTERVAL,
    );
    tickN(ctx, system, pairs, ticksNeeded + 1);

    expect(player.combatState.previousHealth).toBe(player.health.current);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("ElectricitySystem — edge cases", () => {
  it("requires materialRegistry", () => {
    const ctx = createMockContext({ materialRegistry: undefined });
    expect(() => createElectricitySystem(ctx)).toThrow(
      "ctx.materialRegistry is required",
    );
  });

  it("handles entity removed mid-chain gracefully", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);

    const pairs = [pair(battery, wire)];
    tickN(ctx, system, pairs, ELECTRICITY.CHAIN_RECALC_INTERVAL);

    expect(wire.material.state).toBe("electrified");

    // Simulate wire being destroyed (e.g., by fire system removing it)
    world.remove(wire);

    // System should not crash when the wire is gone
    expect(() => {
      tickN(ctx, system, [], ELECTRICITY.CHAIN_RECALC_INTERVAL);
    }).not.toThrow();
  });

  it("shared entity between two battery chains stays electrified", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery1 = spawnCarBattery(ctx, 100, 100);
    const sharedWire = spawnWireSpool(ctx, 116, 100);
    const battery2 = spawnCarBattery(ctx, 132, 100);

    // Both batteries touch the shared wire
    const pairs = [pair(battery1, sharedWire), pair(battery2, sharedWire)];
    tickN(ctx, system, pairs, ELECTRICITY.CHAIN_RECALC_INTERVAL);

    expect(sharedWire.material.state).toBe("electrified");

    // Deplete battery1 — shared wire should still be electrified from battery2
    battery1.battery!.charge = 0;
    tickN(ctx, system, pairs, ELECTRICITY.CHAIN_RECALC_INTERVAL);

    expect(sharedWire.material.state).toBe("electrified");
  });

  it("does not stagger already-staggered zombies", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);
    const zombie = spawnZombie(ctx, 116, 100);

    // Pre-set zombie to staggered with specific remaining time
    zombie.aiState.state = "staggered";
    zombie.aiState.staggerTimeRemaining = 999;

    const pairs = [pair(battery, wire)];
    const ticksNeeded = Math.max(
      ELECTRICITY.CHAIN_RECALC_INTERVAL,
      ELECTRICITY.DAMAGE_TICK_INTERVAL,
    );
    tickN(ctx, system, pairs, ticksNeeded + 1);

    // Stagger time should not be overwritten (still very high)
    expect(zombie.aiState.staggerTimeRemaining).toBeGreaterThan(
      ELECTRICITY.ELECTROCUTION_STAGGER_DURATION,
    );
  });

  it("does not stagger dead zombies", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);
    const zombie = spawnZombie(ctx, 116, 100);

    zombie.aiState.state = "dead";

    const pairs = [pair(battery, wire)];
    const ticksNeeded = Math.max(
      ELECTRICITY.CHAIN_RECALC_INTERVAL,
      ELECTRICITY.DAMAGE_TICK_INTERVAL,
    );
    tickN(ctx, system, pairs, ticksNeeded + 1);

    expect(zombie.aiState.state).toBe("dead");
  });

  it("brute zombie gets shorter stagger than base electrocution duration", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);
    const brute = spawnBrute(ctx, 116, 100);

    brute.aiState.state = "pathing";

    const pairs = [pair(battery, wire)];
    const ticksNeeded = Math.max(
      ELECTRICITY.CHAIN_RECALC_INTERVAL,
      ELECTRICITY.DAMAGE_TICK_INTERVAL,
    );
    tickN(ctx, system, pairs, ticksNeeded + 1);

    expect(brute.aiState.state).toBe("staggered");
    // Brute stagger duration (0.2s) is shorter than ELECTROCUTION_STAGGER_DURATION (0.8s)
    expect(brute.aiState.staggerTimeRemaining).toBe(
      BRUTE_STATS.staggerDuration,
    );
  });

  it("emits electricity-charge-changed event periodically", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);

    const chargeEvents = collectEvents(ctx.eventBus, "electricity-charge-changed");
    const pairs = [pair(battery, wire)];
    // Tick enough for chain formation + charge event interval
    tickN(ctx, system, pairs, ELECTRICITY.CHARGE_EVENT_INTERVAL + ELECTRICITY.CHAIN_RECALC_INTERVAL);

    expect(chargeEvents.length).toBeGreaterThanOrEqual(1);
    expect(chargeEvents[0]).toMatchObject({
      charge: expect.any(Number),
      maxCharge: ELECTRICITY.MAX_CHARGE,
    });
  });

  it("burning battery deactivates its chain", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);

    // Form the chain first
    const pairs = [pair(battery, wire)];
    tickN(ctx, system, pairs, ELECTRICITY.CHAIN_RECALC_INTERVAL);
    expect(battery.material.state).toBe("electrified");
    expect(wire.material.state).toBe("electrified");

    // Set battery to burning (fire system would do this)
    battery.material.state = "burning";

    // Tick to recalculate — chain should deactivate
    tickN(ctx, system, pairs, ELECTRICITY.CHAIN_RECALC_INTERVAL);
    expect(battery.battery!.active).toBe(false);
    // Wire should revert to inert since battery is burning
    expect(wire.material.state).toBe("inert");
  });

  it("emits electricity-damage event for player", () => {
    const ctx = createMockContext();
    const system = createElectricitySystem(ctx);
    const battery = spawnCarBattery(ctx, 100, 100);
    const wire = spawnWireSpool(ctx, 116, 100);
    spawnPlayer(ctx, 116, 100);

    const damageEvents = collectEvents(ctx.eventBus, "electricity-damage");
    const pairs = [pair(battery, wire)];
    const ticksNeeded = Math.max(
      ELECTRICITY.CHAIN_RECALC_INTERVAL,
      ELECTRICITY.DAMAGE_TICK_INTERVAL,
    );
    tickN(ctx, system, pairs, ticksNeeded + 1);

    const playerDamageEvents = damageEvents.filter(
      (e) => (e as { targetType: string }).targetType === "player",
    );
    expect(playerDamageEvents.length).toBeGreaterThanOrEqual(1);
  });
});
