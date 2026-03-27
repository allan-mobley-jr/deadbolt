// @vitest-environment node

/**
 * Comprehensive tests for the WFC city layout generator.
 *
 * Covers: socket compatibility, tile definitions, entropy, constraint
 * propagation, solver, macro-to-tile expansion, building extraction,
 * fallback generator, full pipeline, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import seedrandom from 'seedrandom';
import type { PRNG } from 'seedrandom';
import { TileType } from '@/types/procgen';
import { WFC } from './constants';
import {
  EXPANSION_PATTERNS,
  isBuildingTile,
  isRoadTile,
  MACRO_TILE_COUNT,
  MacroTileType,
  socketsCompatible,
  TILE_DEFINITIONS,
  TILE_WEIGHT_LOG_WEIGHTS,
  TILE_WEIGHTS,
  type Socket,
} from './wfc-tiles';
import {
  debugMacroGrid,
  expandMacroGrid,
  extractBuildings,
  generateCityLayout,
  generateFallbackGrid,
  solveMacroGrid,
  validateMacroGrid,
} from './wfc';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRng(seed = 'test-seed'): PRNG {
  return seedrandom(seed);
}

// ---------------------------------------------------------------------------
// Socket compatibility
// ---------------------------------------------------------------------------

describe('socketsCompatible', () => {
  it('R matches only R', () => {
    expect(socketsCompatible('R', 'R')).toBe(true);
    expect(socketsCompatible('R', 'S')).toBe(false);
    expect(socketsCompatible('R', 'O')).toBe(false);
  });

  it('S matches S and O', () => {
    expect(socketsCompatible('S', 'S')).toBe(true);
    expect(socketsCompatible('S', 'O')).toBe(true);
    expect(socketsCompatible('S', 'R')).toBe(false);
  });

  it('O matches S and O', () => {
    expect(socketsCompatible('O', 'S')).toBe(true);
    expect(socketsCompatible('O', 'O')).toBe(true);
    expect(socketsCompatible('O', 'R')).toBe(false);
  });

  it('is symmetric', () => {
    const sockets: Socket[] = ['R', 'S', 'O'];
    for (const a of sockets) {
      for (const b of sockets) {
        expect(socketsCompatible(a, b)).toBe(socketsCompatible(b, a));
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Tile definitions
// ---------------------------------------------------------------------------

describe('tile definitions', () => {
  it('has exactly MACRO_TILE_COUNT definitions', () => {
    expect(TILE_DEFINITIONS.length).toBe(MACRO_TILE_COUNT);
  });

  it('tile type indices match array positions', () => {
    for (let i = 0; i < MACRO_TILE_COUNT; i++) {
      expect(TILE_DEFINITIONS[i].type).toBe(i);
    }
  });

  it('all definitions have valid socket labels', () => {
    const validSockets = new Set(['R', 'S', 'O']);
    for (const def of TILE_DEFINITIONS) {
      expect(validSockets.has(def.sockets.north)).toBe(true);
      expect(validSockets.has(def.sockets.south)).toBe(true);
      expect(validSockets.has(def.sockets.east)).toBe(true);
      expect(validSockets.has(def.sockets.west)).toBe(true);
    }
  });

  it('all weights are positive', () => {
    for (const def of TILE_DEFINITIONS) {
      expect(def.weight).toBeGreaterThan(0);
    }
  });

  it('building tiles have buildingClass set', () => {
    const classes = new Set(['residential', 'commercial', 'industrial']);
    for (const def of TILE_DEFINITIONS) {
      if (isBuildingTile(def.type)) {
        expect(classes.has(def.buildingClass!)).toBe(true);
      }
    }
  });

  it('non-building tiles do not have buildingClass', () => {
    for (const def of TILE_DEFINITIONS) {
      if (!isBuildingTile(def.type)) {
        expect(def.buildingClass).toBeUndefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Expansion patterns
// ---------------------------------------------------------------------------

describe('expansion patterns', () => {
  it('every macro tile type has an 8×8 pattern', () => {
    for (let t = 0; t < MACRO_TILE_COUNT; t++) {
      const pattern = EXPANSION_PATTERNS[t as MacroTileType];
      expect(pattern).toBeDefined();
      expect(pattern.length).toBe(WFC.MACRO_TILE_SIZE);
      for (const row of pattern) {
        expect(row.length).toBe(WFC.MACRO_TILE_SIZE);
      }
    }
  });

  it('road tile north R-socket edge has road in cols 2-5', () => {
    for (let t = 0; t < MACRO_TILE_COUNT; t++) {
      const def = TILE_DEFINITIONS[t];
      if (def.sockets.north !== 'R') continue;
      const pattern = EXPANSION_PATTERNS[t as MacroTileType];
      // First two rows, cols 2-5 should be Road
      for (let row = 0; row < 2; row++) {
        for (let col = 2; col < 6; col++) {
          expect(pattern[row][col]).toBe(
            TileType.Road,
          );
        }
      }
    }
  });

  it('road tile south R-socket edge has road in cols 2-5', () => {
    for (let t = 0; t < MACRO_TILE_COUNT; t++) {
      const def = TILE_DEFINITIONS[t];
      if (def.sockets.south !== 'R') continue;
      const pattern = EXPANSION_PATTERNS[t as MacroTileType];
      for (let row = 6; row < 8; row++) {
        for (let col = 2; col < 6; col++) {
          expect(pattern[row][col]).toBe(TileType.Road);
        }
      }
    }
  });

  it('road tile east R-socket edge has road in rows 2-5', () => {
    for (let t = 0; t < MACRO_TILE_COUNT; t++) {
      const def = TILE_DEFINITIONS[t];
      if (def.sockets.east !== 'R') continue;
      const pattern = EXPANSION_PATTERNS[t as MacroTileType];
      for (let row = 2; row < 6; row++) {
        for (let col = 6; col < 8; col++) {
          expect(pattern[row][col]).toBe(TileType.Road);
        }
      }
    }
  });

  it('road tile west R-socket edge has road in rows 2-5', () => {
    for (let t = 0; t < MACRO_TILE_COUNT; t++) {
      const def = TILE_DEFINITIONS[t];
      if (def.sockets.west !== 'R') continue;
      const pattern = EXPANSION_PATTERNS[t as MacroTileType];
      for (let row = 2; row < 6; row++) {
        for (let col = 0; col < 2; col++) {
          expect(pattern[row][col]).toBe(TileType.Road);
        }
      }
    }
  });

  it('road tile S-socket north edge is all sidewalk', () => {
    for (let t = 0; t < MACRO_TILE_COUNT; t++) {
      const def = TILE_DEFINITIONS[t];
      if (!isRoadTile(def.type) || def.sockets.north !== 'S') continue;
      const pattern = EXPANSION_PATTERNS[t as MacroTileType];
      for (let col = 0; col < 8; col++) {
        expect(pattern[0][col]).toBe(TileType.Sidewalk);
        expect(pattern[1][col]).toBe(TileType.Sidewalk);
      }
    }
  });

  it('building tiles expand to all Empty', () => {
    for (const type of [
      MacroTileType.BUILDING_RESIDENTIAL,
      MacroTileType.BUILDING_COMMERCIAL,
      MacroTileType.BUILDING_INDUSTRIAL,
    ]) {
      const pattern = EXPANSION_PATTERNS[type];
      for (const row of pattern) {
        for (const cell of row) {
          expect(cell).toBe(TileType.Empty);
        }
      }
    }
  });

  it('parking lot expands to all Road', () => {
    const pattern = EXPANSION_PATTERNS[MacroTileType.PARKING_LOT];
    for (const row of pattern) {
      for (const cell of row) {
        expect(cell).toBe(TileType.Road);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Tile category helpers
// ---------------------------------------------------------------------------

describe('tile category helpers', () => {
  it('isRoadTile identifies all 11 road variants', () => {
    let count = 0;
    for (let t = 0; t < MACRO_TILE_COUNT; t++) {
      if (isRoadTile(t as MacroTileType)) count++;
    }
    expect(count).toBe(11);
  });

  it('isBuildingTile identifies all 3 building types', () => {
    let count = 0;
    for (let t = 0; t < MACRO_TILE_COUNT; t++) {
      if (isBuildingTile(t as MacroTileType)) count++;
    }
    expect(count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// WFC solver
// ---------------------------------------------------------------------------

describe('solveMacroGrid', () => {
  it('returns a valid grid for small sizes', () => {
    const rng = makeRng('small-grid');
    const grid = solveMacroGrid(4, 4, rng);
    expect(grid).not.toBeNull();
    expect(grid!.length).toBe(4);
    expect(grid![0].length).toBe(4);
  });

  it('all cells are valid MacroTileType values', () => {
    const rng = makeRng('valid-tiles');
    const grid = solveMacroGrid(6, 6, rng);
    expect(grid).not.toBeNull();
    for (const row of grid!) {
      for (const cell of row) {
        expect(cell).toBeGreaterThanOrEqual(0);
        expect(cell).toBeLessThan(MACRO_TILE_COUNT);
      }
    }
  });

  it('is deterministic: same seed produces same grid', () => {
    const grid1 = solveMacroGrid(8, 8, makeRng('determinism'));
    const grid2 = solveMacroGrid(8, 8, makeRng('determinism'));
    expect(grid1).toEqual(grid2);
  });

  it('different seeds produce different grids', () => {
    const grid1 = solveMacroGrid(8, 8, makeRng('seed-a'));
    const grid2 = solveMacroGrid(8, 8, makeRng('seed-b'));
    expect(grid1).not.toBeNull();
    expect(grid2).not.toBeNull();
    // Grids should differ in at least some cells
    let differences = 0;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (grid1![y][x] !== grid2![y][x]) differences++;
      }
    }
    expect(differences).toBeGreaterThan(0);
  });

  it('border cells never have R sockets facing outward', () => {
    const rng = makeRng('border-check');
    const grid = solveMacroGrid(8, 8, rng);
    expect(grid).not.toBeNull();
    const w = 8;
    const h = 8;

    // North border
    for (let x = 0; x < w; x++) {
      expect(TILE_DEFINITIONS[grid![0][x]].sockets.north).not.toBe('R');
    }
    // South border
    for (let x = 0; x < w; x++) {
      expect(TILE_DEFINITIONS[grid![h - 1][x]].sockets.south).not.toBe('R');
    }
    // West border
    for (let y = 0; y < h; y++) {
      expect(TILE_DEFINITIONS[grid![y][0]].sockets.west).not.toBe('R');
    }
    // East border
    for (let y = 0; y < h; y++) {
      expect(TILE_DEFINITIONS[grid![y][w - 1]].sockets.east).not.toBe('R');
    }
  });

  it('all adjacent cells have compatible sockets when solver succeeds', () => {
    // WFC can hit contradictions on some seeds — try several until one succeeds
    const seeds = ['adj-1', 'adj-2', 'adj-3', 'adj-4', 'adj-5',
      'adj-6', 'adj-7', 'adj-8', 'adj-9', 'adj-10'];
    let grid: MacroTileType[][] | null = null;
    for (const seed of seeds) {
      grid = solveMacroGrid(8, 8, makeRng(seed));
      if (grid) break;
    }
    expect(grid).not.toBeNull();
    const w = 8;
    const h = 8;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const def = TILE_DEFINITIONS[grid![y][x]];
        // East neighbour
        if (x + 1 < w) {
          const nDef = TILE_DEFINITIONS[grid![y][x + 1]];
          expect(socketsCompatible(def.sockets.east, nDef.sockets.west)).toBe(
            true,
          );
        }
        // South neighbour
        if (y + 1 < h) {
          const nDef = TILE_DEFINITIONS[grid![y + 1][x]];
          expect(
            socketsCompatible(def.sockets.south, nDef.sockets.north),
          ).toBe(true);
        }
      }
    }
  });

  it('succeeds for a majority of seeds on 8×8 grid', () => {
    // WFC can hit contradictions — we expect most seeds to succeed
    const seeds = [
      'alpha', 'beta', 'gamma', 'delta', 'epsilon',
      'zeta', 'eta', 'theta', 'iota', 'kappa',
    ];
    let successes = 0;
    for (const seed of seeds) {
      const grid = solveMacroGrid(8, 8, makeRng(seed));
      if (grid) successes++;
    }
    // At least 50% of seeds should succeed in a single attempt
    expect(successes).toBeGreaterThanOrEqual(seeds.length / 2);
  });
});

// ---------------------------------------------------------------------------
// Macro grid validation
// ---------------------------------------------------------------------------

describe('validateMacroGrid', () => {
  it('accepts a known-valid fallback grid', () => {
    // The fallback grid is deterministic and always has connected roads
    const grid = generateFallbackGrid(16, 16, makeRng('validate-ok'));
    expect(validateMacroGrid(grid, 16, 16)).toBe(true);
  });

  it('rejects a grid with zero roads', () => {
    const grid: MacroTileType[][] = Array.from({ length: 4 }, () =>
      new Array<MacroTileType>(4).fill(MacroTileType.BUILDING_RESIDENTIAL),
    );
    expect(validateMacroGrid(grid, 4, 4)).toBe(false);
  });

  it('rejects a grid with zero buildings', () => {
    const grid: MacroTileType[][] = Array.from({ length: 4 }, () =>
      new Array<MacroTileType>(4).fill(MacroTileType.ROAD_CROSS),
    );
    expect(validateMacroGrid(grid, 4, 4)).toBe(false);
  });

  it('rejects disconnected road networks', () => {
    // 10×10 grid with enough roads and buildings but two isolated road clusters
    const grid: MacroTileType[][] = Array.from({ length: 10 }, () =>
      new Array<MacroTileType>(10).fill(MacroTileType.BUILDING_RESIDENTIAL),
    );
    // Cluster 1: connected NS road in column 2, rows 1-4
    grid[1][2] = MacroTileType.ROAD_NS;
    grid[2][2] = MacroTileType.ROAD_NS;
    grid[3][2] = MacroTileType.ROAD_NS;
    grid[4][2] = MacroTileType.ROAD_NS;
    // Cluster 2: connected NS road in column 7, rows 6-9
    grid[6][7] = MacroTileType.ROAD_NS;
    grid[7][7] = MacroTileType.ROAD_NS;
    grid[8][7] = MacroTileType.ROAD_NS;
    grid[9][7] = MacroTileType.ROAD_NS;
    // 8 roads / 100 = 0.08 — still below MIN_ROAD_FRACTION (0.12)
    // Add more roads to cluster 1 to meet the threshold
    grid[1][3] = MacroTileType.ROAD_EW;
    grid[1][4] = MacroTileType.ROAD_EW;
    grid[6][8] = MacroTileType.ROAD_EW;
    grid[6][9] = MacroTileType.ROAD_EW;
    // Now 12 roads / 100 = 0.12, meeting the threshold
    // But the two clusters are not connected → should reject
    expect(validateMacroGrid(grid, 10, 10)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fallback grid generator
// ---------------------------------------------------------------------------

describe('generateFallbackGrid', () => {
  it('returns a grid of the correct dimensions', () => {
    const grid = generateFallbackGrid(8, 8, makeRng('fallback'));
    expect(grid.length).toBe(8);
    for (const row of grid) {
      expect(row.length).toBe(8);
    }
  });

  it('border cells are empty lots', () => {
    const grid = generateFallbackGrid(8, 8, makeRng('fallback-border'));
    // Top and bottom rows
    for (let x = 0; x < 8; x++) {
      expect(grid[0][x]).toBe(MacroTileType.EMPTY_LOT);
      expect(grid[7][x]).toBe(MacroTileType.EMPTY_LOT);
    }
    // Left and right columns
    for (let y = 0; y < 8; y++) {
      expect(grid[y][0]).toBe(MacroTileType.EMPTY_LOT);
      expect(grid[y][7]).toBe(MacroTileType.EMPTY_LOT);
    }
  });

  it('contains road tiles in interior', () => {
    const grid = generateFallbackGrid(16, 16, makeRng('fallback-roads'));
    let hasRoad = false;
    for (let y = 1; y < 15; y++) {
      for (let x = 1; x < 15; x++) {
        if (isRoadTile(grid[y][x])) hasRoad = true;
      }
    }
    expect(hasRoad).toBe(true);
  });

  it('contains building tiles in interior', () => {
    const grid = generateFallbackGrid(16, 16, makeRng('fallback-buildings'));
    let hasBuilding = false;
    for (let y = 1; y < 15; y++) {
      for (let x = 1; x < 15; x++) {
        if (isBuildingTile(grid[y][x])) hasBuilding = true;
      }
    }
    expect(hasBuilding).toBe(true);
  });

  it('is deterministic', () => {
    const g1 = generateFallbackGrid(8, 8, makeRng('det'));
    const g2 = generateFallbackGrid(8, 8, makeRng('det'));
    expect(g1).toEqual(g2);
  });

  it('passes validateMacroGrid', () => {
    const grid = generateFallbackGrid(16, 16, makeRng('fallback-valid'));
    expect(validateMacroGrid(grid, 16, 16)).toBe(true);
  });

  it('has correct road tile types at grid positions', () => {
    const grid = generateFallbackGrid(16, 16, makeRng('fallback-structure'));
    // With FALLBACK_ROAD_INTERVAL=4, roads at y%4===1 and x%4===1
    // Intersection: both road row and road col
    expect(grid[1][1]).toBe(MacroTileType.ROAD_CROSS);
    // Road row, non-road col
    expect(grid[1][2]).toBe(MacroTileType.ROAD_EW);
    // Road col, non-road row
    expect(grid[2][1]).toBe(MacroTileType.ROAD_NS);
    // Non-road cell is a building
    expect(isBuildingTile(grid[2][2])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Macro-to-tile expansion
// ---------------------------------------------------------------------------

describe('expandMacroGrid', () => {
  it('output dimensions match macro grid × MACRO_TILE_SIZE', () => {
    const macroGrid: MacroTileType[][] = [
      [MacroTileType.ROAD_NS, MacroTileType.BUILDING_RESIDENTIAL],
      [MacroTileType.PARK, MacroTileType.ROAD_EW],
    ];
    const tiles = expandMacroGrid(macroGrid, 2, 2);
    expect(tiles.length).toBe(2 * WFC.MACRO_TILE_SIZE);
    expect(tiles[0].length).toBe(2 * WFC.MACRO_TILE_SIZE);
  });

  it('road tiles produce Road and Sidewalk tile types', () => {
    const macroGrid: MacroTileType[][] = [[MacroTileType.ROAD_NS]];
    const tiles = expandMacroGrid(macroGrid, 1, 1);
    let hasRoad = false;
    let hasSidewalk = false;
    for (const row of tiles) {
      for (const cell of row) {
        if (cell === TileType.Road) hasRoad = true;
        if (cell === TileType.Sidewalk) hasSidewalk = true;
      }
    }
    expect(hasRoad).toBe(true);
    expect(hasSidewalk).toBe(true);
  });

  it('building tiles produce only Empty tile types', () => {
    const macroGrid: MacroTileType[][] = [
      [MacroTileType.BUILDING_COMMERCIAL],
    ];
    const tiles = expandMacroGrid(macroGrid, 1, 1);
    for (const row of tiles) {
      for (const cell of row) {
        expect(cell).toBe(TileType.Empty);
      }
    }
  });

  it('adjacent road tiles produce continuous road at shared edge', () => {
    // Two NS roads side by side vertically
    const macroGrid: MacroTileType[][] = [
      [MacroTileType.ROAD_NS],
      [MacroTileType.ROAD_NS],
    ];
    const tiles = expandMacroGrid(macroGrid, 1, 2);
    const sz = WFC.MACRO_TILE_SIZE;
    // At the boundary (row sz-1 of first tile and row 0 of second tile = rows 7 and 8)
    // Both should have road in cols 2-5
    for (let col = 2; col < 6; col++) {
      expect(tiles[sz - 1][col]).toBe(TileType.Road);
      expect(tiles[sz][col]).toBe(TileType.Road);
    }
  });
});

// ---------------------------------------------------------------------------
// Building extraction
// ---------------------------------------------------------------------------

describe('extractBuildings', () => {
  it('extracts buildings from building macro cells', () => {
    const macroGrid: MacroTileType[][] = [
      [MacroTileType.ROAD_NS, MacroTileType.BUILDING_RESIDENTIAL],
      [MacroTileType.ROAD_NS, MacroTileType.BUILDING_RESIDENTIAL],
    ];
    const { buildings, buildingClasses } = extractBuildings(macroGrid, 2, 2);
    expect(buildings.length).toBe(1); // merged vertically
    expect(buildings[0].width).toBe(WFC.MACRO_TILE_SIZE);
    expect(buildings[0].height).toBe(2 * WFC.MACRO_TILE_SIZE);
    expect(buildingClasses.get(buildings[0].id)).toBe('residential');
  });

  it('merges adjacent same-class buildings into rectangles', () => {
    const macroGrid: MacroTileType[][] = [
      [
        MacroTileType.BUILDING_COMMERCIAL,
        MacroTileType.BUILDING_COMMERCIAL,
      ],
      [
        MacroTileType.BUILDING_COMMERCIAL,
        MacroTileType.BUILDING_COMMERCIAL,
      ],
    ];
    const { buildings } = extractBuildings(macroGrid, 2, 2);
    expect(buildings.length).toBe(1);
    expect(buildings[0].width).toBe(2 * WFC.MACRO_TILE_SIZE);
    expect(buildings[0].height).toBe(2 * WFC.MACRO_TILE_SIZE);
  });

  it('separates different building classes', () => {
    const macroGrid: MacroTileType[][] = [
      [
        MacroTileType.BUILDING_RESIDENTIAL,
        MacroTileType.BUILDING_COMMERCIAL,
      ],
    ];
    const { buildings, buildingClasses } = extractBuildings(macroGrid, 2, 1);
    expect(buildings.length).toBe(2);
    const classes = new Set(
      buildings.map((b) => buildingClasses.get(b.id)),
    );
    expect(classes.has('residential')).toBe(true);
    expect(classes.has('commercial')).toBe(true);
  });

  it('building origins and dimensions are in tile coordinates', () => {
    const macroGrid: MacroTileType[][] = [
      [MacroTileType.ROAD_NS, MacroTileType.BUILDING_INDUSTRIAL],
    ];
    const { buildings } = extractBuildings(macroGrid, 2, 1);
    expect(buildings.length).toBe(1);
    expect(buildings[0].origin.x).toBe(WFC.MACRO_TILE_SIZE);
    expect(buildings[0].origin.y).toBe(0);
    expect(buildings[0].width).toBe(WFC.MACRO_TILE_SIZE);
    expect(buildings[0].height).toBe(WFC.MACRO_TILE_SIZE);
  });

  it('all buildings have unique IDs', () => {
    const macroGrid: MacroTileType[][] = [
      [
        MacroTileType.BUILDING_RESIDENTIAL,
        MacroTileType.BUILDING_COMMERCIAL,
        MacroTileType.BUILDING_INDUSTRIAL,
      ],
    ];
    const { buildings } = extractBuildings(macroGrid, 3, 1);
    const ids = buildings.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('buildings have empty rooms, entryPoints, and objects arrays', () => {
    const macroGrid: MacroTileType[][] = [
      [MacroTileType.BUILDING_RESIDENTIAL],
    ];
    const { buildings } = extractBuildings(macroGrid, 1, 1);
    expect(buildings[0].rooms).toEqual([]);
    expect(buildings[0].entryPoints).toEqual([]);
    expect(buildings[0].objects).toEqual([]);
  });

  it('non-building tiles produce no buildings', () => {
    const macroGrid: MacroTileType[][] = [
      [MacroTileType.ROAD_NS, MacroTileType.PARK],
    ];
    const { buildings } = extractBuildings(macroGrid, 2, 1);
    expect(buildings.length).toBe(0);
  });

  it('same-class buildings separated by road stay separate', () => {
    const macroGrid: MacroTileType[][] = [
      [
        MacroTileType.BUILDING_RESIDENTIAL,
        MacroTileType.ROAD_NS,
        MacroTileType.BUILDING_RESIDENTIAL,
      ],
    ];
    const { buildings } = extractBuildings(macroGrid, 3, 1);
    expect(buildings.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Debug visualisation
// ---------------------------------------------------------------------------

describe('debugMacroGrid', () => {
  it('returns a string with correct dimensions', () => {
    const grid: MacroTileType[][] = [
      [MacroTileType.ROAD_NS, MacroTileType.BUILDING_RESIDENTIAL],
      [MacroTileType.PARK, MacroTileType.ROAD_EW],
    ];
    const output = debugMacroGrid(grid, 2);
    const lines = output.split('\n');
    expect(lines.length).toBe(2);
    // Each line has 2 characters
    for (const line of lines) {
      expect([...line].length).toBe(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Full pipeline: generateCityLayout
// ---------------------------------------------------------------------------

describe('generateCityLayout', () => {
  it('returns a valid CityGenerationResult', () => {
    const result = generateCityLayout('city-test', {
      width: 8,
      height: 8,
    });
    expect(result.layout).toBeDefined();
    expect(result.buildingClasses).toBeInstanceOf(Map);
    expect(result.layout.widthTiles).toBe(8 * WFC.MACRO_TILE_SIZE);
    expect(result.layout.heightTiles).toBe(8 * WFC.MACRO_TILE_SIZE);
    expect(result.layout.seed).toBe('city-test');
  });

  it('tile grid has correct dimensions', () => {
    const result = generateCityLayout('dimensions-test', {
      width: 6,
      height: 6,
    });
    const tiles = result.layout.tiles;
    expect(tiles.length).toBe(6 * WFC.MACRO_TILE_SIZE);
    for (const row of tiles) {
      expect(row.length).toBe(6 * WFC.MACRO_TILE_SIZE);
    }
  });

  it('contains at least one building', () => {
    const result = generateCityLayout('buildings-test', {
      width: 8,
      height: 8,
    });
    expect(result.layout.buildings.length).toBeGreaterThan(0);
  });

  it('contains road tiles', () => {
    const result = generateCityLayout('roads-test', {
      width: 8,
      height: 8,
    });
    let hasRoad = false;
    for (const row of result.layout.tiles) {
      for (const cell of row) {
        if (cell === TileType.Road) hasRoad = true;
      }
    }
    expect(hasRoad).toBe(true);
  });

  it('is deterministic: same seed produces identical output', () => {
    const r1 = generateCityLayout('det-seed', { width: 8, height: 8 });
    const r2 = generateCityLayout('det-seed', { width: 8, height: 8 });
    expect(r1.layout.tiles).toEqual(r2.layout.tiles);
    expect(r1.layout.buildings).toEqual(r2.layout.buildings);
  });

  it('different seeds produce different output', () => {
    const r1 = generateCityLayout('seed-1', { width: 8, height: 8 });
    const r2 = generateCityLayout('seed-2', { width: 8, height: 8 });
    // At least some tiles should differ
    let differences = 0;
    const h = r1.layout.tiles.length;
    const w = r1.layout.tiles[0].length;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (r1.layout.tiles[y][x] !== r2.layout.tiles[y][x]) differences++;
      }
    }
    expect(differences).toBeGreaterThan(0);
  });

  it('building classes map has entry for every building', () => {
    const result = generateCityLayout('classes-test', {
      width: 8,
      height: 8,
    });
    for (const building of result.layout.buildings) {
      expect(result.buildingClasses.has(building.id)).toBe(true);
    }
  });

  it('all tile values are valid TileType enum members', () => {
    const result = generateCityLayout('valid-tiles', {
      width: 8,
      height: 8,
    });
    const validTypes = new Set([
      TileType.Empty,
      TileType.Wall,
      TileType.Floor,
      TileType.Door,
      TileType.Window,
      TileType.Road,
      TileType.Sidewalk,
    ]);
    for (const row of result.layout.tiles) {
      for (const cell of row) {
        expect(validTypes.has(cell)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

describe('performance', () => {
  it('32×32 generation completes in under 2 seconds', () => {
    const start = performance.now();
    const result = generateCityLayout('perf-test');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
    // Verify it produced valid output
    expect(result.layout.widthTiles).toBe(32 * WFC.MACRO_TILE_SIZE);
    expect(result.layout.buildings.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('handles 2×2 grid (minimum viable)', () => {
    const result = generateCityLayout('tiny', { width: 2, height: 2 });
    expect(result.layout.tiles.length).toBe(2 * WFC.MACRO_TILE_SIZE);
    expect(result.layout.tiles[0].length).toBe(2 * WFC.MACRO_TILE_SIZE);
  });

  it('handles non-square grid', () => {
    const result = generateCityLayout('non-square', {
      width: 6,
      height: 10,
    });
    expect(result.layout.widthTiles).toBe(6 * WFC.MACRO_TILE_SIZE);
    expect(result.layout.heightTiles).toBe(10 * WFC.MACRO_TILE_SIZE);
  });

  it('uses default dimensions when no options given', () => {
    const result = generateCityLayout('default-dims');
    expect(result.layout.widthTiles).toBe(
      WFC.GRID_WIDTH * WFC.MACRO_TILE_SIZE,
    );
    expect(result.layout.heightTiles).toBe(
      WFC.GRID_HEIGHT * WFC.MACRO_TILE_SIZE,
    );
  });

  it('TILE_WEIGHTS has correct length', () => {
    expect(TILE_WEIGHTS.length).toBe(MACRO_TILE_COUNT);
  });

  it('rejects grid smaller than 2×2', () => {
    expect(() => generateCityLayout('tiny', { width: 1, height: 4 })).toThrow(
      /at least 2×2/,
    );
    expect(() => generateCityLayout('tiny', { width: 4, height: 0 })).toThrow(
      /at least 2×2/,
    );
  });

  it('rejects grid larger than 128×128', () => {
    expect(() =>
      generateCityLayout('huge', { width: 200, height: 200 }),
    ).toThrow(/exceeds maximum/);
  });

  it('TILE_WEIGHT_LOG_WEIGHTS matches formula', () => {
    for (let i = 0; i < MACRO_TILE_COUNT; i++) {
      const expected = TILE_WEIGHTS[i] * Math.log(TILE_WEIGHTS[i]);
      expect(TILE_WEIGHT_LOG_WEIGHTS[i]).toBeCloseTo(expected);
    }
  });
});
