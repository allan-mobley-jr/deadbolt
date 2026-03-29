import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createBarricadeSystem,
  BARRICADE_DURABILITY_SCALE,
} from "./barricade-system";
import type { SceneContext } from "./scene-context";
import { createInputState, createClockState } from "./scene-context";
import { BodyRegistry } from "./body-registry";
import { ConstraintRegistry } from "./constraint-registry";
import { WallAnchorRegistry, SNAP_RADIUS } from "./wall-anchor-registry";
import { PathfindingGrid } from "@/game/procgen/pathfinding-grid";
import { world } from "@/game/ecs/world";
import { resetWorld } from "@/game/ecs/world";
import { createGameEventBus, safeEmit } from "@/game/events/event-bus";
import type { GameEventBus } from "@/game/events/event-bus";
import {
  createPlayerEntity,
  createObjectEntity,
} from "@/game/ecs/archetypes";
import { barricadeEntities, interactableEntities } from "@/game/ecs/queries";
import { TILE_SIZE } from "@/game/procgen/constants";
import type { EntryPoint } from "@/types/procgen";
import { ObjectCategory } from "@/types/procgen";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextBodyId = 500;
let nextConstraintId = 900;

function mockBody(
  id?: number,
  x = 0,
  y = 0,
): MatterJS.BodyType {
  const bid = id ?? nextBodyId++;
  return {
    id: bid,
    position: { x, y },
    velocity: { x: 0, y: 0 },
    speed: 0,
    angularVelocity: 0,
    force: { x: 0, y: 0 },
    friction: 0.8,
    frictionAir: 0.1,
    inertia: Infinity,
    inverseInertia: 0,
  } as unknown as MatterJS.BodyType;
}

function mockConstraint(id?: number): MatterJS.ConstraintType {
  const cid = id ?? nextConstraintId++;
  return {
    id: cid,
    bodyA: null,
    bodyB: null,
    pointA: { x: 0, y: 0 },
    pointB: { x: 0, y: 0 },
    stiffness: 0.8,
    length: 0,
  } as unknown as MatterJS.ConstraintType;
}

function createEntryPoint(
  x: number,
  y: number,
  type: "door" | "window" = "door",
  facingDirection: "north" | "south" | "east" | "west" = "north",
): EntryPoint {
  return {
    position: { x, y },
    type,
    facingDirection,
    roomIndex: 0,
    barricaded: false,
  };
}

function createMockContext(): {
  ctx: SceneContext;
  bodyRegistry: BodyRegistry;
  constraintRegistry: ConstraintRegistry;
  wallAnchorRegistry: WallAnchorRegistry;
  eventBus: GameEventBus;
  pathfindingGrid: PathfindingGrid;
  entryPoints: EntryPoint[];
} {
  const bodyRegistry = new BodyRegistry();
  const constraintRegistry = new ConstraintRegistry();
  const wallAnchorRegistry = new WallAnchorRegistry();
  const eventBus = createGameEventBus();

  // Create a small pathfinding grid (10x10, all walkable)
  const matrix: number[][] = [];
  for (let y = 0; y < 10; y++) {
    matrix.push(new Array(10).fill(0));
  }
  const pathfindingGrid = new PathfindingGrid(matrix);

  const entryPoints = [
    createEntryPoint(5, 3, "door", "north"),
  ];

  // Set up wall anchors
  const anchorA = mockBody(undefined, 5 * TILE_SIZE, 3 * TILE_SIZE + TILE_SIZE / 2);
  const anchorB = mockBody(undefined, 5 * TILE_SIZE + TILE_SIZE, 3 * TILE_SIZE + TILE_SIZE / 2);
  bodyRegistry.register(anchorA);
  bodyRegistry.register(anchorB);

  // Manually populate the anchor registry
  (wallAnchorRegistry as unknown as { anchors: unknown[] }).anchors = [
    {
      entryPointIndex: 0,
      anchorBodyIdA: anchorA.id,
      anchorBodyIdB: anchorB.id,
      centerX: 5 * TILE_SIZE + TILE_SIZE / 2,
      centerY: 3 * TILE_SIZE + TILE_SIZE / 2,
      orientation: "horizontal" as const,
    },
  ];

  const mockMatterWorld = {
    removeConstraint: vi.fn(),
    step: vi.fn(),
    autoUpdate: false,
  };

  const mockMatterAdd = {
    constraint: vi.fn((_bodyA: unknown, _bodyB: unknown, _len: number, _stiff: number) => {
      return mockConstraint();
    }),
    rectangle: vi.fn(),
  };

  const ctx: SceneContext = {
    scene: {
      matter: {
        world: mockMatterWorld,
        add: mockMatterAdd,
      },
      add: {
        rectangle: vi.fn(),
        graphics: vi.fn(() => ({
          clear: vi.fn(),
          fillStyle: vi.fn(),
          fillRect: vi.fn(),
        })),
      },
      cameras: {
        main: {
          getWorldPoint: vi.fn((x: number, y: number) => ({ x, y })),
        },
      },
      input: {
        keyboard: null,
        activePointer: { x: 0, y: 0, isDown: false },
      },
    } as unknown as Phaser.Scene,
    bodyRegistry,
    inputState: createInputState(),
    getAlpha: () => 0,
    clockState: createClockState(),
    eventBus,
    constraintRegistry,
    wallAnchorRegistry,
    pathfindingGrid,
    entryPoints,
  };

  return {
    ctx,
    bodyRegistry,
    constraintRegistry,
    wallAnchorRegistry,
    eventBus,
    pathfindingGrid,
    entryPoints,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BarricadeSystem", () => {
  beforeEach(() => {
    resetWorld();
    nextBodyId = 500;
    nextConstraintId = 900;
  });

  it("is a no-op when registries are not set", () => {
    const { ctx } = createMockContext();
    // Remove registries
    ctx.constraintRegistry = undefined;
    ctx.wallAnchorRegistry = undefined;
    ctx.pathfindingGrid = undefined;
    ctx.entryPoints = undefined;

    const system = createBarricadeSystem(ctx);
    expect(() => system(1 / 60)).not.toThrow();
  });

  it("is a no-op when no player exists", () => {
    const { ctx } = createMockContext();
    const system = createBarricadeSystem(ctx);
    expect(() => system(1 / 60)).not.toThrow();
  });

  describe("snap detection", () => {
    it("emits barricade-snap when object is near entry point during drag", () => {
      const { ctx, bodyRegistry, eventBus } = createMockContext();

      // Spawn player
      const playerBody = mockBody();
      bodyRegistry.register(playerBody);
      createPlayerEntity(100, 100, playerBody.id);

      // Spawn an object near the entry point snap zone
      const epCenterX = 5 * TILE_SIZE + TILE_SIZE / 2;
      const epCenterY = 3 * TILE_SIZE + TILE_SIZE / 2;
      const objBody = mockBody(undefined, epCenterX, epCenterY);
      bodyRegistry.register(objBody);
      createObjectEntity(
        epCenterX,
        epCenterY,
        objBody.id,
        "wooden_plank",
        ObjectCategory.Loot,
        false,
        { durability: 0.3, flammability: 0.9, conductivity: 0 },
        3,
      );

      const handler = vi.fn();
      eventBus.on("barricade-snap", handler);

      // Simulate pointer down (dragging)
      ctx.inputState.pointerDown = true;
      ctx.inputState.pointerWorldX = epCenterX;
      ctx.inputState.pointerWorldY = epCenterY;

      const system = createBarricadeSystem(ctx);
      system(1 / 60);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          snapping: true,
          entryPointIndex: 0,
        }),
      );
    });

    it("emits snap:false when object leaves snap zone", () => {
      const { ctx, bodyRegistry, eventBus } = createMockContext();

      const playerBody = mockBody();
      bodyRegistry.register(playerBody);
      createPlayerEntity(100, 100, playerBody.id);

      const epCenterX = 5 * TILE_SIZE + TILE_SIZE / 2;
      const epCenterY = 3 * TILE_SIZE + TILE_SIZE / 2;
      const objBody = mockBody(undefined, epCenterX, epCenterY);
      bodyRegistry.register(objBody);
      createObjectEntity(
        epCenterX, epCenterY, objBody.id,
        "wooden_plank", ObjectCategory.Loot, false,
        { durability: 0.3, flammability: 0.9, conductivity: 0 }, 3,
      );

      const handler = vi.fn();
      eventBus.on("barricade-snap", handler);

      // Enter snap zone
      ctx.inputState.pointerDown = true;
      const system = createBarricadeSystem(ctx);
      system(1 / 60);

      // Move object far away (by mutating position)
      const entity = interactableEntities.entities[0];
      entity.position.x = 9999;
      entity.position.y = 9999;

      system(1 / 60);

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenLastCalledWith(
        expect.objectContaining({ snapping: false }),
      );
    });
  });

  describe("placement", () => {
    it("places a barricade on pointer release within snap zone", () => {
      const { ctx, bodyRegistry, eventBus, constraintRegistry, pathfindingGrid, entryPoints } =
        createMockContext();

      const playerBody = mockBody();
      bodyRegistry.register(playerBody);
      createPlayerEntity(100, 100, playerBody.id);

      const epCenterX = 5 * TILE_SIZE + TILE_SIZE / 2;
      const epCenterY = 3 * TILE_SIZE + TILE_SIZE / 2;
      const objBody = mockBody(undefined, epCenterX, epCenterY);
      bodyRegistry.register(objBody);
      createObjectEntity(
        epCenterX, epCenterY, objBody.id,
        "wooden_plank", ObjectCategory.Loot, false,
        { durability: 0.3, flammability: 0.9, conductivity: 0 }, 3,
      );

      const placedHandler = vi.fn();
      eventBus.on("barricade-placed", placedHandler);

      // Simulate pointer release
      ctx.inputState.pointerReleased = true;
      ctx.inputState.pointerWorldX = epCenterX;
      ctx.inputState.pointerWorldY = epCenterY;

      const system = createBarricadeSystem(ctx);
      system(1 / 60);

      // Verify barricade entity was created
      expect(barricadeEntities.entities).toHaveLength(1);
      const barricade = barricadeEntities.entities[0];
      expect(barricade.barricade.sourceObjectType).toBe("wooden_plank");
      expect(barricade.barricade.entryPointIndex).toBe(0);
      expect(barricade.barricade.constraintIds).toHaveLength(2);
      expect(barricade.health.max).toBe(Math.round(0.3 * BARRICADE_DURABILITY_SCALE));

      // Verify constraints were created
      expect(constraintRegistry.size).toBe(2);

      // Verify pathfinding grid updated
      expect(pathfindingGrid.isWalkable(5, 3)).toBe(false);

      // Verify entry point marked as barricaded
      expect(entryPoints[0].barricaded).toBe(true);

      // Verify event emitted
      expect(placedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          health: Math.round(0.3 * BARRICADE_DURABILITY_SCALE),
          maxHealth: Math.round(0.3 * BARRICADE_DURABILITY_SCALE),
        }),
      );

      // Verify object is no longer interactable
      expect(interactableEntities.entities).toHaveLength(0);
    });

    it("does not place when pointer is not released", () => {
      const { ctx, bodyRegistry } = createMockContext();

      const playerBody = mockBody();
      bodyRegistry.register(playerBody);
      createPlayerEntity(100, 100, playerBody.id);

      const epCenterX = 5 * TILE_SIZE + TILE_SIZE / 2;
      const epCenterY = 3 * TILE_SIZE + TILE_SIZE / 2;
      const objBody = mockBody(undefined, epCenterX, epCenterY);
      bodyRegistry.register(objBody);
      createObjectEntity(
        epCenterX, epCenterY, objBody.id,
        "wooden_plank", ObjectCategory.Loot, false,
        { durability: 0.3, flammability: 0.9, conductivity: 0 }, 3,
      );

      // Pointer is down but not released
      ctx.inputState.pointerDown = true;
      ctx.inputState.pointerReleased = false;

      const system = createBarricadeSystem(ctx);
      system(1 / 60);

      expect(barricadeEntities.entities).toHaveLength(0);
    });

    it("does not place when object is outside snap radius", () => {
      const { ctx, bodyRegistry } = createMockContext();

      const playerBody = mockBody();
      bodyRegistry.register(playerBody);
      createPlayerEntity(100, 100, playerBody.id);

      // Object far from any entry point
      const objBody = mockBody(undefined, 9999, 9999);
      bodyRegistry.register(objBody);
      createObjectEntity(
        9999, 9999, objBody.id,
        "wooden_plank", ObjectCategory.Loot, false,
        { durability: 0.3, flammability: 0.9, conductivity: 0 }, 3,
      );

      ctx.inputState.pointerReleased = true;

      const system = createBarricadeSystem(ctx);
      system(1 / 60);

      expect(barricadeEntities.entities).toHaveLength(0);
    });
  });

  describe("damage tracking", () => {
    it("emits barricade-damaged when health decreases", () => {
      const { ctx, bodyRegistry, eventBus, constraintRegistry } = createMockContext();

      const playerBody = mockBody();
      bodyRegistry.register(playerBody);
      createPlayerEntity(100, 100, playerBody.id);

      // Create a barricade by placing an object
      const epCenterX = 5 * TILE_SIZE + TILE_SIZE / 2;
      const epCenterY = 3 * TILE_SIZE + TILE_SIZE / 2;
      const objBody = mockBody(undefined, epCenterX, epCenterY);
      bodyRegistry.register(objBody);
      createObjectEntity(
        epCenterX, epCenterY, objBody.id,
        "wooden_plank", ObjectCategory.Loot, false,
        { durability: 0.3, flammability: 0.9, conductivity: 0 }, 3,
      );

      ctx.inputState.pointerReleased = true;
      const system = createBarricadeSystem(ctx);
      system(1 / 60);

      // Verify placement
      expect(barricadeEntities.entities).toHaveLength(1);
      const barricade = barricadeEntities.entities[0];
      const maxHp = barricade.health.max;

      // Reset input state
      ctx.inputState.pointerReleased = false;

      const damageHandler = vi.fn();
      eventBus.on("barricade-damaged", damageHandler);

      // Simulate damage (as combat system would do)
      barricade.health.current = maxHp - 20;

      system(1 / 60);

      expect(damageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          healthFraction: expect.any(Number),
          entryPointIndex: 0,
        }),
      );
    });
  });

  describe("destruction", () => {
    it("breaks constraints and restores debris when health reaches zero", () => {
      const {
        ctx, bodyRegistry, eventBus, constraintRegistry,
        pathfindingGrid, entryPoints,
      } = createMockContext();

      const playerBody = mockBody();
      bodyRegistry.register(playerBody);
      createPlayerEntity(100, 100, playerBody.id);

      const epCenterX = 5 * TILE_SIZE + TILE_SIZE / 2;
      const epCenterY = 3 * TILE_SIZE + TILE_SIZE / 2;
      const objBody = mockBody(undefined, epCenterX, epCenterY);
      bodyRegistry.register(objBody);
      createObjectEntity(
        epCenterX, epCenterY, objBody.id,
        "wooden_plank", ObjectCategory.Loot, false,
        { durability: 0.3, flammability: 0.9, conductivity: 0 }, 3,
      );

      // Place the barricade
      ctx.inputState.pointerReleased = true;
      const system = createBarricadeSystem(ctx);
      system(1 / 60);

      expect(barricadeEntities.entities).toHaveLength(1);
      expect(pathfindingGrid.isWalkable(5, 3)).toBe(false);
      const constraintCount = constraintRegistry.size;
      expect(constraintCount).toBe(2);

      // Reset input
      ctx.inputState.pointerReleased = false;

      const brokenHandler = vi.fn();
      eventBus.on("barricade-broken", brokenHandler);

      // Destroy the barricade
      const barricade = barricadeEntities.entities[0];
      barricade.health.current = 0;

      system(1 / 60);

      // Barricade entity should no longer have barricade component
      expect(barricadeEntities.entities).toHaveLength(0);

      // Should be restored as an interactable object
      expect(interactableEntities.entities).toHaveLength(1);
      const debris = interactableEntities.entities[0];
      expect(debris.objectProperties!.objectType).toBe("wooden_plank");

      // Constraints removed
      expect(constraintRegistry.size).toBe(0);
      expect(
        (ctx.scene.matter.world as unknown as { removeConstraint: ReturnType<typeof vi.fn> })
          .removeConstraint,
      ).toHaveBeenCalledTimes(2);

      // Pathfinding restored
      expect(pathfindingGrid.isWalkable(5, 3)).toBe(true);

      // Entry point unbarricaded
      expect(entryPoints[0].barricaded).toBe(false);

      // Event emitted
      expect(brokenHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          position: expect.objectContaining({ x: epCenterX, y: epCenterY }),
        }),
      );
    });

    it("keeps pathfinding blocked when other barricades remain at entry point", () => {
      const { ctx, bodyRegistry, pathfindingGrid, entryPoints } = createMockContext();

      const playerBody = mockBody();
      bodyRegistry.register(playerBody);
      createPlayerEntity(100, 100, playerBody.id);

      const epCenterX = 5 * TILE_SIZE + TILE_SIZE / 2;
      const epCenterY = 3 * TILE_SIZE + TILE_SIZE / 2;

      // Place first barricade
      const obj1Body = mockBody(undefined, epCenterX, epCenterY);
      bodyRegistry.register(obj1Body);
      createObjectEntity(
        epCenterX, epCenterY, obj1Body.id,
        "wooden_plank", ObjectCategory.Loot, false,
        { durability: 0.3, flammability: 0.9, conductivity: 0 }, 3,
      );

      ctx.inputState.pointerReleased = true;
      const system = createBarricadeSystem(ctx);
      system(1 / 60);

      // Place second barricade at same entry point
      ctx.inputState.pointerReleased = false;
      const obj2Body = mockBody(undefined, epCenterX + 2, epCenterY + 2);
      bodyRegistry.register(obj2Body);
      createObjectEntity(
        epCenterX + 2, epCenterY + 2, obj2Body.id,
        "metal_sheet", ObjectCategory.Loot, false,
        { durability: 0.8, flammability: 0, conductivity: 0.6 }, 4,
      );

      ctx.inputState.pointerReleased = true;
      system(1 / 60);

      expect(barricadeEntities.entities).toHaveLength(2);

      // Destroy first barricade only
      ctx.inputState.pointerReleased = false;
      barricadeEntities.entities[0].health.current = 0;
      system(1 / 60);

      // One barricade remains
      expect(barricadeEntities.entities).toHaveLength(1);

      // Pathfinding should still be blocked
      expect(pathfindingGrid.isWalkable(5, 3)).toBe(false);
      expect(entryPoints[0].barricaded).toBe(true);
    });
  });

  describe("durability calculation", () => {
    it("derives max durability from object definition", () => {
      const { ctx, bodyRegistry } = createMockContext();

      const playerBody = mockBody();
      bodyRegistry.register(playerBody);
      createPlayerEntity(100, 100, playerBody.id);

      const epCenterX = 5 * TILE_SIZE + TILE_SIZE / 2;
      const epCenterY = 3 * TILE_SIZE + TILE_SIZE / 2;

      // metal_sheet has durability 0.8
      const objBody = mockBody(undefined, epCenterX, epCenterY);
      bodyRegistry.register(objBody);
      createObjectEntity(
        epCenterX, epCenterY, objBody.id,
        "metal_sheet", ObjectCategory.Loot, false,
        { durability: 0.8, flammability: 0, conductivity: 0.6 }, 4,
      );

      ctx.inputState.pointerReleased = true;
      const system = createBarricadeSystem(ctx);
      system(1 / 60);

      const barricade = barricadeEntities.entities[0];
      expect(barricade.health.max).toBe(Math.round(0.8 * BARRICADE_DURABILITY_SCALE));
      expect(barricade.barricade.maxDurability).toBe(Math.round(0.8 * BARRICADE_DURABILITY_SCALE));
    });
  });
});
