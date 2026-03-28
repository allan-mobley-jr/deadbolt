import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMovementSystem, approach, PLAYER_SPEED, ACCELERATION, DECELERATION } from "./movement-system";
import { createInputState, createClockState } from "./scene-context";
import type { SceneContext } from "./scene-context";
import { BodyRegistry } from "./body-registry";
import { createGameEventBus } from "@/game/events/event-bus";
import { world, resetWorld } from "@/game/ecs/world";
import { createPlayerEntity } from "@/game/ecs/archetypes";

const DT = 1 / 60;

function createMockContext(): SceneContext {
  return {
    scene: {} as Phaser.Scene,
    bodyRegistry: new BodyRegistry(),
    inputState: createInputState(),
    getAlpha: () => 0,
    clockState: createClockState(),
    eventBus: createGameEventBus(),
  };
}

// ---------------------------------------------------------------------------
// approach() helper — direct unit tests
// ---------------------------------------------------------------------------

describe("approach", () => {
  it("accelerates toward target when current < target", () => {
    expect(approach(0, 100, 10)).toBe(10);
  });

  it("decelerates toward target when current > target", () => {
    expect(approach(100, 0, 10)).toBe(90);
  });

  it("does not overshoot target when accelerating", () => {
    // Gap is 5, maxDelta is 10 — should clamp to target
    expect(approach(95, 100, 10)).toBe(100);
  });

  it("does not overshoot target when decelerating", () => {
    // Gap is 5, maxDelta is 10 — should clamp to target
    expect(approach(5, 0, 10)).toBe(0);
  });

  it("returns target when current equals target", () => {
    expect(approach(50, 50, 10)).toBe(50);
  });

  it("handles negative targets correctly", () => {
    expect(approach(0, -100, 10)).toBe(-10);
  });
});

// ---------------------------------------------------------------------------
// MovementSystem — full system tests
// ---------------------------------------------------------------------------

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

  it("reverses direction when input flips mid-motion", () => {
    ctx.inputState.moveX = 1;
    // Accelerate rightward for 30 ticks
    for (let i = 0; i < 30; i++) system(DT);
    const player = world.entities.find((e) => e.playerControlled)!;
    expect(player.velocity!.vx).toBeGreaterThan(0);

    // Flip to leftward
    ctx.inputState.moveX = -1;
    // Run enough ticks to reach max speed leftward
    const ticksNeeded = Math.ceil((2 * PLAYER_SPEED) / (ACCELERATION * DT)) + 5;
    for (let i = 0; i < ticksNeeded; i++) system(DT);
    expect(player.velocity!.vx).toBeCloseTo(-PLAYER_SPEED, 0);
  });

  it("decelerates before reversing when input flips", () => {
    ctx.inputState.moveX = 1;
    // Build partial rightward speed
    for (let i = 0; i < 5; i++) system(DT);
    const player = world.entities.find((e) => e.playerControlled)!;
    const speedBefore = player.velocity!.vx;
    expect(speedBefore).toBeGreaterThan(0);

    // Flip direction and run one tick
    ctx.inputState.moveX = -1;
    system(DT);

    // Velocity should have decreased (moving toward negative target)
    expect(player.velocity!.vx).toBeLessThan(speedBefore);
  });

  it("reduces max speed when player has carry weight", () => {
    const player = world.entities.find((e) => e.playerControlled)!;
    // Load the player to 50% carry weight
    player.inventory!.carryWeight = 25;

    ctx.inputState.moveX = 1;
    // Run to steady state
    for (let i = 0; i < 120; i++) system(DT);

    // Speed should be below normal PLAYER_SPEED
    expect(player.velocity!.vx).toBeLessThan(PLAYER_SPEED);
    expect(player.velocity!.vx).toBeGreaterThan(0);
  });

  it("reduces speed further at maximum carry weight", () => {
    const player = world.entities.find((e) => e.playerControlled)!;
    player.inventory!.carryWeight = player.inventory!.maxCarryWeight;

    ctx.inputState.moveX = 1;
    for (let i = 0; i < 120; i++) system(DT);

    // Should be at minimum speed multiplier * PLAYER_SPEED
    expect(player.velocity!.vx).toBeLessThan(PLAYER_SPEED * 0.5);
    expect(player.velocity!.vx).toBeGreaterThan(0);
  });

  it("moves at full speed with no carry weight", () => {
    ctx.inputState.moveX = 1;
    const ticksNeeded = Math.ceil(PLAYER_SPEED / (ACCELERATION * DT)) + 1;
    for (let i = 0; i < ticksNeeded; i++) system(DT);

    const player = world.entities.find((e) => e.playerControlled)!;
    expect(player.velocity!.vx).toBeCloseTo(PLAYER_SPEED, 1);
  });
});
