import { describe, it, expect, beforeEach, vi } from "vitest";
import { WallAnchorRegistry, SNAP_RADIUS } from "./wall-anchor-registry";
import { BodyRegistry } from "./body-registry";
import type { EntryPoint } from "@/types/procgen";
import { TILE_SIZE } from "@/game/procgen/constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextBodyId = 1000;

function createMockMatterAdd() {
  return {
    rectangle: vi.fn((_x: number, _y: number, _w: number, _h: number, _opts: Record<string, unknown>) => {
      const id = nextBodyId++;
      return {
        id,
        position: { x: _x, y: _y },
        velocity: { x: 0, y: 0 },
        speed: 0,
        angularVelocity: 0,
      } as unknown as MatterJS.BodyType;
    }),
  };
}

function createEntryPoint(
  x: number,
  y: number,
  type: "door" | "window",
  facingDirection: "north" | "south" | "east" | "west",
): EntryPoint {
  return {
    position: { x, y },
    type,
    facingDirection,
    roomIndex: 0,
    barricaded: false,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WallAnchorRegistry", () => {
  let registry: WallAnchorRegistry;
  let bodyRegistry: BodyRegistry;

  beforeEach(() => {
    registry = new WallAnchorRegistry();
    bodyRegistry = new BodyRegistry();
    nextBodyId = 1000;
  });

  it("starts empty", () => {
    expect(registry.size).toBe(0);
    expect(registry.getAll()).toHaveLength(0);
  });

  describe("createAnchors", () => {
    it("creates anchor pairs for each entry point", () => {
      const entryPoints = [
        createEntryPoint(5, 3, "door", "north"),
        createEntryPoint(8, 6, "window", "east"),
      ];
      const matterAdd = createMockMatterAdd();

      registry.createAnchors(entryPoints, matterAdd, bodyRegistry);

      expect(registry.size).toBe(2);
      expect(matterAdd.rectangle).toHaveBeenCalledTimes(4); // 2 anchors per EP
    });

    it("assigns correct entry point indices", () => {
      const entryPoints = [
        createEntryPoint(5, 3, "door", "north"),
        createEntryPoint(8, 6, "window", "east"),
      ];

      registry.createAnchors(entryPoints, createMockMatterAdd(), bodyRegistry);

      const pairs = registry.getAll();
      expect(pairs[0].entryPointIndex).toBe(0);
      expect(pairs[1].entryPointIndex).toBe(1);
    });

    it("registers all anchor bodies in the body registry", () => {
      const entryPoints = [createEntryPoint(5, 3, "door", "south")];
      registry.createAnchors(entryPoints, createMockMatterAdd(), bodyRegistry);

      const pair = registry.getAll()[0];
      expect(bodyRegistry.get(pair.anchorBodyIdA)).toBeDefined();
      expect(bodyRegistry.get(pair.anchorBodyIdB)).toBeDefined();
    });

    it("computes horizontal orientation for north-facing entry points", () => {
      const entryPoints = [createEntryPoint(5, 3, "door", "north")];
      registry.createAnchors(entryPoints, createMockMatterAdd(), bodyRegistry);

      const pair = registry.getAll()[0];
      expect(pair.orientation).toBe("horizontal");
    });

    it("computes horizontal orientation for south-facing entry points", () => {
      const entryPoints = [createEntryPoint(5, 3, "door", "south")];
      registry.createAnchors(entryPoints, createMockMatterAdd(), bodyRegistry);

      const pair = registry.getAll()[0];
      expect(pair.orientation).toBe("horizontal");
    });

    it("computes vertical orientation for east-facing entry points", () => {
      const entryPoints = [createEntryPoint(5, 3, "window", "east")];
      registry.createAnchors(entryPoints, createMockMatterAdd(), bodyRegistry);

      const pair = registry.getAll()[0];
      expect(pair.orientation).toBe("vertical");
    });

    it("computes vertical orientation for west-facing entry points", () => {
      const entryPoints = [createEntryPoint(5, 3, "window", "west")];
      registry.createAnchors(entryPoints, createMockMatterAdd(), bodyRegistry);

      const pair = registry.getAll()[0];
      expect(pair.orientation).toBe("vertical");
    });

    it("positions anchors at tile center", () => {
      const entryPoints = [createEntryPoint(5, 3, "door", "north")];
      registry.createAnchors(entryPoints, createMockMatterAdd(), bodyRegistry);

      const pair = registry.getAll()[0];
      const expectedCX = 5 * TILE_SIZE + TILE_SIZE / 2;
      const expectedCY = 3 * TILE_SIZE + TILE_SIZE / 2;
      expect(pair.centerX).toBe(expectedCX);
      expect(pair.centerY).toBe(expectedCY);
    });
  });

  describe("findSnapTarget", () => {
    it("returns null when no anchors exist", () => {
      expect(registry.findSnapTarget(100, 100)).toBeNull();
    });

    it("returns the anchor pair when point is within SNAP_RADIUS", () => {
      const entryPoints = [createEntryPoint(5, 3, "door", "north")];
      registry.createAnchors(entryPoints, createMockMatterAdd(), bodyRegistry);

      const pair = registry.getAll()[0];
      // Test at the exact center
      const result = registry.findSnapTarget(pair.centerX, pair.centerY);
      expect(result).toBe(pair);
    });

    it("returns null when point is outside SNAP_RADIUS", () => {
      const entryPoints = [createEntryPoint(5, 3, "door", "north")];
      registry.createAnchors(entryPoints, createMockMatterAdd(), bodyRegistry);

      const pair = registry.getAll()[0];
      // Point far away
      const result = registry.findSnapTarget(
        pair.centerX + SNAP_RADIUS + 10,
        pair.centerY + SNAP_RADIUS + 10,
      );
      expect(result).toBeNull();
    });

    it("returns the nearest anchor when multiple are close", () => {
      const entryPoints = [
        createEntryPoint(5, 3, "door", "north"),
        createEntryPoint(5, 5, "door", "south"),
      ];
      registry.createAnchors(entryPoints, createMockMatterAdd(), bodyRegistry);

      const pairs = registry.getAll();
      // Test a point closest to the first pair
      const result = registry.findSnapTarget(pairs[0].centerX, pairs[0].centerY + 1);
      expect(result?.entryPointIndex).toBe(0);
    });
  });

  describe("getByEntryPointIndex", () => {
    it("returns the correct pair by index", () => {
      const entryPoints = [
        createEntryPoint(5, 3, "door", "north"),
        createEntryPoint(8, 6, "window", "east"),
      ];
      registry.createAnchors(entryPoints, createMockMatterAdd(), bodyRegistry);

      const pair = registry.getByEntryPointIndex(1);
      expect(pair?.entryPointIndex).toBe(1);
    });

    it("returns undefined for non-existent index", () => {
      expect(registry.getByEntryPointIndex(99)).toBeUndefined();
    });
  });

  describe("clear", () => {
    it("removes all anchor pairs", () => {
      const entryPoints = [createEntryPoint(5, 3, "door", "north")];
      registry.createAnchors(entryPoints, createMockMatterAdd(), bodyRegistry);
      expect(registry.size).toBe(1);

      registry.clear();
      expect(registry.size).toBe(0);
      expect(registry.getAll()).toHaveLength(0);
    });
  });
});
