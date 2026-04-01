import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInputSystem } from "./input-system";
import { createInputState, createClockState } from "./scene-context";
import type { SceneContext } from "./scene-context";
import { BodyRegistry } from "./body-registry";
import { createGameEventBus } from "@/game/events/event-bus";

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
    E: mkKey(),
    ONE: mkKey(),
    TWO: mkKey(),
    THREE: mkKey(),
    FOUR: mkKey(),
    FIVE: mkKey(),
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
      clockState: createClockState(),
      eventBus: createGameEventBus(),
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

  it("supports arrow keys for keyboard aiming", () => {
    const system = createInputSystem(ctx);
    keys.RIGHT.isDown = true;
    keys.DOWN.isDown = true;
    system(1 / 60);
    // Arrow keys now control aiming direction (not movement)
    // Movement axes should be zero (no WASD pressed)
    expect(ctx.inputState.moveX).toBe(0);
    expect(ctx.inputState.moveY).toBe(0);
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

  // -------------------------------------------------------------------------
  // Interact key (E) — edge detection
  // -------------------------------------------------------------------------

  describe("interact key (E)", () => {
    it("sets interactPressed on rising edge", () => {
      const system = createInputSystem(ctx);
      keys.E.isDown = true;
      system(1 / 60);
      expect(ctx.inputState.interactPressed).toBe(true);
    });

    it("does not repeat while E is held down", () => {
      const system = createInputSystem(ctx);
      keys.E.isDown = true;
      system(1 / 60);
      expect(ctx.inputState.interactPressed).toBe(true);

      // Second tick with E still held
      system(1 / 60);
      expect(ctx.inputState.interactPressed).toBe(false);
    });

    it("re-triggers after release and re-press", () => {
      const system = createInputSystem(ctx);

      // Press
      keys.E.isDown = true;
      system(1 / 60);
      expect(ctx.inputState.interactPressed).toBe(true);

      // Release
      keys.E.isDown = false;
      system(1 / 60);
      expect(ctx.inputState.interactPressed).toBe(false);

      // Re-press
      keys.E.isDown = true;
      system(1 / 60);
      expect(ctx.inputState.interactPressed).toBe(true);
    });

    it("defaults to false when keyboard is null", () => {
      const { ctx: noKbCtx } = createMockContext(null);
      const system = createInputSystem(noKbCtx);
      system(1 / 60);
      expect(noKbCtx.inputState.interactPressed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Quick-select keys (1-5) — edge detection
  // -------------------------------------------------------------------------

  describe("quick-select keys (1-5)", () => {
    it("defaults quickSelectPressed to -1 when no number key is pressed", () => {
      const system = createInputSystem(ctx);
      system(1 / 60);
      expect(ctx.inputState.quickSelectPressed).toBe(-1);
    });

    it.each([
      ["ONE", 0],
      ["TWO", 1],
      ["THREE", 2],
      ["FOUR", 3],
      ["FIVE", 4],
    ] as const)(
      "maps %s key press to quickSelectPressed = %d",
      (keyName, expectedIndex) => {
        const system = createInputSystem(ctx);
        (keys[keyName] as { isDown: boolean }).isDown = true;
        system(1 / 60);
        expect(ctx.inputState.quickSelectPressed).toBe(expectedIndex);
      },
    );

    it("does not repeat while a number key is held down", () => {
      const system = createInputSystem(ctx);
      keys.ONE.isDown = true;

      system(1 / 60);
      expect(ctx.inputState.quickSelectPressed).toBe(0);

      // Second tick with ONE still held
      system(1 / 60);
      expect(ctx.inputState.quickSelectPressed).toBe(-1);
    });

    it("re-triggers after release and re-press", () => {
      const system = createInputSystem(ctx);

      keys.THREE.isDown = true;
      system(1 / 60);
      expect(ctx.inputState.quickSelectPressed).toBe(2);

      keys.THREE.isDown = false;
      system(1 / 60);
      expect(ctx.inputState.quickSelectPressed).toBe(-1);

      keys.THREE.isDown = true;
      system(1 / 60);
      expect(ctx.inputState.quickSelectPressed).toBe(2);
    });

    it("when multiple keys pressed simultaneously, last-writer-wins", () => {
      const system = createInputSystem(ctx);
      keys.ONE.isDown = true;
      keys.FOUR.isDown = true;
      system(1 / 60);
      // Iteration order is ONE(0), TWO(1), THREE(2), FOUR(3), FIVE(4)
      // Both ONE and FOUR are rising edges, so FOUR (index 3) overwrites ONE (index 0)
      expect(ctx.inputState.quickSelectPressed).toBe(3);
    });

    it("defaults to -1 when keyboard is null", () => {
      const { ctx: noKbCtx } = createMockContext(null);
      const system = createInputSystem(noKbCtx);
      system(1 / 60);
      expect(noKbCtx.inputState.quickSelectPressed).toBe(-1);
    });
  });
});
