import { describe, it, expect } from "vitest";
import {
  TileType,
  TILE_PROPERTIES,
  TILE_SIZE,
  RENDERABLE_TILE_COUNT,
} from "./tile-types";

describe("TileType enum", () => {
  it("has the expected integer values matching procgen convention", () => {
    expect(TileType.Empty).toBe(0);
    expect(TileType.Wall).toBe(1);
    expect(TileType.Floor).toBe(2);
    expect(TileType.Door).toBe(3);
    expect(TileType.Window).toBe(4);
    expect(TileType.Road).toBe(5);
    expect(TileType.Sidewalk).toBe(6);
    expect(TileType.Grass).toBe(7);
  });

  it("TILE_SIZE is 32", () => {
    expect(TILE_SIZE).toBe(32);
  });

  it("RENDERABLE_TILE_COUNT excludes Empty", () => {
    // 7 renderable types: Wall, Floor, Door, Window, Road, Sidewalk, Grass
    expect(RENDERABLE_TILE_COUNT).toBe(7);
  });
});

describe("TILE_PROPERTIES", () => {
  it("has an entry for every TileType value", () => {
    const numericValues = Object.values(TileType).filter(
      (v): v is number => typeof v === "number",
    );
    for (const value of numericValues) {
      expect(TILE_PROPERTIES[value as TileType]).toBeDefined();
    }
  });

  it("Wall and Window are the only colliding types", () => {
    const colliding = Object.entries(TILE_PROPERTIES)
      .filter(([, props]) => props.collides)
      .map(([key]) => Number(key));

    expect(colliding).toHaveLength(2);
    expect(colliding).toContain(TileType.Wall);
    expect(colliding).toContain(TileType.Window);
  });

  it("Door does not collide (walkable)", () => {
    expect(TILE_PROPERTIES[TileType.Door].collides).toBe(false);
  });

  it("Floor does not collide", () => {
    expect(TILE_PROPERTIES[TileType.Floor].collides).toBe(false);
  });

  it("every entry has a non-empty label", () => {
    for (const props of Object.values(TILE_PROPERTIES)) {
      expect(props.label.length).toBeGreaterThan(0);
    }
  });

  it("every colour is a valid 24-bit integer", () => {
    for (const props of Object.values(TILE_PROPERTIES)) {
      expect(props.color).toBeGreaterThanOrEqual(0x000000);
      expect(props.color).toBeLessThanOrEqual(0xffffff);
    }
  });
});
