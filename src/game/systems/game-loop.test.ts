import { describe, it, expect, vi } from "vitest";
import {
  GameLoop,
  FIXED_DT,
  MAX_STEPS_PER_FRAME,
} from "@/game/systems/game-loop";
import type { SystemFn } from "@/game/systems/system-runner";

describe("GameLoop", () => {
  describe("constants", () => {
    it("FIXED_DT is 1/60 (~16.67ms)", () => {
      expect(FIXED_DT).toBeCloseTo(1 / 60, 10);
    });

    it("MAX_STEPS_PER_FRAME is 5", () => {
      expect(MAX_STEPS_PER_FRAME).toBe(5);
    });
  });

  describe("constructor", () => {
    it("accepts an empty systems array", () => {
      expect(() => new GameLoop([])).not.toThrow();
    });

    it("accepts custom fixedDt and maxSteps", () => {
      const loop = new GameLoop([], 1 / 30, 10);
      // Verify by ticking — with dt = 1/30, one tick at fixedDt=1/30 → 1 step
      loop.tick(1 / 30);
      expect(loop.physicsTicks).toBe(1);
    });

    it("rejects fixedDt of zero", () => {
      expect(() => new GameLoop([], 0)).toThrow(/fixedDt must be positive/);
    });

    it("rejects negative fixedDt", () => {
      expect(() => new GameLoop([], -1 / 60)).toThrow(/fixedDt must be positive/);
    });

    it("rejects maxSteps of zero", () => {
      expect(() => new GameLoop([], FIXED_DT, 0)).toThrow(
        /maxSteps must be a positive integer/,
      );
    });

    it("rejects non-integer maxSteps", () => {
      expect(() => new GameLoop([], FIXED_DT, 2.5)).toThrow(
        /maxSteps must be a positive integer/,
      );
    });
  });

  describe("single tick behavior", () => {
    it("executes exactly 1 physics step for dt equal to FIXED_DT", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys]);

      loop.tick(FIXED_DT);

      expect(sys).toHaveBeenCalledTimes(1);
      expect(sys).toHaveBeenCalledWith(FIXED_DT);
      expect(loop.physicsTicks).toBe(1);
    });

    it("executes exactly 3 physics steps for dt = FIXED_DT * 3", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys]);

      loop.tick(FIXED_DT * 3);

      expect(sys).toHaveBeenCalledTimes(3);
      expect(loop.physicsTicks).toBe(3);
    });

    it("executes 0 physics steps for dt = FIXED_DT * 0.5", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys]);

      loop.tick(FIXED_DT * 0.5);

      expect(sys).not.toHaveBeenCalled();
      expect(loop.physicsTicks).toBe(0);
    });

    it("accumulates partial frames across ticks", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys]);

      loop.tick(FIXED_DT * 0.5);
      expect(sys).not.toHaveBeenCalled();

      loop.tick(FIXED_DT * 0.5);
      expect(sys).toHaveBeenCalledTimes(1);
      expect(loop.physicsTicks).toBe(1);
    });

    it("passes FIXED_DT (not raw frame delta) to systems", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys]);

      // Pass a large frame delta — system should still receive FIXED_DT
      loop.tick(FIXED_DT * 3);

      for (const call of sys.mock.calls) {
        expect(call[0]).toBeCloseTo(FIXED_DT, 10);
      }
    });
  });

  describe("spiral-of-death guard", () => {
    it("caps at MAX_STEPS_PER_FRAME when dt is very large", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys]);

      loop.tick(FIXED_DT * 10);

      expect(sys).toHaveBeenCalledTimes(MAX_STEPS_PER_FRAME);
      expect(loop.physicsTicks).toBe(MAX_STEPS_PER_FRAME);
    });

    it("caps at MAX_STEPS_PER_FRAME for extreme dt values", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys]);

      loop.tick(FIXED_DT * 100);

      expect(sys).toHaveBeenCalledTimes(MAX_STEPS_PER_FRAME);
    });

    it("allows exactly MAX_STEPS_PER_FRAME steps at the boundary", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys]);

      loop.tick(FIXED_DT * MAX_STEPS_PER_FRAME);

      expect(sys).toHaveBeenCalledTimes(MAX_STEPS_PER_FRAME);
    });

    it("respects custom maxSteps value", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys], FIXED_DT, 3);

      loop.tick(FIXED_DT * 10);

      expect(sys).toHaveBeenCalledTimes(3);
    });

    it("does not carry over excess accumulator time to the next frame", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys]);

      // Massive spike: 20× FIXED_DT, capped to MAX_STEPS_PER_FRAME
      loop.tick(FIXED_DT * 20);
      expect(sys).toHaveBeenCalledTimes(MAX_STEPS_PER_FRAME);

      sys.mockClear();

      // Next normal frame should behave as if no excess leaked through
      loop.tick(FIXED_DT);
      expect(sys).toHaveBeenCalledTimes(1);
      expect(loop.physicsTicks).toBe(1);
    });

    it("two consecutive spiral-guard frames do not compound accumulated time", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys]);

      loop.tick(FIXED_DT * 100);
      loop.tick(FIXED_DT * 100);

      // Total across both frames should be exactly 2 × MAX_STEPS_PER_FRAME
      expect(sys).toHaveBeenCalledTimes(MAX_STEPS_PER_FRAME * 2);
    });

    it("accumulator after spiral guard equals remainder of capped value", () => {
      const loop = new GameLoop([]);

      // Spike triggers guard; cap = FIXED_DT * MAX_STEPS_PER_FRAME
      // which is an exact multiple of FIXED_DT, so remainder ≈ 0
      loop.tick(FIXED_DT * 20);
      expect(loop.alpha).toBeCloseTo(0, 10);

      // A subsequent partial frame should accumulate correctly from ~0
      loop.tick(FIXED_DT * 0.3);
      expect(loop.alpha).toBeCloseTo(0.3, 5);
    });
  });

  describe("interpolation alpha", () => {
    it("is 0 when the accumulator is perfectly consumed", () => {
      const loop = new GameLoop([]);

      loop.tick(FIXED_DT);

      expect(loop.alpha).toBeCloseTo(0, 5);
    });

    it("is approximately 0.5 with half a step remaining", () => {
      const loop = new GameLoop([]);

      loop.tick(FIXED_DT * 1.5);

      expect(loop.alpha).toBeCloseTo(0.5, 5);
    });

    it("stays in [0, 1) range across various deltas", () => {
      const deltas = [
        FIXED_DT * 0.1,
        FIXED_DT * 0.99,
        FIXED_DT * 1.5,
        FIXED_DT * 2.7,
        FIXED_DT * 4.9,
      ];

      for (const dt of deltas) {
        // Fresh loop each time to avoid accumulation
        const fresh = new GameLoop([]);
        fresh.tick(dt);
        expect(fresh.alpha).toBeGreaterThanOrEqual(0);
        expect(fresh.alpha).toBeLessThan(1);
      }
    });

    it("is 0 on initial state before any ticks", () => {
      const loop = new GameLoop([]);
      expect(loop.alpha).toBe(0);
    });

    it("is approximately 0 after a spiral-guard frame", () => {
      const loop = new GameLoop([]);
      loop.tick(FIXED_DT * 10);
      // Cap is an exact multiple of FIXED_DT → fully consumed
      expect(loop.alpha).toBeCloseTo(0, 10);
    });

    it("is approximately 0 after spiral guard with any oversized delta", () => {
      const deltas = [FIXED_DT * 6, FIXED_DT * 50, FIXED_DT * 1000, 5.0];

      for (const dt of deltas) {
        const fresh = new GameLoop([]);
        fresh.tick(dt);
        expect(fresh.alpha).toBeCloseTo(0, 10);
      }
    });
  });

  describe("FPS calculation", () => {
    it("starts at 60 fps", () => {
      const loop = new GameLoop([]);
      expect(loop.fps).toBe(60);
    });

    it("converges toward actual rate over multiple ticks", () => {
      const loop = new GameLoop([]);
      // Simulate 30 fps for many frames
      for (let i = 0; i < 200; i++) {
        loop.tick(1 / 30);
      }
      expect(loop.fps).toBeCloseTo(30, 0);
    });

    it("handles zero delta gracefully", () => {
      const loop = new GameLoop([]);

      expect(() => loop.tick(0)).not.toThrow();
      // FPS should remain unchanged (no division by zero)
      expect(loop.fps).toBe(60);
    });

    it("resets physicsTicks to 0 on zero-delta after a positive tick", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys]);

      loop.tick(FIXED_DT);
      expect(loop.physicsTicks).toBe(1);

      loop.tick(0);
      expect(loop.physicsTicks).toBe(0);
      // FPS should remain unchanged (no division by zero)
      expect(Number.isFinite(loop.fps)).toBe(true);
    });

    it("resets physicsTicks to 0 on negative delta after a positive tick", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys]);

      loop.tick(FIXED_DT);
      expect(loop.physicsTicks).toBe(1);

      loop.tick(-0.01);
      expect(loop.physicsTicks).toBe(0);
      expect(sys).toHaveBeenCalledTimes(1); // Only the first tick called it
    });

    it("rejects negative delta without corrupting state", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys]);

      loop.tick(-0.1);

      expect(sys).not.toHaveBeenCalled();
      expect(loop.fps).toBe(60);
      expect(loop.alpha).toBe(0);

      // Subsequent positive tick still works normally
      loop.tick(FIXED_DT);
      expect(sys).toHaveBeenCalledTimes(1);
    });

    it("converges toward 240 fps at sustained 240 Hz", () => {
      const loop = new GameLoop([]);
      for (let i = 0; i < 500; i++) {
        loop.tick(1 / 240);
      }
      expect(loop.fps).toBeCloseTo(240, 0);
    });

    it("converges toward 15 fps at sustained 15 Hz", () => {
      const loop = new GameLoop([]);
      for (let i = 0; i < 500; i++) {
        loop.tick(1 / 15);
      }
      expect(loop.fps).toBeCloseTo(15, 0);
    });

    it("FPS remains finite after rapid transitions between extreme rates", () => {
      const loop = new GameLoop([]);

      // Alternate between 240 Hz and 15 Hz in blocks
      for (let cycle = 0; cycle < 3; cycle++) {
        for (let i = 0; i < 100; i++) loop.tick(1 / 240);
        expect(Number.isFinite(loop.fps)).toBe(true);

        for (let i = 0; i < 100; i++) loop.tick(1 / 15);
        expect(Number.isFinite(loop.fps)).toBe(true);
      }

      // After final 15 Hz block, should converge near 15
      expect(loop.fps).toBeGreaterThan(10);
      expect(loop.fps).toBeLessThan(25);
    });

    it("smooths out jittery frame times", () => {
      const loop = new GameLoop([]);
      // Alternate between fast and slow frames
      for (let i = 0; i < 200; i++) {
        loop.tick(i % 2 === 0 ? 1 / 90 : 1 / 30);
      }
      // EMA tracks arithmetic mean of instantaneous fps: (90+30)/2 = 60
      expect(loop.fps).toBeGreaterThan(55);
      expect(loop.fps).toBeLessThan(65);
    });
  });

  describe("edge case: near-zero positive delta", () => {
    it("handles Number.EPSILON delta without corrupting state", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys]);

      loop.tick(Number.EPSILON);

      expect(sys).not.toHaveBeenCalled(); // Not enough for a physics step
      expect(loop.physicsTicks).toBe(0);
      expect(Number.isFinite(loop.fps)).toBe(true);
      expect(loop.alpha).toBeGreaterThanOrEqual(0);
      expect(loop.alpha).toBeLessThan(1);
    });

    it("handles 1e-15 delta without NaN in FPS", () => {
      const loop = new GameLoop([]);

      loop.tick(1e-15);

      // 1/1e-15 = 1e15 — very large but finite; EMA will spike
      expect(Number.isFinite(loop.fps)).toBe(true);
      expect(Number.isNaN(loop.fps)).toBe(false);
      expect(Number.isFinite(loop.alpha)).toBe(true);
    });

    it("many tiny deltas eventually accumulate to a physics step", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys]);

      // FIXED_DT / 1000 ≈ 16.67 µs — small but reasonable
      const tiny = FIXED_DT / 1000;
      for (let i = 0; i < 1000; i++) {
        loop.tick(tiny);
      }

      // 1000 × (FIXED_DT/1000) = FIXED_DT → exactly 1 physics step
      expect(sys).toHaveBeenCalledTimes(1);
    });
  });

  describe("stats getter", () => {
    it("returns an object with fps, physicsTicks, and alpha", () => {
      const loop = new GameLoop([]);
      loop.tick(FIXED_DT * 1.5);

      const stats = loop.stats;

      expect(stats).toHaveProperty("fps");
      expect(stats).toHaveProperty("physicsTicks");
      expect(stats).toHaveProperty("alpha");
    });

    it("physicsTicks reflects only the most recent frame", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys]);

      loop.tick(FIXED_DT * 3);
      expect(loop.stats.physicsTicks).toBe(3);

      sys.mockClear();
      loop.tick(FIXED_DT * 0.5);
      expect(loop.stats.physicsTicks).toBe(0);
    });
  });

  describe("system execution order", () => {
    it("runs all systems in registration order each tick", () => {
      const order: string[] = [];
      const a: SystemFn = () => order.push("a");
      const b: SystemFn = () => order.push("b");
      const loop = new GameLoop([a, b]);

      loop.tick(FIXED_DT * 2);

      // Two ticks, each running [a, b] in order
      expect(order).toEqual(["a", "b", "a", "b"]);
    });

    it("does not execute systems when no full step has accumulated", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys]);

      loop.tick(FIXED_DT * 0.1);

      expect(sys).not.toHaveBeenCalled();
    });
  });

  describe("resetAccumulator()", () => {
    it("zeroes accumulated time so next tick starts fresh", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys]);

      // Accumulate 0.75 of a physics step — not enough for a tick
      loop.tick(FIXED_DT * 0.75);
      expect(sys).not.toHaveBeenCalled();

      // Reset the accumulator, discarding the 0.75 step
      loop.resetAccumulator();

      // Another 0.5 step — without the reset, total would be 1.25 (1 tick).
      // With the reset, only 0.5 accumulated — still not enough.
      loop.tick(FIXED_DT * 0.5);
      expect(sys).not.toHaveBeenCalled();
      expect(loop.physicsTicks).toBe(0);
    });

    it("prevents catch-up burst after a long pause", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys]);

      // Establish baseline — one normal tick
      loop.tick(FIXED_DT);
      expect(sys).toHaveBeenCalledTimes(1);
      sys.mockClear();

      // Reset accumulator (simulating what GameScene does on resume from pause)
      loop.resetAccumulator();

      // Next tick with exactly one FIXED_DT of real time elapsed.
      // Without reset, any leftover accumulator from the prior tick would
      // cause extra physics steps here.
      loop.tick(FIXED_DT);
      expect(sys).toHaveBeenCalledTimes(1);
      expect(loop.physicsTicks).toBe(1);
    });
  });

  describe("display rate scenarios", () => {
    it("produces 2 physics steps per frame at 30 fps", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys]);

      // 30 fps → 33.33ms frame → ~2 × FIXED_DT
      loop.tick(1 / 30);

      expect(sys).toHaveBeenCalledTimes(2);
      expect(loop.physicsTicks).toBe(2);
    });

    it("accumulates partial steps at 144 fps", () => {
      const sys = vi.fn<SystemFn>();
      const loop = new GameLoop([sys]);

      // 144 fps → ~6.94ms frame → less than 1 FIXED_DT (16.67ms)
      loop.tick(1 / 144);
      expect(sys).not.toHaveBeenCalled();
      expect(loop.physicsTicks).toBe(0);

      // After ~3 frames at 144fps, enough time accumulates for 1 step
      loop.tick(1 / 144);
      loop.tick(1 / 144);
      expect(sys).toHaveBeenCalledTimes(1);
    });

    it("maintains consistent total physics steps across display rates", () => {
      // Simulate 1 second at 30 fps vs 144 fps — both should
      // execute approximately 60 physics steps.
      const sys30 = vi.fn<SystemFn>();
      const loop30 = new GameLoop([sys30]);
      for (let i = 0; i < 30; i++) loop30.tick(1 / 30);

      const sys144 = vi.fn<SystemFn>();
      const loop144 = new GameLoop([sys144]);
      for (let i = 0; i < 144; i++) loop144.tick(1 / 144);

      // Both should be ~60 steps (minor floating-point variance allowed)
      expect(sys30.mock.calls.length).toBeGreaterThanOrEqual(59);
      expect(sys30.mock.calls.length).toBeLessThanOrEqual(61);
      expect(sys144.mock.calls.length).toBeGreaterThanOrEqual(59);
      expect(sys144.mock.calls.length).toBeLessThanOrEqual(61);
    });
  });
});
