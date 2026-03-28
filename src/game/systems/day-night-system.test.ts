import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDayNightSystem } from "./day-night-system";
import { createInputState, createClockState } from "./scene-context";
import type { SceneContext, ClockState } from "./scene-context";
import { BodyRegistry } from "./body-registry";
import { createGameEventBus } from "@/game/events/event-bus";
import type { GameEventBus, PhaseChangeEvent, ClockTickEvent } from "@/game/events/event-bus";
import { DAY_NIGHT } from "./day-night-constants";

const DT = 1 / 60;

function createMockContext(): {
  ctx: SceneContext;
  clockState: ClockState;
  eventBus: GameEventBus;
} {
  const clockState = createClockState();
  const eventBus = createGameEventBus();
  return {
    ctx: {
      scene: {} as Phaser.Scene,
      bodyRegistry: new BodyRegistry(),
      inputState: createInputState(),
      getAlpha: () => 0,
      clockState,
      eventBus,
    },
    clockState,
    eventBus,
  };
}

/** Advance the system by the given number of seconds. */
function tickSeconds(
  system: (dt: number) => void,
  seconds: number,
): void {
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i++) {
    system(DT);
  }
}

describe("DayNightSystem", () => {
  let ctx: SceneContext;
  let clockState: ClockState;
  let eventBus: GameEventBus;
  let system: (dt: number) => void;

  beforeEach(() => {
    const mock = createMockContext();
    ctx = mock.ctx;
    clockState = mock.clockState;
    eventBus = mock.eventBus;
    system = createDayNightSystem(ctx);
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  describe("initial state", () => {
    it("starts in day phase", () => {
      expect(clockState.phase).toBe("day");
    });

    it("starts on day 1", () => {
      expect(clockState.dayNumber).toBe(1);
    });

    it("time remaining equals day 1 day duration", () => {
      expect(clockState.timeRemainingInPhase).toBe(300);
    });

    it("elapsed total is 0", () => {
      expect(clockState.elapsedTotal).toBe(0);
    });

    it("is not paused", () => {
      expect(clockState.paused).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Time tracking
  // -----------------------------------------------------------------------

  describe("time tracking", () => {
    it("accumulates elapsed time", () => {
      system(DT);
      expect(clockState.elapsedTotal).toBeCloseTo(DT, 10);
    });

    it("counts down timeRemainingInPhase", () => {
      system(DT);
      expect(clockState.timeRemainingInPhase).toBeCloseTo(300 - DT, 4);
    });

    it("accumulates elapsed across many ticks", () => {
      tickSeconds(system, 10);
      expect(clockState.elapsedTotal).toBeCloseTo(10, 1);
    });

    it("timeRemaining decreases over time", () => {
      tickSeconds(system, 10);
      expect(clockState.timeRemainingInPhase).toBeCloseTo(290, 1);
    });

    it("timeRemaining does not go below 0", () => {
      tickSeconds(system, 299.99);
      expect(clockState.timeRemainingInPhase).toBeGreaterThanOrEqual(0);
    });
  });

  // -----------------------------------------------------------------------
  // Phase transitions — Day 1 full cycle
  // -----------------------------------------------------------------------

  describe("phase transitions (Day 1)", () => {
    it("transitions from day to dusk after 300s", () => {
      tickSeconds(system, 300);
      expect(clockState.phase).toBe("dusk");
    });

    it("transitions from dusk to night after 15s of dusk", () => {
      tickSeconds(system, 300 + 15);
      expect(clockState.phase).toBe("night");
    });

    it("transitions from night to dawn after 90s of night", () => {
      tickSeconds(system, 300 + 15 + 90);
      expect(clockState.phase).toBe("dawn");
    });

    it("transitions from dawn to day after 15s of dawn", () => {
      tickSeconds(system, 300 + 15 + 90 + 15);
      expect(clockState.phase).toBe("day");
    });

    it("increments dayNumber when transitioning dawn -> day", () => {
      tickSeconds(system, 300 + 15 + 90 + 15);
      expect(clockState.dayNumber).toBe(2);
    });

    it("does not increment dayNumber during other transitions", () => {
      tickSeconds(system, 300); // day -> dusk
      expect(clockState.dayNumber).toBe(1);
      tickSeconds(system, 15); // dusk -> night
      expect(clockState.dayNumber).toBe(1);
      tickSeconds(system, 90); // night -> dawn
      expect(clockState.dayNumber).toBe(1);
    });

    it("updates phaseDuration on transition", () => {
      tickSeconds(system, 300); // day -> dusk
      expect(clockState.phaseDuration).toBe(DAY_NIGHT.DUSK_DURATION);
    });

    it("resets timeRemaining on transition", () => {
      tickSeconds(system, 300); // day -> dusk
      expect(clockState.timeRemainingInPhase).toBeCloseTo(
        DAY_NIGHT.DUSK_DURATION,
        0,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Escalation curve
  // -----------------------------------------------------------------------

  describe("escalation curve", () => {
    it("Day 2 uses shorter day duration", () => {
      // Complete Day 1 full cycle: 300 + 15 + 90 + 15 = 420s
      tickSeconds(system, 420);
      expect(clockState.phase).toBe("day");
      expect(clockState.dayNumber).toBe(2);
      expect(clockState.phaseDuration).toBe(240);
    });

    it("Day 2 uses longer night duration", () => {
      // Day 1 cycle + Day 2 day + dusk
      tickSeconds(system, 420 + 240 + 15);
      expect(clockState.phase).toBe("night");
      expect(clockState.phaseDuration).toBe(120);
    });

    it("Day 4+ clamps to final escalation entry", () => {
      // Complete 3 full cycles to reach Day 4
      // Day 1: 300 + 15 + 90 + 15 = 420
      // Day 2: 240 + 15 + 120 + 15 = 390
      // Day 3: 180 + 15 + 150 + 15 = 360
      tickSeconds(system, 420 + 390 + 360);
      expect(clockState.dayNumber).toBe(4);
      expect(clockState.phase).toBe("day");
      expect(clockState.phaseDuration).toBe(120); // Day 4+ day = 2 min
    });

    it("Day 10 still uses Day 4+ values", () => {
      // Complete 9 full cycles
      // Day 1: 420, Day 2: 390, Day 3: 360
      // Day 4+: 120 + 15 + 180 + 15 = 330
      const total = 420 + 390 + 360 + 330 * 6;
      tickSeconds(system, total);
      expect(clockState.dayNumber).toBe(10);
      expect(clockState.phaseDuration).toBe(120);
    });
  });

  // -----------------------------------------------------------------------
  // Pause
  // -----------------------------------------------------------------------

  describe("pause", () => {
    it("does not advance when paused", () => {
      clockState.paused = true;
      tickSeconds(system, 10);
      expect(clockState.elapsedTotal).toBe(0);
      expect(clockState.timeRemainingInPhase).toBe(300);
    });

    it("resumes from where it left off when unpaused", () => {
      tickSeconds(system, 100);
      const elapsed = clockState.elapsedTotal;
      clockState.paused = true;
      tickSeconds(system, 50);
      expect(clockState.elapsedTotal).toBeCloseTo(elapsed, 1);

      clockState.paused = false;
      tickSeconds(system, 10);
      expect(clockState.elapsedTotal).toBeCloseTo(elapsed + 10, 1);
    });

    it("does not emit events when paused", () => {
      const handler = vi.fn();
      eventBus.on("clock-tick", handler);
      clockState.paused = true;
      tickSeconds(system, 10);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  describe("events", () => {
    it("emits phase-change on day -> dusk", () => {
      const handler = vi.fn();
      eventBus.on("phase-change", handler);
      tickSeconds(system, 300);
      expect(handler).toHaveBeenCalledTimes(1);

      const event = handler.mock.calls[0][0] as PhaseChangeEvent;
      expect(event.phase).toBe("dusk");
      expect(event.previousPhase).toBe("day");
      expect(event.dayNumber).toBe(1);
    });

    it("emits phase-change for each transition in a full cycle", () => {
      const handler = vi.fn();
      eventBus.on("phase-change", handler);
      // Complete one full cycle: 300 + 15 + 90 + 15 = 420s
      tickSeconds(system, 420);
      expect(handler).toHaveBeenCalledTimes(4);

      const phases = handler.mock.calls.map(
        (call: unknown[]) => (call[0] as PhaseChangeEvent).phase,
      );
      expect(phases).toEqual(["dusk", "night", "dawn", "day"]);
    });

    it("emits clock-tick events periodically", () => {
      const handler = vi.fn();
      eventBus.on("clock-tick", handler);

      // Run 60 ticks (1 second at 60 Hz)
      tickSeconds(system, 1);

      // Should emit at interval of TICK_EVENT_INTERVAL (15 ticks)
      // 60 ticks / 15 = 4 emissions
      expect(handler.mock.calls.length).toBe(4);
    });

    it("clock-tick event has correct payload", () => {
      const handler = vi.fn();
      eventBus.on("clock-tick", handler);

      // Run enough ticks to trigger one emission
      for (let i = 0; i < DAY_NIGHT.TICK_EVENT_INTERVAL; i++) {
        system(DT);
      }

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as ClockTickEvent;
      expect(event.phase).toBe("day");
      expect(event.dayNumber).toBe(1);
      expect(event.phaseDuration).toBe(300);
      expect(event.elapsedTotal).toBeGreaterThan(0);
      expect(event.timeRemainingInPhase).toBeLessThan(300);
    });

    it("emits clock-tick immediately after phase-change", () => {
      const events: string[] = [];
      eventBus.on("phase-change", () => events.push("phase-change"));
      eventBus.on("clock-tick", () => events.push("clock-tick"));

      tickSeconds(system, 300);

      // The phase-change should be followed by a clock-tick
      const pcIdx = events.lastIndexOf("phase-change");
      const ctIdx = events.indexOf("clock-tick", pcIdx);
      expect(ctIdx).toBeGreaterThan(pcIdx);
    });
  });

  // -----------------------------------------------------------------------
  // Elapsed total
  // -----------------------------------------------------------------------

  describe("elapsed total", () => {
    it("accumulates across phase transitions", () => {
      tickSeconds(system, 400);
      expect(clockState.elapsedTotal).toBeCloseTo(400, 0);
    });

    it("accumulates across day boundaries", () => {
      // Complete Day 1 cycle (420s) + partial Day 2 (100s)
      tickSeconds(system, 520);
      expect(clockState.elapsedTotal).toBeCloseTo(520, 0);
    });
  });
});
