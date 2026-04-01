// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  isWalkableTileType,
  buildWalkabilityMatrix,
  applyObjectBlocking,
  PathfindingGrid,
} from './pathfinding-grid';
import { TileType, ObjectCategory } from '@/types/procgen';
import type { CityLayout, Building } from '@/types/procgen';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a minimal CityLayout with the given tile grid and optional buildings. */
function createLayout(
  tiles: TileType[][],
  buildings: Building[] = [],
): CityLayout {
  return {
    widthTiles: tiles[0]?.length ?? 0,
    heightTiles: tiles.length,
    tiles,
    buildings,
    seed: 'test-seed',
  };
}

/** Shorthand aliases for readability. */
const W = TileType.Wall;
const F = TileType.Floor;
const R = TileType.Road;
const D = TileType.Door;

// ---------------------------------------------------------------------------
// isWalkableTileType
// ---------------------------------------------------------------------------

describe('isWalkableTileType', () => {
  it.each([
    ['Wall', TileType.Wall],
    ['Empty', TileType.Empty],
    ['Window', TileType.Window],
  ] as const)('marks %s as non-walkable', (_, type) => {
    expect(isWalkableTileType(type)).toBe(false);
  });

  it.each([
    ['Floor', TileType.Floor],
    ['Door', TileType.Door],
    ['Road', TileType.Road],
    ['Sidewalk', TileType.Sidewalk],
  ] as const)('marks %s as walkable', (_, type) => {
    expect(isWalkableTileType(type)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildWalkabilityMatrix
// ---------------------------------------------------------------------------

describe('buildWalkabilityMatrix', () => {
  it('converts tile grid to 0/1 matrix', () => {
    const layout = createLayout([
      [R, W, F],
      [W, W, D],
    ]);

    const matrix = buildWalkabilityMatrix(layout);

    expect(matrix).toEqual([
      [0, 1, 0], // Road=walkable, Wall=blocked, Floor=walkable
      [1, 1, 0], // Wall=blocked, Wall=blocked, Door=walkable
    ]);
  });

  it('handles empty layout', () => {
    const layout = createLayout([]);
    expect(buildWalkabilityMatrix(layout)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// applyObjectBlocking
// ---------------------------------------------------------------------------

describe('applyObjectBlocking', () => {
  it('marks blocking objects as non-walkable in the matrix', () => {
    const matrix = [
      [0, 0, 0],
      [0, 0, 0],
    ];

    const buildings: Building[] = [
      {
        id: 'b1',
        origin: { x: 0, y: 0 },
        width: 3,
        height: 2,
        rooms: [],
        entryPoints: [],
        objects: [
          {
            position: { x: 1, y: 0 },
            category: ObjectCategory.Furniture,
            blocksMovement: true,
            objectType: 'sofa',
          },
          {
            position: { x: 2, y: 1 },
            category: ObjectCategory.Loot,
            blocksMovement: false,
            objectType: 'medkit',
          },
        ],
      },
    ];

    applyObjectBlocking(matrix, buildings);

    expect(matrix[0][1]).toBe(1); // sofa blocks
    expect(matrix[1][2]).toBe(0); // medkit does not block
  });

  it('ignores objects outside the matrix bounds', () => {
    const matrix = [[0, 0]];
    const buildings: Building[] = [
      {
        id: 'b1',
        origin: { x: 0, y: 0 },
        width: 10,
        height: 10,
        rooms: [],
        entryPoints: [],
        objects: [
          {
            position: { x: 99, y: 99 },
            category: ObjectCategory.Debris,
            blocksMovement: true,
            objectType: 'rubble',
          },
        ],
      },
    ];

    // Should not throw
    applyObjectBlocking(matrix, buildings);
    expect(matrix).toEqual([[0, 0]]);
  });
});

// ---------------------------------------------------------------------------
// PathfindingGrid construction
// ---------------------------------------------------------------------------

describe('PathfindingGrid', () => {
  describe('fromCityLayout', () => {
    it('creates a grid with correct dimensions', () => {
      const layout = createLayout([
        [R, R, R, R, R],
        [R, W, W, W, R],
        [R, W, F, W, R],
        [R, W, W, W, R],
        [R, R, R, R, R],
      ]);

      const grid = PathfindingGrid.fromCityLayout(layout);

      expect(grid.getDimensions()).toEqual({ width: 5, height: 5 });
    });

    it('reflects tile walkability correctly', () => {
      const layout = createLayout([
        [R, W],
        [F, D],
      ]);

      const grid = PathfindingGrid.fromCityLayout(layout);

      expect(grid.isWalkable(0, 0)).toBe(true);  // Road
      expect(grid.isWalkable(1, 0)).toBe(false);  // Wall
      expect(grid.isWalkable(0, 1)).toBe(true);   // Floor
      expect(grid.isWalkable(1, 1)).toBe(true);   // Door
    });

    it('marks blocking objects as non-walkable', () => {
      const buildings: Building[] = [
        {
          id: 'b1',
          origin: { x: 0, y: 0 },
          width: 3,
          height: 3,
          rooms: [],
          entryPoints: [],
          objects: [
            {
              position: { x: 1, y: 1 },
              category: ObjectCategory.Furniture,
              blocksMovement: true,
              objectType: 'desk',
            },
          ],
        },
      ];

      const layout = createLayout(
        [
          [F, F, F],
          [F, F, F],
          [F, F, F],
        ],
        buildings,
      );

      const grid = PathfindingGrid.fromCityLayout(layout);

      expect(grid.isWalkable(1, 1)).toBe(false); // desk blocks
      expect(grid.isWalkable(0, 0)).toBe(true);  // no object here
    });
  });

  // -------------------------------------------------------------------------
  // Walkability updates
  // -------------------------------------------------------------------------

  describe('setWalkable', () => {
    it('toggles a tile from walkable to blocked', () => {
      const grid = PathfindingGrid.fromCityLayout(
        createLayout([[R, R, R]]),
      );

      expect(grid.isWalkable(1, 0)).toBe(true);

      grid.setWalkable(1, 0, false);
      expect(grid.isWalkable(1, 0)).toBe(false);

      grid.setWalkable(1, 0, true);
      expect(grid.isWalkable(1, 0)).toBe(true);
    });

    it('returns true for in-bounds updates', () => {
      const grid = PathfindingGrid.fromCityLayout(
        createLayout([[R, R]]),
      );

      expect(grid.setWalkable(0, 0, false)).toBe(true);
    });

    it('returns false for out-of-bounds coordinates', () => {
      const grid = PathfindingGrid.fromCityLayout(
        createLayout([[R]]),
      );

      expect(grid.setWalkable(-1, 0, false)).toBe(false);
      expect(grid.setWalkable(0, 99, false)).toBe(false);
    });
  });

  describe('setWalkableBatch', () => {
    it('updates multiple tiles at once', () => {
      const grid = PathfindingGrid.fromCityLayout(
        createLayout([
          [R, R, R],
          [R, R, R],
        ]),
      );

      grid.setWalkableBatch([
        { coord: { x: 0, y: 0 }, walkable: false },
        { coord: { x: 2, y: 1 }, walkable: false },
      ]);

      expect(grid.isWalkable(0, 0)).toBe(false);
      expect(grid.isWalkable(2, 1)).toBe(false);
      expect(grid.isWalkable(1, 0)).toBe(true); // untouched
    });
  });

  // -------------------------------------------------------------------------
  // Pathfinding
  // -------------------------------------------------------------------------

  describe('findPath', () => {
    it('finds a path between two walkable tiles', () => {
      // Open corridor: all roads
      const layout = createLayout([
        [R, R, R, R, R],
      ]);

      const grid = PathfindingGrid.fromCityLayout(layout);
      const result = grid.findPath({ x: 0, y: 0 }, { x: 4, y: 0 });

      expect(result.found).toBe(true);
      expect(result.path.length).toBeGreaterThanOrEqual(2);
      expect(result.path[0]).toEqual({ x: 0, y: 0 });
      expect(result.path[result.path.length - 1]).toEqual({ x: 4, y: 0 });
    });

    it('returns not-found when path is blocked', () => {
      // Wall separates start from end
      const layout = createLayout([
        [R, W, R],
      ]);

      const grid = PathfindingGrid.fromCityLayout(layout);
      const result = grid.findPath({ x: 0, y: 0 }, { x: 2, y: 0 });

      expect(result.found).toBe(false);
      expect(result.path).toEqual([]);
      expect(result.length).toBe(0);
    });

    it('routes around obstacles', () => {
      const layout = createLayout([
        [R, R, R],
        [R, W, R],
        [R, R, R],
      ]);

      const grid = PathfindingGrid.fromCityLayout(layout);
      const result = grid.findPath({ x: 0, y: 0 }, { x: 2, y: 2 });

      expect(result.found).toBe(true);
      // Path should not pass through (1,1) which is a wall
      const passesWall = result.path.some((p) => p.x === 1 && p.y === 1);
      expect(passesWall).toBe(false);
    });

    it('returns not-found for out-of-bounds start', () => {
      const grid = PathfindingGrid.fromCityLayout(
        createLayout([[R, R]]),
      );

      const result = grid.findPath({ x: -1, y: 0 }, { x: 1, y: 0 });
      expect(result.found).toBe(false);
    });

    it('returns not-found when start or end is non-walkable', () => {
      const grid = PathfindingGrid.fromCityLayout(
        createLayout([[W, R]]),
      );

      const result = grid.findPath({ x: 0, y: 0 }, { x: 1, y: 0 });
      expect(result.found).toBe(false);
    });

    it('respects runtime walkability updates (barricade blocks path)', () => {
      const layout = createLayout([
        [R, R, R],
      ]);

      const grid = PathfindingGrid.fromCityLayout(layout);

      // Before barricade: path exists
      expect(grid.findPath({ x: 0, y: 0 }, { x: 2, y: 0 }).found).toBe(true);

      // Place barricade at (1,0) — blocks the only route
      grid.setWalkable(1, 0, false);
      expect(grid.findPath({ x: 0, y: 0 }, { x: 2, y: 0 }).found).toBe(false);

      // Remove barricade — path restored
      grid.setWalkable(1, 0, true);
      expect(grid.findPath({ x: 0, y: 0 }, { x: 2, y: 0 }).found).toBe(true);
    });
  });

  describe('findSmoothedPath', () => {
    it('returns a valid smoothed path', () => {
      const layout = createLayout([
        [R, R, R, R, R],
        [R, R, R, R, R],
        [R, R, R, R, R],
      ]);

      const grid = PathfindingGrid.fromCityLayout(layout);
      const result = grid.findSmoothedPath({ x: 0, y: 0 }, { x: 4, y: 2 });

      expect(result.found).toBe(true);
      expect(result.path[0]).toEqual({ x: 0, y: 0 });
      expect(result.path[result.path.length - 1]).toEqual({ x: 4, y: 2 });
    });

    it('returns not-found when blocked', () => {
      const grid = PathfindingGrid.fromCityLayout(
        createLayout([[R, W, R]]),
      );

      const result = grid.findSmoothedPath({ x: 0, y: 0 }, { x: 2, y: 0 });
      expect(result.found).toBe(false);
    });

    it('returns not-found for out-of-bounds coordinates', () => {
      const grid = PathfindingGrid.fromCityLayout(
        createLayout([[R, R, R]]),
      );

      expect(grid.findSmoothedPath({ x: -1, y: 0 }, { x: 2, y: 0 }).found).toBe(false);
      expect(grid.findSmoothedPath({ x: 0, y: 0 }, { x: 99, y: 0 }).found).toBe(false);
    });

    it('returns not-found when start is non-walkable', () => {
      const grid = PathfindingGrid.fromCityLayout(
        createLayout([[W, R, R]]),
      );

      expect(grid.findSmoothedPath({ x: 0, y: 0 }, { x: 2, y: 0 }).found).toBe(false);
    });

    it('produces fewer waypoints than raw A* on open grid', () => {
      // 7x7 open grid — diagonal traversal
      const layout = createLayout(
        Array.from({ length: 7 }, () =>
          Array.from({ length: 7 }, () => R),
        ),
      );

      const grid = PathfindingGrid.fromCityLayout(layout);
      const raw = grid.findPath({ x: 0, y: 0 }, { x: 6, y: 6 });
      const smoothed = grid.findSmoothedPath({ x: 0, y: 0 }, { x: 6, y: 6 });

      expect(raw.found).toBe(true);
      expect(smoothed.found).toBe(true);

      // Smoothing should reduce waypoints on an open diagonal path
      expect(smoothed.path.length).toBeLessThan(raw.path.length);

      // Both should share start and end
      expect(smoothed.path[0]).toEqual(raw.path[0]);
      expect(smoothed.path[smoothed.path.length - 1]).toEqual(
        raw.path[raw.path.length - 1],
      );
    });
  });

  describe('hasPath', () => {
    it('returns true when path exists', () => {
      const grid = PathfindingGrid.fromCityLayout(
        createLayout([[R, R, R]]),
      );

      expect(grid.hasPath({ x: 0, y: 0 }, { x: 2, y: 0 })).toBe(true);
    });

    it('returns false when path is blocked', () => {
      const grid = PathfindingGrid.fromCityLayout(
        createLayout([[R, W, R]]),
      );

      expect(grid.hasPath({ x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // toMatrix / export
  // -------------------------------------------------------------------------

  describe('toMatrix', () => {
    it('exports the current walkability state', () => {
      const layout = createLayout([
        [R, W],
        [F, D],
      ]);

      const grid = PathfindingGrid.fromCityLayout(layout);
      const matrix = grid.toMatrix();

      expect(matrix).toEqual([
        [0, 1],
        [0, 0],
      ]);
    });

    it('reflects runtime walkability changes', () => {
      const grid = PathfindingGrid.fromCityLayout(
        createLayout([[R, R]]),
      );

      grid.setWalkable(0, 0, false);
      expect(grid.toMatrix()).toEqual([[1, 0]]);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('throws on zero-dimension CityLayout', () => {
      const emptyLayout: CityLayout = {
        widthTiles: 0,
        heightTiles: 0,
        tiles: [],
        buildings: [],
        seed: 'test',
      };

      expect(() => PathfindingGrid.fromCityLayout(emptyLayout)).toThrow(
        'Cannot create PathfindingGrid from empty CityLayout',
      );
    });

    it('finds a trivial path from a tile to itself', () => {
      const grid = PathfindingGrid.fromCityLayout(
        createLayout([[R, R, R]]),
      );

      const result = grid.findPath({ x: 1, y: 0 }, { x: 1, y: 0 });
      expect(result.found).toBe(true);
      expect(result.path.length).toBeGreaterThanOrEqual(1);
    });

    it('returns distinct objects for separate no-path results', () => {
      const grid = PathfindingGrid.fromCityLayout(
        createLayout([[R, W, R]]),
      );

      const r1 = grid.findPath({ x: 0, y: 0 }, { x: 2, y: 0 });
      const r2 = grid.findPath({ x: 0, y: 0 }, { x: 2, y: 0 });

      expect(r1).not.toBe(r2);
      expect(r1.path).not.toBe(r2.path);
    });

    it('treats Empty tiles as non-walkable in the grid', () => {
      const E = TileType.Empty;
      const grid = PathfindingGrid.fromCityLayout(
        createLayout([
          [R, E, R],
        ]),
      );

      expect(grid.isWalkable(1, 0)).toBe(false);
      expect(grid.findPath({ x: 0, y: 0 }, { x: 2, y: 0 }).found).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // A* acceptance: map edge → safehouse center
  // -------------------------------------------------------------------------

  describe('acceptance: path from map edge to safehouse', () => {
    it('finds path from edge to building interior through door', () => {
      // 7x7 city: road border, wall building with one door, floor interior
      const layout = createLayout([
        [R, R, R, R, R, R, R],
        [R, W, W, D, W, W, R],
        [R, W, F, F, F, W, R],
        [R, W, F, F, F, W, R],
        [R, W, F, F, F, W, R],
        [R, W, W, W, W, W, R],
        [R, R, R, R, R, R, R],
      ]);

      const grid = PathfindingGrid.fromCityLayout(layout);

      // Path from top-left road corner to building center
      const result = grid.findPath({ x: 0, y: 0 }, { x: 3, y: 3 });

      expect(result.found).toBe(true);
      expect(result.path[0]).toEqual({ x: 0, y: 0 });
      expect(result.path[result.path.length - 1]).toEqual({ x: 3, y: 3 });

      // Path must pass through the door at (3,1)
      const passesDoor = result.path.some((p) => p.x === 3 && p.y === 1);
      expect(passesDoor).toBe(true);
    });
  });
});
