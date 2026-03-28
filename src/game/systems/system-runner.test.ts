import { describe, it, expect, vi } from "vitest";
import { runSystems, type SystemFn } from "@/game/systems/system-runner";

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
