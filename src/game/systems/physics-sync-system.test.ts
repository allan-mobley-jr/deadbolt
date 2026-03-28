import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPhysicsSyncSystem } from "./physics-sync-system";
import { createInputState } from "./scene-context";
import type { SceneContext } from "./scene-context";
import { BodyRegistry } from "./body-registry";
import { world, resetWorld } from "@/game/ecs/world";
import { createPlayerEntity } from "@/game/ecs/archetypes";

const DT = 1 / 60;

function createMockBody(id: number, x = 0, y = 0) {
  return {
    id,
    position: { x, y },
    velocity: { x: 0, y: 0 },
    speed: 0,
    angularVelocity: 0,
  } as unknown as MatterJS.BodyType;
}

function createMockContext(): {
  ctx: SceneContext;
  worldStep: ReturnType<typeof vi.fn>;
} {
  const worldStep = vi.fn();
  const bodyRegistry = new BodyRegistry();

  const scene = {
    matter: {
      world: {
        step: worldStep,
      },
    },
  } as unknown as Phaser.Scene;

  return {
    ctx: {
      scene,
      bodyRegistry,
      inputState: createInputState(),
      getAlpha: () => 0,
    },
    worldStep,
  };
}

describe("PhysicsSyncSystem", () => {
  let ctx: SceneContext;
  let worldStep: ReturnType<typeof vi.fn>;
  let system: (dt: number) => void;

  beforeEach(() => {
    const mock = createMockContext();
    ctx = mock.ctx;
    worldStep = mock.worldStep;
    system = createPhysicsSyncSystem(ctx);
  });

  afterEach(() => {
    resetWorld();
  });

  it("writes ECS velocity to Matter.js body velocity", () => {
    const body = createMockBody(1, 100, 100);
    ctx.bodyRegistry.register(body);
    const entity = createPlayerEntity(100, 100, 1);
    entity.velocity.vx = 200;
    entity.velocity.vy = -100;

    system(DT);

    // Body velocity should be displacement-per-step = vel * dt
    expect(body.velocity.x).toBeCloseTo(200 * DT, 5);
    expect(body.velocity.y).toBeCloseTo(-100 * DT, 5);
  });

  it("calls matter.world.step with delta in milliseconds", () => {
    system(DT);
    expect(worldStep).toHaveBeenCalledTimes(1);
    expect(worldStep).toHaveBeenCalledWith(expect.closeTo(DT * 1000, 2));
  });

  it("reads body position back to ECS position", () => {
    const body = createMockBody(1, 100, 100);
    ctx.bodyRegistry.register(body);
    createPlayerEntity(100, 100, 1);

    // Simulate physics moving the body
    worldStep.mockImplementation(() => {
      body.position.x = 105;
      body.position.y = 95;
    });

    system(DT);

    const entity = world.entities.find((e) => e.playerControlled)!;
    expect(entity.position!.x).toBe(105);
    expect(entity.position!.y).toBe(95);
  });

  it("saves previousPosition before overwriting with physics result", () => {
    const body = createMockBody(1, 100, 200);
    ctx.bodyRegistry.register(body);
    createPlayerEntity(100, 200, 1);

    worldStep.mockImplementation(() => {
      body.position.x = 110;
      body.position.y = 210;
    });

    system(DT);

    const entity = world.entities.find((e) => e.playerControlled)!;
    expect(entity.previousPosition).toBeDefined();
    expect(entity.previousPosition!.x).toBe(100);
    expect(entity.previousPosition!.y).toBe(200);
  });

  it("warns once for entities with no registered body", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Entity references a body id that isn't in the registry
    createPlayerEntity(50, 50, 999);

    system(DT);
    expect(warnSpy).toHaveBeenCalledTimes(1); // warn-once per bodyId

    // Second tick should NOT warn again (warn-once)
    warnSpy.mockClear();
    system(DT);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("skips entities that have velocity but no physicsBody", () => {
    // A moving entity without a physicsBody (e.g. a visual effect)
    world.add({
      position: { x: 0, y: 0 },
      velocity: { vx: 100, vy: 0 },
    });
    expect(() => system(DT)).not.toThrow();
  });

  it("sets body.speed to the magnitude of the step velocity", () => {
    const body = createMockBody(1, 100, 100);
    ctx.bodyRegistry.register(body);
    const entity = createPlayerEntity(100, 100, 1);
    entity.velocity.vx = 200;
    entity.velocity.vy = -100;

    system(DT);

    const stepVx = 200 * DT;
    const stepVy = -100 * DT;
    const expectedSpeed = Math.sqrt(stepVx * stepVx + stepVy * stepVy);
    expect(body.speed).toBeCloseTo(expectedSpeed, 5);
  });

  it("resets body.angularVelocity to zero after writing velocity", () => {
    const body = createMockBody(1, 100, 100);
    // Simulate a residual spin from Matter.js
    (body as { angularVelocity: number }).angularVelocity = 5;
    ctx.bodyRegistry.register(body);
    const entity = createPlayerEntity(100, 100, 1);
    entity.velocity.vx = 100;

    system(DT);

    expect(body.angularVelocity).toBe(0);
  });

  it("sets body.speed to zero when ECS velocity is zero", () => {
    const body = createMockBody(1, 100, 100);
    // Stale speed value
    (body as { speed: number }).speed = 99;
    ctx.bodyRegistry.register(body);
    createPlayerEntity(100, 100, 1);
    // velocity defaults to {vx: 0, vy: 0}

    system(DT);

    expect(body.speed).toBe(0);
  });

  it("does not write velocity for entities without velocity component", () => {
    // A barricade has physicsBody but no velocity
    const body = createMockBody(2, 300, 300);
    ctx.bodyRegistry.register(body);
    world.add({
      position: { x: 300, y: 300 },
      physicsBody: { bodyId: 2 },
      renderable: { spriteKey: "barricade" },
    });

    system(DT);

    // Body velocity should remain at zero
    expect(body.velocity.x).toBe(0);
    expect(body.velocity.y).toBe(0);
  });
});
