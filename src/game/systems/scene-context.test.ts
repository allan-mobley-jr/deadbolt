import { describe, it, expect } from "vitest";
import { createInputState, createClockState } from "./scene-context";
import { DAY_NIGHT } from "./day-night-constants";

describe("createInputState", () => {
  it("returns zeroed-out axes", () => {
    const input = createInputState();
    expect(input.moveX).toBe(0);
    expect(input.moveY).toBe(0);
    expect(input.aimX).toBe(0);
    expect(input.aimY).toBe(0);
  });
});

describe("createClockState", () => {
  it("initialises to start of day 1 with correct defaults", () => {
    const clock = createClockState();
    expect(clock.phase).toBe(DAY_NIGHT.INITIAL_PHASE);
    expect(clock.dayNumber).toBe(DAY_NIGHT.INITIAL_DAY);
    expect(clock.phaseDuration).toBe(DAY_NIGHT.ESCALATION[0].day);
    expect(clock.timeRemainingInPhase).toBe(DAY_NIGHT.ESCALATION[0].day);
    expect(clock.elapsedTotal).toBe(0);
    expect(clock.paused).toBe(false);
  });

  it("phaseDuration equals timeRemainingInPhase at start", () => {
    const clock = createClockState();
    expect(clock.phaseDuration).toBe(clock.timeRemainingInPhase);
  });
});
