import { describe, it, expect, vi, afterEach } from "vitest";
import { createLightingSystem, getOverlayParams } from "./lighting-system";
import { createInputState, createClockState } from "./scene-context";
import type { SceneContext, ClockState } from "./scene-context";
import { BodyRegistry } from "./body-registry";
import { createGameEventBus } from "@/game/events/event-bus";
import { resetWorld } from "@/game/ecs/world";
import { createPlayerEntity } from "@/game/ecs/archetypes";
import { LIGHTING } from "./day-night-constants";

const DT = 1 / 60;

// ---------------------------------------------------------------------------
// Mock factories
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

function createMockContext(clockOverrides?: Partial<ClockState>): {
  ctx: SceneContext;
  clockState: ClockState;
  renderTexture: ReturnType<typeof createMockRenderTexture>;
} {
  const clockState = { ...createClockState(), ...clockOverrides };
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
      eventBus: createGameEventBus(),
    },
    clockState,
    renderTexture,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getOverlayParams", () => {
  it("day phase returns zero alpha", () => {
    const { alpha } = getOverlayParams("day", 0);
    expect(alpha).toBe(0);
  });

  it("night phase returns full night alpha", () => {
    const { alpha } = getOverlayParams("night", 0.5);
    expect(alpha).toBe(LIGHTING.NIGHT_OVERLAY_ALPHA);
  });

  it("dusk at progress=0 returns day alpha", () => {
    const { alpha } = getOverlayParams("dusk", 0);
    expect(alpha).toBe(LIGHTING.DAY_OVERLAY_ALPHA);
  });

  it("dusk at progress=1 returns night alpha", () => {
    const { alpha } = getOverlayParams("dusk", 1);
    expect(alpha).toBeCloseTo(LIGHTING.NIGHT_OVERLAY_ALPHA, 5);
  });

  it("dusk at progress=0.5 returns midpoint alpha", () => {
    const { alpha } = getOverlayParams("dusk", 0.5);
    const expected =
      (LIGHTING.DAY_OVERLAY_ALPHA + LIGHTING.NIGHT_OVERLAY_ALPHA) / 2;
    expect(alpha).toBeCloseTo(expected, 5);
  });

  it("dawn at progress=0 returns night alpha", () => {
    const { alpha } = getOverlayParams("dawn", 0);
    expect(alpha).toBe(LIGHTING.NIGHT_OVERLAY_ALPHA);
  });

  it("dawn at progress=1 returns day alpha", () => {
    const { alpha } = getOverlayParams("dawn", 1);
    expect(alpha).toBeCloseTo(LIGHTING.DAY_OVERLAY_ALPHA, 5);
  });

  // Tint value assertions
  it("day phase returns black tint", () => {
    const { tint } = getOverlayParams("day", 0);
    expect(tint).toBe(0x000000);
  });

  it("night phase returns NIGHT_TINT", () => {
    const { tint } = getOverlayParams("night", 0.5);
    expect(tint).toBe(LIGHTING.NIGHT_TINT);
  });

  it("dusk at progress=0 returns DUSK_TINT", () => {
    const { tint } = getOverlayParams("dusk", 0);
    expect(tint).toBe(LIGHTING.DUSK_TINT);
  });

  it("dusk at progress=1 returns NIGHT_TINT", () => {
    const { tint } = getOverlayParams("dusk", 1);
    expect(tint).toBe(LIGHTING.NIGHT_TINT);
  });

  it("dawn at progress=0 returns NIGHT_TINT", () => {
    const { tint } = getOverlayParams("dawn", 0);
    expect(tint).toBe(LIGHTING.NIGHT_TINT);
  });

  it("dawn at progress=1 returns DAWN_TINT", () => {
    const { tint } = getOverlayParams("dawn", 1);
    expect(tint).toBe(LIGHTING.DAWN_TINT);
  });
});

describe("LightingSystem", () => {
  afterEach(() => {
    resetWorld();
  });

  it("does not create overlay during day phase", () => {
    const { ctx } = createMockContext({
      phase: "day",
      timeRemainingInPhase: 200,
      phaseDuration: 300,
    });
    const system = createLightingSystem(ctx);
    system(DT);

    // RenderTexture should not be created since alpha = 0
    expect(
      (ctx.scene.add as unknown as { renderTexture: ReturnType<typeof vi.fn> })
        .renderTexture,
    ).not.toHaveBeenCalled();
  });

  it("creates overlay during night phase", () => {
    const { ctx, renderTexture } = createMockContext({
      phase: "night",
      timeRemainingInPhase: 45,
      phaseDuration: 90,
    });
    const system = createLightingSystem(ctx);
    system(DT);

    expect(
      (ctx.scene.add as unknown as { renderTexture: ReturnType<typeof vi.fn> })
        .renderTexture,
    ).toHaveBeenCalledTimes(1);
    expect(renderTexture.setScrollFactor).toHaveBeenCalledWith(0);
    expect(renderTexture.setDepth).toHaveBeenCalledWith(LIGHTING.OVERLAY_DEPTH);
  });

  it("sets overlay visible and fills during night", () => {
    const { ctx, renderTexture } = createMockContext({
      phase: "night",
      timeRemainingInPhase: 45,
      phaseDuration: 90,
    });
    const system = createLightingSystem(ctx);
    system(DT);

    expect(renderTexture.setVisible).toHaveBeenCalledWith(true);
    expect(renderTexture.fill).toHaveBeenCalledWith(LIGHTING.NIGHT_TINT, 1);
    expect(renderTexture.setAlpha).toHaveBeenCalledWith(
      LIGHTING.NIGHT_OVERLAY_ALPHA,
    );
  });

  it("hides overlay when transitioning back to day", () => {
    const { ctx, renderTexture } = createMockContext({
      phase: "night",
      timeRemainingInPhase: 45,
      phaseDuration: 90,
    });
    const system = createLightingSystem(ctx);
    system(DT); // Create overlay during night

    // Switch to day
    ctx.clockState.phase = "day";
    ctx.clockState.timeRemainingInPhase = 200;
    ctx.clockState.phaseDuration = 300;
    system(DT);

    expect(renderTexture.setVisible).toHaveBeenCalledWith(false);
  });

  it("erases visibility circle at player position during night", () => {
    const { ctx, renderTexture } = createMockContext({
      phase: "night",
      timeRemainingInPhase: 45,
      phaseDuration: 90,
    });
    createPlayerEntity(100, 200, 1);

    const system = createLightingSystem(ctx);
    system(DT);

    expect(renderTexture.erase).toHaveBeenCalled();
  });

  it("does not erase when no player exists", () => {
    const { ctx, renderTexture } = createMockContext({
      phase: "night",
      timeRemainingInPhase: 45,
      phaseDuration: 90,
    });
    // No player entity created

    const system = createLightingSystem(ctx);
    system(DT);

    expect(renderTexture.erase).not.toHaveBeenCalled();
  });

  it("creates overlay during dusk with interpolated alpha", () => {
    const { ctx, renderTexture } = createMockContext({
      phase: "dusk",
      timeRemainingInPhase: 7.5, // halfway through 15s dusk
      phaseDuration: 15,
    });
    const system = createLightingSystem(ctx);
    system(DT);

    const setAlphaCall = renderTexture.setAlpha.mock.calls[0][0] as number;
    expect(setAlphaCall).toBeGreaterThan(0);
    expect(setAlphaCall).toBeLessThan(LIGHTING.NIGHT_OVERLAY_ALPHA);

    // Verify fill() receives a packed tint integer with alpha=1
    const fillCall = renderTexture.fill.mock.calls[0];
    expect(fillCall[0]).toBeTypeOf("number");
    expect(fillCall[1]).toBe(1);
  });

  it("creates overlay during dawn with interpolated alpha", () => {
    const { ctx, renderTexture } = createMockContext({
      phase: "dawn",
      timeRemainingInPhase: 7.5, // halfway through 15s dawn
      phaseDuration: 15,
    });
    const system = createLightingSystem(ctx);
    system(DT);

    const setAlphaCall = renderTexture.setAlpha.mock.calls[0][0] as number;
    expect(setAlphaCall).toBeGreaterThan(0);
    expect(setAlphaCall).toBeLessThan(LIGHTING.NIGHT_OVERLAY_ALPHA);
  });

  it("does not throw when camera is missing", () => {
    const { ctx } = createMockContext({
      phase: "night",
      timeRemainingInPhase: 45,
      phaseDuration: 90,
    });
    (ctx.scene as unknown as { cameras: { main: null } }).cameras.main = null;

    const system = createLightingSystem(ctx);
    expect(() => system(DT)).not.toThrow();
  });

  it("recreates overlay when viewport resizes", () => {
    const { ctx, renderTexture } = createMockContext({
      phase: "night",
      timeRemainingInPhase: 45,
      phaseDuration: 90,
    });
    const addRT = (ctx.scene.add as unknown as { renderTexture: ReturnType<typeof vi.fn> }).renderTexture;
    const system = createLightingSystem(ctx);
    system(DT); // first frame, creates overlay

    expect(addRT).toHaveBeenCalledTimes(1);

    // Simulate viewport resize
    const cam = ctx.scene.cameras.main as unknown as { width: number; height: number };
    cam.width = 1920;
    cam.height = 1080;

    system(DT); // second frame, should recreate

    expect(addRT).toHaveBeenCalledTimes(2);
    expect(renderTexture.destroy).toHaveBeenCalled();
  });

  it("erases visibility circle during dusk", () => {
    const { ctx, renderTexture } = createMockContext({
      phase: "dusk",
      timeRemainingInPhase: 7.5,
      phaseDuration: 15,
    });
    createPlayerEntity(100, 200, 1);

    const system = createLightingSystem(ctx);
    system(DT);

    expect(renderTexture.erase).toHaveBeenCalled();
  });

  it("erases visibility circle during dawn", () => {
    const { ctx, renderTexture } = createMockContext({
      phase: "dawn",
      timeRemainingInPhase: 7.5,
      phaseDuration: 15,
    });
    createPlayerEntity(100, 200, 1);

    const system = createLightingSystem(ctx);
    system(DT);

    expect(renderTexture.erase).toHaveBeenCalled();
  });

  it("handles zero phaseDuration without throwing", () => {
    const { ctx } = createMockContext({
      phase: "dusk",
      timeRemainingInPhase: 0,
      phaseDuration: 0,
    });

    const system = createLightingSystem(ctx);
    expect(() => system(DT)).not.toThrow();
  });
});
