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
});
