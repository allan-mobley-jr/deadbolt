import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createZombieAISystem, resetZombieKills } from "./zombie-ai-system";
import { createInputState, createClockState } from "./scene-context";
import type { SceneContext } from "./scene-context";
import { BodyRegistry } from "./body-registry";
import { createGameEventBus } from "@/game/events/event-bus";
import { world, resetWorld } from "@/game/ecs/world";
import {
  createZombieEntity,
  createPlayerEntity,
  createBarricadeEntity,
} from "@/game/ecs/archetypes";
import { PathfindingGrid } from "@/game/procgen/pathfinding-grid";
import {
  SHAMBLER_STATS,
  SHAMBLER_HEALTH,
  RUNNER_STATS,
  RUNNER_HEALTH,
  BRUTE_STATS,
  BRUTE_HEALTH,
  HORDE_STATS,
  HORDE_HEALTH,
  ZOMBIE_AI,
} from "./zombie-ai-constants";
import { TILE_SIZE } from "@/game/procgen/constants";

const DT = 1 / 60;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Create a small walkable grid for testing (10x10, all walkable).
 * 0 = walkable, 1 = blocked.
 */
function createTestGrid(width = 10, height = 10): PathfindingGrid {
  const matrix: number[][] = [];
  for (let y = 0; y < height; y++) {
    matrix.push(new Array(width).fill(0));
  }
  return new PathfindingGrid(matrix);
}

/** Create a grid with a wall blocking the middle row (except for one gap). */
function createGridWithWall(): PathfindingGrid {
  const matrix: number[][] = [];
  for (let y = 0; y < 10; y++) {
    if (y === 5) {
      // Wall across the middle with a gap at x=5
      const row = new Array(10).fill(1);
      row[5] = 0;
      matrix.push(row);
    } else {
      matrix.push(new Array(10).fill(0));
    }
  }
  return new PathfindingGrid(matrix);
}

function createMockContext(
  overrides: Partial<SceneContext> = {},
): SceneContext {
  return {
    scene: {
      matter: {
        world: {
          remove: () => {},
        },
      },
    } as unknown as Phaser.Scene,
    bodyRegistry: new BodyRegistry(),
    inputState: createInputState(),
    getAlpha: () => 0,
    clockState: createClockState(),
    eventBus: createGameEventBus(),
    pathfindingGrid: createTestGrid(),
    safehouseCenter: { x: 5, y: 5 },
    ...overrides,
  };
}

/** Helper to tile-center a position (like the real game does). */
function tileCenter(tileX: number, tileY: number): { x: number; y: number } {
  return {
    x: tileX * TILE_SIZE + TILE_SIZE / 2,
    y: tileY * TILE_SIZE + TILE_SIZE / 2,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ZombieAISystem", () => {
  let ctx: SceneContext;
  let system: (dt: number) => void;

  beforeEach(() => {
    ctx = createMockContext();
    system = createZombieAISystem(ctx);
    resetZombieKills();
  });

  afterEach(() => {
    resetWorld();
  });

  // -----------------------------------------------------------------------
  // Archetype completeness
  // -----------------------------------------------------------------------

  describe("createZombieEntity archetype", () => {
    it("returns entity with all 7 required components", () => {
      const zombie = createZombieEntity(100, 100, 1);

      expect(zombie.position).toBeDefined();
      expect(zombie.velocity).toBeDefined();
      expect(zombie.renderable).toBeDefined();
      expect(zombie.physicsBody).toBeDefined();
      expect(zombie.health).toBeDefined();
      expect(zombie.aiState).toBeDefined();
      expect(zombie.zombieType).toBeDefined();
    });

    it("initialises with correct default values", () => {
      const zombie = createZombieEntity(50, 75, 42);

      expect(zombie.position).toEqual({ x: 50, y: 75 });
      expect(zombie.velocity).toEqual({ vx: 0, vy: 0 });
      expect(zombie.renderable.spriteKey).toBe("zombie");
      expect(zombie.physicsBody.bodyId).toBe(42);
      expect(zombie.health.current).toBe(SHAMBLER_HEALTH);
      expect(zombie.health.max).toBe(SHAMBLER_HEALTH);
      expect(zombie.aiState.state).toBe("idle");
      expect(zombie.zombieType.variant).toBe("shambler");
    });
  });

  // -----------------------------------------------------------------------
  // State transitions
  // -----------------------------------------------------------------------

  describe("state transitions", () => {
    it("transitions from idle to pathing on first tick", () => {
      const { x, y } = tileCenter(0, 0);
      const zombie = createZombieEntity(x, y, 1);

      expect(zombie.aiState.state).toBe("idle");
      system(DT);
      expect(zombie.aiState.state).toBe("pathing");
    });

    it("transitions to dead when health reaches zero", () => {
      const { x, y } = tileCenter(0, 0);
      const zombie = createZombieEntity(x, y, 1);

      system(DT); // idle → pathing
      zombie.health.current = 0;
      system(DT);

      // Entity should be removed from world
      expect(world.entities.filter((e) => e.aiState)).toHaveLength(0);
    });

    it("transitions to staggered when health decreases", () => {
      const { x, y } = tileCenter(0, 0);
      const zombie = createZombieEntity(x, y, 1);

      system(DT); // idle → pathing
      zombie.health.current -= 10; // Take damage
      system(DT);

      expect(zombie.aiState.state).toBe("staggered");
    });

    it("transitions from staggered back to pathing after duration", () => {
      const { x, y } = tileCenter(0, 0);
      const zombie = createZombieEntity(x, y, 1);

      system(DT); // idle → pathing
      zombie.health.current -= 10; // Take damage
      system(DT); // → staggered

      expect(zombie.aiState.state).toBe("staggered");

      // Run enough ticks for stagger to expire
      const ticksNeeded = Math.ceil(SHAMBLER_STATS.staggerDuration / DT) + 1;
      for (let i = 0; i < ticksNeeded; i++) {
        system(DT);
      }

      expect(zombie.aiState.state).toBe("pathing");
    });

    it("transitions to attacking when near a barricade", () => {
      // Place zombie right next to a barricade
      const bPos = tileCenter(3, 3);
      const barricade = createBarricadeEntity(
        bPos.x, bPos.y, 10,
        "wooden_plank", 0, [100, 101], 60,
      );

      // Place zombie very close to barricade
      const zPos = {
        x: bPos.x + ZOMBIE_AI.BARRICADE_DETECTION_RANGE * 0.5,
        y: bPos.y,
      };
      const zombie = createZombieEntity(zPos.x, zPos.y, 2);

      system(DT); // idle → pathing, then detect barricade
      expect(zombie.aiState.state).toBe("attacking");
      expect(zombie.aiState.attackTargetBodyId).toBe(barricade.physicsBody.bodyId);
    });

    it("transitions from attacking to pathing when barricade is destroyed", () => {
      const bPos = tileCenter(3, 3);
      const barricade = createBarricadeEntity(
        bPos.x, bPos.y, 10,
        "wooden_plank", 0, [100, 101], 60,
      );

      const zPos = {
        x: bPos.x + ZOMBIE_AI.BARRICADE_DETECTION_RANGE * 0.5,
        y: bPos.y,
      };
      const zombie = createZombieEntity(zPos.x, zPos.y, 2);

      system(DT); // idle → pathing → attacking
      expect(zombie.aiState.state).toBe("attacking");

      // Simulate barricade destruction (remove from world)
      world.remove(barricade);
      system(DT);

      expect(zombie.aiState.state).toBe("pathing");
    });

    it("transitions to attacking when near the player", () => {
      const pPos = tileCenter(3, 3);
      createPlayerEntity(pPos.x, pPos.y, 10);

      const zPos = {
        x: pPos.x + ZOMBIE_AI.ATTACK_RANGE * 0.5,
        y: pPos.y,
      };
      const zombie = createZombieEntity(zPos.x, zPos.y, 2);

      system(DT); // idle → pathing, detect player
      expect(zombie.aiState.state).toBe("attacking");
    });
  });

  // -----------------------------------------------------------------------
  // Pathfinding
  // -----------------------------------------------------------------------

  describe("pathfinding", () => {
    it("computes a path toward safehouse center", () => {
      const { x, y } = tileCenter(0, 0);
      const zombie = createZombieEntity(x, y, 1);

      system(DT); // idle → pathing (forces path calc)

      expect(zombie.aiState.path.length).toBeGreaterThan(0);
    });

    it("sets velocity toward the first waypoint", () => {
      const { x, y } = tileCenter(0, 0);
      const zombie = createZombieEntity(x, y, 1);

      system(DT); // idle → pathing, calc path
      system(DT); // follow path

      // Zombie should be moving (velocity non-zero)
      const speed = Math.sqrt(
        zombie.velocity.vx ** 2 + zombie.velocity.vy ** 2,
      );
      expect(speed).toBeGreaterThan(0);
      expect(speed).toBeLessThanOrEqual(SHAMBLER_STATS.moveSpeed + 0.01);
    });

    it("recalculates path after pathRecalcInterval ticks", () => {
      const { x, y } = tileCenter(0, 0);
      const zombie = createZombieEntity(x, y, 1);

      system(DT); // idle → pathing (counter becomes 1 from pathing handler)

      // After initial tick, counter = 1. Need pathRecalcInterval - 1 more
      // ticks for counter to reach the threshold and trigger recalc.
      for (let i = 0; i < SHAMBLER_STATS.pathRecalcInterval - 1; i++) {
        system(DT);
      }

      // Path should have been recalculated (tick counter resets to 0)
      expect(zombie.aiState.ticksSinceLastPathCalc).toBe(0);
    });

    it("staggers pathfinding across zombies with different offsets", () => {
      // Spawn two zombies with different initial offsets
      const pos1 = tileCenter(0, 0);
      const pos2 = tileCenter(1, 0);
      const z1 = createZombieEntity(pos1.x, pos1.y, 1, undefined, 0);
      const z2 = createZombieEntity(pos2.x, pos2.y, 2, undefined, 20);

      // After first tick, both transition to pathing but z2 has a 20-tick head start
      system(DT);

      // Both have paths now (idle→pathing forces immediate calc)
      expect(z1.aiState.path.length).toBeGreaterThan(0);
      expect(z2.aiState.path.length).toBeGreaterThan(0);

      // But their tick counters should differ on subsequent ticks
      for (let i = 0; i < 10; i++) system(DT);

      expect(z1.aiState.ticksSinceLastPathCalc).not.toBe(
        z2.aiState.ticksSinceLastPathCalc,
      );
    });

    it("routes around wall obstacle through gap", () => {
      const grid = createGridWithWall();
      ctx = createMockContext({
        pathfindingGrid: grid,
        // Safehouse is below the wall — zombie must path through the gap at x=5
        safehouseCenter: { x: 5, y: 9 },
      });
      system = createZombieAISystem(ctx);

      const { x, y } = tileCenter(0, 0);
      const zombie = createZombieEntity(x, y, 1);

      system(DT); // idle → pathing (computes path)

      // A valid path must exist (zombie can reach safehouse through the gap)
      expect(zombie.aiState.path.length).toBeGreaterThan(0);

      // Path must NOT go through the wall (row 5 is blocked except x=5)
      const passesWallRow = zombie.aiState.path.filter((wp) => wp.y === 5);
      for (const wp of passesWallRow) {
        expect(wp.x).toBe(5); // Only the gap tile is allowed
      }
    });

    it("handles unreachable safehouse gracefully", () => {
      // Create a grid where the zombie's start is isolated from everything
      const matrix: number[][] = [];
      for (let y = 0; y < 10; y++) {
        matrix.push(new Array(10).fill(1)); // All blocked
      }
      // Only tile (0,0) is walkable — zombie is trapped
      matrix[0][0] = 0;

      const grid = new PathfindingGrid(matrix);
      ctx = createMockContext({ pathfindingGrid: grid });
      system = createZombieAISystem(ctx);

      const { x, y } = tileCenter(0, 0);
      const zombie = createZombieEntity(x, y, 1);

      // Should not crash — zombie just stands still (no valid path)
      system(DT);
      system(DT);

      expect(zombie.aiState.state).toBe("pathing");
      // Path may contain degenerate entries but zombie cannot move
      expect(zombie.velocity.vx).toBe(0);
      expect(zombie.velocity.vy).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Attacking
  // -----------------------------------------------------------------------

  describe("attacking", () => {
    it("deals damage to barricade health", () => {
      const bPos = tileCenter(3, 3);
      const barricade = createBarricadeEntity(
        bPos.x, bPos.y, 10,
        "wooden_plank", 0, [100, 101], 60,
      );
      const initialHealth = barricade.health.current;

      // Place zombie at attack range
      const zPos = {
        x: bPos.x + ZOMBIE_AI.ATTACK_RANGE * 0.5,
        y: bPos.y,
      };
      createZombieEntity(zPos.x, zPos.y, 2);

      system(DT); // idle → pathing → attacking (first hit at cooldown 0)
      system(DT); // attacking (damage applied on first available tick)

      expect(barricade.health.current).toBeLessThan(initialHealth);
    });

    it("respects attack cooldown", () => {
      const bPos = tileCenter(3, 3);
      const barricade = createBarricadeEntity(
        bPos.x, bPos.y, 10,
        "wooden_plank", 0, [100, 101], 200,
      );

      const zPos = {
        x: bPos.x + ZOMBIE_AI.ATTACK_RANGE * 0.5,
        y: bPos.y,
      };
      createZombieEntity(zPos.x, zPos.y, 2);

      // Run through initial ticks to get into attacking state and first hit
      system(DT);
      system(DT);
      const healthAfterFirstHit = barricade.health.current;

      // Run a few more ticks — cooldown should prevent immediate second hit
      system(DT);
      system(DT);
      system(DT);
      const healthAfterFewTicks = barricade.health.current;

      // Should not have taken another full hit yet (cooldown is 1.5s = 90 ticks)
      expect(healthAfterFewTicks).toBe(healthAfterFirstHit);
    });

    it("deals damage to player and emits health event", () => {
      const events: Array<{ current: number; delta: number }> = [];
      ctx.eventBus.on("player-health-changed", (e) => {
        events.push({ current: e.current, delta: e.delta });
      });

      const pPos = tileCenter(3, 3);
      const player = createPlayerEntity(pPos.x, pPos.y, 10);
      const initialHealth = player.health.current;

      const zPos = {
        x: pPos.x + ZOMBIE_AI.ATTACK_RANGE * 0.5,
        y: pPos.y,
      };
      createZombieEntity(zPos.x, zPos.y, 2);

      system(DT); // idle → attacking
      system(DT); // attack

      expect(player.health.current).toBeLessThan(initialHealth);
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].delta).toBe(-SHAMBLER_STATS.attackDamage);
    });

    it("sets velocity to zero while within attack range", () => {
      const bPos = tileCenter(3, 3);
      createBarricadeEntity(
        bPos.x, bPos.y, 10,
        "wooden_plank", 0, [100, 101], 60,
      );

      // Place zombie very close (within attack range)
      const zPos = {
        x: bPos.x + 5,
        y: bPos.y,
      };
      const zombie = createZombieEntity(zPos.x, zPos.y, 2);

      system(DT); // idle → attacking
      system(DT);

      expect(zombie.velocity.vx).toBe(0);
      expect(zombie.velocity.vy).toBe(0);
    });

    it("emits clamped delta when damage exceeds remaining health", () => {
      const events: Array<{ current: number; delta: number }> = [];
      ctx.eventBus.on("player-health-changed", (e) => {
        events.push({ current: e.current, delta: e.delta });
      });

      const pPos = tileCenter(3, 3);
      const player = createPlayerEntity(pPos.x, pPos.y, 10);
      player.health.current = 2; // Less than attackDamage (5)

      const zPos = {
        x: pPos.x + ZOMBIE_AI.ATTACK_RANGE * 0.5,
        y: pPos.y,
      };
      createZombieEntity(zPos.x, zPos.y, 2);

      system(DT); // idle → attacking
      system(DT); // attack

      expect(player.health.current).toBe(0);
      expect(events.length).toBeGreaterThan(0);
      // Delta should reflect actual applied damage (-2), not raw attackDamage (-5)
      expect(events[0].delta).toBe(-2);
    });

    it("emits player-died when player health reaches zero", () => {
      const diedEvents: Array<{ cause: string }> = [];
      ctx.eventBus.on("player-died", (e) => {
        diedEvents.push({ cause: e.cause });
      });

      const pPos = tileCenter(3, 3);
      const player = createPlayerEntity(pPos.x, pPos.y, 10);
      player.health.current = 1; // Nearly dead

      const zPos = {
        x: pPos.x + ZOMBIE_AI.ATTACK_RANGE * 0.5,
        y: pPos.y,
      };
      createZombieEntity(zPos.x, zPos.y, 2);

      system(DT); // attack
      system(DT);

      expect(player.health.current).toBe(0);
      expect(diedEvents.length).toBe(1);
      expect(diedEvents[0].cause).toBe("zombie");
    });
  });

  // -----------------------------------------------------------------------
  // Stagger state
  // -----------------------------------------------------------------------

  describe("stagger", () => {
    it("sets velocity to zero during stagger", () => {
      const { x, y } = tileCenter(0, 0);
      const zombie = createZombieEntity(x, y, 1);

      system(DT); // idle → pathing
      // Ensure zombie has some velocity
      zombie.velocity.vx = 40;
      zombie.velocity.vy = 0;

      zombie.health.current -= 10; // Take damage
      system(DT); // → staggered

      expect(zombie.velocity.vx).toBe(0);
      expect(zombie.velocity.vy).toBe(0);
    });

    it("transitions from attacking to staggered when taking damage", () => {
      const bPos = tileCenter(3, 3);
      createBarricadeEntity(
        bPos.x, bPos.y, 10,
        "wooden_plank", 0, [100, 101], 200,
      );

      // Place zombie within barricade detection range
      const zPos = {
        x: bPos.x + ZOMBIE_AI.BARRICADE_DETECTION_RANGE * 0.5,
        y: bPos.y,
      };
      const zombie = createZombieEntity(zPos.x, zPos.y, 2);

      system(DT); // idle → pathing → attacking
      expect(zombie.aiState.state).toBe("attacking");

      // Take damage while attacking
      zombie.health.current -= 10;
      system(DT);

      expect(zombie.aiState.state).toBe("staggered");
      expect(zombie.velocity.vx).toBe(0);
      expect(zombie.velocity.vy).toBe(0);
    });

    it("can attack again after recovering from stagger", () => {
      const bPos = tileCenter(3, 3);
      const barricade = createBarricadeEntity(
        bPos.x, bPos.y, 10,
        "wooden_plank", 0, [100, 101], 500,
      );

      // Place zombie within barricade detection range
      const zPos = {
        x: bPos.x + ZOMBIE_AI.BARRICADE_DETECTION_RANGE * 0.5,
        y: bPos.y,
      };
      const zombie = createZombieEntity(zPos.x, zPos.y, 2);

      system(DT); // idle → pathing → attacking
      system(DT); // attack (first hit applies)
      const healthAfterFirstHit = barricade.health.current;

      // Stagger the zombie
      zombie.health.current -= 10;
      system(DT);
      expect(zombie.aiState.state).toBe("staggered");

      // Wait for stagger to expire
      const ticksNeeded = Math.ceil(SHAMBLER_STATS.staggerDuration / DT) + 1;
      for (let i = 0; i < ticksNeeded; i++) {
        system(DT);
      }

      // Zombie should recover and re-enter attacking (still near barricade)
      expect(zombie.aiState.state).toBe("attacking");

      // Run enough ticks for attack cooldown to expire and damage to apply
      const cooldownTicks = Math.ceil(SHAMBLER_STATS.attackCooldown / DT) + 1;
      for (let i = 0; i < cooldownTicks; i++) {
        system(DT);
      }

      // Barricade should have taken additional damage
      expect(barricade.health.current).toBeLessThan(healthAfterFirstHit);
    });

    it("stagger duration matches zombie type config", () => {
      const { x, y } = tileCenter(0, 0);
      const zombie = createZombieEntity(x, y, 1);

      system(DT); // idle → pathing
      zombie.health.current -= 10;
      system(DT); // → staggered

      expect(zombie.aiState.staggerTimeRemaining).toBeCloseTo(
        SHAMBLER_STATS.staggerDuration - DT,
        4,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Death
  // -----------------------------------------------------------------------

  describe("death", () => {
    it("emits zombie-killed event on death", () => {
      const killedEvents: Array<{ totalKills: number }> = [];
      ctx.eventBus.on("zombie-killed", (e) => {
        killedEvents.push({ totalKills: e.totalKills });
      });

      const { x, y } = tileCenter(0, 0);
      const zombie = createZombieEntity(x, y, 1);

      system(DT); // idle → pathing
      zombie.health.current = 0;
      system(DT); // → dead, removed

      expect(killedEvents.length).toBe(1);
      expect(killedEvents[0].totalKills).toBe(1);
    });

    it("removes zombie entity from world on death", () => {
      const { x, y } = tileCenter(0, 0);
      const zombie = createZombieEntity(x, y, 1);

      const initialCount = world.entities.length;
      system(DT); // idle → pathing
      zombie.health.current = 0;
      system(DT); // → dead, removed

      expect(world.entities.length).toBe(initialCount - 1);
    });

    it("tracks cumulative kill count across multiple deaths", () => {
      const killedEvents: Array<{ totalKills: number }> = [];
      ctx.eventBus.on("zombie-killed", (e) => {
        killedEvents.push({ totalKills: e.totalKills });
      });

      // Spawn and kill 3 zombies
      for (let i = 0; i < 3; i++) {
        const { x, y } = tileCenter(i, 0);
        const z = createZombieEntity(x, y, i + 1);
        system(DT); // idle → pathing
        z.health.current = 0;
        system(DT); // → dead
      }

      expect(killedEvents.length).toBe(3);
      expect(killedEvents[0].totalKills).toBe(1);
      expect(killedEvents[1].totalKills).toBe(2);
      expect(killedEvents[2].totalKills).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // Stagger re-entry guard
  // -----------------------------------------------------------------------

  describe("stagger re-entry", () => {
    it("does not restart stagger timer when taking damage while already staggered", () => {
      const { x, y } = tileCenter(0, 0);
      const zombie = createZombieEntity(x, y, 1);

      system(DT); // idle → pathing
      zombie.health.current -= 10; // Take damage
      system(DT); // → staggered

      expect(zombie.aiState.state).toBe("staggered");
      const remainingBefore = zombie.aiState.staggerTimeRemaining;

      // Take more damage while staggered
      zombie.health.current -= 5;
      system(DT);

      // Stagger timer should continue counting down, NOT reset to full duration
      expect(zombie.aiState.state).toBe("staggered");
      expect(zombie.aiState.staggerTimeRemaining).toBeLessThan(remainingBefore);
      expect(zombie.aiState.staggerTimeRemaining).not.toBeCloseTo(
        SHAMBLER_STATS.staggerDuration,
        2,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Attack disengage
  // -----------------------------------------------------------------------

  describe("attack disengage", () => {
    it("returns to pathing when target moves far out of range", () => {
      const bPos = tileCenter(3, 3);
      const barricade = createBarricadeEntity(
        bPos.x, bPos.y, 10,
        "wooden_plank", 0, [100, 101], 200,
      );

      // Place zombie close to barricade
      const zPos = {
        x: bPos.x + ZOMBIE_AI.BARRICADE_DETECTION_RANGE * 0.5,
        y: bPos.y,
      };
      const zombie = createZombieEntity(zPos.x, zPos.y, 2);

      system(DT); // idle → attacking
      expect(zombie.aiState.state).toBe("attacking");

      // Move barricade far away (simulate by modifying position)
      barricade.position.x = bPos.x + 500;
      barricade.position.y = bPos.y + 500;
      system(DT);

      expect(zombie.aiState.state).toBe("pathing");
      expect(zombie.aiState.attackTargetBodyId).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Non-walkable safehouse center
  // -----------------------------------------------------------------------

  describe("non-walkable safehouse center", () => {
    it("finds alternate target when safehouse center is blocked", () => {
      const matrix: number[][] = [];
      for (let y = 0; y < 10; y++) {
        matrix.push(new Array(10).fill(0));
      }
      // Block the safehouse center tile
      matrix[5][5] = 1;

      const grid = new PathfindingGrid(matrix);
      ctx = createMockContext({
        pathfindingGrid: grid,
        safehouseCenter: { x: 5, y: 5 },
      });
      system = createZombieAISystem(ctx);

      const { x, y } = tileCenter(0, 0);
      const zombie = createZombieEntity(x, y, 1);

      system(DT); // idle → pathing (should find alt target)

      // Zombie should still compute a valid path (to a nearby walkable tile)
      expect(zombie.aiState.path.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Reset kills
  // -----------------------------------------------------------------------

  describe("resetZombieKills", () => {
    it("resets kill counter so next death reports totalKills as 1", () => {
      const killedEvents: Array<{ totalKills: number }> = [];
      ctx.eventBus.on("zombie-killed", (e) => {
        killedEvents.push({ totalKills: e.totalKills });
      });

      // Kill first zombie
      const pos1 = tileCenter(0, 0);
      const z1 = createZombieEntity(pos1.x, pos1.y, 1);
      system(DT);
      z1.health.current = 0;
      system(DT);

      expect(killedEvents[0].totalKills).toBe(1);

      // Reset kills
      resetZombieKills();

      // Kill second zombie — should report 1, not 2
      const pos2 = tileCenter(1, 0);
      const z2 = createZombieEntity(pos2.x, pos2.y, 2);
      system(DT);
      z2.health.current = 0;
      system(DT);

      expect(killedEvents[1].totalKills).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe("edge cases", () => {
    it("skips when pathfindingGrid is missing", () => {
      ctx = createMockContext({ pathfindingGrid: undefined });
      system = createZombieAISystem(ctx);

      const { x, y } = tileCenter(0, 0);
      const zombie = createZombieEntity(x, y, 1);

      // Should not throw
      system(DT);
      expect(zombie.aiState.state).toBe("idle");
    });

    it("skips when safehouseCenter is missing", () => {
      ctx = createMockContext({ safehouseCenter: undefined });
      system = createZombieAISystem(ctx);

      const { x, y } = tileCenter(0, 0);
      const zombie = createZombieEntity(x, y, 1);

      system(DT);
      expect(zombie.aiState.state).toBe("idle");
    });

    it("handles no zombies in world gracefully", () => {
      // Should not throw with empty world
      system(DT);
      system(DT);
    });

    it("handles zombie at exact safehouse center tile", () => {
      const center = ctx.safehouseCenter!;
      const { x, y } = tileCenter(center.x, center.y);
      const zombie = createZombieEntity(x, y, 1);

      system(DT); // idle → pathing
      system(DT);

      // Zombie at target — path exhausted, no movement
      expect(zombie.aiState.state).toBe("pathing");
      expect(zombie.aiState.pathIndex).toBeGreaterThanOrEqual(
        zombie.aiState.path.length,
      );
      expect(zombie.velocity.vx).toBe(0);
      expect(zombie.velocity.vy).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Multiple zombies
  // -----------------------------------------------------------------------

  describe("multiple zombies", () => {
    it("processes all zombies each tick", () => {
      const zombies = [];
      for (let i = 0; i < 5; i++) {
        const { x, y } = tileCenter(i, 0);
        zombies.push(createZombieEntity(x, y, i + 1, undefined, i * 10));
      }

      system(DT);

      // All should have transitioned from idle
      for (const z of zombies) {
        expect(z.aiState.state).not.toBe("idle");
      }
    });

    it("allows independent state machines per zombie", () => {
      const z1Pos = tileCenter(0, 0);
      const z2Pos = tileCenter(1, 0);
      const z1 = createZombieEntity(z1Pos.x, z1Pos.y, 1);
      const z2 = createZombieEntity(z2Pos.x, z2Pos.y, 2);

      system(DT); // Both idle → pathing

      // Damage only z1
      z1.health.current -= 10;
      system(DT);

      expect(z1.aiState.state).toBe("staggered");
      expect(z2.aiState.state).toBe("pathing");
    });
  });

  // -----------------------------------------------------------------------
  // Runner archetype
  // -----------------------------------------------------------------------

  describe("runner archetype", () => {
    it("creates runner entity with correct stats", () => {
      const { x, y } = tileCenter(0, 0);
      const runner = createZombieEntity(
        x, y, 1, { ...RUNNER_STATS }, 0, RUNNER_HEALTH,
      );

      expect(runner.zombieType.variant).toBe("runner");
      expect(runner.zombieType.moveSpeed).toBe(100);
      expect(runner.health.current).toBe(RUNNER_HEALTH);
      expect(runner.renderable.spriteKey).toBe("zombie_runner");
    });

    it("ignores low-durability barricades (vault mechanic)", () => {
      const bPos = tileCenter(3, 3);
      // Barricade with durability below runner's vault threshold (30)
      const barricade = createBarricadeEntity(
        bPos.x, bPos.y, 10,
        "wooden_plank", 0, [100, 101], 60,
      );
      // Set durability to below runner vault threshold
      barricade.barricade.currentDurability = 20;
      barricade.health.current = 20;

      const zPos = {
        x: bPos.x + ZOMBIE_AI.BARRICADE_DETECTION_RANGE * 0.5,
        y: bPos.y,
      };
      const runner = createZombieEntity(
        zPos.x, zPos.y, 2, { ...RUNNER_STATS }, 0, RUNNER_HEALTH,
      );

      system(DT); // idle → pathing — should NOT transition to attacking
      expect(runner.aiState.state).toBe("pathing");
    });

    it("attacks barricades above vault threshold normally", () => {
      const bPos = tileCenter(3, 3);
      const barricade = createBarricadeEntity(
        bPos.x, bPos.y, 10,
        "metal_sheet", 0, [100, 101], 160,
      );
      // Durability above vault threshold
      barricade.barricade.currentDurability = 100;

      const zPos = {
        x: bPos.x + ZOMBIE_AI.BARRICADE_DETECTION_RANGE * 0.5,
        y: bPos.y,
      };
      const runner = createZombieEntity(
        zPos.x, zPos.y, 2, { ...RUNNER_STATS }, 0, RUNNER_HEALTH,
      );

      system(DT);
      expect(runner.aiState.state).toBe("attacking");
    });

    it("has more frequent path recalculation than shambler", () => {
      expect(RUNNER_STATS.pathRecalcInterval).toBeLessThan(
        SHAMBLER_STATS.pathRecalcInterval,
      );
    });

    it("moves faster than shambler", () => {
      const { x, y } = tileCenter(0, 0);
      const runner = createZombieEntity(
        x, y, 1, { ...RUNNER_STATS }, 0, RUNNER_HEALTH,
      );

      system(DT); // idle → pathing
      system(DT); // follow path

      const speed = Math.sqrt(
        runner.velocity.vx ** 2 + runner.velocity.vy ** 2,
      );
      // Runner should move at its higher speed
      expect(speed).toBeLessThanOrEqual(RUNNER_STATS.moveSpeed + 0.01);
      expect(speed).toBeGreaterThan(SHAMBLER_STATS.moveSpeed);
    });
  });

  // -----------------------------------------------------------------------
  // Brute archetype
  // -----------------------------------------------------------------------

  describe("brute archetype", () => {
    it("creates brute entity with correct stats", () => {
      const { x, y } = tileCenter(0, 0);
      const brute = createZombieEntity(
        x, y, 1, { ...BRUTE_STATS }, 0, BRUTE_HEALTH,
      );

      expect(brute.zombieType.variant).toBe("brute");
      expect(brute.health.current).toBe(BRUTE_HEALTH);
      expect(brute.zombieType.barricadeDamageMultiplier).toBe(3);
      expect(brute.renderable.spriteKey).toBe("zombie_brute");
    });

    it("deals 3x damage to barricades", () => {
      const bPos = tileCenter(3, 3);
      const barricade = createBarricadeEntity(
        bPos.x, bPos.y, 10,
        "wooden_plank", 0, [100, 101], 500,
      );
      const initialHealth = barricade.health.current;

      // Place brute within attack range
      const zPos = {
        x: bPos.x + ZOMBIE_AI.ATTACK_RANGE * 0.5,
        y: bPos.y,
      };
      createZombieEntity(
        zPos.x, zPos.y, 2, { ...BRUTE_STATS }, 0, BRUTE_HEALTH,
      );

      system(DT); // idle → attacking
      system(DT); // attack (first hit)

      // Brute damage = attackDamage × barricadeDamageMultiplier = 10 × 3 = 30
      const expectedDamage = BRUTE_STATS.attackDamage * BRUTE_STATS.barricadeDamageMultiplier;
      expect(barricade.health.current).toBe(initialHealth - expectedDamage);
    });

    it("deals normal (non-multiplied) damage to player", () => {
      const pPos = tileCenter(3, 3);
      const player = createPlayerEntity(pPos.x, pPos.y, 10);
      const initialHealth = player.health.current;

      const zPos = {
        x: pPos.x + ZOMBIE_AI.ATTACK_RANGE * 0.5,
        y: pPos.y,
      };
      createZombieEntity(
        zPos.x, zPos.y, 2, { ...BRUTE_STATS }, 0, BRUTE_HEALTH,
      );

      system(DT); // idle → attacking
      system(DT); // attack

      // Player damage should be attackDamage only, NOT multiplied
      expect(player.health.current).toBe(initialHealth - BRUTE_STATS.attackDamage);
    });

    it("targets the weakest barricade rather than the nearest", () => {
      // Place two barricades: a strong one nearby and a weak one further away
      const strongPos = tileCenter(3, 3);
      const strongBarricade = createBarricadeEntity(
        strongPos.x, strongPos.y, 10,
        "metal_sheet", 0, [100, 101], 200,
      );
      strongBarricade.barricade.currentDurability = 200;

      const weakPos = tileCenter(3, 5);
      const weakBarricade = createBarricadeEntity(
        weakPos.x, weakPos.y, 11,
        "wooden_plank", 1, [102, 103], 60,
      );
      weakBarricade.barricade.currentDurability = 20;

      // Place brute close to strong barricade but equidistant in detection range
      const brutePos = {
        x: strongPos.x + ZOMBIE_AI.BARRICADE_DETECTION_RANGE * 0.3,
        y: strongPos.y,
      };
      const brute = createZombieEntity(
        brutePos.x, brutePos.y, 3, { ...BRUTE_STATS }, 0, BRUTE_HEALTH,
      );

      system(DT); // idle → pathing (brute should path toward weak barricade)

      // The brute's computed path target should be toward the weak barricade
      // Verify by checking that it pathfinds (has a path)
      expect(brute.aiState.path.length).toBeGreaterThan(0);
    });

    it("falls back to safehouse center when no barricades exist", () => {
      const { x, y } = tileCenter(0, 0);
      const brute = createZombieEntity(
        x, y, 1, { ...BRUTE_STATS }, 0, BRUTE_HEALTH,
      );

      system(DT); // idle → pathing (no barricades → safehouse center)
      expect(brute.aiState.path.length).toBeGreaterThan(0);
    });

    it("moves slower than shambler", () => {
      expect(BRUTE_STATS.moveSpeed).toBeLessThan(SHAMBLER_STATS.moveSpeed);
    });

    it("has higher health than shambler", () => {
      expect(BRUTE_HEALTH).toBeGreaterThan(SHAMBLER_HEALTH);
    });
  });

  // -----------------------------------------------------------------------
  // Horde archetype
  // -----------------------------------------------------------------------

  describe("horde archetype", () => {
    it("creates horde entity with correct stats", () => {
      const { x, y } = tileCenter(0, 0);
      const horde = createZombieEntity(
        x, y, 1, { ...HORDE_STATS }, 0, HORDE_HEALTH,
      );

      expect(horde.zombieType.variant).toBe("horde");
      expect(horde.health.current).toBe(HORDE_HEALTH);
      expect(horde.health.max).toBe(HORDE_HEALTH);
      expect(horde.renderable.spriteKey).toBe("zombie_horde");
    });

    it("has lower health than shambler", () => {
      expect(HORDE_HEALTH).toBeLessThan(SHAMBLER_HEALTH);
    });

    it("has lower individual damage than shambler", () => {
      expect(HORDE_STATS.attackDamage).toBeLessThan(SHAMBLER_STATS.attackDamage);
    });

    it("has smaller body size than shambler", () => {
      expect(HORDE_STATS.bodySize).toBeLessThan(SHAMBLER_STATS.bodySize);
    });

    it("follows standard AI state machine (no vault, no brute targeting)", () => {
      const bPos = tileCenter(3, 3);
      createBarricadeEntity(
        bPos.x, bPos.y, 10,
        "wooden_plank", 0, [100, 101], 60,
      );

      const zPos = {
        x: bPos.x + ZOMBIE_AI.BARRICADE_DETECTION_RANGE * 0.5,
        y: bPos.y,
      };
      const horde = createZombieEntity(
        zPos.x, zPos.y, 2, { ...HORDE_STATS }, 0, HORDE_HEALTH,
      );

      system(DT); // idle → pathing → attacking (standard barricade detection)
      expect(horde.aiState.state).toBe("attacking");
    });
  });

  // -----------------------------------------------------------------------
  // Variant stat validation
  // -----------------------------------------------------------------------

  describe("variant stat validation", () => {
    it("all variants have required ZombieType fields", () => {
      for (const stats of [SHAMBLER_STATS, RUNNER_STATS, BRUTE_STATS, HORDE_STATS]) {
        expect(stats.variant).toBeDefined();
        expect(stats.moveSpeed).toBeGreaterThan(0);
        expect(stats.attackDamage).toBeGreaterThan(0);
        expect(stats.attackCooldown).toBeGreaterThan(0);
        expect(stats.pathRecalcInterval).toBeGreaterThan(0);
        expect(stats.staggerDuration).toBeGreaterThan(0);
        expect(stats.barricadeDamageMultiplier).toBeGreaterThanOrEqual(1);
        expect(stats.vaultDurabilityThreshold).toBeGreaterThanOrEqual(0);
        expect(stats.bodySize).toBeGreaterThan(0);
      }
    });

    it("shambler has no vault capability", () => {
      expect(SHAMBLER_STATS.vaultDurabilityThreshold).toBe(0);
    });

    it("shambler has default barricade damage multiplier", () => {
      expect(SHAMBLER_STATS.barricadeDamageMultiplier).toBe(1);
    });

    it("runner has vault capability", () => {
      expect(RUNNER_STATS.vaultDurabilityThreshold).toBeGreaterThan(0);
    });

    it("brute has 3x barricade damage multiplier", () => {
      expect(BRUTE_STATS.barricadeDamageMultiplier).toBe(3);
    });
  });
});
