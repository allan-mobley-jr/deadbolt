import { describe, it, expect, vi, afterEach } from "vitest";
import { createRenderSyncSystem } from "./render-sync-system";
import { createInputState, createClockState } from "./scene-context";
import type { SceneContext } from "./scene-context";
import { BodyRegistry } from "./body-registry";
import { createGameEventBus } from "@/game/events/event-bus";
import { world, resetWorld } from "@/game/ecs/world";

const DT = 1 / 60;

function createMockRect(x = 0, y = 0) {
  return { x, y, destroy: vi.fn() };
}

function createMockContext(alphaValue = 0.5): {
  ctx: SceneContext;
  addRectangle: ReturnType<typeof vi.fn>;
} {
  const addRectangle = vi.fn().mockImplementation(() => createMockRect());

  const scene = {
    add: {
      rectangle: addRectangle,
      graphics: vi.fn().mockReturnValue({
        clear: vi.fn(),
        lineStyle: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        strokePath: vi.fn(),
      }),
    },
    cameras: {
      main: {
        startFollow: vi.fn(),
      },
    },
  } as unknown as Phaser.Scene;

  return {
    ctx: {
      scene,
      bodyRegistry: new BodyRegistry(),
      inputState: createInputState(),
      getAlpha: () => alphaValue,
      clockState: createClockState(),
      eventBus: createGameEventBus(),
    },
    addRectangle,
  };
}

describe("RenderSyncSystem", () => {
  afterEach(() => {
    resetWorld();
  });

  it("creates a Phaser rectangle for a renderable entity", () => {
    const { ctx, addRectangle } = createMockContext();
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 100, y: 200 },
      renderable: { spriteKey: "player" },
    });

    system(DT);

    expect(addRectangle).toHaveBeenCalledTimes(1);
  });

  it("does not recreate visuals on subsequent ticks", () => {
    const { ctx, addRectangle } = createMockContext();
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 100, y: 200 },
      renderable: { spriteKey: "player" },
    });

    system(DT);
    system(DT);
    system(DT);

    expect(addRectangle).toHaveBeenCalledTimes(1);
  });

  it("interpolates position using alpha", () => {
    const alpha = 0.5;
    const { ctx, addRectangle } = createMockContext(alpha);
    const mockRect = createMockRect();
    addRectangle.mockReturnValue(mockRect);
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 200, y: 300 },
      previousPosition: { x: 100, y: 200 },
      renderable: { spriteKey: "zombie" },
    });

    system(DT);

    // Interpolated: prev + (curr - prev) * alpha
    // x: 100 + (200 - 100) * 0.5 = 150
    // y: 200 + (300 - 200) * 0.5 = 250
    expect(mockRect.x).toBeCloseTo(150, 5);
    expect(mockRect.y).toBeCloseTo(250, 5);
  });

  it("falls back to current position when previousPosition is absent", () => {
    const { ctx, addRectangle } = createMockContext(0.5);
    const mockRect = createMockRect();
    addRectangle.mockReturnValue(mockRect);
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 100, y: 100 },
      renderable: { spriteKey: "player" },
    });

    system(DT);

    // No previous → lerp(100, 100, 0.5) = 100
    expect(mockRect.x).toBe(100);
    expect(mockRect.y).toBe(100);
  });

  it("destroys sprites for removed entities", () => {
    const { ctx, addRectangle } = createMockContext();
    const mockRect = createMockRect();
    addRectangle.mockReturnValue(mockRect);
    const system = createRenderSyncSystem(ctx);

    const entity = world.add({
      position: { x: 50, y: 50 },
      renderable: { spriteKey: "bullet" },
    });

    system(DT);
    expect(mockRect.destroy).not.toHaveBeenCalled();

    // Remove the entity
    world.remove(entity);
    system(DT);

    expect(mockRect.destroy).toHaveBeenCalledTimes(1);
  });

  it("wires camera follow on first player sprite", () => {
    const { ctx } = createMockContext();
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 100, y: 100 },
      renderable: { spriteKey: "player" },
      playerControlled: { active: true },
    });

    system(DT);

    const cam = ctx.scene.cameras.main as unknown as {
      startFollow: ReturnType<typeof vi.fn>;
    };
    expect(cam.startFollow).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Interpolation boundary values
  // -------------------------------------------------------------------------

  it("positions sprite at previous position when alpha is 0", () => {
    const { ctx, addRectangle } = createMockContext(0);
    const mockRect = createMockRect();
    addRectangle.mockReturnValue(mockRect);
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 200, y: 300 },
      previousPosition: { x: 100, y: 200 },
      renderable: { spriteKey: "zombie" },
    });

    system(DT);

    expect(mockRect.x).toBe(100);
    expect(mockRect.y).toBe(200);
  });

  it("positions sprite at current position when alpha is 1", () => {
    const { ctx, addRectangle } = createMockContext(1);
    const mockRect = createMockRect();
    addRectangle.mockReturnValue(mockRect);
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 200, y: 300 },
      previousPosition: { x: 100, y: 200 },
      renderable: { spriteKey: "zombie" },
    });

    system(DT);

    expect(mockRect.x).toBe(200);
    expect(mockRect.y).toBe(300);
  });

  // -------------------------------------------------------------------------
  // Aim indicator
  // -------------------------------------------------------------------------

  it("lazily creates a Graphics object for the aim indicator", () => {
    const { ctx, addRectangle } = createMockContext(0);
    const mockRect = createMockRect(100, 100);
    addRectangle.mockReturnValue(mockRect);
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 100, y: 100 },
      velocity: { vx: 0, vy: 0 },
      renderable: { spriteKey: "player" },
      playerControlled: { active: true },
    });

    ctx.inputState.aimX = 200;
    ctx.inputState.aimY = 100;

    system(DT);

    const addGraphics = (ctx.scene.add as unknown as { graphics: ReturnType<typeof vi.fn> }).graphics;
    expect(addGraphics).toHaveBeenCalledTimes(1);
  });

  it("draws the aim line toward the mouse position", () => {
    const { ctx, addRectangle } = createMockContext(0);
    // Sprite will be at (100, 100) due to alpha=0 and prev=current
    const mockRect = createMockRect(100, 100);
    addRectangle.mockReturnValue(mockRect);
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 100, y: 100 },
      previousPosition: { x: 100, y: 100 },
      velocity: { vx: 0, vy: 0 },
      renderable: { spriteKey: "player" },
      playerControlled: { active: true },
    });

    // Aim directly to the right
    ctx.inputState.aimX = 300;
    ctx.inputState.aimY = 100;

    system(DT);

    const addGraphics = (ctx.scene.add as unknown as { graphics: ReturnType<typeof vi.fn> }).graphics;
    const gfxMock = addGraphics.mock.results[0]!.value;

    expect(gfxMock.clear).toHaveBeenCalled();
    expect(gfxMock.lineStyle).toHaveBeenCalledWith(2, 0xffffff, 0.7);
    expect(gfxMock.beginPath).toHaveBeenCalled();
    expect(gfxMock.moveTo).toHaveBeenCalledWith(100, 100);
    // AIM_LINE_LENGTH = 32, direction (1, 0) → lineTo(132, 100)
    expect(gfxMock.lineTo).toHaveBeenCalledWith(132, 100);
    expect(gfxMock.strokePath).toHaveBeenCalled();
  });

  it("does not draw the aim line when aim position equals player position", () => {
    const { ctx, addRectangle } = createMockContext(0);
    const mockRect = createMockRect(100, 100);
    addRectangle.mockReturnValue(mockRect);
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 100, y: 100 },
      previousPosition: { x: 100, y: 100 },
      velocity: { vx: 0, vy: 0 },
      renderable: { spriteKey: "player" },
      playerControlled: { active: true },
    });

    // Aim at the same position as player
    ctx.inputState.aimX = 100;
    ctx.inputState.aimY = 100;

    system(DT);

    const addGraphics = (ctx.scene.add as unknown as { graphics: ReturnType<typeof vi.fn> }).graphics;
    const gfxMock = addGraphics.mock.results[0]!.value;

    // clear() is always called, but beginPath should NOT be called (dist === 0)
    expect(gfxMock.clear).toHaveBeenCalled();
    expect(gfxMock.beginPath).not.toHaveBeenCalled();
  });

  it("reuses the same Graphics object across ticks", () => {
    const { ctx, addRectangle } = createMockContext(0);
    const mockRect = createMockRect(100, 100);
    addRectangle.mockReturnValue(mockRect);
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 100, y: 100 },
      velocity: { vx: 0, vy: 0 },
      renderable: { spriteKey: "player" },
      playerControlled: { active: true },
    });

    ctx.inputState.aimX = 200;
    ctx.inputState.aimY = 100;

    system(DT);
    system(DT);

    const addGraphics = (ctx.scene.add as unknown as { graphics: ReturnType<typeof vi.fn> }).graphics;
    expect(addGraphics).toHaveBeenCalledTimes(1);
  });

  it("only wires camera follow once", () => {
    const { ctx } = createMockContext();
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 100, y: 100 },
      renderable: { spriteKey: "player" },
      playerControlled: { active: true },
    });

    system(DT);
    system(DT);
    system(DT);

    const cam = ctx.scene.cameras.main as unknown as {
      startFollow: ReturnType<typeof vi.fn>;
    };
    expect(cam.startFollow).toHaveBeenCalledTimes(1);
  });
});
