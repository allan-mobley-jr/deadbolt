import { describe, it, expect, vi } from "vitest";
import { createGameEventBus } from "./event-bus";
import type { PhaseChangeEvent, ClockTickEvent } from "./event-bus";

describe("GameEventBus", () => {
  it("creates a new event bus instance", () => {
    const bus = createGameEventBus();
    expect(bus).toBeDefined();
    expect(bus.emit).toBeTypeOf("function");
    expect(bus.on).toBeTypeOf("function");
  });

  it("emits phase-change events with correct payload", () => {
    const bus = createGameEventBus();
    const handler = vi.fn();
    bus.on("phase-change", handler);

    const event: PhaseChangeEvent = {
      phase: "dusk",
      previousPhase: "day",
      dayNumber: 1,
      timeRemainingInPhase: 15,
    };
    bus.emit("phase-change", event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("emits clock-tick events with correct payload", () => {
    const bus = createGameEventBus();
    const handler = vi.fn();
    bus.on("clock-tick", handler);

    const event: ClockTickEvent = {
      phase: "day",
      dayNumber: 1,
      timeRemainingInPhase: 200,
      phaseDuration: 300,
      elapsedTotal: 100,
    };
    bus.emit("clock-tick", event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("supports multiple listeners on the same event", () => {
    const bus = createGameEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("phase-change", a);
    bus.on("phase-change", b);

    bus.emit("phase-change", {
      phase: "night",
      previousPhase: "dusk",
      dayNumber: 1,
      timeRemainingInPhase: 90,
    });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("does not carry listeners between separate bus instances", () => {
    const bus1 = createGameEventBus();
    const bus2 = createGameEventBus();
    const handler = vi.fn();
    bus1.on("phase-change", handler);

    bus2.emit("phase-change", {
      phase: "dawn",
      previousPhase: "night",
      dayNumber: 2,
      timeRemainingInPhase: 15,
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("removes listeners with removeAllListeners", () => {
    const bus = createGameEventBus();
    const handler = vi.fn();
    bus.on("phase-change", handler);
    bus.removeAllListeners();

    bus.emit("phase-change", {
      phase: "dusk",
      previousPhase: "day",
      dayNumber: 1,
      timeRemainingInPhase: 15,
    });

    expect(handler).not.toHaveBeenCalled();
  });
});
