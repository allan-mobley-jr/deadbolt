import { describe, it, expect, vi } from "vitest";
import {
  runSystems,
  SystemRunner,
  type SystemFn,
} from "@/game/systems/system-runner";

// ---------------------------------------------------------------------------
// Original runSystems (unguarded)
// ---------------------------------------------------------------------------

describe("runSystems", () => {
  it("calls each system with the provided dt", () => {
    const a = vi.fn<SystemFn>();
    const b = vi.fn<SystemFn>();
    const dt = 1 / 60;

    runSystems([a, b], dt);

    expect(a).toHaveBeenCalledWith(dt);
    expect(b).toHaveBeenCalledWith(dt);
  });

  it("executes systems in array order", () => {
    const order: string[] = [];
    const a: SystemFn = () => order.push("a");
    const b: SystemFn = () => order.push("b");
    const c: SystemFn = () => order.push("c");

    runSystems([a, b, c], 1 / 60);

    expect(order).toEqual(["a", "b", "c"]);
  });

  it("does nothing with an empty array", () => {
    expect(() => runSystems([], 1 / 60)).not.toThrow();
  });

  it("makes earlier system mutations visible to later systems", () => {
    const shared = { value: 0 };
    const writer: SystemFn = () => {
      shared.value = 42;
    };
    const reader: SystemFn = () => {
      shared.value *= 2;
    };

    runSystems([writer, reader], 1 / 60);

    expect(shared.value).toBe(84);
  });

  it("propagates errors from systems", () => {
    const failing: SystemFn = () => {
      throw new Error("system failure");
    };

    expect(() => runSystems([failing], 1 / 60)).toThrow("system failure");
  });

  it("does not execute systems after one that throws", () => {
    const before = vi.fn<SystemFn>();
    const failing: SystemFn = () => {
      throw new Error("boom");
    };
    const after = vi.fn<SystemFn>();

    expect(() => runSystems([before, failing, after], 1 / 60)).toThrow("boom");
    expect(before).toHaveBeenCalledTimes(1);
    expect(after).not.toHaveBeenCalled();
  });

  it("executes all systems before the failing one", () => {
    const a = vi.fn<SystemFn>();
    const b = vi.fn<SystemFn>();
    const failing: SystemFn = () => {
      throw new Error("crash");
    };
    const d = vi.fn<SystemFn>();

    expect(() => runSystems([a, b, failing, d], 1 / 60)).toThrow("crash");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(d).not.toHaveBeenCalled();
  });

  it("calls each system exactly once per invocation", () => {
    const sys = vi.fn<SystemFn>();

    runSystems([sys], 1 / 60);

    expect(sys).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// SystemRunner (error-isolated)
// ---------------------------------------------------------------------------

describe("SystemRunner", () => {
  const DT = 1 / 60;

  describe("constructor validation", () => {
    it("rejects non-integer errorBudget", () => {
      expect(() => new SystemRunner([], { errorBudget: 2.5 })).toThrow(
        /errorBudget must be a positive integer/,
      );
    });

    it("rejects errorBudget of zero", () => {
      expect(() => new SystemRunner([], { errorBudget: 0 })).toThrow(
        /errorBudget must be a positive integer/,
      );
    });

    it("rejects negative errorBudget", () => {
      expect(() => new SystemRunner([], { errorBudget: -1 })).toThrow(
        /errorBudget must be a positive integer/,
      );
    });

    it("rejects names array with wrong length", () => {
      expect(
        () => new SystemRunner([vi.fn(), vi.fn()], { names: ["A"] }),
      ).toThrow(/names length \(1\) must match systems length \(2\)/);
    });

    it("accepts matching names array", () => {
      expect(
        () => new SystemRunner([vi.fn()], { names: ["Sys"] }),
      ).not.toThrow();
    });
  });

  describe("basic execution", () => {
    it("calls each system with the provided dt", () => {
      const a = vi.fn<SystemFn>();
      const b = vi.fn<SystemFn>();
      const runner = new SystemRunner([a, b]);

      runner.run(DT);

      expect(a).toHaveBeenCalledWith(DT);
      expect(b).toHaveBeenCalledWith(DT);
    });

    it("executes systems in array order", () => {
      const order: string[] = [];
      const a: SystemFn = () => order.push("a");
      const b: SystemFn = () => order.push("b");
      const c: SystemFn = () => order.push("c");
      const runner = new SystemRunner([a, b, c]);

      runner.run(DT);

      expect(order).toEqual(["a", "b", "c"]);
    });

    it("does nothing with an empty array", () => {
      const runner = new SystemRunner([]);
      expect(() => runner.run(DT)).not.toThrow();
    });

    it("makes earlier system mutations visible to later systems", () => {
      const shared = { value: 0 };
      const writer: SystemFn = () => { shared.value = 42; };
      const reader: SystemFn = () => { shared.value *= 2; };
      const runner = new SystemRunner([writer, reader]);

      runner.run(DT);

      expect(shared.value).toBe(84);
    });
  });

  describe("error isolation", () => {
    it("one system throwing does not prevent others from running", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const before = vi.fn<SystemFn>();
      const failing: SystemFn = () => { throw new Error("boom"); };
      const after = vi.fn<SystemFn>();
      const runner = new SystemRunner([before, failing, after]);

      runner.run(DT);

      expect(before).toHaveBeenCalledTimes(1);
      expect(after).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("does not throw when a system throws", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const failing: SystemFn = () => { throw new Error("crash"); };
      const runner = new SystemRunner([failing]);

      expect(() => runner.run(DT)).not.toThrow();

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("logs errors with system identification", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const failing: SystemFn = () => { throw new Error("oops"); };
      const runner = new SystemRunner([failing], { names: ["TestSystem"] });

      runner.run(DT);

      expect(consoleSpy).toHaveBeenCalledWith(
        "[TestSystem] System error 1/5:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("uses index-based names when no names provided", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const failing: SystemFn = () => { throw new Error("oops"); };
      const runner = new SystemRunner([failing]);

      runner.run(DT);

      expect(consoleSpy).toHaveBeenCalledWith(
        "[System[0]] System error 1/5:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });

  describe("error budget", () => {
    it("disables a system after it exceeds the error budget", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      let callCount = 0;
      const failing: SystemFn = () => {
        callCount++;
        throw new Error("repeating");
      };
      const runner = new SystemRunner([failing], { errorBudget: 3 });

      // Run 5 times — should only call the system 3 times
      for (let i = 0; i < 5; i++) runner.run(DT);

      expect(callCount).toBe(3);
      expect(runner.isDisabled(0)).toBe(true);

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("uses default error budget of 5", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      let callCount = 0;
      const failing: SystemFn = () => {
        callCount++;
        throw new Error("oops");
      };
      const runner = new SystemRunner([failing]);

      for (let i = 0; i < 10; i++) runner.run(DT);

      expect(callCount).toBe(5);
      expect(runner.isDisabled(0)).toBe(true);

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("error budget of 1 disables on first error", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      let callCount = 0;
      const failing: SystemFn = () => {
        callCount++;
        throw new Error("once");
      };
      const runner = new SystemRunner([failing], { errorBudget: 1 });

      runner.run(DT);
      runner.run(DT);
      runner.run(DT);

      expect(callCount).toBe(1);
      expect(runner.isDisabled(0)).toBe(true);

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("disabled system does not prevent healthy systems from running", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const healthy = vi.fn<SystemFn>();
      const failing: SystemFn = () => { throw new Error("bad"); };
      const runner = new SystemRunner([failing, healthy], { errorBudget: 1 });

      // First run: failing gets called then disabled, healthy still runs
      runner.run(DT);
      expect(healthy).toHaveBeenCalledTimes(1);

      // Second run: failing skipped, healthy runs
      runner.run(DT);
      expect(healthy).toHaveBeenCalledTimes(2);
      expect(runner.isDisabled(0)).toBe(true);
      expect(runner.isDisabled(1)).toBe(false);

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("multiple systems can be independently disabled", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const fail1: SystemFn = () => { throw new Error("fail1"); };
      const healthy = vi.fn<SystemFn>();
      const fail2: SystemFn = () => { throw new Error("fail2"); };
      const runner = new SystemRunner([fail1, healthy, fail2], { errorBudget: 1 });

      runner.run(DT);

      expect(runner.isDisabled(0)).toBe(true);
      expect(runner.isDisabled(1)).toBe(false);
      expect(runner.isDisabled(2)).toBe(true);
      expect(runner.disabledCount).toBe(2);

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });

  describe("callbacks", () => {
    it("calls onError on each system error with correct arguments", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const onError = vi.fn();
      const error = new Error("test error");
      const failing: SystemFn = () => { throw error; };
      const runner = new SystemRunner([failing], {
        names: ["TestSystem"],
        onError,
        errorBudget: 10,
      });

      runner.run(DT);

      expect(onError).toHaveBeenCalledWith(0, "TestSystem", error, 1);

      runner.run(DT);

      expect(onError).toHaveBeenCalledWith(0, "TestSystem", error, 2);

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("calls onDisabled once when the error budget is exhausted", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const onDisabled = vi.fn();
      const failing: SystemFn = () => { throw new Error("fail"); };
      const runner = new SystemRunner([failing], {
        names: ["BadSystem"],
        onDisabled,
        errorBudget: 2,
      });

      runner.run(DT); // error 1
      expect(onDisabled).not.toHaveBeenCalled();

      runner.run(DT); // error 2 — budget exhausted
      expect(onDisabled).toHaveBeenCalledTimes(1);
      expect(onDisabled).toHaveBeenCalledWith(0, "BadSystem");

      // Should not be called again
      runner.run(DT);
      expect(onDisabled).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });

  describe("callback resilience", () => {
    it("a throwing onError callback does not prevent subsequent systems from running", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const failing: SystemFn = () => { throw new Error("sys"); };
      const after = vi.fn<SystemFn>();
      const runner = new SystemRunner([failing, after], {
        onError: () => { throw new Error("callback boom"); },
      });

      runner.run(DT);

      // The system after the failing one should still have run
      expect(after).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("a throwing onDisabled callback does not prevent subsequent systems from running", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const failing: SystemFn = () => { throw new Error("sys"); };
      const after = vi.fn<SystemFn>();
      const runner = new SystemRunner([failing, after], {
        errorBudget: 1,
        onDisabled: () => { throw new Error("disabled boom"); },
      });

      runner.run(DT);

      expect(after).toHaveBeenCalledTimes(1);
      expect(runner.isDisabled(0)).toBe(true);

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("logs when onError callback throws", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const callbackError = new Error("callback boom");
      const failing: SystemFn = () => { throw new Error("sys"); };
      const runner = new SystemRunner([failing], {
        names: ["TestSys"],
        onError: () => { throw callbackError; },
      });

      runner.run(DT);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[SystemRunner] onError callback threw for "TestSys":',
        callbackError,
      );

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("logs when onDisabled callback throws", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const callbackError = new Error("disabled boom");
      const failing: SystemFn = () => { throw new Error("sys"); };
      const runner = new SystemRunner([failing], {
        names: ["TestSys"],
        errorBudget: 1,
        onDisabled: () => { throw callbackError; },
      });

      runner.run(DT);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[SystemRunner] onDisabled callback threw for "TestSys":',
        callbackError,
      );

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });

  describe("disabledCount", () => {
    it("starts at zero", () => {
      const runner = new SystemRunner([vi.fn(), vi.fn()]);
      expect(runner.disabledCount).toBe(0);
    });

    it("reflects current disabled count", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const fail1: SystemFn = () => { throw new Error("a"); };
      const fail2: SystemFn = () => { throw new Error("b"); };
      const runner = new SystemRunner([fail1, vi.fn(), fail2], { errorBudget: 1 });

      runner.run(DT);

      expect(runner.disabledCount).toBe(2);

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });

  describe("isDisabled", () => {
    it("returns false for out-of-range indices", () => {
      const runner = new SystemRunner([vi.fn()]);
      expect(runner.isDisabled(-1)).toBe(false);
      expect(runner.isDisabled(99)).toBe(false);
    });
  });

  describe("reset", () => {
    it("re-enables all disabled systems", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      let callCount = 0;
      const failing: SystemFn = () => {
        callCount++;
        throw new Error("oops");
      };
      const runner = new SystemRunner([failing], { errorBudget: 2 });

      runner.run(DT);
      runner.run(DT); // disabled after 2
      expect(runner.isDisabled(0)).toBe(true);
      expect(callCount).toBe(2);

      runner.reset();

      expect(runner.isDisabled(0)).toBe(false);
      expect(runner.disabledCount).toBe(0);

      // System should run again after reset
      runner.run(DT);
      expect(callCount).toBe(3);

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("clears error counts so the budget starts fresh", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      let callCount = 0;
      const failing: SystemFn = () => {
        callCount++;
        throw new Error("oops");
      };
      const runner = new SystemRunner([failing], { errorBudget: 2 });

      runner.run(DT); // error 1
      runner.reset();  // clear
      runner.run(DT); // error 1 again (not 2)
      runner.run(DT); // error 2 — now disabled

      expect(callCount).toBe(3);
      expect(runner.isDisabled(0)).toBe(true);

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });
});
