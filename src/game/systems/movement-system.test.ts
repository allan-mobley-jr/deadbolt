import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMovementSystem, PLAYER_SPEED, ACCELERATION, DECELERATION } from "./movement-system";
import { createInputState } from "./scene-context";
import type { SceneContext } from "./scene-context";
import { BodyRegistry } from "./body-registry";
import { world, resetWorld } from "@/game/ecs/world";
import { createPlayerEntity } from "@/game/ecs/archetypes";

const DT = 1 / 60;

function createMockContext(): SceneContext {
  return {
    scene: {} as Phaser.Scene,
    bodyRegistry: new BodyRegistry(),
    inputState: createInputState(),
    getAlpha: () => 0,
  };
}

describe("MovementSystem", () => {
  let ctx: SceneContext;
  let system: (dt: number) => void;

  beforeEach(() => {
    ctx = createMockContext();
    system = createMovementSystem(ctx);
    // Spawn a player entity
    createPlayerEntity(100, 100, 1);
  });

  afterEach(() => {
    resetWorld();
  });

  it("does not change velocity when no input is active", () => {
    system(DT);
    const player = world.entities.find((e) => e.playerControlled)!;
    expect(player.velocity!.vx).toBe(0);
    expect(player.velocity!.vy).toBe(0);
  });

  it("accelerates rightward when moveX is positive", () => {
    ctx.inputState.moveX = 1;
    system(DT);
    const player = world.entities.find((e) => e.playerControlled)!;
    expect(player.velocity!.vx).toBeGreaterThan(0);
    expect(player.velocity!.vx).toBeLessThanOrEqual(PLAYER_SPEED);
  });

  it("accelerates leftward when moveX is negative", () => {
    ctx.inputState.moveX = -1;
    system(DT);
    const player = world.entities.find((e) => e.playerControlled)!;
    expect(player.velocity!.vx).toBeLessThan(0);
  });

  it("reaches max speed after enough ticks", () => {
    ctx.inputState.moveX = 1;
    // Run enough ticks to reach max speed
    const ticksNeeded = Math.ceil(PLAYER_SPEED / (ACCELERATION * DT)) + 1;
    for (let i = 0; i < ticksNeeded; i++) {
      system(DT);
    }
    const player = world.entities.find((e) => e.playerControlled)!;
    expect(player.velocity!.vx).toBeCloseTo(PLAYER_SPEED, 1);
  });

  it("decelerates to zero when input is released", () => {
    // First, accelerate
    ctx.inputState.moveX = 1;
    for (let i = 0; i < 30; i++) system(DT);
    const player = world.entities.find((e) => e.playerControlled)!;
    expect(player.velocity!.vx).toBeGreaterThan(0);

    // Release input
    ctx.inputState.moveX = 0;
    const ticksNeeded = Math.ceil(PLAYER_SPEED / (DECELERATION * DT)) + 1;
    for (let i = 0; i < ticksNeeded; i++) {
      system(DT);
    }
    expect(player.velocity!.vx).toBeCloseTo(0, 1);
  });

  it("handles diagonal input without exceeding PLAYER_SPEED", () => {
    // Normalised diagonal input
    ctx.inputState.moveX = 1 / Math.SQRT2;
    ctx.inputState.moveY = 1 / Math.SQRT2;

    // Run to steady state
    for (let i = 0; i < 120; i++) system(DT);

    const player = world.entities.find((e) => e.playerControlled)!;
    const speed = Math.sqrt(
      player.velocity!.vx ** 2 + player.velocity!.vy ** 2,
    );
    // Speed should approximate PLAYER_SPEED (input was normalised)
    expect(speed).toBeCloseTo(PLAYER_SPEED, 0);
  });

  it("skips inactive player entities", () => {
    const player = world.entities.find((e) => e.playerControlled)!;
    player.playerControlled!.active = false;
    ctx.inputState.moveX = 1;
    system(DT);
    expect(player.velocity!.vx).toBe(0);
  });

  it("decelerates faster than it accelerates", () => {
    expect(DECELERATION).toBeGreaterThan(ACCELERATION);
  });
});
