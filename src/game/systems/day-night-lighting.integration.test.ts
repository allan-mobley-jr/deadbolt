/**
 * Integration tests: DayNightSystem + LightingSystem + EventBus
 *
 * Verifies the contract between the day/night clock (fixed-tick) and the
 * lighting overlay (render-phase) when both systems share a single
 * SceneContext. Also validates the event bus bridge pattern that external
 * consumers (HUD, AI, wave spawner) depend on.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createDayNightSystem } from "./day-night-system";
import { createLightingSystem } from "./lighting-system";
import { createInputState, createClockState } from "./scene-context";
import type { SceneContext, ClockState } from "./scene-context";
import { BodyRegistry } from "./body-registry";
import { createGameEventBus } from "@/game/events/event-bus";
import type { GameEventBus, PhaseChangeEvent, ClockTickEvent } from "@/game/events/event-bus";
import { resetWorld } from "@/game/ecs/world";
import { createPlayerEntity } from "@/game/ecs/archetypes";
import { DAY_NIGHT, LIGHTING } from "./day-night-constants";

const DT = 1 / 60;

// ---------------------------------------------------------------------------
// Shared mock factory
// ---------------------------------------------------------------------------

function createMockRenderTexture() {
  const rt: Record<string, ReturnType<typeof vi.fn>> = {};
  rt.setScrollFactor = vi.fn().mockReturnValue(rt);
  rt.setDepth = vi.fn().mockReturnValue(rt);
  rt.setVisible = vi.fn().mockReturnValue(rt);
  rt.setAlpha = vi.fn().mockReturnValue(rt);
  rt.fill = vi.fn().mockReturnValue(rt);
  rt.erase = vi.fn().mockReturnValue(rt);
  rt.destroy = vi.fn();
  return rt;
}

function createMockCanvas() {
  return {
    context: {
      createRadialGradient: vi.fn().mockReturnValue({
        addColorStop: vi.fn(),
      }),
      fillRect: vi.fn(),
    },
    refresh: vi.fn(),
  };
}

function createIntegrationContext(): {
  ctx: SceneContext;
  clockState: ClockState;
  eventBus: GameEventBus;
  renderTexture: ReturnType<typeof createMockRenderTexture>;
} {
  const clockState = createClockState();
  const eventBus = createGameEventBus();
  const renderTexture = createMockRenderTexture();

  const scene = {
    add: {
      renderTexture: vi.fn().mockReturnValue(renderTexture),
    },
    cameras: {
      main: {
        width: 1280,
        height: 720,
        scrollX: 0,
        scrollY: 0,
      },
    },
    textures: {
      exists: vi.fn().mockReturnValue(false),
      createCanvas: vi.fn().mockReturnValue(createMockCanvas()),
    },
  } as unknown as Phaser.Scene;

  return {
    ctx: {
      scene,
      bodyRegistry: new BodyRegistry(),
      inputState: createInputState(),
      getAlpha: () => 0,
      clockState,
      eventBus,
    },
    clockState,
    eventBus,
    renderTexture,
  };
}

/** Advance a system by the given number of seconds at 60Hz. */
function tickSeconds(system: (dt: number) => void, seconds: number): void {
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i++) {
    system(DT);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DayNight + Lighting integration", () => {
  afterEach(() => {
    resetWorld();
  });

  it("lighting overlay appears after DayNightSystem triggers day -> dusk", () => {
    const { ctx, renderTexture } = createIntegrationContext();
    const dayNight = createDayNightSystem(ctx);
    const lighting = createLightingSystem(ctx);

    // Day phase — lighting should produce no overlay
    lighting(DT);
    expect(
      (ctx.scene.add as unknown as { renderTexture: ReturnType<typeof vi.fn> })
        .renderTexture,
    ).not.toHaveBeenCalled();

    // Advance clock past day -> dusk transition (300s)
    tickSeconds(dayNight, 300);
    expect(ctx.clockState.phase).toBe("dusk");

    // Now the lighting system should create and fill the overlay
    lighting(DT);
    expect(
      (ctx.scene.add as unknown as { renderTexture: ReturnType<typeof vi.fn> })
        .renderTexture,
    ).toHaveBeenCalledTimes(1);
    expect(renderTexture.setVisible).toHaveBeenCalledWith(true);
    expect(renderTexture.fill).toHaveBeenCalled();

    // Alpha should be > 0 (dusk interpolation)
    const alpha = renderTexture.setAlpha.mock.calls[0][0] as number;
    expect(alpha).toBeGreaterThan(0);
  });

  it("lighting overlay hides after full cycle returns to day", () => {
    const { ctx, renderTexture } = createIntegrationContext();
    const dayNight = createDayNightSystem(ctx);
    const lighting = createLightingSystem(ctx);

    // Advance through dusk so overlay gets created
    tickSeconds(dayNight, 300);
    lighting(DT); // creates overlay during dusk

    // Complete full Day 1 cycle: 300 + 15 + 90 + 15 = 420s
    tickSeconds(dayNight, 15 + 90 + 15);
    expect(ctx.clockState.phase).toBe("day");
    expect(ctx.clockState.dayNumber).toBe(2);

    // Lighting should hide the overlay
    lighting(DT);
    expect(renderTexture.setVisible).toHaveBeenCalledWith(false);
  });

  it("time carry-over produces correct remaining time after transition", () => {
    const { ctx, clockState } = createIntegrationContext();
    const dayNight = createDayNightSystem(ctx);

    // Advance to just before the transition
    tickSeconds(dayNight, 300);

    // After the day -> dusk transition, timeRemainingInPhase should be
    // strictly less than DUSK_DURATION due to carry-over of excess time
    expect(clockState.phase).toBe("dusk");
    expect(clockState.timeRemainingInPhase).toBeLessThanOrEqual(
      DAY_NIGHT.DUSK_DURATION,
    );
    // The carry-over should be small (at most one tick's worth)
    expect(clockState.timeRemainingInPhase).toBeGreaterThan(
      DAY_NIGHT.DUSK_DURATION - DT * 2,
    );
  });

  it("visibility circle erased at player position during night", () => {
    const { ctx, renderTexture } = createIntegrationContext();
    const dayNight = createDayNightSystem(ctx);
    const lighting = createLightingSystem(ctx);

    createPlayerEntity(400, 300, 1);

    // Advance to night: day(300) + dusk(15) = 315s
    tickSeconds(dayNight, 315);
    expect(ctx.clockState.phase).toBe("night");

    lighting(DT);

    expect(renderTexture.erase).toHaveBeenCalled();
    expect(renderTexture.setAlpha).toHaveBeenCalledWith(
      LIGHTING.NIGHT_OVERLAY_ALPHA,
    );
    expect(renderTexture.fill).toHaveBeenCalledWith(LIGHTING.NIGHT_TINT, 1);
  });
});

describe("Event bus bridge", () => {
  afterEach(() => {
    resetWorld();
  });

  it("external listener receives correct phase-change payload", () => {
    const { ctx, eventBus } = createIntegrationContext();
    const dayNight = createDayNightSystem(ctx);

    const handler = vi.fn();
    eventBus.on("phase-change", handler);

    tickSeconds(dayNight, 300);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as PhaseChangeEvent;
    expect(event.phase).toBe("dusk");
    expect(event.previousPhase).toBe("day");
    expect(event.dayNumber).toBe(1);
    expect(event.timeRemainingInPhase).toBeGreaterThan(0);
    expect(event.timeRemainingInPhase).toBeLessThanOrEqual(
      DAY_NIGHT.DUSK_DURATION,
    );
  });

  it("clock-tick events arrive at ~4Hz with monotonically decreasing time", () => {
    const { ctx, eventBus } = createIntegrationContext();
    const dayNight = createDayNightSystem(ctx);

    const ticks: ClockTickEvent[] = [];
    eventBus.on("clock-tick", (e) => ticks.push(e));

    // Run exactly 1 second (60 ticks)
    tickSeconds(dayNight, 1);

    // Should emit 4 times (60 / 15 = 4)
    expect(ticks).toHaveLength(4);

    // All events should have consistent metadata
    for (const tick of ticks) {
      expect(tick.phase).toBe("day");
      expect(tick.dayNumber).toBe(1);
      expect(tick.phaseDuration).toBe(300);
    }

    // timeRemainingInPhase should decrease monotonically
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i].timeRemainingInPhase).toBeLessThan(
        ticks[i - 1].timeRemainingInPhase,
      );
    }
  });
});
