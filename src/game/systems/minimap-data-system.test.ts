import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMinimapDataSystem } from "./minimap-data-system";
import { createGameEventBus } from "@/game/events/event-bus";
import type { GameEventBus, MinimapUpdateEvent } from "@/game/events/event-bus";
import type { SceneContext } from "./scene-context";
import { world } from "@/game/ecs/world";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(bus: GameEventBus): SceneContext {
  return {
    scene: {} as SceneContext["scene"],
    bodyRegistry: {} as SceneContext["bodyRegistry"],
    inputState: {} as SceneContext["inputState"],
    getAlpha: () => 0,
    clockState: {} as SceneContext["clockState"],
    eventBus: bus,
  };
}

function addPlayerEntity(x: number, y: number) {
  return world.add({
    playerControlled: { active: true },
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
  });
}

function addZombieEntity(x: number, y: number, state = "pathing" as const) {
  return world.add({
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    physicsBody: { bodyId: Math.random() },
    health: { current: 50, max: 50 },
    aiState: {
      state,
      targetX: 0,
      targetY: 0,
      pathIndex: 0,
      path: [],
      retargetCooldown: 0,
      attackCooldown: 0,
      lastKnownNoiseX: 0,
      lastKnownNoiseY: 0,
      noiseMemory: 0,
    },
    zombieType: {
      variant: "shambler" as const,
      speed: 40,
      damage: 10,
      attackInterval: 1.0,
      healthMultiplier: 1,
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Clear all ECS entities
  for (const entity of [...world.entities]) {
    world.remove(entity);
  }
});

describe("createMinimapDataSystem", () => {
  it("does not emit on every tick (throttled to ~30 ticks)", () => {
    const bus = createGameEventBus();
    const ctx = makeContext(bus);
    const system = createMinimapDataSystem(ctx);
    const handler = vi.fn();
    bus.on("minimap-update", handler);

    addPlayerEntity(100, 200);

    // Run 29 ticks — should NOT emit
    for (let i = 0; i < 29; i++) system(1 / 60);
    expect(handler).not.toHaveBeenCalled();

    // 30th tick — should emit
    system(1 / 60);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("emits player position and zombie positions", () => {
    const bus = createGameEventBus();
    const ctx = makeContext(bus);
    const system = createMinimapDataSystem(ctx);
    let captured: MinimapUpdateEvent | null = null;
    bus.on("minimap-update", (e) => { captured = e; });

    addPlayerEntity(100, 200);
    addZombieEntity(300, 400);
    addZombieEntity(500, 600);

    // Run 30 ticks to trigger emit
    for (let i = 0; i < 30; i++) system(1 / 60);

    expect(captured).not.toBeNull();
    expect(captured!.playerPosition).toEqual({ x: 100, y: 200 });
    expect(captured!.zombiePositions).toHaveLength(2);
    expect(captured!.zombiePositions[0]).toEqual({ x: 300, y: 400 });
    expect(captured!.zombiePositions[1]).toEqual({ x: 500, y: 600 });
  });

  it("excludes dead zombies from positions", () => {
    const bus = createGameEventBus();
    const ctx = makeContext(bus);
    const system = createMinimapDataSystem(ctx);
    let captured: MinimapUpdateEvent | null = null;
    bus.on("minimap-update", (e) => { captured = e; });

    addPlayerEntity(100, 200);
    addZombieEntity(300, 400, "pathing");
    addZombieEntity(500, 600, "dead");

    for (let i = 0; i < 30; i++) system(1 / 60);

    expect(captured!.zombiePositions).toHaveLength(1);
    expect(captured!.zombiePositions[0]).toEqual({ x: 300, y: 400 });
  });

  it("does not emit when no player entity exists", () => {
    const bus = createGameEventBus();
    const ctx = makeContext(bus);
    const system = createMinimapDataSystem(ctx);
    const handler = vi.fn();
    bus.on("minimap-update", handler);

    // No player entity
    addZombieEntity(300, 400);

    for (let i = 0; i < 30; i++) system(1 / 60);
    expect(handler).not.toHaveBeenCalled();
  });

  it("emits repeatedly every 30 ticks", () => {
    const bus = createGameEventBus();
    const ctx = makeContext(bus);
    const system = createMinimapDataSystem(ctx);
    const handler = vi.fn();
    bus.on("minimap-update", handler);

    addPlayerEntity(100, 200);

    // 60 ticks = 2 emissions
    for (let i = 0; i < 60; i++) system(1 / 60);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
