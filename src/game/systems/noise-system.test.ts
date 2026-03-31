import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NoiseMap, createNoiseSystem } from "./noise-system";
import { createInputState, createClockState } from "./scene-context";
import type { SceneContext } from "./scene-context";
import { BodyRegistry } from "./body-registry";
import { createGameEventBus, safeEmit } from "@/game/events/event-bus";
import { world, resetWorld } from "@/game/ecs/world";
import { createPlayerEntity } from "@/game/ecs/archetypes";
import { NOISE } from "./noise-constants";

const DT = 1 / 60;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockContext(
  overrides: Partial<SceneContext> = {},
): SceneContext {
  return {
    scene: {
      matter: {
        world: { remove: vi.fn() },
      },
    } as unknown as Phaser.Scene,
    bodyRegistry: new BodyRegistry(),
    inputState: createInputState(),
    getAlpha: () => 0,
    clockState: createClockState(),
    eventBus: createGameEventBus(),
    noiseMap: new NoiseMap(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// NoiseMap unit tests
// ---------------------------------------------------------------------------

describe("NoiseMap", () => {
  let noiseMap: NoiseMap;

  beforeEach(() => {
    noiseMap = new NoiseMap();
  });

  describe("addNoise", () => {
    it("adds a noise event and increments the ID", () => {
      const id1 = noiseMap.addNoise(100, 200, 300, 1.0, 2.0, "explosion");
      const id2 = noiseMap.addNoise(150, 250, 100, 0.5, 1.0, "combat");

      expect(id1).toBe(0);
      expect(id2).toBe(1);
      expect(noiseMap.size).toBe(2);
    });

    it("stores correct event properties", () => {
      noiseMap.addNoise(100, 200, 300, 0.8, 2.0, "explosion");

      const events = noiseMap.getActiveEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        x: 100,
        y: 200,
        radius: 300,
        intensity: 0.8,
        maxIntensity: 0.8,
        timeRemaining: 2.0,
        duration: 2.0,
        source: "explosion",
      });
    });
  });

  describe("update", () => {
    it("decays intensity linearly over time", () => {
      noiseMap.addNoise(0, 0, 100, 1.0, 2.0, "test");

      noiseMap.update(1.0); // Half duration elapsed

      const events = noiseMap.getActiveEvents();
      expect(events).toHaveLength(1);
      // intensity = 1.0 * (1.0 / 2.0) = 0.5
      expect(events[0].intensity).toBeCloseTo(0.5, 5);
      expect(events[0].timeRemaining).toBeCloseTo(1.0, 5);
    });

    it("removes expired events", () => {
      noiseMap.addNoise(0, 0, 100, 1.0, 1.0, "short");
      noiseMap.addNoise(0, 0, 100, 1.0, 3.0, "long");

      expect(noiseMap.size).toBe(2);

      noiseMap.update(1.5); // Short one should expire

      expect(noiseMap.size).toBe(1);
      const events = noiseMap.getActiveEvents();
      expect(events[0].source).toBe("long");
    });

    it("removes events at exactly their duration", () => {
      noiseMap.addNoise(0, 0, 100, 1.0, 1.0, "exact");

      noiseMap.update(1.0);

      expect(noiseMap.size).toBe(0);
    });

    it("handles multiple decay ticks correctly", () => {
      noiseMap.addNoise(0, 0, 100, 1.0, 4.0, "test");

      // 4 ticks of 1s each
      noiseMap.update(1.0);
      expect(noiseMap.getActiveEvents()[0].intensity).toBeCloseTo(0.75, 5);

      noiseMap.update(1.0);
      expect(noiseMap.getActiveEvents()[0].intensity).toBeCloseTo(0.5, 5);

      noiseMap.update(1.0);
      expect(noiseMap.getActiveEvents()[0].intensity).toBeCloseTo(0.25, 5);

      noiseMap.update(1.0);
      expect(noiseMap.size).toBe(0); // Expired
    });
  });

  describe("findLoudestNoise", () => {
    it("returns null when no events exist", () => {
      const result = noiseMap.findLoudestNoise(0, 0, 500);
      expect(result).toBeNull();
    });

    it("returns the event when listener is within radius and hearing range", () => {
      noiseMap.addNoise(100, 100, 200, 1.0, 2.0, "explosion");

      const result = noiseMap.findLoudestNoise(100, 100, 500);
      expect(result).not.toBeNull();
      expect(result!.source).toBe("explosion");
    });

    it("returns null when event is outside hearing range", () => {
      noiseMap.addNoise(1000, 1000, 500, 1.0, 2.0, "explosion");

      // Listener at origin, hearing range 100 — event at 1414px away
      const result = noiseMap.findLoudestNoise(0, 0, 100);
      expect(result).toBeNull();
    });

    it("returns null when listener is outside noise radius", () => {
      noiseMap.addNoise(0, 0, 50, 1.0, 2.0, "small-noise");

      // Listener is 100px away, noise radius is only 50px
      const result = noiseMap.findLoudestNoise(100, 0, 500);
      expect(result).toBeNull();
    });

    it("returns the LOUDEST noise, not the nearest", () => {
      // Near but quiet noise
      noiseMap.addNoise(10, 0, 200, 0.2, 2.0, "quiet-near");
      // Far but loud noise
      noiseMap.addNoise(150, 0, 300, 1.0, 2.0, "loud-far");

      const result = noiseMap.findLoudestNoise(0, 0, 500);
      expect(result).not.toBeNull();
      expect(result!.source).toBe("loud-far");
    });

    it("perceived intensity accounts for distance falloff", () => {
      // Noise at origin, radius 100, intensity 1.0
      noiseMap.addNoise(0, 0, 100, 1.0, 2.0, "center");

      // At distance 50: perceived = 1.0 * (1 - 50/100) = 0.5
      // So a noise at the origin should be perceived at 0.5 from 50px away

      // Add another noise at (50, 0), radius 100, intensity 0.6
      // At distance 0 from listener: perceived = 0.6
      noiseMap.addNoise(50, 0, 100, 0.6, 2.0, "closer");

      // Listener at (50, 0): "center" perceived = 0.5, "closer" perceived = 0.6
      const result = noiseMap.findLoudestNoise(50, 0, 500);
      expect(result).not.toBeNull();
      expect(result!.source).toBe("closer");
    });

    it("ignores noise with zero perceived intensity at the edge", () => {
      noiseMap.addNoise(0, 0, 100, 1.0, 2.0, "test");

      // At exactly the radius edge: perceived = 1.0 * (1 - 100/100) = 0
      const result = noiseMap.findLoudestNoise(100, 0, 500);
      expect(result).toBeNull();
    });

    it("works correctly after decay reduces intensity", () => {
      noiseMap.addNoise(0, 0, 200, 1.0, 2.0, "decaying");

      // After 1s: intensity = 0.5, time remaining = 1.0
      noiseMap.update(1.0);

      const result = noiseMap.findLoudestNoise(0, 0, 500);
      expect(result).not.toBeNull();
      expect(result!.intensity).toBeCloseTo(0.5, 5);
    });
  });

  describe("clear", () => {
    it("removes all events and resets ID counter", () => {
      noiseMap.addNoise(0, 0, 100, 1.0, 2.0, "a");
      noiseMap.addNoise(0, 0, 100, 1.0, 2.0, "b");

      noiseMap.clear();

      expect(noiseMap.size).toBe(0);
      expect(noiseMap.getActiveEvents()).toHaveLength(0);

      // ID counter resets
      const id = noiseMap.addNoise(0, 0, 100, 1.0, 2.0, "after-clear");
      expect(id).toBe(0);
    });
  });

  describe("getActiveEvents", () => {
    it("returns readonly snapshot of current events", () => {
      noiseMap.addNoise(10, 20, 100, 0.5, 1.0, "a");
      noiseMap.addNoise(30, 40, 200, 0.8, 2.0, "b");

      const events = noiseMap.getActiveEvents();
      expect(events).toHaveLength(2);
    });
  });
});

// ---------------------------------------------------------------------------
// createNoiseSystem tests
// ---------------------------------------------------------------------------

describe("createNoiseSystem", () => {
  let ctx: SceneContext;
  let system: (dt: number) => void;

  beforeEach(() => {
    ctx = createMockContext();
    system = createNoiseSystem(ctx);
    resetWorld();
  });

  afterEach(() => {
    resetWorld();
  });

  it("throws if noiseMap is missing from context", () => {
    const badCtx = createMockContext({ noiseMap: undefined });
    expect(() => createNoiseSystem(badCtx)).toThrow("ctx.noiseMap is required");
  });

  it("subscribes to noise-generated events and populates the map", () => {
    safeEmit(ctx.eventBus, "noise-generated", {
      position: { x: 100, y: 200 },
      radius: 300,
      intensity: 0.8,
      duration: 2.0,
      source: "explosion",
    });

    // Events are collected by the listener, not by the tick
    expect(ctx.noiseMap!.size).toBe(1);
  });

  it("uses DEFAULT_DECAY_DURATION when duration is omitted", () => {
    safeEmit(ctx.eventBus, "noise-generated", {
      position: { x: 0, y: 0 },
      radius: 100,
      intensity: 0.5,
      source: "test",
    });

    const events = ctx.noiseMap!.getActiveEvents();
    expect(events[0].duration).toBe(NOISE.DEFAULT_DECAY_DURATION);
  });

  it("decays events each tick", () => {
    safeEmit(ctx.eventBus, "noise-generated", {
      position: { x: 0, y: 0 },
      radius: 100,
      intensity: 1.0,
      duration: 1.0,
      source: "test",
    });

    // Run enough ticks to expire the event (1.0 / DT = 60 ticks)
    for (let i = 0; i < 61; i++) {
      system(DT);
    }

    expect(ctx.noiseMap!.size).toBe(0);
  });

  describe("footstep noise", () => {
    it("generates footstep noise when player is moving above threshold", () => {
      const bodyId = 999;
      ctx.bodyRegistry.register({
        id: bodyId,
        position: { x: 100, y: 100 },
        velocity: { x: 0, y: 0 },
        speed: 0,
        angularVelocity: 0,
        force: { x: 0, y: 0 },
        friction: 0,
        frictionAir: 0,
        inertia: Infinity,
        inverseInertia: 0,
        isStatic: false,
      } as unknown as MatterJS.BodyType);
      createPlayerEntity(100, 100, bodyId);

      // Set player velocity above threshold
      const player = world.with("velocity").entities[0];
      player.velocity.vx = 100;
      player.velocity.vy = 0;

      // Run enough ticks to trigger footstep (FOOTSTEP_TICK_INTERVAL)
      for (let i = 0; i < NOISE.FOOTSTEP_TICK_INTERVAL; i++) {
        system(DT);
      }

      // Should have generated at least one footstep noise
      const events = ctx.noiseMap!.getActiveEvents();
      const footsteps = events.filter((e) => e.source === "footstep");
      expect(footsteps.length).toBeGreaterThanOrEqual(1);
    });

    it("does not generate footstep noise when player is stationary", () => {
      const bodyId = 999;
      ctx.bodyRegistry.register({
        id: bodyId,
        position: { x: 100, y: 100 },
        velocity: { x: 0, y: 0 },
        speed: 0,
        angularVelocity: 0,
        force: { x: 0, y: 0 },
        friction: 0,
        frictionAir: 0,
        inertia: Infinity,
        inverseInertia: 0,
        isStatic: false,
      } as unknown as MatterJS.BodyType);
      createPlayerEntity(100, 100, bodyId);

      // Player velocity is 0 (below threshold)
      for (let i = 0; i < NOISE.FOOTSTEP_TICK_INTERVAL * 2; i++) {
        system(DT);
      }

      const events = ctx.noiseMap!.getActiveEvents();
      const footsteps = events.filter((e) => e.source === "footstep");
      expect(footsteps).toHaveLength(0);
    });

    it("throttles footstep noise to FOOTSTEP_TICK_INTERVAL", () => {
      const bodyId = 999;
      ctx.bodyRegistry.register({
        id: bodyId,
        position: { x: 100, y: 100 },
        velocity: { x: 0, y: 0 },
        speed: 0,
        angularVelocity: 0,
        force: { x: 0, y: 0 },
        friction: 0,
        frictionAir: 0,
        inertia: Infinity,
        inverseInertia: 0,
        isStatic: false,
      } as unknown as MatterJS.BodyType);
      createPlayerEntity(100, 100, bodyId);

      const player = world.with("velocity").entities[0];
      player.velocity.vx = 200;

      const listener = vi.fn();
      ctx.eventBus.on("noise-generated", listener);

      // Run exactly FOOTSTEP_TICK_INTERVAL * 3 ticks
      const totalTicks = NOISE.FOOTSTEP_TICK_INTERVAL * 3;
      for (let i = 0; i < totalTicks; i++) {
        system(DT);
      }

      // Count footstep events emitted on the bus
      const footstepCalls = listener.mock.calls.filter(
        (call: unknown[]) => (call[0] as { source: string }).source === "footstep",
      );
      // Should be exactly 3 (one per interval)
      expect(footstepCalls).toHaveLength(3);
    });

    it("does not double-register footstep noise (bus listener skips footsteps)", () => {
      const bodyId = 999;
      ctx.bodyRegistry.register({
        id: bodyId,
        position: { x: 100, y: 100 },
        velocity: { x: 0, y: 0 },
        speed: 0,
        angularVelocity: 0,
        force: { x: 0, y: 0 },
        friction: 0,
        frictionAir: 0,
        inertia: Infinity,
        inverseInertia: 0,
        isStatic: false,
      } as unknown as MatterJS.BodyType);
      createPlayerEntity(100, 100, bodyId);

      const player = world.with("velocity").entities[0];
      player.velocity.vx = 200;

      // Run enough ticks to trigger one footstep
      for (let i = 0; i < NOISE.FOOTSTEP_TICK_INTERVAL; i++) {
        system(DT);
      }

      // Should have exactly ONE footstep in the noise map (not two from
      // double-registration via both direct addNoise and bus listener)
      const events = ctx.noiseMap!.getActiveEvents();
      const footsteps = events.filter((e) => e.source === "footstep");
      expect(footsteps).toHaveLength(1);
    });

    it("emits footstep event on the bus for UI consumption", () => {
      const bodyId = 999;
      ctx.bodyRegistry.register({
        id: bodyId,
        position: { x: 100, y: 100 },
        velocity: { x: 0, y: 0 },
        speed: 0,
        angularVelocity: 0,
        force: { x: 0, y: 0 },
        friction: 0,
        frictionAir: 0,
        inertia: Infinity,
        inverseInertia: 0,
        isStatic: false,
      } as unknown as MatterJS.BodyType);
      createPlayerEntity(100, 100, bodyId);

      const player = world.with("velocity").entities[0];
      player.velocity.vx = 200;

      const listener = vi.fn();
      ctx.eventBus.on("noise-generated", listener);

      // Run enough ticks to trigger
      for (let i = 0; i < NOISE.FOOTSTEP_TICK_INTERVAL; i++) {
        system(DT);
      }

      const footstepCalls = listener.mock.calls.filter(
        (call: unknown[]) => (call[0] as { source: string }).source === "footstep",
      );
      expect(footstepCalls.length).toBeGreaterThanOrEqual(1);

      const payload = footstepCalls[0][0] as {
        position: { x: number; y: number };
        radius: number;
        intensity: number;
        source: string;
      };
      expect(payload.intensity).toBe(NOISE.FOOTSTEP_INTENSITY);
      expect(payload.radius).toBe(NOISE.FOOTSTEP_RADIUS);
    });
  });
});
