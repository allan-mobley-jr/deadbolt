import { describe, it, expect, beforeEach } from "vitest";
import { createGameEventBus, safeEmit } from "@/game/events/event-bus";
import type { GameEventBus } from "@/game/events/event-bus";
import { createClockState } from "./scene-context";
import type { ClockState } from "./scene-context";
import { createCommandSystem } from "./command-system";
import type { SystemFn } from "./system-runner";

/**
 * Minimal SceneContext for command system tests.
 * Only clockState and eventBus are needed.
 */
function createTestContext(bus: GameEventBus, clockState: ClockState) {
  return {
    scene: {} as never,
    bodyRegistry: {} as never,
    inputState: { moveX: 0, moveY: 0, aimX: 0, aimY: 0 },
    getAlpha: () => 0,
    clockState,
    eventBus: bus,
  };
}

describe("createCommandSystem", () => {
  let bus: GameEventBus;
  let clockState: ClockState;
  let system: SystemFn;

  beforeEach(() => {
    bus = createGameEventBus();
    clockState = createClockState();
    const ctx = createTestContext(bus, clockState);
    system = createCommandSystem(ctx);
  });

  it("pauses the clock when cmd:pause is received", () => {
    safeEmit(bus, "cmd:pause", { source: "ui" });
    system(1 / 60);

    expect(clockState.paused).toBe(true);
  });

  it("resumes the clock when cmd:resume is received", () => {
    clockState.paused = true;
    safeEmit(bus, "cmd:resume", { source: "ui" });
    system(1 / 60);

    expect(clockState.paused).toBe(false);
  });

  it("applies last command when multiple arrive in one frame", () => {
    safeEmit(bus, "cmd:pause", { source: "ui" });
    safeEmit(bus, "cmd:resume", { source: "ui" });
    safeEmit(bus, "cmd:pause", { source: "ui" });
    system(1 / 60);

    expect(clockState.paused).toBe(true);
  });

  it("clears the command buffer after processing", () => {
    safeEmit(bus, "cmd:pause", { source: "ui" });
    system(1 / 60);
    expect(clockState.paused).toBe(true);

    // No new commands — next tick should not change state
    clockState.paused = false; // manually reset
    system(1 / 60);
    expect(clockState.paused).toBe(false);
  });

  it("does nothing when no commands are pending", () => {
    const initialPaused = clockState.paused;
    system(1 / 60);
    expect(clockState.paused).toBe(initialPaused);
  });
});
