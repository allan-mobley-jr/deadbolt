import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createGameEventBus, safeEmit } from "@/game/events/event-bus";
import { useGameEvent } from "./useGameEvent";

describe("useGameEvent", () => {
  it("subscribes to a bus event", () => {
    const bus = createGameEventBus();
    const handler = vi.fn();

    renderHook(() => useGameEvent(bus, "player-health-changed", handler));

    safeEmit(bus, "player-health-changed", {
      current: 80,
      max: 100,
      delta: -20,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ current: 80 }),
    );
  });

  it("unsubscribes on unmount", () => {
    const bus = createGameEventBus();
    const handler = vi.fn();

    const { unmount } = renderHook(() =>
      useGameEvent(bus, "zombie-killed", handler),
    );

    unmount();

    safeEmit(bus, "zombie-killed", {
      position: { x: 100, y: 200 },
      totalKills: 1,
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("does nothing when bus is null", () => {
    const handler = vi.fn();

    // Should not throw even without a bus
    const { unmount } = renderHook(() =>
      useGameEvent(null, "player-died", handler),
    );

    expect(handler).not.toHaveBeenCalled();
    unmount();
  });

  it("re-subscribes when event name changes", () => {
    const bus = createGameEventBus();
    const handler = vi.fn();

    type TestEvent = "wave-started" | "wave-ended";

    const { rerender } = renderHook(
      ({ event }: { event: TestEvent }) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        useGameEvent(bus, event, handler as any),
      { initialProps: { event: "wave-started" as TestEvent } },
    );

    safeEmit(bus, "wave-started", {
      waveNumber: 1,
      zombieCount: 10,
      dayNumber: 1,
    });
    expect(handler).toHaveBeenCalledTimes(1);

    // Switch to a different event
    rerender({ event: "wave-ended" });

    // Old event should not fire the handler
    handler.mockClear();
    safeEmit(bus, "wave-started", {
      waveNumber: 2,
      zombieCount: 15,
      dayNumber: 1,
    });
    expect(handler).not.toHaveBeenCalled();

    // New event should fire
    safeEmit(bus, "wave-ended", {
      waveNumber: 1,
      zombiesKilled: 10,
      dayNumber: 1,
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
