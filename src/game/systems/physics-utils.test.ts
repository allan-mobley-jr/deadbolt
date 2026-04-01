import { describe, it, expect, vi } from "vitest";
import { safeRemoveBody, safeRemoveConstraint } from "./physics-utils";
import { BodyRegistry } from "./body-registry";
import { ConstraintRegistry } from "./constraint-registry";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockWorld() {
  return {
    remove: vi.fn(),
    removeConstraint: vi.fn(),
  };
}

function createMockBody(id: number): MatterJS.BodyType {
  return { id, position: { x: 0, y: 0 } } as unknown as MatterJS.BodyType;
}

function createMockConstraint(id: number): MatterJS.ConstraintType {
  return { id } as unknown as MatterJS.ConstraintType;
}

// ---------------------------------------------------------------------------
// safeRemoveBody
// ---------------------------------------------------------------------------

describe("safeRemoveBody", () => {
  it("removes body and unregisters when body exists", () => {
    const world = createMockWorld();
    const registry = new BodyRegistry();
    const body = createMockBody(42);
    registry.register(body);

    const result = safeRemoveBody(world, registry, 42, "TestSystem");

    expect(result).toBe(true);
    expect(world.remove).toHaveBeenCalledWith(body);
    expect(registry.get(42)).toBeUndefined();
  });

  it("returns false and still unregisters when body is absent", () => {
    const world = createMockWorld();
    const registry = new BodyRegistry();

    const result = safeRemoveBody(world, registry, 999, "TestSystem");

    expect(result).toBe(false);
    expect(world.remove).not.toHaveBeenCalled();
  });

  it("catches removal errors, logs, and still unregisters", () => {
    const world = createMockWorld();
    world.remove.mockImplementation(() => {
      throw new Error("physics corruption");
    });
    const registry = new BodyRegistry();
    const body = createMockBody(7);
    registry.register(body);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = safeRemoveBody(world, registry, 7, "TestSystem");

    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[TestSystem] Failed to remove physics body 7:",
      expect.any(Error),
    );
    // Body still unregistered despite removal failure
    expect(registry.get(7)).toBeUndefined();

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// safeRemoveConstraint
// ---------------------------------------------------------------------------

describe("safeRemoveConstraint", () => {
  it("removes constraint and unregisters when constraint exists", () => {
    const world = createMockWorld();
    const registry = new ConstraintRegistry();
    const constraint = createMockConstraint(10);
    registry.register(constraint);

    const result = safeRemoveConstraint(world, registry, 10, "TestSystem");

    expect(result).toBe(true);
    expect(world.removeConstraint).toHaveBeenCalledWith(constraint);
    expect(registry.get(10)).toBeUndefined();
  });

  it("returns false when constraint is absent", () => {
    const world = createMockWorld();
    const registry = new ConstraintRegistry();

    const result = safeRemoveConstraint(world, registry, 999, "TestSystem");

    expect(result).toBe(false);
    expect(world.removeConstraint).not.toHaveBeenCalled();
  });

  it("catches removal errors, logs, and still unregisters", () => {
    const world = createMockWorld();
    world.removeConstraint.mockImplementation(() => {
      throw new Error("constraint error");
    });
    const registry = new ConstraintRegistry();
    const constraint = createMockConstraint(5);
    registry.register(constraint);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = safeRemoveConstraint(world, registry, 5, "TestSystem");

    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[TestSystem] Failed to remove constraint 5:",
      expect.any(Error),
    );
    expect(registry.get(5)).toBeUndefined();

    consoleSpy.mockRestore();
  });
});
