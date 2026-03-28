import { describe, it, expect, vi, afterEach } from "vitest";
import { createRenderSyncSystem } from "./render-sync-system";
import { createInputState } from "./scene-context";
import type { SceneContext } from "./scene-context";
import { BodyRegistry } from "./body-registry";
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
