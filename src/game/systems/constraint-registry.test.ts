import { describe, it, expect, beforeEach } from "vitest";
import { ConstraintRegistry } from "./constraint-registry";

function mockConstraint(id: number): MatterJS.ConstraintType {
  return {
    id,
    bodyA: null,
    bodyB: null,
    pointA: { x: 0, y: 0 },
    pointB: { x: 0, y: 0 },
    stiffness: 0.8,
    length: 0,
  } as unknown as MatterJS.ConstraintType;
}

describe("ConstraintRegistry", () => {
  let registry: ConstraintRegistry;

  beforeEach(() => {
    registry = new ConstraintRegistry();
  });

  it("starts empty", () => {
    expect(registry.size).toBe(0);
  });

  it("registers and retrieves a constraint by id", () => {
    const constraint = mockConstraint(42);
    registry.register(constraint);
    expect(registry.get(42)).toBe(constraint);
    expect(registry.size).toBe(1);
  });

  it("returns undefined for unregistered id", () => {
    expect(registry.get(999)).toBeUndefined();
  });

  it("unregisters a constraint", () => {
    const constraint = mockConstraint(7);
    registry.register(constraint);
    registry.unregister(7);
    expect(registry.get(7)).toBeUndefined();
    expect(registry.size).toBe(0);
  });

  it("unregistering a non-existent id does not throw", () => {
    expect(() => registry.unregister(123)).not.toThrow();
  });

  it("clears all entries", () => {
    registry.register(mockConstraint(1));
    registry.register(mockConstraint(2));
    registry.register(mockConstraint(3));
    expect(registry.size).toBe(3);

    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.get(1)).toBeUndefined();
  });

  it("overwrites a constraint with the same id", () => {
    const constraintA = mockConstraint(5);
    const constraintB = mockConstraint(5);
    registry.register(constraintA);
    registry.register(constraintB);
    expect(registry.get(5)).toBe(constraintB);
    expect(registry.size).toBe(1);
  });

  it("handles multiple constraints independently", () => {
    const c1 = mockConstraint(10);
    const c2 = mockConstraint(20);
    registry.register(c1);
    registry.register(c2);

    expect(registry.size).toBe(2);
    expect(registry.get(10)).toBe(c1);
    expect(registry.get(20)).toBe(c2);

    registry.unregister(10);
    expect(registry.size).toBe(1);
    expect(registry.get(10)).toBeUndefined();
    expect(registry.get(20)).toBe(c2);
  });
});
