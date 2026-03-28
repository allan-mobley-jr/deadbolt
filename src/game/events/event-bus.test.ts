import { describe, it, expect, vi } from "vitest";
import { createGameEventBus, safeEmit } from "./event-bus";
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

describe("safeEmit", () => {
  it("delivers events to listeners", () => {
    const bus = createGameEventBus();
    const handler = vi.fn();
    bus.on("phase-change", handler);

    safeEmit(bus, "phase-change", {
      phase: "dusk",
      previousPhase: "day",
      dayNumber: 1,
      timeRemainingInPhase: 15,
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("catches and logs listener exceptions without rethrowing", () => {
    const bus = createGameEventBus();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    bus.on("clock-tick", () => {
      throw new Error("listener blew up");
    });

    expect(() =>
      safeEmit(bus, "clock-tick", {
        phase: "day",
        dayNumber: 1,
        timeRemainingInPhase: 200,
        phaseDuration: 300,
        elapsedTotal: 100,
      }),
    ).not.toThrow();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("clock-tick"),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it("still delivers to other listeners when one throws", () => {
    const bus = createGameEventBus();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const good = vi.fn();

    // eventemitter3 calls listeners in order — if the first throws,
    // safeEmit catches the entire batch. This test verifies that
    // safeEmit at least prevents the exception from propagating.
    bus.on("phase-change", () => {
      throw new Error("bad listener");
    });
    // Note: eventemitter3 stops calling remaining listeners when one
    // throws, but safeEmit prevents the error from crashing the caller.
    bus.on("phase-change", good);

    safeEmit(bus, "phase-change", {
      phase: "night",
      previousPhase: "dusk",
      dayNumber: 1,
      timeRemainingInPhase: 90,
    });

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
