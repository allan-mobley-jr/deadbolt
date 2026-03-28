import { describe, it, expect, beforeEach } from "vitest";
import { BodyRegistry } from "./body-registry";

function mockBody(id: number): MatterJS.BodyType {
  return {
    id,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    speed: 0,
    angularVelocity: 0,
  } as unknown as MatterJS.BodyType;
}

describe("BodyRegistry", () => {
  let registry: BodyRegistry;

  beforeEach(() => {
    registry = new BodyRegistry();
  });

  it("starts empty", () => {
    expect(registry.size).toBe(0);
  });

  it("registers and retrieves a body by id", () => {
    const body = mockBody(42);
    registry.register(body);
    expect(registry.get(42)).toBe(body);
    expect(registry.size).toBe(1);
  });

  it("returns undefined for unregistered id", () => {
    expect(registry.get(999)).toBeUndefined();
  });

  it("unregisters a body", () => {
    const body = mockBody(7);
    registry.register(body);
    registry.unregister(7);
    expect(registry.get(7)).toBeUndefined();
    expect(registry.size).toBe(0);
  });

  it("unregistering a non-existent id does not throw", () => {
    expect(() => registry.unregister(123)).not.toThrow();
  });

  it("clears all entries", () => {
    registry.register(mockBody(1));
    registry.register(mockBody(2));
    registry.register(mockBody(3));
    expect(registry.size).toBe(3);

    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.get(1)).toBeUndefined();
  });

  it("overwrites a body with the same id", () => {
    const bodyA = mockBody(5);
    const bodyB = mockBody(5);
    registry.register(bodyA);
    registry.register(bodyB);
    expect(registry.get(5)).toBe(bodyB);
    expect(registry.size).toBe(1);
  });
});
