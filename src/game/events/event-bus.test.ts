import { describe, it, expect, vi } from "vitest";
import { createGameEventBus, safeEmit } from "./event-bus";
import type {
  PhaseChangeEvent,
  ClockTickEvent,
  PlayerHealthChangedEvent,
  WaveStartedEvent,
  PauseCommandEvent,
} from "./event-bus";

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

  it("emits player-health-changed events with correct payload", () => {
    const bus = createGameEventBus();
    const handler = vi.fn();
    bus.on("player-health-changed", handler);

    const event: PlayerHealthChangedEvent = {
      current: 75,
      max: 100,
      delta: -25,
    };
    bus.emit("player-health-changed", event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("emits wave-started events with correct payload", () => {
    const bus = createGameEventBus();
    const handler = vi.fn();
    bus.on("wave-started", handler);

    const event: WaveStartedEvent = {
      waveNumber: 3,
      zombieCount: 20,
      dayNumber: 2,
    };
    bus.emit("wave-started", event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("emits UI command events with correct payload", () => {
    const bus = createGameEventBus();
    const handler = vi.fn();
    bus.on("cmd:pause", handler);

    const event: PauseCommandEvent = { source: "ui" };
    bus.emit("cmd:pause", event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
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

    // safeEmit calls each listener in its own try/catch, so a throw
    // in listener 1 should not prevent listener 2 from running.
    bus.on("phase-change", () => {
      throw new Error("bad listener");
    });
    bus.on("phase-change", good);

    safeEmit(bus, "phase-change", {
      phase: "night",
      previousPhase: "dusk",
      dayNumber: 1,
      timeRemainingInPhase: 90,
    });

    expect(errorSpy).toHaveBeenCalled();
    expect(good).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "night" }),
    );
    errorSpy.mockRestore();
  });

  it("delivers to all listeners when multiple throw", () => {
    const bus = createGameEventBus();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const survivor = vi.fn();

    bus.on("phase-change", () => {
      throw new Error("first bad");
    });
    bus.on("phase-change", () => {
      throw new Error("second bad");
    });
    bus.on("phase-change", survivor);

    safeEmit(bus, "phase-change", {
      phase: "night",
      previousPhase: "dusk",
      dayNumber: 1,
      timeRemainingInPhase: 90,
    });

    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(survivor).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("does not auto-remove once() listeners (known limitation)", () => {
    // safeEmit iterates bus.listeners() directly, bypassing eventemitter3's
    // once-auto-removal. This test documents the known trade-off: once()
    // listeners fire on every safeEmit call. All production callers use
    // bus.on(), which is unaffected.
    const bus = createGameEventBus();
    const handler = vi.fn();
    bus.once("phase-change", handler);

    const payload = {
      phase: "dusk" as const,
      previousPhase: "day" as const,
      dayNumber: 1,
      timeRemainingInPhase: 15,
    };

    safeEmit(bus, "phase-change", payload);
    safeEmit(bus, "phase-change", payload);

    // With bus.emit() this would be 1. With safeEmit it's 2.
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
