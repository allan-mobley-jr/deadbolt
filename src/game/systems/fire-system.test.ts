import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFireSystem, igniteEntity } from "./fire-system";
import { MaterialRegistry } from "./material-system";
import { createInputState, createClockState } from "./scene-context";
import type { SceneContext } from "./scene-context";
import { BodyRegistry } from "./body-registry";
import { ConstraintRegistry } from "./constraint-registry";
import { createGameEventBus, type GameEventBus } from "@/game/events/event-bus";
import { world, resetWorld } from "@/game/ecs/world";
import {
  createObjectEntity,
  createBarricadeEntity,
  createZombieEntity,
  createPlayerEntity,
} from "@/game/ecs/archetypes";
import { ObjectCategory } from "@/types/procgen";
import { FIRE } from "./fire-constants";

const DT = 1 / 60;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let nextBodyId = 1000;

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

function spawnGasCan(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx);
  return createObjectEntity(
    x, y, bodyId,
    "gas_can", ObjectCategory.Loot, false,
    { durability: 0.2, flammability: 1.0, conductivity: 0.1 },
    6,
  );
}

function spawnWoodenPlank(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx);
  return createObjectEntity(
    x, y, bodyId,
    "wooden_plank", ObjectCategory.Loot, false,
    { durability: 0.3, flammability: 0.9, conductivity: 0.0 },
    3,
  );
}

function spawnMetalSheet(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx);
  return createObjectEntity(
    x, y, bodyId,
    "metal_sheet", ObjectCategory.Loot, false,
    { durability: 0.8, flammability: 0.0, conductivity: 0.6 },
    4,
  );
}

function spawnSofa(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx);
  return createObjectEntity(
    x, y, bodyId,
    "sofa", ObjectCategory.Furniture, true,
    { durability: 0.5, flammability: 0.95, conductivity: 0.0 },
    1,
  );
}

function spawnZombie(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx);
  return createZombieEntity(x, y, bodyId);
}

function spawnPlayer(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx);
  return createPlayerEntity(x, y, bodyId);
}

/** Tick the material system to update the registry, then tick the fire system. */
function tickFireWithMaterial(
  ctx: SceneContext,
  system: (dt: number) => void,
): void {
  // MaterialRegistry needs body lookup rebuilt before fire system queries it
  ctx.materialRegistry!.rebuildBodyLookup();
  system(DT);
}

/** Tick the fire system N times (with material registry updates). */
function tickN(
  ctx: SceneContext,
  system: (dt: number) => void,
  n: number,
): void {
  for (let i = 0; i < n; i++) {
    tickFireWithMaterial(ctx, system);
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
  nextBodyId = 1000;
});

afterEach(() => {
  resetWorld();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Ignition tracking
// ---------------------------------------------------------------------------

describe("FireSystem — ignition tracking", () => {
  it("detects externally set burning entities", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);
    const gasCan = spawnGasCan(ctx, 100, 100);

    // Set burning externally (as a lighter or Molotov would)
    gasCan.material.state = "burning";

    const ignited = collectEvents(ctx.eventBus, "fire-ignited");
    tickFireWithMaterial(ctx, system);

    expect(ignited).toHaveLength(1);
    expect(ignited[0]).toMatchObject({
      objectType: "gas_can",
      sourceObjectType: null,
    });
  });

  it("does not emit duplicate ignition events for already-tracked entities", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);
    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    const ignited = collectEvents(ctx.eventBus, "fire-ignited");
    tickN(ctx, system, 5);

    expect(ignited).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Burn duration
// ---------------------------------------------------------------------------

describe("FireSystem — burn duration", () => {
  it("destroys entities after burn duration expires", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);
    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    // Gas can: fuel category, FUEL_BURN_DURATION = 2.0s = 120 ticks
    const burnTicks = Math.ceil(FIRE.FUEL_BURN_DURATION / DT);
    tickN(ctx, system, burnTicks + 1);

    // Entity should have been removed from the world
    expect(world.entities).not.toContain(gasCan);
  });

  it("fuel objects burn shorter than wood objects", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    const plank = spawnWoodenPlank(ctx, 300, 300);
    gasCan.material.state = "burning";
    plank.material.state = "burning";

    // After fuel burn duration, gas can should be gone but plank still exists
    const fuelTicks = Math.ceil(FIRE.FUEL_BURN_DURATION / DT) + 1;
    tickN(ctx, system, fuelTicks);

    expect(world.entities).not.toContain(gasCan);
    expect(world.entities).toContain(plank);
  });

  it("emits fire-burnout event on destruction", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);
    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    const burnouts = collectEvents(ctx.eventBus, "fire-burnout");
    const burnTicks = Math.ceil(FIRE.FUEL_BURN_DURATION / DT) + 1;
    tickN(ctx, system, burnTicks);

    expect(burnouts).toHaveLength(1);
    expect(burnouts[0]).toMatchObject({
      objectType: "gas_can",
      wasBarricade: false,
    });
  });

  it("removes physics body on burnout", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);
    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    const burnTicks = Math.ceil(FIRE.FUEL_BURN_DURATION / DT) + 1;
    tickN(ctx, system, burnTicks);

    const matterRemove = ctx.scene.matter.world.remove as ReturnType<typeof vi.fn>;
    expect(matterRemove).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Fire spread
// ---------------------------------------------------------------------------

describe("FireSystem — spread", () => {
  it("spreads fire to nearby flammable objects", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    const source = spawnGasCan(ctx, 100, 100);
    const target = spawnWoodenPlank(ctx, 140, 100); // 40px away, within 64px radius
    source.material.state = "burning";

    // Force spread to succeed
    vi.spyOn(Math, "random").mockReturnValue(0);

    // Tick enough to trigger spread check
    tickN(ctx, system, FIRE.SPREAD_CHECK_INTERVAL + 1);

    expect(target.material.state).toBe("burning");
  });

  it("does not spread to fireproof (metal) objects", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    const source = spawnGasCan(ctx, 100, 100);
    const metal = spawnMetalSheet(ctx, 140, 100);
    source.material.state = "burning";

    vi.spyOn(Math, "random").mockReturnValue(0);
    tickN(ctx, system, FIRE.SPREAD_CHECK_INTERVAL + 1);

    expect(metal.material.state).toBe("inert");
  });

  it("does not spread beyond spread radius", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    const source = spawnGasCan(ctx, 100, 100);
    // Place target just outside spread radius
    const target = spawnWoodenPlank(ctx, 100 + FIRE.SPREAD_RADIUS + 10, 100);
    source.material.state = "burning";

    vi.spyOn(Math, "random").mockReturnValue(0);
    tickN(ctx, system, FIRE.SPREAD_CHECK_INTERVAL + 1);

    expect(target.material.state).toBe("inert");
  });

  it("emits fire-spread and material-state-changed events", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    const source = spawnGasCan(ctx, 100, 100);
    spawnWoodenPlank(ctx, 140, 100);
    source.material.state = "burning";

    vi.spyOn(Math, "random").mockReturnValue(0);
    const spreads = collectEvents(ctx.eventBus, "fire-spread");
    const stateChanges = collectEvents(ctx.eventBus, "material-state-changed");

    tickN(ctx, system, FIRE.SPREAD_CHECK_INTERVAL + 1);

    expect(spreads).toHaveLength(1);
    expect(spreads[0]).toMatchObject({
      targetObjectType: "wooden_plank",
    });

    // material-state-changed emitted for the newly ignited target
    expect(
      stateChanges.some(
        (e) => {
          const ev = e as { objectType?: string; newState?: string };
          return ev.objectType === "wooden_plank" && ev.newState === "burning";
        },
      ),
    ).toBe(true);
  });

  it("respects the spread check interval cooldown", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    const source = spawnGasCan(ctx, 100, 100);
    const target = spawnWoodenPlank(ctx, 140, 100);
    source.material.state = "burning";

    vi.spyOn(Math, "random").mockReturnValue(0);

    // Tick fewer than the interval — should not spread
    tickN(ctx, system, FIRE.SPREAD_CHECK_INTERVAL - 1);

    expect(target.material.state).toBe("inert");
  });

  it("spread probability scales with target flammability", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    const source = spawnGasCan(ctx, 100, 100);
    // Sofa has flammability 0.95; chance = 0.15 * 0.95 ≈ 0.1425
    const sofa = spawnSofa(ctx, 140, 100);
    source.material.state = "burning";

    // Set random to be just above the threshold (should NOT ignite)
    vi.spyOn(Math, "random").mockReturnValue(
      FIRE.BASE_IGNITION_CHANCE * 0.95 + 0.01,
    );

    tickN(ctx, system, FIRE.SPREAD_CHECK_INTERVAL + 1);

    expect(sofa.material.state).toBe("inert");
  });
});

// ---------------------------------------------------------------------------
// AoE damage
// ---------------------------------------------------------------------------

describe("FireSystem — AoE damage", () => {
  it("damages zombies within damage radius", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    const source = spawnGasCan(ctx, 100, 100);
    const zombie = spawnZombie(ctx, 130, 100); // 30px away, within 48px radius
    source.material.state = "burning";
    const initialHp = zombie.health.current;

    // Tick to trigger damage
    tickN(ctx, system, FIRE.DAMAGE_TICK_INTERVAL + 1);

    expect(zombie.health.current).toBeLessThan(initialHp);
  });

  it("does not damage zombies outside damage radius", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    const source = spawnGasCan(ctx, 100, 100);
    const zombie = spawnZombie(ctx, 100 + FIRE.DAMAGE_RADIUS + 10, 100);
    source.material.state = "burning";
    const initialHp = zombie.health.current;

    tickN(ctx, system, FIRE.DAMAGE_TICK_INTERVAL + 1);

    expect(zombie.health.current).toBe(initialHp);
  });

  it("damages the player within damage radius", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    const source = spawnGasCan(ctx, 100, 100);
    const player = spawnPlayer(ctx, 130, 100);
    source.material.state = "burning";
    const initialHp = player.health.current;

    tickN(ctx, system, FIRE.DAMAGE_TICK_INTERVAL + 1);

    expect(player.health.current).toBeLessThan(initialHp);
  });

  it("syncs combat previousHealth to prevent false i-frame triggers", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    const source = spawnGasCan(ctx, 100, 100);
    const player = spawnPlayer(ctx, 130, 100);
    source.material.state = "burning";

    tickN(ctx, system, FIRE.DAMAGE_TICK_INTERVAL + 1);

    // After fire damage, previousHealth should match current health
    // so the combat system does not detect a delta and grant i-frames
    expect(player.combatState.previousHealth).toBe(player.health.current);
  });

  it("respects player i-frames", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    const source = spawnGasCan(ctx, 100, 100);
    const player = spawnPlayer(ctx, 130, 100);
    player.combatState.iFramesRemaining = 1.0; // 1 second of immunity
    source.material.state = "burning";
    const initialHp = player.health.current;

    tickN(ctx, system, FIRE.DAMAGE_TICK_INTERVAL + 1);

    expect(player.health.current).toBe(initialHp);
  });

  it("applies distance-based damage falloff", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    // Two zombies at different distances
    const source = spawnGasCan(ctx, 100, 100);
    const closeZombie = spawnZombie(ctx, 101, 100); // ~1px away
    const farZombie = spawnZombie(ctx, 100 + FIRE.DAMAGE_RADIUS - 1, 100);
    source.material.state = "burning";

    const closeInitialHp = closeZombie.health.current;
    const farInitialHp = farZombie.health.current;

    tickN(ctx, system, FIRE.DAMAGE_TICK_INTERVAL + 1);

    const closeDamage = closeInitialHp - closeZombie.health.current;
    const farDamage = farInitialHp - farZombie.health.current;

    expect(closeDamage).toBeGreaterThan(farDamage);
  });

  it("stacks damage from multiple burning sources", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    const source1 = spawnGasCan(ctx, 100, 100);
    const source2 = spawnWoodenPlank(ctx, 110, 100);
    source2.material.state = "burning";
    const zombie = spawnZombie(ctx, 105, 100); // Between both fires
    source1.material.state = "burning";

    const initialHp = zombie.health.current;
    tickN(ctx, system, FIRE.DAMAGE_TICK_INTERVAL + 1);
    const damageFromTwo = initialHp - zombie.health.current;

    // Reset and test with one source
    resetWorld();
    const ctx2 = createMockContext();
    const system2 = createFireSystem(ctx2);
    const singleSource = spawnGasCan(ctx2, 100, 100);
    const singleZombie = spawnZombie(ctx2, 105, 100);
    singleSource.material.state = "burning";
    const singleInitialHp = singleZombie.health.current;

    tickN(ctx2, system2, FIRE.DAMAGE_TICK_INTERVAL + 1);
    const damageFromOne = singleInitialHp - singleZombie.health.current;

    expect(damageFromTwo).toBeGreaterThan(damageFromOne);
  });

  it("fuel objects deal extra damage", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    const fuelSource = spawnGasCan(ctx, 100, 100);
    const fuelZombie = spawnZombie(ctx, 110, 100);
    fuelSource.material.state = "burning";
    const fuelInitialHp = fuelZombie.health.current;

    tickN(ctx, system, FIRE.DAMAGE_TICK_INTERVAL + 1);
    const fuelDamage = fuelInitialHp - fuelZombie.health.current;

    // Reset and test with wood source
    resetWorld();
    const ctx2 = createMockContext();
    const system2 = createFireSystem(ctx2);
    const woodSource = spawnWoodenPlank(ctx2, 100, 100);
    const woodZombie = spawnZombie(ctx2, 110, 100);
    woodSource.material.state = "burning";
    const woodInitialHp = woodZombie.health.current;

    tickN(ctx2, system2, FIRE.DAMAGE_TICK_INTERVAL + 1);
    const woodDamage = woodInitialHp - woodZombie.health.current;

    expect(fuelDamage).toBeGreaterThan(woodDamage);
  });

  it("emits fire-damage events", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    const source = spawnGasCan(ctx, 100, 100);
    spawnZombie(ctx, 130, 100);
    source.material.state = "burning";

    const damageEvents = collectEvents(ctx.eventBus, "fire-damage");
    tickN(ctx, system, FIRE.DAMAGE_TICK_INTERVAL + 1);

    expect(damageEvents).toHaveLength(1);
    expect(damageEvents[0]).toMatchObject({ targetType: "zombie" });
  });

  it("emits fire-damage event with targetType 'player'", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    const source = spawnGasCan(ctx, 100, 100);
    spawnPlayer(ctx, 130, 100);
    source.material.state = "burning";

    const damageEvents = collectEvents<{ targetType: string; damage: number }>(
      ctx.eventBus,
      "fire-damage",
    );
    tickN(ctx, system, FIRE.DAMAGE_TICK_INTERVAL + 1);

    const playerEvents = damageEvents.filter((e) => e.targetType === "player");
    expect(playerEvents).toHaveLength(1);
    expect(playerEvents[0].damage).toBeGreaterThan(0);
  });

  it("does not emit fire-damage event for player during i-frames", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    const source = spawnGasCan(ctx, 100, 100);
    const player = spawnPlayer(ctx, 130, 100);
    player.combatState.iFramesRemaining = 1.0;
    source.material.state = "burning";

    const damageEvents = collectEvents<{ targetType: string }>(
      ctx.eventBus,
      "fire-damage",
    );
    tickN(ctx, system, FIRE.DAMAGE_TICK_INTERVAL + 1);

    const playerEvents = damageEvents.filter((e) => e.targetType === "player");
    expect(playerEvents).toHaveLength(0);
  });

  it("does not let health go below zero", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    const source = spawnGasCan(ctx, 100, 100);
    const zombie = spawnZombie(ctx, 105, 100);
    zombie.health.current = 1; // Nearly dead
    source.material.state = "burning";

    tickN(ctx, system, FIRE.DAMAGE_TICK_INTERVAL + 1);

    expect(zombie.health.current).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Barricade destruction
// ---------------------------------------------------------------------------

describe("FireSystem — barricade destruction", () => {
  it("releases constraints when burning barricade burns out", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    // Register mock constraint
    const constraintId = 500;
    const mockConstraint = { id: constraintId } as unknown as MatterJS.ConstraintType;
    ctx.constraintRegistry!.register(mockConstraint);

    const bodyId = registerMockBody(ctx);
    const barricade = createBarricadeEntity(
      100, 100, bodyId,
      "wooden_plank", 0, [constraintId], 60,
    );
    barricade.material.state = "burning";

    // Tick until burnout (wood flammability 0.9: duration = 3 + 0.1*8 = 3.8s)
    const burnDuration =
      FIRE.BASE_BURN_DURATION +
      (1 - 0.9) * FIRE.FLAMMABILITY_DURATION_SCALE;
    const burnTicks = Math.ceil(burnDuration / DT) + 1;
    tickN(ctx, system, burnTicks);

    const removeConstraint = ctx.scene.matter.world.removeConstraint as ReturnType<typeof vi.fn>;
    expect(removeConstraint).toHaveBeenCalledWith(mockConstraint);
    expect(ctx.constraintRegistry!.get(constraintId)).toBeUndefined();
  });

  it("updates pathfinding grid when barricade burns out", () => {
    const mockPathfindingGrid = {
      setWalkable: vi.fn().mockReturnValue(true),
    };
    const mockEntryPoints = [
      { barricaded: true, position: { x: 3, y: 3 }, orientation: "horizontal" as const },
    ];
    const ctx = createMockContext({
      pathfindingGrid: mockPathfindingGrid as unknown as NonNullable<SceneContext["pathfindingGrid"]>,
      entryPoints: mockEntryPoints as unknown as NonNullable<SceneContext["entryPoints"]>,
    });
    const system = createFireSystem(ctx);

    const bodyId = registerMockBody(ctx);
    const barricade = createBarricadeEntity(
      100, 100, bodyId,
      "wooden_plank", 0, [], 60,
    );
    barricade.material.state = "burning";

    const burnDuration =
      FIRE.BASE_BURN_DURATION +
      (1 - 0.9) * FIRE.FLAMMABILITY_DURATION_SCALE;
    const burnTicks = Math.ceil(burnDuration / DT) + 1;
    tickN(ctx, system, burnTicks);

    // Pathfinding tile should be marked walkable (100px / 32 TILE_SIZE = tile 3)
    expect(mockPathfindingGrid.setWalkable).toHaveBeenCalledWith(3, 3, true);
    expect(mockEntryPoints[0].barricaded).toBe(false);
  });

  it("unregisters physics body from body registry on burnout", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    const bodyId = registerMockBody(ctx);
    const barricade = createBarricadeEntity(
      100, 100, bodyId,
      "wooden_plank", 0, [], 60,
    );
    barricade.material.state = "burning";

    // Verify body is registered before burnout
    expect(ctx.bodyRegistry.get(bodyId)).toBeDefined();

    const burnDuration =
      FIRE.BASE_BURN_DURATION +
      (1 - 0.9) * FIRE.FLAMMABILITY_DURATION_SCALE;
    const burnTicks = Math.ceil(burnDuration / DT) + 1;
    tickN(ctx, system, burnTicks);

    // Body should be unregistered after burnout
    expect(ctx.bodyRegistry.get(bodyId)).toBeUndefined();
  });

  it("emits barricade-broken and fire-burnout events", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    const bodyId = registerMockBody(ctx);
    const barricade = createBarricadeEntity(
      100, 100, bodyId,
      "wooden_plank", 0, [], 60,
    );
    barricade.material.state = "burning";

    const brokenEvents = collectEvents(ctx.eventBus, "barricade-broken");
    const burnoutEvents = collectEvents(ctx.eventBus, "fire-burnout");

    const burnDuration =
      FIRE.BASE_BURN_DURATION +
      (1 - 0.9) * FIRE.FLAMMABILITY_DURATION_SCALE;
    const burnTicks = Math.ceil(burnDuration / DT) + 1;
    tickN(ctx, system, burnTicks);

    expect(brokenEvents).toHaveLength(1);
    expect(burnoutEvents).toHaveLength(1);
    expect(burnoutEvents[0]).toMatchObject({
      wasBarricade: true,
    });
  });

  it("unregisters constraint even when removeConstraint throws", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    // Register mock constraint
    const constraintId = 500;
    const mockConstraint = { id: constraintId } as unknown as MatterJS.ConstraintType;
    ctx.constraintRegistry!.register(mockConstraint);

    // Make removeConstraint throw
    const removeConstraint = ctx.scene.matter.world
      .removeConstraint as ReturnType<typeof vi.fn>;
    removeConstraint.mockImplementation(() => {
      throw new Error("physics engine error");
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const bodyId = registerMockBody(ctx);
    const barricade = createBarricadeEntity(
      100, 100, bodyId,
      "wooden_plank", 0, [constraintId], 60,
    );
    barricade.material.state = "burning";

    const burnDuration =
      FIRE.BASE_BURN_DURATION +
      (1 - 0.9) * FIRE.FLAMMABILITY_DURATION_SCALE;
    const burnTicks = Math.ceil(burnDuration / DT) + 1;
    tickN(ctx, system, burnTicks);

    // Constraint should be unregistered despite the throw
    expect(ctx.constraintRegistry!.get(constraintId)).toBeUndefined();
    // Error should have been logged
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[FireSystem] Failed to remove constraint"),
      expect.any(Error),
    );

    errorSpy.mockRestore();
  });

  it("does NOT unblock pathfinding when another healthy barricade exists at the same entry point", () => {
    const mockPathfindingGrid = {
      setWalkable: vi.fn().mockReturnValue(true),
    };
    const mockEntryPoints = [
      {
        barricaded: true,
        position: { x: 3, y: 3 },
        orientation: "horizontal" as const,
      },
    ];
    const ctx = createMockContext({
      pathfindingGrid:
        mockPathfindingGrid as unknown as NonNullable<SceneContext["pathfindingGrid"]>,
      entryPoints:
        mockEntryPoints as unknown as NonNullable<SceneContext["entryPoints"]>,
    });
    const system = createFireSystem(ctx);

    // Create two barricades at the same entry point
    const bodyId1 = registerMockBody(ctx);
    const burningBarricade = createBarricadeEntity(
      100, 100, bodyId1,
      "wooden_plank", 0, [], 60,
    );
    const bodyId2 = registerMockBody(ctx);
    createBarricadeEntity(
      100, 132, bodyId2,
      "wooden_plank", 0, [], 60,
    );

    burningBarricade.material.state = "burning";

    const burnDuration =
      FIRE.BASE_BURN_DURATION +
      (1 - 0.9) * FIRE.FLAMMABILITY_DURATION_SCALE;
    const burnTicks = Math.ceil(burnDuration / DT) + 1;
    tickN(ctx, system, burnTicks);

    // The burning barricade should be gone
    expect(world.entities).not.toContain(burningBarricade);
    // But pathfinding should NOT have been unblocked
    expect(mockPathfindingGrid.setWalkable).not.toHaveBeenCalled();
    // Entry point should still be barricaded
    expect(mockEntryPoints[0].barricaded).toBe(true);
  });

  it("unregisters physics body even when world.remove throws", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    // Make world.remove throw
    const matterRemove = ctx.scene.matter.world.remove as ReturnType<typeof vi.fn>;
    matterRemove.mockImplementation(() => {
      throw new Error("physics body removal failed");
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const gasCan = spawnGasCan(ctx, 100, 100);
    const bodyId = gasCan.physicsBody!.bodyId;
    gasCan.material.state = "burning";

    // Verify body is registered
    expect(ctx.bodyRegistry.get(bodyId)).toBeDefined();

    const burnTicks = Math.ceil(FIRE.FUEL_BURN_DURATION / DT) + 1;
    tickN(ctx, system, burnTicks);

    // Body should still be unregistered despite the throw
    expect(ctx.bodyRegistry.get(bodyId)).toBeUndefined();
    // Error should have been logged
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[FireSystem] Failed to remove physics body"),
      expect.any(Error),
    );
    // Entity should still be removed from ECS
    expect(world.entities).not.toContain(gasCan);

    errorSpy.mockRestore();
  });

  it("warns when setWalkable returns false (out of grid bounds)", () => {
    const mockPathfindingGrid = {
      setWalkable: vi.fn().mockReturnValue(false),
    };
    const mockEntryPoints = [
      {
        barricaded: true,
        position: { x: 3, y: 3 },
        orientation: "horizontal" as const,
      },
    ];
    const ctx = createMockContext({
      pathfindingGrid:
        mockPathfindingGrid as unknown as NonNullable<SceneContext["pathfindingGrid"]>,
      entryPoints:
        mockEntryPoints as unknown as NonNullable<SceneContext["entryPoints"]>,
    });
    const system = createFireSystem(ctx);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const bodyId = registerMockBody(ctx);
    const barricade = createBarricadeEntity(
      100, 100, bodyId,
      "wooden_plank", 0, [], 60,
    );
    barricade.material.state = "burning";

    const burnDuration =
      FIRE.BASE_BURN_DURATION +
      (1 - 0.9) * FIRE.FLAMMABILITY_DURATION_SCALE;
    const burnTicks = Math.ceil(burnDuration / DT) + 1;
    tickN(ctx, system, burnTicks);

    expect(mockPathfindingGrid.setWalkable).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[FireSystem] Failed to unblock pathfinding"),
    );
    // Entry point should still be marked unbarricaded even when setWalkable fails
    expect(mockEntryPoints[0].barricaded).toBe(false);

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("FireSystem — edge cases", () => {
  it("handles no burning entities gracefully", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    // Should not throw
    expect(() => tickN(ctx, system, 10)).not.toThrow();
  });

  it("handles entity removed by another system during burn", () => {
    const ctx = createMockContext();
    const system = createFireSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";
    tickFireWithMaterial(ctx, system); // Start tracking

    // Simulate another system removing the entity
    world.remove(gasCan);

    // Should not throw on subsequent ticks
    expect(() => tickN(ctx, system, 10)).not.toThrow();
  });

  it("throws if materialRegistry is missing", () => {
    const ctx = createMockContext({ materialRegistry: undefined });
    expect(() => createFireSystem(ctx)).toThrow("ctx.materialRegistry is required");
  });
});

// ---------------------------------------------------------------------------
// igniteEntity helper
// ---------------------------------------------------------------------------

describe("igniteEntity", () => {
  it("ignites an inert flammable entity", () => {
    const ctx = createMockContext();
    const plank = spawnWoodenPlank(ctx, 100, 100);

    const result = igniteEntity(plank, ctx);

    expect(result).toBe(true);
    expect(plank.material.state).toBe("burning");
  });

  it("emits material-state-changed event", () => {
    const ctx = createMockContext();
    const plank = spawnWoodenPlank(ctx, 100, 100);

    const stateChanges = collectEvents(ctx.eventBus, "material-state-changed");
    igniteEntity(plank, ctx);

    expect(stateChanges).toHaveLength(1);
    expect(stateChanges[0]).toMatchObject({
      objectType: "wooden_plank",
      previousState: "inert",
      newState: "burning",
    });
  });

  it("returns false for already-burning entities", () => {
    const ctx = createMockContext();
    const plank = spawnWoodenPlank(ctx, 100, 100);
    plank.material.state = "burning";

    expect(igniteEntity(plank, ctx)).toBe(false);
  });

  it("returns false for fireproof entities (flammability below threshold)", () => {
    const ctx = createMockContext();
    const metal = spawnMetalSheet(ctx, 100, 100);

    expect(igniteEntity(metal, ctx)).toBe(false);
    expect(metal.material.state).toBe("inert");
  });
});
