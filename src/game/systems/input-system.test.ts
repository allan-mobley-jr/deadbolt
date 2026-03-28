import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInputSystem } from "./input-system";
import { createInputState } from "./scene-context";
import type { SceneContext } from "./scene-context";
import { BodyRegistry } from "./body-registry";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockKeys() {
  const mkKey = () => ({ isDown: false });
  return {
    W: mkKey(),
    A: mkKey(),
    S: mkKey(),
    D: mkKey(),
    UP: mkKey(),
    DOWN: mkKey(),
    LEFT: mkKey(),
    RIGHT: mkKey(),
  };
}

function createMockContext(
  keys: ReturnType<typeof createMockKeys> | null = createMockKeys(),
): { ctx: SceneContext; keys: ReturnType<typeof createMockKeys> | null } {
  const inputState = createInputState();

  const scene = {
    input: {
      keyboard: keys
        ? {
            addKeys: vi.fn().mockReturnValue(keys),
          }
        : null,
      activePointer: { x: 640, y: 360 },
    },
    cameras: {
      main: {
        getWorldPoint: vi.fn(
          (x: number, y: number) => ({ x, y }),
        ),
      },
    },
  } as unknown as Phaser.Scene;

  return {
    ctx: {
      scene,
      bodyRegistry: new BodyRegistry(),
      inputState,
      getAlpha: () => 0,
    },
    keys,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InputSystem", () => {
  let ctx: SceneContext;
  let keys: ReturnType<typeof createMockKeys>;

  beforeEach(() => {
    const mock = createMockContext();
    ctx = mock.ctx;
    keys = mock.keys!;
  });

  it("reads no movement when no keys are pressed", () => {
    const system = createInputSystem(ctx);
    system(1 / 60);
    expect(ctx.inputState.moveX).toBe(0);
    expect(ctx.inputState.moveY).toBe(0);
  });

  it("reads rightward movement on D key", () => {
    const system = createInputSystem(ctx);
    keys.D.isDown = true;
    system(1 / 60);
    expect(ctx.inputState.moveX).toBe(1);
    expect(ctx.inputState.moveY).toBe(0);
  });

  it("reads leftward movement on A key", () => {
    const system = createInputSystem(ctx);
    keys.A.isDown = true;
    system(1 / 60);
    expect(ctx.inputState.moveX).toBe(-1);
    expect(ctx.inputState.moveY).toBe(0);
  });

  it("reads upward movement on W key", () => {
    const system = createInputSystem(ctx);
    keys.W.isDown = true;
    system(1 / 60);
    expect(ctx.inputState.moveX).toBe(0);
    expect(ctx.inputState.moveY).toBe(-1);
  });

  it("reads downward movement on S key", () => {
    const system = createInputSystem(ctx);
    keys.S.isDown = true;
    system(1 / 60);
    expect(ctx.inputState.moveX).toBe(0);
    expect(ctx.inputState.moveY).toBe(1);
  });

  it("supports arrow keys", () => {
    const system = createInputSystem(ctx);
    keys.RIGHT.isDown = true;
    keys.DOWN.isDown = true;
    system(1 / 60);
    // Diagonal normalised
    expect(ctx.inputState.moveX).toBeCloseTo(1 / Math.SQRT2, 5);
    expect(ctx.inputState.moveY).toBeCloseTo(1 / Math.SQRT2, 5);
  });

  it("normalises diagonal movement", () => {
    const system = createInputSystem(ctx);
    keys.D.isDown = true;
    keys.S.isDown = true;
    system(1 / 60);

    const len = Math.sqrt(
      ctx.inputState.moveX ** 2 + ctx.inputState.moveY ** 2,
    );
    expect(len).toBeCloseTo(1, 5);
  });

  it("cancels opposing axes", () => {
    const system = createInputSystem(ctx);
    keys.A.isDown = true;
    keys.D.isDown = true;
    system(1 / 60);
    expect(ctx.inputState.moveX).toBe(0);
    expect(ctx.inputState.moveY).toBe(0);
  });

  it("reads mouse position as aim in world space", () => {
    const system = createInputSystem(ctx);
    (ctx.scene.input.activePointer as { x: number; y: number }).x = 100;
    (ctx.scene.input.activePointer as { x: number; y: number }).y = 200;
    system(1 / 60);
    expect(ctx.inputState.aimX).toBe(100);
    expect(ctx.inputState.aimY).toBe(200);
  });

  it("handles null keyboard gracefully", () => {
    const { ctx: noKbCtx } = createMockContext(null);
    const system = createInputSystem(noKbCtx);
    system(1 / 60);
    expect(noKbCtx.inputState.moveX).toBe(0);
    expect(noKbCtx.inputState.moveY).toBe(0);
  });
});
