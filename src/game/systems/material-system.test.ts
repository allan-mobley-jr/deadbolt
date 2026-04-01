import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createMaterialSystem, MaterialRegistry } from "./material-system";
import { createInputState, createClockState } from "./scene-context";
import type { SceneContext } from "./scene-context";
import { BodyRegistry } from "./body-registry";
import { createGameEventBus } from "@/game/events/event-bus";
import { world, resetWorld } from "@/game/ecs/world";
import {
  createObjectEntity,
  createBarricadeEntity,
} from "@/game/ecs/archetypes";
import { ObjectCategory } from "@/types/procgen";
import { MATERIAL } from "./material-constants";

const DT = 1 / 60;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Auto-incrementing body ID for mock physics bodies. */
let nextBodyId = 1000;

/** Collision pairs accumulated by the mock Matter.js world. */
let mockPairs: Array<{ bodyA: { id: number }; bodyB: { id: number }; isActive?: boolean }> = [];

function createMockContext(
  overrides: Partial<SceneContext> = {},
): SceneContext {
  const bodyRegistry = new BodyRegistry();
  const materialRegistry = new MaterialRegistry();

  return {
    scene: {
      matter: {
        world: {
          remove: vi.fn(),
          engine: {
            pairs: {
              get list() {
                return mockPairs;
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
    ...overrides,
  };
}

/** Register a mock body in the body registry and return its ID. */
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

/** Create a gas_can entity (fuel, high flammability, high explosive). */
function spawnGasCan(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx);
  return createObjectEntity(
    x, y, bodyId,
    "gas_can", ObjectCategory.Loot, false,
    { durability: 0.2, flammability: 1.0, conductivity: 0.1 },
    6,
  );
}

/** Create a wooden_plank entity (wood, high flammability, no conductivity). */
function spawnWoodenPlank(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx);
  return createObjectEntity(
    x, y, bodyId,
    "wooden_plank", ObjectCategory.Loot, false,
    { durability: 0.3, flammability: 0.9, conductivity: 0.0 },
    3,
  );
}

/** Create a metal_sheet entity (metal, no flammability, high conductivity). */
function spawnMetalSheet(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx);
  return createObjectEntity(
    x, y, bodyId,
    "metal_sheet", ObjectCategory.Loot, false,
    { durability: 0.8, flammability: 0.0, conductivity: 0.6 },
    4,
  );
}

/** Create a wire_spool entity (electronic, high conductivity). */
function spawnWireSpool(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx);
  return createObjectEntity(
    x, y, bodyId,
    "wire_spool", ObjectCategory.Loot, false,
    { durability: 0.4, flammability: 0.1, conductivity: 1.0 },
    5,
  );
}

/** Create a car_battery entity (electronic, conductive, slightly explosive). */
function spawnCarBattery(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx);
  return createObjectEntity(
    x, y, bodyId,
    "car_battery", ObjectCategory.Loot, false,
    { durability: 0.7, flammability: 0.0, conductivity: 0.9 },
    7,
  );
}

beforeEach(() => {
  nextBodyId = 1000;
  mockPairs = [];
});

afterEach(() => {
  resetWorld();
});

// ---------------------------------------------------------------------------
// Material component on entities
// ---------------------------------------------------------------------------

describe("Material component on entities", () => {
  it("attaches material component to object entities", () => {
    const ctx = createMockContext();
    const gasCan = spawnGasCan(ctx, 100, 100);

    expect(gasCan.material).toBeDefined();
    expect(gasCan.material.category).toBe("fuel");
    expect(gasCan.material.flammability).toBe(1.0);
    expect(gasCan.material.conductivity).toBe(0.1);
    expect(gasCan.material.explosivePotential).toBe(0.9);
    expect(gasCan.material.state).toBe("inert");
  });

  it("attaches correct material to wood objects", () => {
    const ctx = createMockContext();
    const plank = spawnWoodenPlank(ctx, 100, 100);

    expect(plank.material.category).toBe("wood");
    expect(plank.material.flammability).toBe(0.9);
    expect(plank.material.conductivity).toBe(0.0);
    expect(plank.material.explosivePotential).toBe(0.0);
  });

  it("attaches correct material to metal objects", () => {
    const ctx = createMockContext();
    const sheet = spawnMetalSheet(ctx, 100, 100);

    expect(sheet.material.category).toBe("metal");
    expect(sheet.material.flammability).toBe(0.0);
    expect(sheet.material.conductivity).toBe(0.6);
    expect(sheet.material.explosivePotential).toBe(0.0);
  });

  it("attaches correct material to electronic objects", () => {
    const ctx = createMockContext();
    const battery = spawnCarBattery(ctx, 100, 100);

    expect(battery.material.category).toBe("electronic");
    expect(battery.material.flammability).toBe(0.0);
    expect(battery.material.conductivity).toBe(0.9);
    expect(battery.material.explosivePotential).toBe(0.3);
  });

  it("attaches material to barricade entities", () => {
    const ctx = createMockContext();
    const bodyId = registerMockBody(ctx);
    const barricade = createBarricadeEntity(
      100, 100, bodyId,
      "wooden_plank", 0, [200, 201], 60,
    );

    expect(barricade.material).toBeDefined();
    expect(barricade.material.category).toBe("wood");
    expect(barricade.material.flammability).toBe(0.9);
    expect(barricade.material.conductivity).toBe(0.0);
    expect(barricade.material.explosivePotential).toBe(0.0);
    expect(barricade.material.state).toBe("inert");
  });

  it("preserves material when object is converted to barricade", () => {
    const ctx = createMockContext();
    const plank = spawnWoodenPlank(ctx, 100, 100);

    // Simulate barricade placement: add barricade+health, remove interactable+objectProperties
    world.addComponent(plank, "barricade", {
      constraintIds: [300, 301],
      entryPointIndex: 0,
      sourceObjectType: "wooden_plank",
      maxDurability: 60,
      currentDurability: 60,
    });
    world.addComponent(plank, "health", { current: 60, max: 60 });
    world.removeComponent(plank, "interactable");
    world.removeComponent(plank, "objectProperties");

    // Material should still be present
    expect(plank.material).toBeDefined();
    expect(plank.material!.category).toBe("wood");
    expect(plank.material!.flammability).toBe(0.9);
  });
});

// ---------------------------------------------------------------------------
// MaterialSystem tick
// ---------------------------------------------------------------------------

describe("MaterialSystem tick", () => {
  it("runs without errors", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    spawnGasCan(ctx, 100, 100);
    expect(() => system(DT)).not.toThrow();
  });

  it("throws if materialRegistry is not on context", () => {
    const ctx = createMockContext();
    ctx.materialRegistry = undefined;
    expect(() => createMaterialSystem(ctx)).toThrow("[MaterialSystem]");
  });
});

// ---------------------------------------------------------------------------
// Spatial radius queries
// ---------------------------------------------------------------------------

describe("MaterialRegistry.queryRadius", () => {
  it("returns entities within radius", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    spawnGasCan(ctx, 100, 100);
    spawnWoodenPlank(ctx, 130, 100); // 30px away
    spawnMetalSheet(ctx, 300, 300);  // ~283px away

    system(DT); // tick to populate

    const results = reg.queryRadius(100, 100, 50);
    expect(results).toHaveLength(2); // gas_can (0px) and plank (30px)
  });

  it("excludes entities outside radius", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    spawnGasCan(ctx, 100, 100);
    spawnMetalSheet(ctx, 300, 300);

    system(DT);

    const results = reg.queryRadius(100, 100, 50);
    expect(results).toHaveLength(1);
    expect(results[0].entity.material.category).toBe("fuel");
  });

  it("sorts results by distance (nearest first)", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    spawnGasCan(ctx, 150, 100);      // 50px from query point
    spawnWoodenPlank(ctx, 110, 100);  // 10px
    spawnMetalSheet(ctx, 130, 100);   // 30px

    system(DT);

    const results = reg.queryRadius(100, 100, 100);
    expect(results).toHaveLength(3);
    expect(results[0].distance).toBeLessThanOrEqual(results[1].distance);
    expect(results[1].distance).toBeLessThanOrEqual(results[2].distance);
  });

  it("applies filter predicate", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    spawnGasCan(ctx, 100, 100);
    spawnMetalSheet(ctx, 110, 100);

    system(DT);

    const results = reg.queryRadius(100, 100, 50, (e) => e.material.category === "fuel");
    expect(results).toHaveLength(1);
    expect(results[0].entity.material.category).toBe("fuel");
  });

  it("returns empty array when no entities in range", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    spawnGasCan(ctx, 1000, 1000);
    system(DT);

    const results = reg.queryRadius(0, 0, 50);
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Flammable queries
// ---------------------------------------------------------------------------

describe("MaterialRegistry.getFlammableInRadius", () => {
  it("returns only flammable entities", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    spawnGasCan(ctx, 100, 100);        // flammability: 1.0
    spawnWoodenPlank(ctx, 110, 100);   // flammability: 0.9
    spawnMetalSheet(ctx, 120, 100);    // flammability: 0.0

    system(DT);

    const results = reg.getFlammableInRadius(100, 100, 200);
    expect(results).toHaveLength(2);
    const categories = results.map((r) => r.entity.material.category);
    expect(categories).toContain("fuel");
    expect(categories).toContain("wood");
  });

  it("uses default FIRE_SPREAD_RADIUS", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    // Just beyond default fire spread radius
    const farX = 100 + MATERIAL.FIRE_SPREAD_RADIUS + 10;
    spawnGasCan(ctx, farX, 100);

    system(DT);

    const results = reg.getFlammableInRadius(100, 100);
    expect(results).toHaveLength(0);
  });

  it("excludes objects below flammability threshold", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    // Metal sheet has flammability 0.0 — below threshold
    spawnMetalSheet(ctx, 100, 100);

    system(DT);

    const results = reg.getFlammableInRadius(100, 100, 200);
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Explosive queries
// ---------------------------------------------------------------------------

describe("MaterialRegistry.getExplosiveInRadius", () => {
  it("returns only explosive entities", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    spawnGasCan(ctx, 100, 100);        // explosivePotential: 0.9
    spawnCarBattery(ctx, 110, 100);    // explosivePotential: 0.3
    spawnWoodenPlank(ctx, 120, 100);   // explosivePotential: 0.0

    system(DT);

    const results = reg.getExplosiveInRadius(100, 100, 200);
    expect(results).toHaveLength(2);
  });

  it("excludes non-explosive objects", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    spawnWoodenPlank(ctx, 100, 100);
    spawnMetalSheet(ctx, 110, 100);

    system(DT);

    const results = reg.getExplosiveInRadius(100, 100, 200);
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Conductive queries
// ---------------------------------------------------------------------------

describe("MaterialRegistry.getConductiveInRadius", () => {
  it("returns only conductive entities", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    spawnWireSpool(ctx, 100, 100);     // conductivity: 1.0
    spawnCarBattery(ctx, 110, 100);    // conductivity: 0.9
    spawnMetalSheet(ctx, 120, 100);    // conductivity: 0.6
    spawnWoodenPlank(ctx, 130, 100);   // conductivity: 0.0

    system(DT);

    const results = reg.getConductiveInRadius(100, 100, 200);
    expect(results).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Adjacency detection (collision pairs)
// ---------------------------------------------------------------------------

describe("MaterialRegistry adjacency", () => {
  it("detects touching entities from collision pairs", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    const gasCan = spawnGasCan(ctx, 100, 100);
    const plank = spawnWoodenPlank(ctx, 132, 100);

    // Simulate collision pair between their bodies
    mockPairs = [
      { bodyA: { id: gasCan.physicsBody.bodyId }, bodyB: { id: plank.physicsBody.bodyId }, isActive: true },
    ];

    system(DT);

    const neighbors = reg.getAdjacentEntities(gasCan.physicsBody.bodyId);
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].material.category).toBe("wood");
  });

  it("returns bidirectional adjacency", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    const gasCan = spawnGasCan(ctx, 100, 100);
    const plank = spawnWoodenPlank(ctx, 132, 100);

    mockPairs = [
      { bodyA: { id: gasCan.physicsBody.bodyId }, bodyB: { id: plank.physicsBody.bodyId }, isActive: true },
    ];

    system(DT);

    const gasNeighbors = reg.getAdjacentEntities(gasCan.physicsBody.bodyId);
    const plankNeighbors = reg.getAdjacentEntities(plank.physicsBody.bodyId);
    expect(gasNeighbors).toHaveLength(1);
    expect(plankNeighbors).toHaveLength(1);
  });

  it("returns empty array for entities with no contacts", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    const gasCan = spawnGasCan(ctx, 100, 100);
    mockPairs = [];

    system(DT);

    const neighbors = reg.getAdjacentEntities(gasCan.physicsBody.bodyId);
    expect(neighbors).toHaveLength(0);
  });

  it("ignores collision pairs with non-material bodies", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    const gasCan = spawnGasCan(ctx, 100, 100);

    // Non-material body (e.g., wall, sensor)
    const wallBodyId = 9999;
    mockPairs = [
      { bodyA: { id: gasCan.physicsBody.bodyId }, bodyB: { id: wallBodyId }, isActive: true },
    ];

    system(DT);

    const neighbors = reg.getAdjacentEntities(gasCan.physicsBody.bodyId);
    expect(neighbors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Conductive neighbor queries
// ---------------------------------------------------------------------------

describe("MaterialRegistry.getConductiveNeighbors", () => {
  it("returns only conductive adjacent entities", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    const wire = spawnWireSpool(ctx, 100, 100);
    const metal = spawnMetalSheet(ctx, 110, 100);
    const plank = spawnWoodenPlank(ctx, 120, 100);

    // Wire touches both metal and plank
    mockPairs = [
      { bodyA: { id: wire.physicsBody.bodyId }, bodyB: { id: metal.physicsBody.bodyId }, isActive: true },
      { bodyA: { id: wire.physicsBody.bodyId }, bodyB: { id: plank.physicsBody.bodyId }, isActive: true },
    ];

    system(DT);

    const conductiveNeighbors = reg.getConductiveNeighbors(wire.physicsBody.bodyId);
    // Metal (0.6) is conductive, plank (0.0) is not
    expect(conductiveNeighbors).toHaveLength(1);
    expect(conductiveNeighbors[0].material.category).toBe("metal");
  });
});

// ---------------------------------------------------------------------------
// State queries
// ---------------------------------------------------------------------------

describe("MaterialRegistry state queries", () => {
  it("returns burning entities", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    const gasCan = spawnGasCan(ctx, 100, 100);
    spawnWoodenPlank(ctx, 200, 200);

    // Set gas can to burning
    gasCan.material.state = "burning";

    system(DT);

    const burning = reg.getBurningEntities();
    expect(burning).toHaveLength(1);
    expect(burning[0].material.category).toBe("fuel");
  });

  it("returns electrified entities", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    const wire = spawnWireSpool(ctx, 100, 100);
    spawnGasCan(ctx, 200, 200);

    wire.material.state = "electrified";

    system(DT);

    const electrified = reg.getElectrifiedEntities();
    expect(electrified).toHaveLength(1);
    expect(electrified[0].material.category).toBe("electronic");
  });

  it("returns empty arrays when no entities are in special states", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    spawnGasCan(ctx, 100, 100);
    spawnWoodenPlank(ctx, 200, 200);

    system(DT);

    expect(reg.getBurningEntities()).toHaveLength(0);
    expect(reg.getElectrifiedEntities()).toHaveLength(0);
  });

  it("tracks state transitions", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    const plank = spawnWoodenPlank(ctx, 100, 100);
    system(DT);

    // Initially inert
    expect(reg.getBurningEntities()).toHaveLength(0);

    // Set to burning
    plank.material.state = "burning";
    expect(reg.getBurningEntities()).toHaveLength(1);

    // Back to inert
    plank.material.state = "inert";
    expect(reg.getBurningEntities()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Entity removal / world churn
// ---------------------------------------------------------------------------

describe("MaterialRegistry after entity removal", () => {
  it("removed entities no longer appear in radius queries", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    const gasCan = spawnGasCan(ctx, 100, 100);
    const plank = spawnWoodenPlank(ctx, 110, 100);
    system(DT);

    expect(reg.queryRadius(100, 100, 200)).toHaveLength(2);

    // Remove gas can from the world
    world.remove(gasCan);
    system(DT);

    const results = reg.queryRadius(100, 100, 200);
    expect(results).toHaveLength(1);
    expect(results[0].entity.material.category).toBe("wood");
  });

  it("removed entities no longer appear in body ID lookup", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    const gasCan = spawnGasCan(ctx, 100, 100);
    const bodyId = gasCan.physicsBody.bodyId;
    system(DT);

    expect(reg.getEntityByBodyId(bodyId)).toBeDefined();

    world.remove(gasCan);
    system(DT);

    expect(reg.getEntityByBodyId(bodyId)).toBeUndefined();
  });

  it("removed entities no longer appear in adjacency queries", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    const wire = spawnWireSpool(ctx, 100, 100);
    const metal = spawnMetalSheet(ctx, 110, 100);

    mockPairs = [
      { bodyA: { id: wire.physicsBody.bodyId }, bodyB: { id: metal.physicsBody.bodyId }, isActive: true },
    ];

    system(DT);
    expect(reg.getAdjacentEntities(wire.physicsBody.bodyId)).toHaveLength(1);

    // Remove metal sheet
    world.remove(metal);
    system(DT);

    expect(reg.getAdjacentEntities(wire.physicsBody.bodyId)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Boundary and edge cases
// ---------------------------------------------------------------------------

describe("MaterialRegistry edge cases", () => {
  it("includes entities exactly at the boundary distance", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    // Entity exactly 50px away from query point
    spawnGasCan(ctx, 150, 100);
    system(DT);

    const results = reg.queryRadius(100, 100, 50);
    expect(results).toHaveLength(1);
    expect(results[0].distance).toBeCloseTo(50, 5);
  });

  it("queryRadius with radius 0 returns only entity at exact point", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    spawnGasCan(ctx, 100, 100);         // at query point
    spawnWoodenPlank(ctx, 100, 101);    // 1px away
    system(DT);

    const results = reg.queryRadius(100, 100, 0);
    expect(results).toHaveLength(1);
    expect(results[0].distance).toBe(0);
  });

  it("getExplosiveInRadius uses default EXPLOSION_RADIUS", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    // Just beyond default explosion radius
    const farX = 100 + MATERIAL.EXPLOSION_RADIUS + 10;
    spawnGasCan(ctx, farX, 100);
    system(DT);

    const results = reg.getExplosiveInRadius(100, 100);
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Fallback behavior for unknown object types
// ---------------------------------------------------------------------------

describe("Material fallback for unknown types", () => {
  it("defaults to wood category for unknown object type", () => {
    const ctx = createMockContext();
    const bodyId = registerMockBody(ctx);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const entity = createObjectEntity(
      100, 100, bodyId,
      "unknown_mystery_object", ObjectCategory.Debris, false,
      { durability: 0.5, flammability: 0.5, conductivity: 0.5 },
      0,
    );

    expect(entity.material.category).toBe("wood");
    expect(entity.material.explosivePotential).toBe(0);
    // Physics values are passed directly, not from assignments
    expect(entity.material.flammability).toBe(0.5);
    expect(entity.material.conductivity).toBe(0.5);
    // Should have warned
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("unknown_mystery_object"),
    );

    warnSpy.mockRestore();
  });

  it("barricade defaults to wood with zero physics for unknown type", () => {
    const ctx = createMockContext();
    const bodyId = registerMockBody(ctx);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const barricade = createBarricadeEntity(
      100, 100, bodyId,
      "nonexistent_type", 0, [200, 201], 60,
    );

    expect(barricade.material.category).toBe("wood");
    expect(barricade.material.flammability).toBe(0);
    expect(barricade.material.conductivity).toBe(0);
    expect(barricade.material.explosivePotential).toBe(0);
    // Should have warned about both missing assignment and missing def
    expect(warnSpy).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Body ID lookup
// ---------------------------------------------------------------------------

describe("MaterialRegistry.getEntityByBodyId", () => {
  it("resolves body ID to entity", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    const gasCan = spawnGasCan(ctx, 100, 100);
    system(DT);

    const entity = reg.getEntityByBodyId(gasCan.physicsBody.bodyId);
    expect(entity).toBeDefined();
    expect(entity!.material.category).toBe("fuel");
  });

  it("returns undefined for unknown body ID", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    system(DT);

    expect(reg.getEntityByBodyId(99999)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Adjacency edge cases (coverage gaps)
// ---------------------------------------------------------------------------

describe("MaterialRegistry adjacency edge cases", () => {
  it("adjacency map is rebuilt from scratch each tick (no stale data)", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    const gasCan = spawnGasCan(ctx, 100, 100);
    const plank = spawnWoodenPlank(ctx, 132, 100);

    // Tick 1: bodies colliding
    mockPairs = [
      { bodyA: { id: gasCan.physicsBody.bodyId }, bodyB: { id: plank.physicsBody.bodyId }, isActive: true },
    ];
    system(DT);
    expect(reg.getAdjacentEntities(gasCan.physicsBody.bodyId)).toHaveLength(1);
    expect(reg.getAdjacentEntities(plank.physicsBody.bodyId)).toHaveLength(1);

    // Tick 2: bodies separated — no collision pairs
    mockPairs = [];
    system(DT);
    expect(reg.getAdjacentEntities(gasCan.physicsBody.bodyId)).toHaveLength(0);
    expect(reg.getAdjacentEntities(plank.physicsBody.bodyId)).toHaveLength(0);
  });

  it("entity touching 3+ entities reports all neighbors", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    const wire = spawnWireSpool(ctx, 100, 100);
    const metal = spawnMetalSheet(ctx, 110, 100);
    const plank = spawnWoodenPlank(ctx, 90, 100);
    const gasCan = spawnGasCan(ctx, 100, 110);

    // Wire touches all three other entities simultaneously
    mockPairs = [
      { bodyA: { id: wire.physicsBody.bodyId }, bodyB: { id: metal.physicsBody.bodyId }, isActive: true },
      { bodyA: { id: wire.physicsBody.bodyId }, bodyB: { id: plank.physicsBody.bodyId }, isActive: true },
      { bodyA: { id: wire.physicsBody.bodyId }, bodyB: { id: gasCan.physicsBody.bodyId }, isActive: true },
    ];

    system(DT);

    const neighbors = reg.getAdjacentEntities(wire.physicsBody.bodyId);
    expect(neighbors).toHaveLength(3);
    const categories = neighbors.map((n) => n.material.category).sort();
    expect(categories).toEqual(["fuel", "metal", "wood"]);

    // Each neighbor also sees wire
    expect(reg.getAdjacentEntities(metal.physicsBody.bodyId)).toHaveLength(1);
    expect(reg.getAdjacentEntities(plank.physicsBody.bodyId)).toHaveLength(1);
    expect(reg.getAdjacentEntities(gasCan.physicsBody.bodyId)).toHaveLength(1);
  });

  it("duplicate collision pairs do not create duplicate adjacency entries", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    const gasCan = spawnGasCan(ctx, 100, 100);
    const plank = spawnWoodenPlank(ctx, 110, 100);

    // Same pair reported multiple times (and in both directions)
    mockPairs = [
      { bodyA: { id: gasCan.physicsBody.bodyId }, bodyB: { id: plank.physicsBody.bodyId }, isActive: true },
      { bodyA: { id: gasCan.physicsBody.bodyId }, bodyB: { id: plank.physicsBody.bodyId }, isActive: true },
      { bodyA: { id: plank.physicsBody.bodyId }, bodyB: { id: gasCan.physicsBody.bodyId }, isActive: true },
    ];

    system(DT);

    expect(reg.getAdjacentEntities(gasCan.physicsBody.bodyId)).toHaveLength(1);
    expect(reg.getAdjacentEntities(plank.physicsBody.bodyId)).toHaveLength(1);
  });

  it("excludes stale (inactive) collision pairs from adjacency", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    const gasCan = spawnGasCan(ctx, 100, 100);
    const plank = spawnWoodenPlank(ctx, 132, 100);
    const metal = spawnMetalSheet(ctx, 164, 100);

    // gas_can <-> plank is active, plank <-> metal is stale (isActive: false)
    mockPairs = [
      { bodyA: { id: gasCan.physicsBody.bodyId }, bodyB: { id: plank.physicsBody.bodyId }, isActive: true },
      { bodyA: { id: plank.physicsBody.bodyId }, bodyB: { id: metal.physicsBody.bodyId }, isActive: false },
    ];

    system(DT);

    // Only the active pair should create adjacency
    expect(reg.getAdjacentEntities(gasCan.physicsBody.bodyId)).toHaveLength(1);
    expect(reg.getAdjacentEntities(plank.physicsBody.bodyId)).toHaveLength(1);
    expect(reg.getAdjacentEntities(metal.physicsBody.bodyId)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Missing engine graceful degradation
// ---------------------------------------------------------------------------

describe("MaterialSystem missing engine", () => {
  /** Create a mock context where Matter.js engine is undefined. */
  function createNoEngineContext(): SceneContext {
    return createMockContext({
      scene: {
        matter: {
          world: { remove: vi.fn() },
          add: { rectangle: vi.fn() },
        },
      } as unknown as Phaser.Scene,
    });
  }

  it("runs without crashing when Matter.js engine is missing", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ctx = createNoEngineContext();
    const system = createMaterialSystem(ctx);
    spawnGasCan(ctx, 100, 100);

    expect(() => system(DT)).not.toThrow();
    expect(() => system(DT)).not.toThrow();

    errorSpy.mockRestore();
  });

  it("errors exactly once when engine is missing", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ctx = createNoEngineContext();
    const system = createMaterialSystem(ctx);
    spawnGasCan(ctx, 100, 100);

    system(DT);
    system(DT);
    system(DT);

    const engineErrors = errorSpy.mock.calls.filter((args) =>
      String(args[0]).includes("[MaterialSystem]"),
    );
    expect(engineErrors).toHaveLength(1);
    expect(engineErrors[0][0]).toContain("engine not found");

    errorSpy.mockRestore();
  });

  it("adjacency is empty (not stale) when engine is missing", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ctx = createNoEngineContext();
    const system = createMaterialSystem(ctx);

    const wire = spawnWireSpool(ctx, 100, 100);
    const metal = spawnMetalSheet(ctx, 110, 100);

    system(DT);

    // Even though both entities exist, adjacency should be empty
    // because no collision pairs are readable without the engine
    expect(ctx.materialRegistry!.getAdjacentEntities(wire.physicsBody.bodyId)).toHaveLength(0);
    expect(ctx.materialRegistry!.getAdjacentEntities(metal.physicsBody.bodyId)).toHaveLength(0);

    errorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Threshold boundary values
// ---------------------------------------------------------------------------

describe("MaterialRegistry threshold boundaries", () => {
  it("includes entity with flammability exactly at FLAMMABILITY_THRESHOLD", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    // wire_spool has flammability: 0.1 which equals FLAMMABILITY_THRESHOLD
    const wire = spawnWireSpool(ctx, 100, 100);
    expect(wire.material.flammability).toBe(MATERIAL.FLAMMABILITY_THRESHOLD);

    system(DT);

    const results = reg.getFlammableInRadius(100, 100, 200);
    expect(results).toHaveLength(1);
    expect(results[0].entity.material.category).toBe("electronic");
  });

  it("excludes entity with flammability below FLAMMABILITY_THRESHOLD", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    // car_battery has flammability: 0.0 which is below threshold
    const battery = spawnCarBattery(ctx, 100, 100);
    expect(battery.material.flammability).toBeLessThan(MATERIAL.FLAMMABILITY_THRESHOLD);

    system(DT);

    const results = reg.getFlammableInRadius(100, 100, 200);
    expect(results).toHaveLength(0);
  });

  it("includes entity with explosivePotential exactly at EXPLOSIVE_THRESHOLD", () => {
    const ctx = createMockContext();
    const system = createMaterialSystem(ctx);
    const reg = ctx.materialRegistry!;

    // fridge has explosivePotential: 0.1 which equals EXPLOSIVE_THRESHOLD
    const bodyId = registerMockBody(ctx);
    const fridge = createObjectEntity(
      100, 100, bodyId,
      "fridge", ObjectCategory.Furniture, false,
      { durability: 0.8, flammability: 0.1, conductivity: 0.4 },
      8,
    );
    expect(fridge.material.explosivePotential).toBe(MATERIAL.EXPLOSIVE_THRESHOLD);

    system(DT);

    const results = reg.getExplosiveInRadius(100, 100, 200);
    expect(results).toHaveLength(1);
    expect(results[0].entity.material.category).toBe("electronic");
  });
});
