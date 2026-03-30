import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExplosionSystem } from "./explosion-system";
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
import { EXPLOSION } from "./explosion-constants";
import { TileType } from "@/game/tiles/tile-types";
import { PathfindingGrid } from "@/game/procgen/pathfinding-grid";

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
      cameras: {
        main: {
          shake: vi.fn(),
          scrollX: 0,
          scrollY: 0,
          width: 800,
          height: 600,
        },
      },
      add: {
        rectangle: vi.fn(() => ({
          setScrollFactor: vi.fn().mockReturnThis(),
          setDepth: vi.fn().mockReturnThis(),
          destroy: vi.fn(),
        })),
        circle: vi.fn(() => ({
          setDepth: vi.fn().mockReturnThis(),
          setScale: vi.fn().mockReturnThis(),
          destroy: vi.fn(),
        })),
      },
      tweens: {
        add: vi.fn(),
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

function registerMockBody(
  ctx: SceneContext,
  x = 0,
  y = 0,
  isStatic = false,
): number {
  const id = nextBodyId++;
  const mockBody = {
    id,
    position: { x, y },
    velocity: { x: 0, y: 0 },
    speed: 0,
    angularVelocity: 0,
    force: { x: 0, y: 0 },
    inertia: Infinity,
    inverseInertia: 0,
    isStatic,
  };
  ctx.bodyRegistry.register(mockBody as unknown as MatterJS.BodyType);
  return id;
}

function spawnGasCan(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx, x, y);
  return createObjectEntity(
    x, y, bodyId,
    "gas_can", ObjectCategory.Loot, false,
    { durability: 0.2, flammability: 1.0, conductivity: 0.1 },
    6,
  );
}

function spawnWoodenPlank(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx, x, y);
  return createObjectEntity(
    x, y, bodyId,
    "wooden_plank", ObjectCategory.Loot, false,
    { durability: 0.3, flammability: 0.9, conductivity: 0.0 },
    3,
  );
}

function spawnMetalSheet(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx, x, y);
  return createObjectEntity(
    x, y, bodyId,
    "metal_sheet", ObjectCategory.Loot, false,
    { durability: 0.8, flammability: 0.0, conductivity: 0.6 },
    4,
  );
}

function spawnZombie(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx, x, y);
  return createZombieEntity(x, y, bodyId);
}

function spawnPlayer(ctx: SceneContext, x: number, y: number) {
  const bodyId = registerMockBody(ctx, x, y);
  return createPlayerEntity(x, y, bodyId);
}

/** Tick the explosion system with material registry body lookup rebuilt. */
function tick(
  ctx: SceneContext,
  system: (dt: number) => void,
): void {
  ctx.materialRegistry!.rebuildBodyLookup();
  system(DT);
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

/**
 * Create a tile grid with the given dimensions filled with floor tiles.
 * Optionally place wall tiles at specified positions.
 */
function createTileGrid(
  width: number,
  height: number,
  walls: Array<{ x: number; y: number }> = [],
): number[][] {
  const grid: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      row.push(TileType.Floor);
    }
    grid.push(row);
  }
  for (const wall of walls) {
    if (wall.y >= 0 && wall.y < height && wall.x >= 0 && wall.x < width) {
      grid[wall.y][wall.x] = TileType.Wall;
    }
  }
  return grid;
}

/** Create a mock PathfindingGrid with all-walkable tiles. */
function createMockPathfindingGrid(width: number, height: number): PathfindingGrid {
  const matrix: number[][] = [];
  for (let y = 0; y < height; y++) {
    matrix.push(new Array(width).fill(0)); // 0 = walkable
  }
  return new PathfindingGrid(matrix);
}

beforeEach(() => {
  nextBodyId = 1000;
});

afterEach(() => {
  resetWorld();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Detonation triggering
// ---------------------------------------------------------------------------

describe("ExplosionSystem — detonation triggering", () => {
  it("triggers explosion when a burning entity has explosive potential above threshold", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    const detonations = collectEvents(ctx.eventBus, "explosion-detonated");
    tick(ctx, system);

    expect(detonations).toHaveLength(1);
    expect(detonations[0]).toMatchObject({
      objectType: "gas_can",
      explosivePotential: 0.9,
      radius: EXPLOSION.BLAST_RADIUS,
    });
  });

  it("does not trigger explosion for non-explosive burning objects", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const plank = spawnWoodenPlank(ctx, 100, 100);
    plank.material.state = "burning";

    const detonations = collectEvents(ctx.eventBus, "explosion-detonated");
    tick(ctx, system);

    expect(detonations).toHaveLength(0);
  });

  it("does not trigger explosion for inert explosive objects", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    spawnGasCan(ctx, 100, 100); // state defaults to 'inert'

    const detonations = collectEvents(ctx.eventBus, "explosion-detonated");
    tick(ctx, system);

    expect(detonations).toHaveLength(0);
  });

  it("removes the detonating entity from the ECS world", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    tick(ctx, system);

    // The gas can should be removed from the world
    // Miniplex keeps object properties after removal — check world membership
    expect(world.entities).not.toContain(gasCan);
  });

  it("unregisters the detonating entity's physics body", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";
    const bodyId = gasCan.physicsBody.bodyId;

    tick(ctx, system);

    expect(ctx.bodyRegistry.get(bodyId)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Area damage — zombies
// ---------------------------------------------------------------------------

describe("ExplosionSystem — zombie damage", () => {
  it("deals full damage to zombie at blast center", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    // Spawn zombie very close but not at exact center (distance > 1)
    const zombie = spawnZombie(ctx, 102, 100);

    tick(ctx, system);

    // At distance ~2px: falloff ≈ 1.0, damage ≈ 80 * 0.9 * 1.0 = 72
    // Since 72 > 50 HP (shambler), health is clamped to 0
    expect(zombie.health.current).toBe(0);
  });

  it("deals reduced damage to zombie at blast edge", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    // Place gas can at 100,100 and zombie at edge of blast radius
    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    // Place zombie at exactly the blast radius distance
    const zombie = spawnZombie(ctx, 100 + EXPLOSION.BLAST_RADIUS, 100);
    const initialHP = zombie.health.current;

    tick(ctx, system);

    // At max radius: damage = BASE_DAMAGE * 0.9 * DAMAGE_FALLOFF
    const expectedDamage = EXPLOSION.BASE_DAMAGE * 0.9 * EXPLOSION.DAMAGE_FALLOFF;
    expect(zombie.health.current).toBeCloseTo(initialHP - expectedDamage, 1);
  });

  it("does not damage zombie outside blast radius", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    const zombie = spawnZombie(ctx, 100 + EXPLOSION.BLAST_RADIUS + 10, 100);
    const initialHP = zombie.health.current;

    tick(ctx, system);

    expect(zombie.health.current).toBe(initialHP);
  });

  it("staggers zombies within blast radius", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    const zombie = spawnZombie(ctx, 120, 100);
    zombie.aiState.state = "pathing";

    tick(ctx, system);

    expect(zombie.aiState.state).toBe("staggered");
    expect(zombie.aiState.staggerTimeRemaining).toBeGreaterThan(0);
    expect(zombie.velocity.vx).toBe(0);
    expect(zombie.velocity.vy).toBe(0);
  });

  it("skips already-dead zombies", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    const zombie = spawnZombie(ctx, 120, 100);
    zombie.health.current = 0; // Already dead

    const damageEvents = collectEvents(ctx.eventBus, "explosion-damage");
    tick(ctx, system);

    const zombieDamageEvents = damageEvents.filter(
      (e: unknown) => (e as { targetType: string }).targetType === "zombie",
    );
    expect(zombieDamageEvents).toHaveLength(0);
  });

  it("emits explosion-damage event for each zombie hit", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    spawnZombie(ctx, 120, 100);
    spawnZombie(ctx, 140, 100);

    const damageEvents = collectEvents(ctx.eventBus, "explosion-damage");
    tick(ctx, system);

    const zombieDamageEvents = damageEvents.filter(
      (e: unknown) => (e as { targetType: string }).targetType === "zombie",
    );
    expect(zombieDamageEvents).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Area damage — player
// ---------------------------------------------------------------------------

describe("ExplosionSystem — player damage", () => {
  it("deals damage to player within blast radius", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    const player = spawnPlayer(ctx, 130, 100);
    const initialHP = player.health.current;

    tick(ctx, system);

    expect(player.health.current).toBeLessThan(initialHP);
  });

  it("respects player i-frames", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    const player = spawnPlayer(ctx, 130, 100);
    player.combatState.iFramesRemaining = 0.5; // Active i-frames
    const initialHP = player.health.current;

    tick(ctx, system);

    expect(player.health.current).toBe(initialHP);
  });

  it("syncs previousHealth to prevent combat system i-frame grant", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    const player = spawnPlayer(ctx, 130, 100);

    tick(ctx, system);

    expect(player.combatState.previousHealth).toBe(player.health.current);
  });

  it("does not damage player outside blast radius", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    const player = spawnPlayer(ctx, 100 + EXPLOSION.BLAST_RADIUS + 10, 100);
    const initialHP = player.health.current;

    tick(ctx, system);

    expect(player.health.current).toBe(initialHP);
  });
});

// ---------------------------------------------------------------------------
// Radial force
// ---------------------------------------------------------------------------

describe("ExplosionSystem — radial force", () => {
  it("applies outward force to physics bodies within blast radius", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    // Spawn a body to the right of the gas can
    const targetBodyId = registerMockBody(ctx, 150, 100);
    const targetBody = ctx.bodyRegistry.get(targetBodyId)!;

    tick(ctx, system);

    // Force should be applied in the positive X direction (away from explosion)
    expect(targetBody.force.x).toBeGreaterThan(0);
    // Y force should be ~0 since the body is directly to the right
    expect(Math.abs(targetBody.force.y)).toBeLessThan(0.001);
  });

  it("does not apply force to static bodies", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    const staticBodyId = registerMockBody(ctx, 150, 100, true);
    const staticBody = ctx.bodyRegistry.get(staticBodyId)!;

    tick(ctx, system);

    expect(staticBody.force.x).toBe(0);
    expect(staticBody.force.y).toBe(0);
  });

  it("does not apply force to bodies outside blast radius", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    const farBodyId = registerMockBody(ctx, 100 + EXPLOSION.BLAST_RADIUS + 50, 100);
    const farBody = ctx.bodyRegistry.get(farBodyId)!;

    tick(ctx, system);

    expect(farBody.force.x).toBe(0);
    expect(farBody.force.y).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Barricade destruction
// ---------------------------------------------------------------------------

describe("ExplosionSystem — barricade damage", () => {
  it("damages barricades within blast radius", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    const bodyId = registerMockBody(ctx, 130, 100);
    const barricade = createBarricadeEntity(
      130, 100, bodyId, "wooden_plank", 0, [], 100,
    );

    tick(ctx, system);

    expect(barricade.barricade.currentDurability).toBeLessThan(100);
  });

  it("destroys barricades when durability reaches zero", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    const bodyId = registerMockBody(ctx, 110, 100);
    const barricade = createBarricadeEntity(
      110, 100, bodyId, "wooden_plank", 0, [], 10, // Very low durability
    );

    const brokenEvents = collectEvents(ctx.eventBus, "barricade-broken");
    tick(ctx, system);

    // Barricade should be removed from the world
    expect(world.entities).not.toContain(barricade);
    expect(brokenEvents).toHaveLength(1);
  });

  it("releases barricade constraints on destruction", () => {
    const constraintRegistry = new ConstraintRegistry();

    // Register a mock constraint
    const mockConstraint = { id: 999 };
    constraintRegistry.register(mockConstraint as unknown as MatterJS.ConstraintType);

    const ctxWithConstraints = createMockContext({ constraintRegistry });
    const system = createExplosionSystem(ctxWithConstraints);

    const gasCan = spawnGasCan(ctxWithConstraints, 100, 100);
    gasCan.material.state = "burning";

    const bodyId = registerMockBody(ctxWithConstraints, 110, 100);
    createBarricadeEntity(
      110, 100, bodyId, "wooden_plank", 0, [999], 5, // Low durability, will be destroyed
    );

    tick(ctxWithConstraints, system);

    // Constraint should be unregistered
    expect(constraintRegistry.get(999)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Fire ignition chain
// ---------------------------------------------------------------------------

describe("ExplosionSystem — fire ignition", () => {
  it("ignites nearby flammable objects within blast radius", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    // Flammable wooden plank within blast radius
    const plank = spawnWoodenPlank(ctx, 150, 100);

    tick(ctx, system);

    expect(plank.material.state).toBe("burning");
  });

  it("does not ignite non-flammable objects", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    // Metal sheet is not flammable (flammability: 0.0)
    const metal = spawnMetalSheet(ctx, 150, 100);

    tick(ctx, system);

    expect(metal.material.state).toBe("inert");
  });

  it("does not ignite objects outside blast radius", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    const plank = spawnWoodenPlank(ctx, 100 + EXPLOSION.BLAST_RADIUS + 50, 100);

    tick(ctx, system);

    expect(plank.material.state).toBe("inert");
  });
});

// ---------------------------------------------------------------------------
// Chain detonation
// ---------------------------------------------------------------------------

describe("ExplosionSystem — chain detonation", () => {
  it("chain-detonates nearby explosive objects within same tick", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    // Gas can A burns and detonates
    const gasCanA = spawnGasCan(ctx, 100, 100);
    gasCanA.material.state = "burning";

    // Gas can B within blast radius of A
    const gasCanB = spawnGasCan(ctx, 160, 100);

    const detonations = collectEvents(ctx.eventBus, "explosion-detonated");
    tick(ctx, system);

    // Both should detonate
    expect(detonations).toHaveLength(2);

    // Both entities should be removed from the world
    expect(world.entities).not.toContain(gasCanA);
    expect(world.entities).not.toContain(gasCanB);
  });

  it("chain-detonates non-flammable explosive objects via direct state mutation", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    // Gas can A triggers the chain
    const gasCanA = spawnGasCan(ctx, 100, 100);
    gasCanA.material.state = "burning";

    // Create a non-flammable explosive object within blast radius
    // (high explosivePotential but zero flammability — bypasses igniteEntity)
    const bodyId = registerMockBody(ctx, 160, 100);
    const nonFlammableExplosive = createObjectEntity(
      160, 100, bodyId,
      "metal_sheet", ObjectCategory.Loot, false,
      { durability: 0.8, flammability: 0.0, conductivity: 0.6 },
      4,
    );
    // Override explosivePotential to make it explosive despite being metal
    nonFlammableExplosive.material.explosivePotential = 0.5;

    const detonations = collectEvents(ctx.eventBus, "explosion-detonated");
    tick(ctx, system);

    // Both should detonate — the non-flammable explosive gets state set directly
    expect(detonations).toHaveLength(2);
    expect(world.entities).not.toContain(gasCanA);
    expect(world.entities).not.toContain(nonFlammableExplosive);
  });

  it("does not re-detonate already detonated entities", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    // Two gas cans very close together
    const gasCanA = spawnGasCan(ctx, 100, 100);
    gasCanA.material.state = "burning";

    const gasCanB = spawnGasCan(ctx, 110, 100);
    gasCanB.material.state = "burning";

    const detonations = collectEvents(ctx.eventBus, "explosion-detonated");
    tick(ctx, system);

    // Each should detonate exactly once
    expect(detonations).toHaveLength(2);
  });

  it("respects MAX_CHAIN_DEPTH limit", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    // Create a linear chain of gas cans longer than MAX_CHAIN_DEPTH.
    // Space them at 90px apart — just under the 96px blast radius — so
    // each explosion can only reach the immediately next can, creating
    // a true one-hop-per-depth BFS progression.
    const chainLength = EXPLOSION.MAX_CHAIN_DEPTH + 3;
    const gasCans = [];
    for (let i = 0; i < chainLength; i++) {
      const gasCan = spawnGasCan(ctx, 100 + i * 90, 100);
      gasCans.push(gasCan);
    }
    gasCans[0].material.state = "burning";

    const detonations = collectEvents(ctx.eventBus, "explosion-detonated");
    tick(ctx, system);

    // Should be capped at MAX_CHAIN_DEPTH (first can detonates as depth 1,
    // each subsequent can adds one depth level)
    expect(detonations.length).toBeLessThanOrEqual(EXPLOSION.MAX_CHAIN_DEPTH);
    expect(detonations.length).toBeLessThan(chainLength);
  });
});

// ---------------------------------------------------------------------------
// Wall destruction
// ---------------------------------------------------------------------------

describe("ExplosionSystem — wall destruction", () => {
  it("destroys interior wall tiles within blast radius", () => {
    // Interior wall: floor on both sides (left and right)
    // Grid layout (10x10): all floor except column 5 is wall
    // But positions (5,3), (5,4), (5,5) have floor on both sides
    const width = 10;
    const height = 10;
    const tileGrid = createTileGrid(width, height, [{ x: 5, y: 5 }]);

    const pathfindingGrid = createMockPathfindingGrid(width, height);

    const ctx = createMockContext({
      tileGrid,
      pathfindingGrid,
    });
    const system = createExplosionSystem(ctx);

    // Place gas can near the interior wall at tile (5,5)
    // Pixel position of tile center (5,5) = (5*32+16, 5*32+16) = (176, 176)
    const gasCan = spawnGasCan(ctx, 176, 176);
    gasCan.material.state = "burning";

    const wallEvents = collectEvents(ctx.eventBus, "explosion-wall-destroyed");
    tick(ctx, system);

    // The wall at (5,5) should be destroyed since it has floor on both sides
    expect(tileGrid[5][5]).toBe(TileType.Floor);
    expect(wallEvents).toHaveLength(1);
    expect(wallEvents[0]).toMatchObject({ tilePosition: { x: 5, y: 5 } });
  });

  it("does not destroy exterior wall tiles (empty on one side)", () => {
    const width = 10;
    const height = 10;
    // Wall at position (0,5) — left edge, cannot have floor on both sides
    const tileGrid = createTileGrid(width, height, [{ x: 0, y: 5 }]);
    // Make tile to the left Empty (out of bounds handled by isInteriorWall)
    const pathfindingGrid = createMockPathfindingGrid(width, height);

    const ctx = createMockContext({
      tileGrid,
      pathfindingGrid,
    });
    const system = createExplosionSystem(ctx);

    // Place gas can near the edge wall
    const gasCan = spawnGasCan(ctx, 16, 176);
    gasCan.material.state = "burning";

    tick(ctx, system);

    // Edge wall should not be destroyed
    expect(tileGrid[5][0]).toBe(TileType.Wall);
  });

  it("destroys wall that is interior on one axis even if another axis has empty", () => {
    const width = 10;
    const height = 10;
    // Wall at (5,5) with Empty tile to the left at (4,5) but floor above and below
    const tileGrid = createTileGrid(width, height, [{ x: 5, y: 5 }]);
    tileGrid[5][4] = TileType.Empty; // Left neighbor is empty

    const pathfindingGrid = createMockPathfindingGrid(width, height);
    const ctx = createMockContext({
      tileGrid,
      pathfindingGrid,
    });
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 176, 176);
    gasCan.material.state = "burning";

    tick(ctx, system);

    // Top (4,5) and bottom (6,5) are both Floor → interior vertically,
    // so the wall is destroyed even though left neighbor is empty
    expect(tileGrid[5][5]).toBe(TileType.Floor);
  });

  it("does not destroy wall with non-walkable tiles on all opposing sides", () => {
    const width = 10;
    const height = 10;
    // Wall at (5,5) with empty/wall on all four sides
    const tileGrid = createTileGrid(width, height, [
      { x: 5, y: 5 },  // Target wall
      { x: 4, y: 5 },  // Left is wall
      { x: 6, y: 5 },  // Right is wall
    ]);
    tileGrid[4][5] = TileType.Empty; // Top is empty
    tileGrid[6][5] = TileType.Empty; // Bottom is empty

    const pathfindingGrid = createMockPathfindingGrid(width, height);
    const ctx = createMockContext({
      tileGrid,
      pathfindingGrid,
    });
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 176, 176);
    gasCan.material.state = "burning";

    tick(ctx, system);

    // Left+right are walls, top+bottom are empty → not interior on either axis
    expect(tileGrid[5][5]).toBe(TileType.Wall);
  });

  it("preserves wall tiles surrounded by non-walkable tiles", () => {
    const width = 10;
    const height = 10;
    // Create a cluster of walls so the center wall has walls on all sides
    const walls = [
      { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 },
      { x: 4, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 },
      { x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 },
    ];
    const tileGrid = createTileGrid(width, height, walls);

    const pathfindingGrid = createMockPathfindingGrid(width, height);
    const ctx = createMockContext({
      tileGrid,
      pathfindingGrid,
    });
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 176, 176); // Near center of wall cluster
    gasCan.material.state = "burning";

    tick(ctx, system);

    // Center wall (5,5) has walls on all sides — not interior
    expect(tileGrid[5][5]).toBe(TileType.Wall);
  });

  it("updates pathfinding grid when walls are destroyed", () => {
    const width = 10;
    const height = 10;
    const tileGrid = createTileGrid(width, height, [{ x: 5, y: 5 }]);
    const pathfindingGrid = createMockPathfindingGrid(width, height);

    // Mark the wall tile as blocked in pathfinding
    pathfindingGrid.setWalkable(5, 5, false);

    const ctx = createMockContext({ tileGrid, pathfindingGrid });
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 176, 176);
    gasCan.material.state = "burning";

    tick(ctx, system);

    // Wall should now be walkable in pathfinding
    expect(tileGrid[5][5]).toBe(TileType.Floor);
  });
});

// ---------------------------------------------------------------------------
// Visual feedback
// ---------------------------------------------------------------------------

describe("ExplosionSystem — visual feedback", () => {
  it("triggers camera shake on detonation", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    tick(ctx, system);

    const cameras = (ctx.scene as unknown as { cameras: { main: { shake: ReturnType<typeof vi.fn> } } }).cameras;
    expect(cameras.main.shake).toHaveBeenCalledWith(
      EXPLOSION.SCREEN_SHAKE_DURATION,
      EXPLOSION.SCREEN_SHAKE_INTENSITY,
    );
  });

  it("creates white flash rectangle on detonation", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    tick(ctx, system);

    const sceneAdd = (ctx.scene as unknown as { add: { rectangle: ReturnType<typeof vi.fn> } }).add;
    expect(sceneAdd.rectangle).toHaveBeenCalled();
  });

  it("creates expanding circle effect on detonation", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    tick(ctx, system);

    const sceneAdd = (ctx.scene as unknown as { add: { circle: ReturnType<typeof vi.fn> } }).add;
    expect(sceneAdd.circle).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Noise generation
// ---------------------------------------------------------------------------

describe("ExplosionSystem — noise generation", () => {
  it("emits noise-generated event on detonation", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    const noiseEvents = collectEvents(ctx.eventBus, "noise-generated");
    tick(ctx, system);

    expect(noiseEvents).toHaveLength(1);
    expect(noiseEvents[0]).toMatchObject({
      position: { x: 100, y: 100 },
      source: "explosion",
    });
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("ExplosionSystem — edge cases", () => {
  it("handles no burning entities gracefully", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    spawnGasCan(ctx, 100, 100); // Inert
    spawnWoodenPlank(ctx, 200, 200); // Also inert

    // Should not throw
    expect(() => tick(ctx, system)).not.toThrow();
  });

  it("handles empty world gracefully", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    expect(() => tick(ctx, system)).not.toThrow();
  });

  it("handles entity removed by prior detonation in same tick", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    // Two gas cans at same position — first detonation removes both
    const gasCanA = spawnGasCan(ctx, 100, 100);
    gasCanA.material.state = "burning";

    const gasCanB = spawnGasCan(ctx, 105, 100);
    gasCanB.material.state = "burning";

    // Should not throw despite entity removal mid-processing
    expect(() => tick(ctx, system)).not.toThrow();
  });

  it("clamps health to zero (never negative)", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    const zombie = spawnZombie(ctx, 100, 100);
    zombie.health.current = 1; // Very low HP

    tick(ctx, system);

    expect(zombie.health.current).toBe(0);
  });

  it("does not detonate the same entity across multiple ticks", () => {
    const ctx = createMockContext();
    const system = createExplosionSystem(ctx);

    const gasCan = spawnGasCan(ctx, 100, 100);
    gasCan.material.state = "burning";

    const detonations = collectEvents(ctx.eventBus, "explosion-detonated");

    tick(ctx, system);
    tick(ctx, system);

    // Entity was removed on first tick, so only 1 detonation
    expect(detonations).toHaveLength(1);
  });

  it("throws if materialRegistry is not provided", () => {
    const ctx = createMockContext({ materialRegistry: undefined });
    expect(() => createExplosionSystem(ctx)).toThrow(
      "[ExplosionSystem] ctx.materialRegistry is required",
    );
  });
});
