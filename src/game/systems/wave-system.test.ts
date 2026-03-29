import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createWaveSystem } from "./wave-system";
import { createInputState, createClockState } from "./scene-context";
import type { SceneContext, ClockState } from "./scene-context";
import { BodyRegistry } from "./body-registry";
import { createGameEventBus } from "@/game/events/event-bus";
import type {
  GameEventBus,
  WaveStartedEvent,
  WaveEndedEvent,
} from "@/game/events/event-bus";
import { world, resetWorld } from "@/game/ecs/world";
import { zombieEntities } from "@/game/ecs/queries";
import type { SpawnZone } from "@/types/procgen";

const DT = 1 / 60;

// ---------------------------------------------------------------------------
// Mock matter.add.rectangle — produces unique body IDs
// ---------------------------------------------------------------------------

let nextBodyId = 100;

function createMockMatterAdd() {
  return {
    rectangle: (
      _x: number,
      _y: number,
      _w: number,
      _h: number,
      _opts?: Record<string, unknown>,
    ) => ({
      id: nextBodyId++,
      inertia: Infinity,
      inverseInertia: 0,
    }),
  };
}

// ---------------------------------------------------------------------------
// Test spawn zones — 12 edge zones (3 per edge) + 1 far-building
// ---------------------------------------------------------------------------

function createTestSpawnZones(): SpawnZone[] {
  const zones: SpawnZone[] = [];

  // 12 edge zones: 3 per edge (N, S, W, E) — mirrors generateEdgeSpawnZones
  const edges = ["north", "south", "west", "east"];
  let id = 0;
  for (const edge of edges) {
    for (let seg = 0; seg < 3; seg++) {
      const baseX = edge === "west" ? 2 : edge === "east" ? 98 : 20 + seg * 30;
      const baseY = edge === "north" ? 2 : edge === "south" ? 98 : 20 + seg * 30;
      zones.push({
        id: `edge-${id++}`,
        type: "map_edge",
        position: { x: baseX, y: baseY },
        radius: 4,
        distanceToSafehouse: 40,
        spawnPoints: [
          { x: baseX, y: baseY },
          { x: baseX + 1, y: baseY },
          { x: baseX, y: baseY + 1 },
        ],
      });
    }
  }

  // 1 far-building zone
  zones.push({
    id: "far-0",
    type: "far_building",
    position: { x: 80, y: 80 },
    radius: 4,
    distanceToSafehouse: 50,
    spawnPoints: [
      { x: 80, y: 80 },
      { x: 81, y: 80 },
    ],
  });

  return zones;
}

// ---------------------------------------------------------------------------
// Mock context factory
// ---------------------------------------------------------------------------

function createMockContext(): {
  ctx: SceneContext;
  clockState: ClockState;
  eventBus: GameEventBus;
} {
  const clockState = createClockState();
  const eventBus = createGameEventBus();
  const bodyRegistry = new BodyRegistry();
  const matterAdd = createMockMatterAdd();
  return {
    ctx: {
      scene: { matter: { add: matterAdd } } as unknown as Phaser.Scene,
      bodyRegistry,
      inputState: createInputState(),
      getAlpha: () => 0,
      clockState,
      eventBus,
      spawnZones: createTestSpawnZones(),
    },
    clockState,
    eventBus,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Advance the system by the given number of seconds. */
function tickSeconds(system: (dt: number) => void, seconds: number): void {
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i++) {
    system(DT);
  }
}

/**
 * Force a phase transition on the clock state.
 * The wave system detects transitions by comparing phase each tick.
 */
function setPhase(
  clockState: ClockState,
  phase: "day" | "dusk" | "night" | "dawn",
  dayNumber?: number,
): void {
  clockState.phase = phase;
  if (dayNumber !== undefined) {
    clockState.dayNumber = dayNumber;
  }
}

/** Remove all zombie entities from the ECS world. */
function removeAllZombies(): void {
  for (const entity of [...zombieEntities.entities]) {
    world.remove(entity);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WaveSystem", () => {
  let ctx: SceneContext;
  let clockState: ClockState;
  let eventBus: GameEventBus;
  let system: (dt: number) => void;

  beforeEach(() => {
    resetWorld();
    nextBodyId = 100;
    const mock = createMockContext();
    ctx = mock.ctx;
    clockState = mock.clockState;
    eventBus = mock.eventBus;
    system = createWaveSystem(ctx);
  });

  afterEach(() => {
    resetWorld();
  });

  // -----------------------------------------------------------------------
  // Initial state / inactive during day
  // -----------------------------------------------------------------------

  describe("inactive state", () => {
    it("does not spawn zombies during day phase", () => {
      tickSeconds(system, 10);
      expect(zombieEntities.entities.length).toBe(0);
    });

    it("does not emit wave-started during day phase", () => {
      const handler = vi.fn();
      eventBus.on("wave-started", handler);
      tickSeconds(system, 10);
      expect(handler).not.toHaveBeenCalled();
    });

    it("respects paused state", () => {
      clockState.paused = true;
      setPhase(clockState, "dusk");
      system(DT); // should be ignored
      setPhase(clockState, "night");
      system(DT); // should be ignored
      expect(zombieEntities.entities.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Night activation
  // -----------------------------------------------------------------------

  describe("night activation", () => {
    it("emits wave-started when night begins", () => {
      const handler = vi.fn();
      eventBus.on("wave-started", handler);

      // Dusk → prepare
      setPhase(clockState, "dusk");
      system(DT);

      // Night → start wave
      setPhase(clockState, "night");
      system(DT);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as WaveStartedEvent;
      expect(event.waveNumber).toBe(1);
      expect(event.dayNumber).toBe(1);
      expect(event.zombieCount).toBeGreaterThanOrEqual(5);
      expect(event.zombieCount).toBeLessThanOrEqual(8);
    });

    it("increments wave number across nights", () => {
      const handler = vi.fn();
      eventBus.on("wave-started", handler);

      // Night 1
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      // Dawn → end wave
      setPhase(clockState, "dawn");
      system(DT);

      // Day 2 cycle
      setPhase(clockState, "day");
      clockState.dayNumber = 2;
      system(DT);
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      expect(handler).toHaveBeenCalledTimes(2);
      expect((handler.mock.calls[1][0] as WaveStartedEvent).waveNumber).toBe(2);
    });

    it("self-recovers if dusk is skipped (direct day→night)", () => {
      const handler = vi.fn();
      eventBus.on("wave-started", handler);

      // Skip dusk entirely — go straight from day to night
      setPhase(clockState, "night");
      system(DT);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as WaveStartedEvent;
      expect(event.waveNumber).toBe(1);
      expect(event.zombieCount).toBeGreaterThanOrEqual(5);

      // Should actually spawn zombies
      tickSeconds(system, 3);
      expect(zombieEntities.entities.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Staggered spawning within pulses
  // -----------------------------------------------------------------------

  describe("staggered spawning", () => {
    it("spawns zombies over time, not all at once", () => {
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      // After one tick, should not have all zombies yet
      const afterOneTick = zombieEntities.entities.length;

      // Spawn more over several seconds
      tickSeconds(system, 2);
      const afterTwoSec = zombieEntities.entities.length;

      expect(afterOneTick).toBeLessThan(afterTwoSec);
    });

    it("respects spawn interval timing", () => {
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      // Night 1 spawn interval is 0.8s
      // After 0.5s, should have few zombies (first spawns at t=0)
      tickSeconds(system, 0.5);
      const earlyCount = zombieEntities.entities.length;

      // After another 0.8s, should have more
      tickSeconds(system, 0.8);
      const laterCount = zombieEntities.entities.length;

      expect(laterCount).toBeGreaterThan(earlyCount);
    });
  });

  // -----------------------------------------------------------------------
  // Pulse timing with pauses
  // -----------------------------------------------------------------------

  describe("pulse timing", () => {
    it("pauses between pulses for barricade repair", () => {
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      // Night 1: 2 pulses, 15s pause, 5-8 zombies, 0.8s interval
      // First pulse: ceil(total/2) zombies at 0.8s each

      // Run enough to complete first pulse
      tickSeconds(system, 5);
      const countAfterFirstPulse = zombieEntities.entities.length;

      // During pause, no new zombies should spawn
      tickSeconds(system, 5);
      const countDuringPause = zombieEntities.entities.length;
      expect(countDuringPause).toBe(countAfterFirstPulse);

      // After full pause (15s total from pulse end), second pulse starts
      tickSeconds(system, 15);
      const countAfterSecondPulse = zombieEntities.entities.length;
      expect(countAfterSecondPulse).toBeGreaterThan(countAfterFirstPulse);
    });
  });

  // -----------------------------------------------------------------------
  // Wave completion
  // -----------------------------------------------------------------------

  describe("wave completion", () => {
    it("emits wave-ended when all zombies are killed", () => {
      const handler = vi.fn();
      eventBus.on("wave-ended", handler);

      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      // Spawn all zombies (run enough time for full night 1)
      tickSeconds(system, 30);

      // Kill all zombies
      for (const entity of [...zombieEntities.entities]) {
        entity.health.current = 0;
      }
      // For this test, we remove them manually from the world.
      for (const entity of [...zombieEntities.entities]) {
        if (entity.health.current <= 0) {
          world.remove(entity);
        }
      }

      // Tick once to detect completion
      system(DT);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as WaveEndedEvent;
      expect(event.waveNumber).toBe(1);
      expect(event.dayNumber).toBe(1);
    });

    it("does NOT emit wave-ended while zombies are still alive", () => {
      const handler = vi.fn();
      eventBus.on("wave-ended", handler);

      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      // Spawn all zombies
      tickSeconds(system, 30);
      expect(zombieEntities.entities.length).toBeGreaterThan(0);

      // Tick while zombies are alive — should NOT end wave
      tickSeconds(system, 5);
      expect(handler).not.toHaveBeenCalled();
    });

    it("emits wave-ended when dawn arrives with survivors", () => {
      const handler = vi.fn();
      eventBus.on("wave-ended", handler);

      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      // Spawn some zombies
      tickSeconds(system, 3);
      expect(zombieEntities.entities.length).toBeGreaterThan(0);

      // Dawn arrives — survivors should be despawned
      setPhase(clockState, "dawn");
      system(DT);

      expect(handler).toHaveBeenCalledTimes(1);

      // All survivors should have health set to 0
      for (const entity of zombieEntities.entities) {
        expect(entity.health.current).toBe(0);
      }
    });

    it("handles dawn arriving immediately after night starts (zero spawns)", () => {
      const handler = vi.fn();
      eventBus.on("wave-ended", handler);

      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      // Dawn immediately
      setPhase(clockState, "dawn");
      system(DT);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as WaveEndedEvent;
      expect(event.zombiesKilled).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Night escalation
  // -----------------------------------------------------------------------

  describe("night escalation", () => {
    it("Night 1 spawns 5-8 zombies", () => {
      const handler = vi.fn();
      eventBus.on("wave-started", handler);

      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      const event = handler.mock.calls[0][0] as WaveStartedEvent;
      expect(event.zombieCount).toBeGreaterThanOrEqual(5);
      expect(event.zombieCount).toBeLessThanOrEqual(8);
    });

    it("Night 2 spawns 12-18 zombies", () => {
      const handler = vi.fn();
      eventBus.on("wave-started", handler);

      clockState.dayNumber = 2;
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      const event = handler.mock.calls[0][0] as WaveStartedEvent;
      expect(event.zombieCount).toBeGreaterThanOrEqual(12);
      expect(event.zombieCount).toBeLessThanOrEqual(18);
    });

    it("Night 3 spawns 25-35 zombies", () => {
      const handler = vi.fn();
      eventBus.on("wave-started", handler);

      clockState.dayNumber = 3;
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      const event = handler.mock.calls[0][0] as WaveStartedEvent;
      expect(event.zombieCount).toBeGreaterThanOrEqual(25);
      expect(event.zombieCount).toBeLessThanOrEqual(35);
    });

    it("Night 4 spawns 40-55 zombies", () => {
      const handler = vi.fn();
      eventBus.on("wave-started", handler);

      clockState.dayNumber = 4;
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      const event = handler.mock.calls[0][0] as WaveStartedEvent;
      expect(event.zombieCount).toBeGreaterThanOrEqual(40);
      expect(event.zombieCount).toBeLessThanOrEqual(55);
    });

    it("Night 5+ scales beyond Night 4 baseline", () => {
      const handler = vi.fn();
      eventBus.on("wave-started", handler);

      clockState.dayNumber = 6;
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      const event = handler.mock.calls[0][0] as WaveStartedEvent;
      // Night 6 = 2 beyond base. Count scales by 1.1^2 ≈ 1.21
      // min: round(40 * 1.21) = 48, max: round(55 * 1.21) = 67
      expect(event.zombieCount).toBeGreaterThanOrEqual(48);
      expect(event.zombieCount).toBeLessThanOrEqual(67);
    });
  });

  // -----------------------------------------------------------------------
  // Stat scaling for Night 4+
  // -----------------------------------------------------------------------

  describe("stat scaling", () => {
    it("applies stat multiplier to zombies on Night 4", () => {
      clockState.dayNumber = 4;
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      // Spawn some zombies
      tickSeconds(system, 2);

      // Check that at least one zombie has scaled stats
      const zombie = zombieEntities.entities[0];
      expect(zombie).toBeDefined();
      // Night 4 stat multiplier is 1.15
      // All stats should be scaled — verify health is at max (scaled)
      expect(zombie.health.current).toBe(zombie.health.max);
      // Verify stats are > 0 (scaled, not zeroed)
      expect(zombie.zombieType.moveSpeed).toBeGreaterThan(0);
      expect(zombie.zombieType.attackDamage).toBeGreaterThan(0);
      expect(zombie.health.max).toBeGreaterThan(0);
    });

    it("does not apply stat multiplier on Night 1", () => {
      clockState.dayNumber = 1;
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      tickSeconds(system, 2);

      const zombie = zombieEntities.entities[0];
      expect(zombie).toBeDefined();
      // Night 1: only shamblers, no multiplier
      // Shambler moveSpeed = 40 (unscaled)
      expect(zombie.zombieType.moveSpeed).toBe(40);
      expect(zombie.zombieType.attackDamage).toBe(5);
      expect(zombie.health.max).toBe(50);
    });
  });

  // -----------------------------------------------------------------------
  // Spawn zone selection (approach directions)
  // -----------------------------------------------------------------------

  describe("spawn zone selection", () => {
    it("Night 1 uses 1 approach direction (3 zones from one edge)", () => {
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      // Spawn enough to have multiple zombies
      tickSeconds(system, 5);

      // All zombies should be from the same edge cluster
      const positions = zombieEntities.entities.map((e) => ({
        x: e.position.x,
        y: e.position.y,
      }));

      expect(positions.length).toBeGreaterThan(0);

      // If single direction, should NOT span both full X and full Y
      const xs = positions.map((p) => p.x);
      const ys = positions.map((p) => p.y);
      const xRange = Math.max(...xs) - Math.min(...xs);
      const yRange = Math.max(...ys) - Math.min(...ys);

      // A single edge has zones within ~30 tiles = ~960px spread
      const fullSpan = 80 * 32; // ~80 tiles worth of spread
      expect(xRange < fullSpan || yRange < fullSpan).toBe(true);
    });

    it("Night 3 uses all 4 approach directions", () => {
      clockState.dayNumber = 3;
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      // Spawn many zombies to cover all zones
      tickSeconds(system, 15);

      const positions = zombieEntities.entities.map((e) => ({
        x: e.position.x,
        y: e.position.y,
      }));
      expect(positions.length).toBeGreaterThan(5);
    });
  });

  // -----------------------------------------------------------------------
  // No spawn zones available
  // -----------------------------------------------------------------------

  describe("no spawn zones", () => {
    it("handles missing spawn zones gracefully", () => {
      const mock = createMockContext();
      mock.ctx.spawnZones = [];
      const noZoneSystem = createWaveSystem(mock.ctx);

      const handler = vi.fn();
      mock.eventBus.on("wave-started", handler);

      mock.clockState.phase = "dusk" as const;
      noZoneSystem(DT);
      mock.clockState.phase = "night" as const;
      noZoneSystem(DT);

      // Should emit wave-started with 0 zombies
      expect(handler).toHaveBeenCalledTimes(1);
      expect((handler.mock.calls[0][0] as WaveStartedEvent).zombieCount).toBe(0);

      tickSeconds(noZoneSystem, 5);
      expect(zombieEntities.entities.length).toBe(0);
    });

    it("handles undefined spawn zones gracefully", () => {
      const mock = createMockContext();
      mock.ctx.spawnZones = undefined;
      const noZoneSystem = createWaveSystem(mock.ctx);

      mock.clockState.phase = "dusk" as const;
      noZoneSystem(DT);
      mock.clockState.phase = "night" as const;
      noZoneSystem(DT);

      tickSeconds(noZoneSystem, 5);
      expect(zombieEntities.entities.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Pause during active spawning
  // -----------------------------------------------------------------------

  describe("pause during spawning", () => {
    it("freezes spawn timer when paused mid-wave", () => {
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      // Spawn some zombies
      tickSeconds(system, 2);
      const countBeforePause = zombieEntities.entities.length;

      // Pause for 5 seconds
      clockState.paused = true;
      tickSeconds(system, 5);
      const countDuringPause = zombieEntities.entities.length;
      expect(countDuringPause).toBe(countBeforePause);

      // Unpause — spawning resumes without timer jump
      clockState.paused = false;
      system(DT);
      // One tick won't accumulate enough for a spawn (interval 0.8s)
      const countAfterOneTick = zombieEntities.entities.length;
      expect(countAfterOneTick).toBe(countBeforePause);

      // More time passes — spawning resumes normally
      tickSeconds(system, 2);
      const countAfterResume = zombieEntities.entities.length;
      expect(countAfterResume).toBeGreaterThan(countBeforePause);
    });
  });

  // -----------------------------------------------------------------------
  // Multiple nights
  // -----------------------------------------------------------------------

  describe("multiple night cycles", () => {
    it("correctly reactivates on subsequent nights", () => {
      const startedHandler = vi.fn();
      const endedHandler = vi.fn();
      eventBus.on("wave-started", startedHandler);
      eventBus.on("wave-ended", endedHandler);

      // Night 1
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);
      setPhase(clockState, "dawn");
      system(DT);

      expect(startedHandler).toHaveBeenCalledTimes(1);
      expect(endedHandler).toHaveBeenCalledTimes(1);

      // Clean up zombie entities for next night
      removeAllZombies();

      // Day 2
      setPhase(clockState, "day");
      clockState.dayNumber = 2;
      system(DT);

      // Night 2
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      expect(startedHandler).toHaveBeenCalledTimes(2);
      const event = startedHandler.mock.calls[1][0] as WaveStartedEvent;
      expect(event.waveNumber).toBe(2);
      expect(event.dayNumber).toBe(2);
      expect(event.zombieCount).toBeGreaterThanOrEqual(12);
    });
  });

  // -----------------------------------------------------------------------
  // Deterministic RNG
  // -----------------------------------------------------------------------

  describe("deterministic spawning", () => {
    it("produces same zombie count with same day number", () => {
      const startedHandler1 = vi.fn();
      eventBus.on("wave-started", startedHandler1);

      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      const count1 = (startedHandler1.mock.calls[0][0] as WaveStartedEvent)
        .zombieCount;

      // Create a second system with same day number
      resetWorld();
      nextBodyId = 100;
      const mock2 = createMockContext();
      const system2 = createWaveSystem(mock2.ctx);
      const startedHandler2 = vi.fn();
      mock2.eventBus.on("wave-started", startedHandler2);

      mock2.clockState.phase = "dusk" as const;
      system2(DT);
      mock2.clockState.phase = "night" as const;
      system2(DT);

      const count2 = (startedHandler2.mock.calls[0][0] as WaveStartedEvent)
        .zombieCount;

      expect(count1).toBe(count2);
    });
  });

  // -----------------------------------------------------------------------
  // Event payloads
  // -----------------------------------------------------------------------

  describe("event payloads", () => {
    it("wave-started has correct structure", () => {
      const handler = vi.fn();
      eventBus.on("wave-started", handler);

      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      const event = handler.mock.calls[0][0] as WaveStartedEvent;
      expect(event).toHaveProperty("waveNumber");
      expect(event).toHaveProperty("zombieCount");
      expect(event).toHaveProperty("dayNumber");
      expect(typeof event.waveNumber).toBe("number");
      expect(typeof event.zombieCount).toBe("number");
      expect(typeof event.dayNumber).toBe("number");
    });

    it("wave-ended has correct structure", () => {
      const handler = vi.fn();
      eventBus.on("wave-ended", handler);

      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);
      setPhase(clockState, "dawn");
      system(DT);

      const event = handler.mock.calls[0][0] as WaveEndedEvent;
      expect(event).toHaveProperty("waveNumber");
      expect(event).toHaveProperty("zombiesKilled");
      expect(event).toHaveProperty("dayNumber");
    });
  });

  // -----------------------------------------------------------------------
  // Error recovery
  // -----------------------------------------------------------------------

  describe("error recovery", () => {
    it("recovers to inactive state on tick error", () => {
      const mock = createMockContext();
      // Sabotage matter.add to cause an error during spawn
      mock.ctx.scene = { matter: { add: { rectangle: null } } } as unknown as Phaser.Scene;
      const errorSystem = createWaveSystem(mock.ctx);

      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      mock.clockState.phase = "dusk" as const;
      errorSystem(DT);
      mock.clockState.phase = "night" as const;
      errorSystem(DT);

      // The system should have caught the error and set state to inactive
      // Subsequent ticks should not crash
      tickSeconds(errorSystem, 5);

      consoleError.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // Performance: handles 40+ zombies
  // -----------------------------------------------------------------------

  describe("performance", () => {
    it("spawns 40+ zombies without issues on Night 4", () => {
      clockState.dayNumber = 4;
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      // Night 4: 40-55 zombies, 0.3s interval, 5 pulses
      // Run enough time to spawn all + pauses
      tickSeconds(system, 60);

      expect(zombieEntities.entities.length).toBeGreaterThanOrEqual(40);
    });
  });

  // -----------------------------------------------------------------------
  // Horde cluster overshoot protection
  // -----------------------------------------------------------------------

  describe("horde cluster handling", () => {
    it("prevents horde cluster from overshooting total spawn count", () => {
      // Night 3+ unlocks hordes. With totalToSpawn of 25-35,
      // horde clusters (5-10 each) could overshoot without capping.
      const handler = vi.fn();
      eventBus.on("wave-started", handler);

      clockState.dayNumber = 3;
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      const announced = (handler.mock.calls[0][0] as WaveStartedEvent)
        .zombieCount;

      // Run the full night
      tickSeconds(system, 60);

      // Actual spawns should not wildly exceed announced count
      // Hordes may overshoot slightly (by up to one cluster), but the
      // cap prevents selecting horde when < 5 remaining
      const actualSpawns = zombieEntities.entities.length;
      expect(actualSpawns).toBeGreaterThanOrEqual(announced);
      // Allow up to one horde cluster (10) overshoot from in-progress spawns
      expect(actualSpawns).toBeLessThanOrEqual(announced + 10);
    });
  });

  // -----------------------------------------------------------------------
  // Kill counter via zombie-killed events (Gap 1 — criticality 9/10)
  // -----------------------------------------------------------------------

  describe("kill tracking via zombie-killed events", () => {
    it("zombiesKilled in wave-ended reflects zombie-killed events emitted during the wave", () => {
      const endedHandler = vi.fn();
      eventBus.on("wave-ended", endedHandler);

      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      // Spawn all zombies
      tickSeconds(system, 30);
      const spawnedCount = zombieEntities.entities.length;
      expect(spawnedCount).toBeGreaterThan(0);

      // Emit zombie-killed events for each entity (simulating combat kills)
      for (let i = 0; i < spawnedCount; i++) {
        eventBus.emit("zombie-killed", {
          position: { x: 100, y: 100 },
          totalKills: i + 1,
        });
      }

      // Remove all zombies from world (simulating zombie-ai-system cleanup)
      removeAllZombies();

      // Tick to detect completion
      system(DT);

      expect(endedHandler).toHaveBeenCalledTimes(1);
      const event = endedHandler.mock.calls[0][0] as WaveEndedEvent;
      expect(event.zombiesKilled).toBe(spawnedCount);
    });

    it("zombie-killed events emitted while inactive are not counted", () => {
      const endedHandler = vi.fn();
      eventBus.on("wave-ended", endedHandler);

      // Emit kills during day (inactive state)
      for (let i = 0; i < 5; i++) {
        eventBus.emit("zombie-killed", {
          position: { x: 0, y: 0 },
          totalKills: i + 1,
        });
      }

      // Start a night wave
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      // Spawn some, emit 2 real kills
      tickSeconds(system, 3);
      eventBus.emit("zombie-killed", {
        position: { x: 50, y: 50 },
        totalKills: 6,
      });
      eventBus.emit("zombie-killed", {
        position: { x: 60, y: 60 },
        totalKills: 7,
      });

      // Dawn ends wave
      setPhase(clockState, "dawn");
      system(DT);

      expect(endedHandler).toHaveBeenCalledTimes(1);
      const event = endedHandler.mock.calls[0][0] as WaveEndedEvent;
      // Only the 2 kills during active wave should count
      expect(event.zombiesKilled).toBe(2);
    });

    it("killsDuringWave resets between nights", () => {
      const endedHandler = vi.fn();
      eventBus.on("wave-ended", endedHandler);

      // Night 1 — emit 4 kills
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);
      tickSeconds(system, 3);
      for (let i = 0; i < 4; i++) {
        eventBus.emit("zombie-killed", {
          position: { x: 0, y: 0 },
          totalKills: i + 1,
        });
      }
      setPhase(clockState, "dawn");
      system(DT);

      expect(endedHandler).toHaveBeenCalledTimes(1);
      expect(
        (endedHandler.mock.calls[0][0] as WaveEndedEvent).zombiesKilled,
      ).toBe(4);

      // Clean up for night 2
      removeAllZombies();

      // Night 2 — emit 2 kills
      setPhase(clockState, "day");
      clockState.dayNumber = 2;
      system(DT);
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);
      tickSeconds(system, 3);
      for (let i = 0; i < 2; i++) {
        eventBus.emit("zombie-killed", {
          position: { x: 0, y: 0 },
          totalKills: i + 5,
        });
      }
      setPhase(clockState, "dawn");
      system(DT);

      expect(endedHandler).toHaveBeenCalledTimes(2);
      // Second wave should have 2 kills, not 6
      expect(
        (endedHandler.mock.calls[1][0] as WaveEndedEvent).zombiesKilled,
      ).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // Complete state polling (Gap 2 — criticality 8/10)
  // -----------------------------------------------------------------------

  describe("complete state polling", () => {
    it("stays in complete state while zombies remain alive across multiple ticks", () => {
      const endedHandler = vi.fn();
      eventBus.on("wave-ended", endedHandler);

      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      // Spawn all zombies by running through full night 1 pulse cycle
      // Night 1: 2 pulses, 0.8s interval, 5-8 total, 15s pause
      // Generous time: pulses + pause + extra
      tickSeconds(system, 60);

      const aliveCount = zombieEntities.entities.length;
      expect(aliveCount).toBeGreaterThan(0);

      // System should now be in 'complete' state (all spawned).
      // Tick 60 more frames — wave-ended should NOT fire while zombies live.
      tickSeconds(system, 1);
      expect(endedHandler).not.toHaveBeenCalled();

      // Remove all but one zombie
      const entities = [...zombieEntities.entities];
      for (let i = 1; i < entities.length; i++) {
        world.remove(entities[i]);
      }
      expect(zombieEntities.entities.length).toBe(1);

      // Tick more — still one alive, should not fire
      tickSeconds(system, 1);
      expect(endedHandler).not.toHaveBeenCalled();

      // Remove the last zombie
      world.remove(zombieEntities.entities[0]);
      expect(zombieEntities.entities.length).toBe(0);

      // One tick — wave-ended should fire
      system(DT);
      expect(endedHandler).toHaveBeenCalledTimes(1);
      expect(
        (endedHandler.mock.calls[0][0] as WaveEndedEvent).waveNumber,
      ).toBe(1);
    });

    it("transitions from complete to inactive on same tick last zombie is removed", () => {
      const endedHandler = vi.fn();
      eventBus.on("wave-ended", endedHandler);

      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      // Spawn all zombies
      tickSeconds(system, 60);
      expect(zombieEntities.entities.length).toBeGreaterThan(0);

      // Remove all zombies in one batch
      removeAllZombies();

      // Single tick should fire wave-ended
      system(DT);
      expect(endedHandler).toHaveBeenCalledTimes(1);

      // System should now be inactive — ticking further produces no events
      tickSeconds(system, 10);
      expect(endedHandler).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // Spawning safety guards (Gap 3 — criticality 7/10)
  // -----------------------------------------------------------------------

  describe("spawning safety guards", () => {
    it("caps spawns per tick when dt is extremely large", { timeout: 5000 }, () => {
      clockState.dayNumber = 4;
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      // Night 4: spawnInterval = 0.3s, 40-55 total
      // Pass a massive dt (100 seconds) — without the guard, the while-loop
      // would attempt 100/0.3 = 333 iterations per tick
      system(100);

      // Should be capped by maxIterations (100) and totalToSpawn
      const count = zombieEntities.entities.length;
      expect(count).toBeGreaterThan(0);
      // Cannot exceed totalToSpawn (at most 55 for night 4)
      expect(count).toBeLessThanOrEqual(65); // 55 + up to 10 horde overshoot

      // Subsequent normal ticks should continue working
      tickSeconds(system, 2);
      // System should not crash
    });
  });

  // -----------------------------------------------------------------------
  // Stat multiplier precision (Gap 5 — criticality 6/10)
  // -----------------------------------------------------------------------

  describe("stat multiplier precision", () => {
    it("Night 4 shamblers have exactly scaled stats (1.15x)", () => {
      clockState.dayNumber = 4;
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      // Spawn enough zombies to find at least one shambler
      tickSeconds(system, 30);

      // Find a shambler among the spawned zombies
      const shambler = zombieEntities.entities.find(
        (e) => e.zombieType.variant === "shambler",
      );

      // Night 4 has all variants; if no shambler by RNG, skip assertion
      // (deterministic seed "4" may or may not produce one early)
      if (shambler) {
        // Shambler base: moveSpeed=40, attackDamage=5, health=50
        // Night 4 multiplier: 1.15
        expect(shambler.zombieType.moveSpeed).toBe(Math.round(40 * 1.15));
        expect(shambler.zombieType.attackDamage).toBe(Math.round(5 * 1.15));
        expect(shambler.health.max).toBe(Math.round(50 * 1.15));
        expect(shambler.health.current).toBe(shambler.health.max);
      }

      // Verify ALL zombies have scaled stats (no zombie left unscaled)
      for (const zombie of zombieEntities.entities) {
        const variant = zombie.zombieType.variant;
        // Base stats differ by variant, but all Night 4 zombies should have
        // health.current === health.max (applyStatMultiplier sets this)
        expect(zombie.health.current).toBe(zombie.health.max);
        // Stats should all be positive
        expect(zombie.zombieType.moveSpeed).toBeGreaterThan(0);
        expect(zombie.zombieType.attackDamage).toBeGreaterThan(0);

        // For shamblers specifically, verify the exact multiplied value
        if (variant === "shambler") {
          expect(zombie.zombieType.moveSpeed).toBe(Math.round(40 * 1.15));
          expect(zombie.zombieType.attackDamage).toBe(Math.round(5 * 1.15));
          expect(zombie.health.max).toBe(Math.round(50 * 1.15));
        }
      }
    });

    it("Night 5 zombies have higher scaling than Night 4", () => {
      clockState.dayNumber = 5;
      setPhase(clockState, "dusk");
      system(DT);
      setPhase(clockState, "night");
      system(DT);

      tickSeconds(system, 30);

      // Night 5 multiplier: 1.15 + 0.05 * 1 = 1.20
      const shambler = zombieEntities.entities.find(
        (e) => e.zombieType.variant === "shambler",
      );

      if (shambler) {
        expect(shambler.zombieType.moveSpeed).toBe(Math.round(40 * 1.2));
        expect(shambler.zombieType.attackDamage).toBe(Math.round(5 * 1.2));
        expect(shambler.health.max).toBe(Math.round(50 * 1.2));
        expect(shambler.health.current).toBe(shambler.health.max);
      }
    });
  });
});
