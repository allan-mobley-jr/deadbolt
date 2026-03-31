import { describe, it, expect, beforeEach } from "vitest";
import { useMinimapStore } from "./useMinimapStore";

beforeEach(() => {
  useMinimapStore.getState().reset();
});

describe("useMinimapStore", () => {
  it("starts with zeroed positions and uninitialised flag", () => {
    const state = useMinimapStore.getState();
    expect(state.playerPosition).toEqual({ x: 0, y: 0 });
    expect(state.zombiePositions).toEqual([]);
    expect(state.safehouseCenter).toEqual({ x: 0, y: 0 });
    expect(state.mapWidth).toBe(0);
    expect(state.mapHeight).toBe(0);
    expect(state.initialised).toBe(false);
  });

  it("setMapBounds sets dimensions, safehouse, and initialised flag", () => {
    useMinimapStore.getState().setMapBounds(8192, 8192, { x: 4096, y: 4096 });
    const state = useMinimapStore.getState();
    expect(state.mapWidth).toBe(8192);
    expect(state.mapHeight).toBe(8192);
    expect(state.safehouseCenter).toEqual({ x: 4096, y: 4096 });
    expect(state.initialised).toBe(true);
  });

  it("updatePositions sets player and zombie positions", () => {
    useMinimapStore.getState().updatePositions(
      { x: 100, y: 200 },
      [{ x: 300, y: 400 }, { x: 500, y: 600 }],
    );
    const state = useMinimapStore.getState();
    expect(state.playerPosition).toEqual({ x: 100, y: 200 });
    expect(state.zombiePositions).toHaveLength(2);
    expect(state.zombiePositions[0]).toEqual({ x: 300, y: 400 });
  });

  it("reset returns to initial state", () => {
    useMinimapStore.getState().setMapBounds(8192, 8192, { x: 4096, y: 4096 });
    useMinimapStore.getState().updatePositions(
      { x: 100, y: 200 },
      [{ x: 300, y: 400 }],
    );
    useMinimapStore.getState().reset();

    const state = useMinimapStore.getState();
    expect(state.initialised).toBe(false);
    expect(state.mapWidth).toBe(0);
    expect(state.playerPosition).toEqual({ x: 0, y: 0 });
    expect(state.zombiePositions).toEqual([]);
  });
});
