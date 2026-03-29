import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createStatsSystem,
  getRunStats,
  resetRunStats,
} from "./stats-system";
import { createInputState, createClockState } from "./scene-context";
import type { SceneContext } from "./scene-context";
import { BodyRegistry } from "./body-registry";
import { createGameEventBus, safeEmit } from "@/game/events/event-bus";
import { world, resetWorld } from "@/game/ecs/world";
import { createPlayerEntity } from "@/game/ecs/archetypes";

const DT = 1 / 60;

function createMockContext(
  overrides: Partial<SceneContext> = {},
): SceneContext {
  return {
    scene: {} as Phaser.Scene,
    bodyRegistry: new BodyRegistry(),
    inputState: createInputState(),
    getAlpha: () => 0,
    clockState: createClockState(),
    eventBus: createGameEventBus(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Stats system tests
// ---------------------------------------------------------------------------

describe("StatsSystem", () => {
  let ctx: SceneContext;
  let system: (dt: number) => void;

  beforeEach(() => {
    resetWorld();
    resetRunStats();
    ctx = createMockContext();
    system = createStatsSystem(ctx);
  });

  afterEach(() => {
    resetWorld();
    resetRunStats();
  });

  // -------------------------------------------------------------------------
  // getRunStats / resetRunStats
  // -------------------------------------------------------------------------

  describe("getRunStats / resetRunStats", () => {
    it("returns zeroed stats on fresh reset", () => {
      const stats = getRunStats();
      expect(stats.barricadesBuilt).toBe(0);
      expect(stats.distanceTraveled).toBe(0);
      expect(stats.objectsUsed).toBe(0);
    });

    it("resetRunStats clears all counters", () => {
      // Emit events to accumulate stats
      safeEmit(ctx.eventBus, "barricade-placed", {
        position: { x: 0, y: 0 },
        health: 100,
        maxHealth: 100,
      });
      safeEmit(ctx.eventBus, "item-picked-up", {
        itemType: "plank",
        quantity: 1,
      });

      expect(getRunStats().barricadesBuilt).toBe(1);
      expect(getRunStats().objectsUsed).toBe(1);

      resetRunStats();

      const stats = getRunStats();
      expect(stats.barricadesBuilt).toBe(0);
      expect(stats.objectsUsed).toBe(0);
      expect(stats.distanceTraveled).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Event-driven counters
  // -------------------------------------------------------------------------

  describe("barricade-placed event", () => {
    it("increments barricadesBuilt on each barricade-placed event", () => {
      safeEmit(ctx.eventBus, "barricade-placed", {
        position: { x: 0, y: 0 },
        health: 100,
        maxHealth: 100,
      });
      safeEmit(ctx.eventBus, "barricade-placed", {
        position: { x: 32, y: 0 },
        health: 100,
        maxHealth: 100,
      });

      expect(getRunStats().barricadesBuilt).toBe(2);
    });
  });

  describe("item-picked-up event", () => {
    it("increments objectsUsed on each item-picked-up event", () => {
      safeEmit(ctx.eventBus, "item-picked-up", {
        itemType: "plank",
        quantity: 1,
      });
      safeEmit(ctx.eventBus, "item-picked-up", {
        itemType: "metal_sheet",
        quantity: 1,
      });
      safeEmit(ctx.eventBus, "item-picked-up", {
        itemType: "plank",
        quantity: 2,
      });

      expect(getRunStats().objectsUsed).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Distance tracking
  // -------------------------------------------------------------------------

  describe("distance tracking", () => {
    it("does nothing when no player entity exists", () => {
      system(DT);
      system(DT);
      expect(getRunStats().distanceTraveled).toBe(0);
    });

    it("initializes from player spawn on first tick (no delta)", () => {
      createPlayerEntity(100, 200, 1);
      system(DT);
      // First tick: initializes prevX/prevY, no distance accumulated
      expect(getRunStats().distanceTraveled).toBe(0);
    });

    it("accumulates distance when player moves", () => {
      const entity = createPlayerEntity(0, 0, 1);
      system(DT); // First tick: init

      // Move player right by 100 pixels
      entity.position.x = 100;
      entity.position.y = 0;
      system(DT);

      expect(getRunStats().distanceTraveled).toBeCloseTo(100, 5);
    });

    it("accumulates diagonal distance correctly", () => {
      const entity = createPlayerEntity(0, 0, 1);
      system(DT); // First tick: init

      // Move diagonally
      entity.position.x = 3;
      entity.position.y = 4;
      system(DT);

      // Distance should be sqrt(9 + 16) = 5
      expect(getRunStats().distanceTraveled).toBeCloseTo(5, 5);
    });

    it("accumulates across multiple ticks", () => {
      const entity = createPlayerEntity(0, 0, 1);
      system(DT); // First tick: init

      // Move right 10
      entity.position.x = 10;
      system(DT);

      // Move right another 20
      entity.position.x = 30;
      system(DT);

      expect(getRunStats().distanceTraveled).toBeCloseTo(30, 5);
    });

    it("does not accumulate when player is stationary", () => {
      createPlayerEntity(50, 50, 1);
      system(DT); // init
      system(DT); // no movement
      system(DT); // no movement

      expect(getRunStats().distanceTraveled).toBe(0);
    });

    it("handles player entity removal mid-run without crashing", () => {
      const entity = createPlayerEntity(0, 0, 1);
      system(DT); // init

      entity.position.x = 100;
      system(DT); // accumulate 100px
      expect(getRunStats().distanceTraveled).toBeCloseTo(100, 5);

      // Remove the player entity (e.g. post-death cleanup)
      world.remove(entity);
      system(DT); // should no-op, not crash
      system(DT);

      expect(getRunStats().distanceTraveled).toBeCloseTo(100, 5);
    });

    it("skips NaN coordinates from physics edge cases", () => {
      const entity = createPlayerEntity(0, 0, 1);
      system(DT); // init

      entity.position.x = NaN;
      entity.position.y = NaN;
      system(DT); // should skip NaN tick

      // Restore valid position
      entity.position.x = 50;
      entity.position.y = 0;
      system(DT); // resumes from prevX=0 since NaN tick was skipped

      expect(getRunStats().distanceTraveled).toBeCloseTo(50, 5);
    });
  });

  // -------------------------------------------------------------------------
  // Integration: all stats together
  // -------------------------------------------------------------------------

  describe("combined stats", () => {
    it("tracks all stat types independently", () => {
      const entity = createPlayerEntity(0, 0, 1);
      system(DT); // init

      // Move
      entity.position.x = 100;
      system(DT);

      // Barricade and item events
      safeEmit(ctx.eventBus, "barricade-placed", {
        position: { x: 0, y: 0 },
        health: 100,
        maxHealth: 100,
      });
      safeEmit(ctx.eventBus, "item-picked-up", {
        itemType: "plank",
        quantity: 1,
      });
      safeEmit(ctx.eventBus, "item-picked-up", {
        itemType: "plank",
        quantity: 1,
      });

      const stats = getRunStats();
      expect(stats.distanceTraveled).toBeCloseTo(100, 5);
      expect(stats.barricadesBuilt).toBe(1);
      expect(stats.objectsUsed).toBe(2);
    });
  });
});
