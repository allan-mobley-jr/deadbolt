/**
 * Wave Function Collapse city layout generator.
 *
 * Generates a macro grid (~32×32) where each cell is a zone type (road,
 * building, park, etc.) based on adjacency constraints. The macro grid is
 * then expanded into a full tile grid and building footprints are extracted.
 *
 * Algorithm overview:
 *   1. Initialise every cell with all tile possibilities.
 *   2. Apply border constraints (no road sockets facing off-grid).
 *   3. Repeatedly collapse the lowest-entropy cell, propagate constraints.
 *   4. On contradiction → full restart with a derived seed.
 *   5. After MAX_RETRIES failures → deterministic fallback grid.
 *   6. Expand the macro grid to game tiles and extract buildings.
 *
 * Performance: bitmask-based constraint propagation keeps the 32×32 grid
 * well under the 2-second budget on mid-range hardware.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import seedrandom from 'seedrandom';
import type { PRNG } from 'seedrandom';
import type { Building, BuildingClass, CityLayout } from '@/types/procgen';
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
} from './wfc-tiles';

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

/** Result of city layout generation. */
export interface CityGenerationResult {
  layout: CityLayout;
  buildingClasses: Map<string, BuildingClass>;
}

// ---------------------------------------------------------------------------
// Internal WFC grid
// ---------------------------------------------------------------------------

interface WFCGrid {
  width: number;
  height: number;
  /**
   * Bitmask per cell — bit i set means tile i is still possible.
   * Uses regular numbers (bitwise ops work on 32 bits; we have 17 tiles).
   */
  possible: Int32Array;
  /** Collapsed tile index per cell, or -1 if uncollapsed. */
  collapsed: Int8Array;
}

// ---------------------------------------------------------------------------
// Precomputed propagation masks
// ---------------------------------------------------------------------------

/**
 * propagationMasks[tileIdx * 4 + dir] = bitmask of tiles that can be in
 * the neighbouring cell in direction `dir` when `tileIdx` is present.
 *
 * Directions: 0 = north, 1 = south, 2 = east, 3 = west.
 */
let propagationMasks: Int32Array | null = null;

/** Bitmask of all tile indices (bits 0–16 set). */
const ALL_POSSIBLE = (1 << MACRO_TILE_COUNT) - 1;

const DIR_KEYS = ['north', 'south', 'east', 'west'] as const;
const OPPOSITE_DIR = [1, 0, 3, 2]; // north↔south, east↔west
const DX = [0, 0, 1, -1]; // north, south, east, west
const DY = [-1, 1, 0, 0];

function ensurePropagationMasks(): Int32Array {
  if (propagationMasks) return propagationMasks;

  const masks = new Int32Array(MACRO_TILE_COUNT * 4);
  for (let t = 0; t < MACRO_TILE_COUNT; t++) {
    const tDef = TILE_DEFINITIONS[t];
    for (let d = 0; d < 4; d++) {
      let mask = 0;
      const tSocket = tDef.sockets[DIR_KEYS[d]];
      for (let n = 0; n < MACRO_TILE_COUNT; n++) {
        const nSocket =
          TILE_DEFINITIONS[n].sockets[DIR_KEYS[OPPOSITE_DIR[d]]];
        if (socketsCompatible(tSocket, nSocket)) {
          mask |= 1 << n;
        }
      }
      masks[t * 4 + d] = mask;
    }
  }
  propagationMasks = masks;
  return masks;
}

// ---------------------------------------------------------------------------
// Bit utilities
// ---------------------------------------------------------------------------

/** Count set bits in a 32-bit integer (Hamming weight). */
function popcount(n: number): number {
  n = n - ((n >> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  return (((n + (n >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
}

/** Iterate set bit indices. Yields the index of each set bit. */
function* iterBits(mask: number): Generator<number> {
  let bits = mask;
  while (bits !== 0) {
    const lowest = bits & -bits;
    yield 31 - Math.clz32(lowest);
    bits ^= lowest;
  }
}

// ---------------------------------------------------------------------------
// Grid creation and border constraints
// ---------------------------------------------------------------------------

function createGrid(width: number, height: number): WFCGrid {
  const total = width * height;
  const possible = new Int32Array(total);
  const collapsed = new Int8Array(total);
  for (let i = 0; i < total; i++) {
    possible[i] = ALL_POSSIBLE;
    collapsed[i] = -1;
  }
  return { width, height, possible, collapsed };
}

/**
 * Remove tiles with R sockets facing off-grid on border cells.
 * Returns the list of constrained cell indices for initial propagation.
 */
function applyBorderConstraints(grid: WFCGrid): number[] {
  const { width, height, possible } = grid;
  const constrained: number[] = [];

  // Precompute bitmasks of tiles without R on each border direction
  let noRoadNorth = 0;
  let noRoadSouth = 0;
  let noRoadEast = 0;
  let noRoadWest = 0;
  for (let t = 0; t < MACRO_TILE_COUNT; t++) {
    const s = TILE_DEFINITIONS[t].sockets;
    if (s.north !== 'R') noRoadNorth |= 1 << t;
    if (s.south !== 'R') noRoadSouth |= 1 << t;
    if (s.east !== 'R') noRoadEast |= 1 << t;
    if (s.west !== 'R') noRoadWest |= 1 << t;
  }

  // North border (y = 0)
  for (let x = 0; x < width; x++) {
    const idx = x;
    const before = possible[idx];
    possible[idx] &= noRoadNorth;
    if (possible[idx] !== before) constrained.push(idx);
  }
  // South border (y = height - 1)
  for (let x = 0; x < width; x++) {
    const idx = (height - 1) * width + x;
    const before = possible[idx];
    possible[idx] &= noRoadSouth;
    if (possible[idx] !== before) constrained.push(idx);
  }
  // West border (x = 0)
  for (let y = 0; y < height; y++) {
    const idx = y * width;
    const before = possible[idx];
    possible[idx] &= noRoadWest;
    if (possible[idx] !== before) constrained.push(idx);
  }
  // East border (x = width - 1)
  for (let y = 0; y < height; y++) {
    const idx = y * width + (width - 1);
    const before = possible[idx];
    possible[idx] &= noRoadEast;
    if (possible[idx] !== before) constrained.push(idx);
  }

  return constrained;
}

// ---------------------------------------------------------------------------
// Entropy and cell selection
// ---------------------------------------------------------------------------

/**
 * Shannon entropy of a cell's possibility set, weighted by tile weights.
 * Returns 0 for cells with 0 or 1 possibility.
 */
function calculateEntropy(possibleMask: number): number {
  const count = popcount(possibleMask);
  if (count <= 1) return 0;

  let sumW = 0;
  let sumWLogW = 0;
  for (const t of iterBits(possibleMask)) {
    sumW += TILE_WEIGHTS[t];
    sumWLogW += TILE_WEIGHT_LOG_WEIGHTS[t];
  }
  if (sumW <= 0) return 0;
  return Math.log(sumW) - sumWLogW / sumW;
}

/**
 * Find the uncollapsed cell with the lowest positive entropy.
 * Adds small noise for deterministic tie-breaking.
 * Returns -1 when all cells are collapsed or determined.
 */
function findLowestEntropyCell(grid: WFCGrid, rng: PRNG): number {
  const { width, height, possible, collapsed } = grid;
  const total = width * height;
  let minEntropy = Infinity;
  let minIdx = -1;

  for (let i = 0; i < total; i++) {
    if (collapsed[i] !== -1) continue;
    const count = popcount(possible[i]);
    if (count <= 1) continue; // determined or contradiction
    const entropy = calculateEntropy(possible[i]) + rng() * 1e-6;
    if (entropy < minEntropy) {
      minEntropy = entropy;
      minIdx = i;
    }
  }
  return minIdx;
}

// ---------------------------------------------------------------------------
// Cell collapse (weighted random selection)
// ---------------------------------------------------------------------------

/**
 * Choose a tile from the possibility bitmask using weighted random selection.
 * Returns the chosen tile index, or -1 if the mask is empty.
 */
function weightedCollapse(possibleMask: number, rng: PRNG): number {
  if (possibleMask === 0) return -1;

  let totalWeight = 0;
  for (const t of iterBits(possibleMask)) {
    totalWeight += TILE_WEIGHTS[t];
  }

  let roll = rng() * totalWeight;
  for (const t of iterBits(possibleMask)) {
    roll -= TILE_WEIGHTS[t];
    if (roll <= 0) return t;
  }

  // Floating-point rounding fallback: return highest set bit
  return 31 - Math.clz32(possibleMask);
}

// ---------------------------------------------------------------------------
// Constraint propagation (AC-3 with bitmasks)
// ---------------------------------------------------------------------------

/**
 * Compute the union of propagation masks for all tiles in `cellPossible`
 * in direction `dir`.
 */
function computeAllowed(
  cellPossible: number,
  dir: number,
  masks: Int32Array,
): number {
  let allowed = 0;
  let bits = cellPossible;
  while (bits !== 0) {
    const lowest = bits & -bits;
    const t = 31 - Math.clz32(lowest);
    allowed |= masks[t * 4 + dir];
    bits ^= lowest;
  }
  return allowed;
}

/**
 * Propagate constraints from a set of starting cells.
 * Returns false on contradiction (any cell reaches 0 possibilities).
 */
function propagate(
  grid: WFCGrid,
  startCells: number[],
): boolean {
  const { width, height, possible, collapsed } = grid;
  const total = width * height;
  const masks = ensurePropagationMasks();

  // Worklist with dedup via a boolean array
  const inWorklist = new Uint8Array(total);
  const worklist: number[] = [];

  for (const idx of startCells) {
    if (!inWorklist[idx]) {
      worklist.push(idx);
      inWorklist[idx] = 1;
    }
  }

  while (worklist.length > 0) {
    const idx = worklist.pop()!;
    inWorklist[idx] = 0;
    const cx = idx % width;
    const cy = (idx - cx) / width;

    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const nIdx = ny * width + nx;
      if (collapsed[nIdx] !== -1) continue;

      const allowed = computeAllowed(possible[idx], d, masks);
      const before = possible[nIdx];
      const after = before & allowed;

      if (after === 0) return false; // contradiction
      if (after !== before) {
        possible[nIdx] = after;
        if (!inWorklist[nIdx]) {
          worklist.push(nIdx);
          inWorklist[nIdx] = 1;
        }
      }
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// WFC solver
// ---------------------------------------------------------------------------

/**
 * Run the WFC solver on a macro grid.
 * Returns the collapsed 2D grid, or null on contradiction.
 */
export function solveMacroGrid(
  width: number,
  height: number,
  rng: PRNG,
): MacroTileType[][] | null {
  ensurePropagationMasks();
  const grid = createGrid(width, height);

  // Apply border constraints and propagate
  const borderCells = applyBorderConstraints(grid);
  if (!propagate(grid, borderCells)) return null;

  // Main collapse loop
  while (true) {
    const cellIdx = findLowestEntropyCell(grid, rng);
    if (cellIdx === -1) break; // all cells determined

    const tileIdx = weightedCollapse(grid.possible[cellIdx], rng);
    if (tileIdx === -1) return null;

    grid.possible[cellIdx] = 1 << tileIdx;
    grid.collapsed[cellIdx] = tileIdx;

    if (!propagate(grid, [cellIdx])) return null;
  }

  // Finalise: collapse any determined cells (exactly 1 possibility)
  const result: MacroTileType[][] = [];
  for (let y = 0; y < height; y++) {
    result[y] = new Array<MacroTileType>(width);
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (grid.collapsed[idx] !== -1) {
        result[y][x] = grid.collapsed[idx] as MacroTileType;
      } else {
        const p = grid.possible[idx];
        if (popcount(p) !== 1) return null; // contradiction
        result[y][x] = (31 - Math.clz32(p)) as MacroTileType;
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Macro grid validation
// ---------------------------------------------------------------------------

/**
 * Validate a collapsed macro grid for quality:
 *   1. All road tiles form a single connected component.
 *   2. Minimum fraction of road tiles met.
 *   3. Minimum fraction of building tiles met.
 */
export function validateMacroGrid(
  macroGrid: MacroTileType[][],
  width: number,
  height: number,
): boolean {
  const total = width * height;
  let roadCount = 0;
  let buildingCount = 0;
  let firstRoadIdx = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = macroGrid[y][x];
      if (isRoadTile(tile)) {
        roadCount++;
        if (firstRoadIdx === -1) firstRoadIdx = y * width + x;
      }
      if (isBuildingTile(tile)) buildingCount++;
    }
  }

  // Check minimum fractions
  if (roadCount / total < WFC.MIN_ROAD_FRACTION) return false;
  if (buildingCount / total < WFC.MIN_BUILDING_FRACTION) return false;

  // Check road connectivity via DFS through road-connected edges
  if (roadCount === 0) return false;

  const visited = new Uint8Array(total);
  const stack: number[] = [firstRoadIdx];
  visited[firstRoadIdx] = 1;
  let visitedCount = 1;

  while (stack.length > 0) {
    const idx = stack.pop()!;
    const cx = idx % width;
    const cy = (idx - cx) / width;
    const tileDef = TILE_DEFINITIONS[macroGrid[cy][cx]];

    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const nIdx = ny * width + nx;
      if (visited[nIdx]) continue;

      const nTile = macroGrid[ny][nx];
      if (!isRoadTile(nTile)) continue;

      // Check that road sockets actually connect
      const mySocket = tileDef.sockets[DIR_KEYS[d]];
      const theirSocket =
        TILE_DEFINITIONS[nTile].sockets[DIR_KEYS[OPPOSITE_DIR[d]]];
      if (mySocket === 'R' && theirSocket === 'R') {
        visited[nIdx] = 1;
        visitedCount++;
        stack.push(nIdx);
      }
    }
  }

  return visitedCount === roadCount;
}

// ---------------------------------------------------------------------------
// Fallback grid generator
// ---------------------------------------------------------------------------

/**
 * Generate a simple grid-pattern city layout as a guaranteed-success fallback.
 * Roads every FALLBACK_ROAD_INTERVAL cells, buildings between, borders empty.
 */
export function generateFallbackGrid(
  width: number,
  height: number,
  rng: PRNG,
): MacroTileType[][] {
  const interval = WFC.FALLBACK_ROAD_INTERVAL;
  const grid: MacroTileType[][] = [];

  for (let y = 0; y < height; y++) {
    grid[y] = new Array<MacroTileType>(width);
    for (let x = 0; x < width; x++) {
      // Border cells are empty lots (no roads exiting the map)
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        grid[y][x] = MacroTileType.EMPTY_LOT;
        continue;
      }

      const isRoadRow = y % interval === 1;
      const isRoadCol = x % interval === 1;

      if (isRoadRow && isRoadCol) {
        grid[y][x] = MacroTileType.ROAD_CROSS;
      } else if (isRoadRow) {
        grid[y][x] = MacroTileType.ROAD_EW;
      } else if (isRoadCol) {
        grid[y][x] = MacroTileType.ROAD_NS;
      } else {
        // Fill with buildings, varying class randomly
        const r = rng();
        if (r < 0.5) grid[y][x] = MacroTileType.BUILDING_RESIDENTIAL;
        else if (r < 0.8) grid[y][x] = MacroTileType.BUILDING_COMMERCIAL;
        else grid[y][x] = MacroTileType.BUILDING_INDUSTRIAL;
      }
    }
  }

  return grid;
}

// ---------------------------------------------------------------------------
// Macro-to-tile expansion
// ---------------------------------------------------------------------------

/**
 * Expand a macro grid into a full tile grid.
 * Each macro cell stamps its 8×8 expansion pattern into the tile grid.
 */
export function expandMacroGrid(
  macroGrid: MacroTileType[][],
  macroWidth: number,
  macroHeight: number,
): TileType[][] {
  if (
    macroGrid.length !== macroHeight ||
    (macroGrid.length > 0 && macroGrid[0].length !== macroWidth)
  ) {
    throw new Error(
      `expandMacroGrid: grid dimensions (${macroGrid.length}×${macroGrid[0]?.length}) ` +
        `do not match declared size (${macroHeight}×${macroWidth})`,
    );
  }
  const size = WFC.MACRO_TILE_SIZE;
  const tileW = macroWidth * size;
  const tileH = macroHeight * size;

  // Allocate tile grid filled with Empty
  const tiles: TileType[][] = new Array(tileH);
  for (let y = 0; y < tileH; y++) {
    tiles[y] = new Array<TileType>(tileW).fill(TileType.Empty);
  }

  // Stamp patterns
  for (let my = 0; my < macroHeight; my++) {
    for (let mx = 0; mx < macroWidth; mx++) {
      const pattern = EXPANSION_PATTERNS[macroGrid[my][mx]];
      const baseX = mx * size;
      const baseY = my * size;
      for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
          tiles[baseY + py][baseX + px] = pattern[py][px];
        }
      }
    }
  }

  return tiles;
}

// ---------------------------------------------------------------------------
// Building extraction
// ---------------------------------------------------------------------------

/**
 * Extract building footprints from the macro grid.
 *
 * Uses a greedy rectangular merge: scans left-to-right, top-to-bottom,
 * extends each unprocessed building cell as far east and south as possible
 * while all cells in the rectangle share the same building class.
 */
export function extractBuildings(
  macroGrid: MacroTileType[][],
  macroWidth: number,
  macroHeight: number,
): { buildings: Building[]; buildingClasses: Map<string, BuildingClass> } {
  const size = WFC.MACRO_TILE_SIZE;
  const used = new Set<number>();
  const buildings: Building[] = [];
  const buildingClasses = new Map<string, BuildingClass>();

  for (let y = 0; y < macroHeight; y++) {
    for (let x = 0; x < macroWidth; x++) {
      const idx = y * macroWidth + x;
      if (used.has(idx)) continue;

      const tile = macroGrid[y][x];
      const tileDef = TILE_DEFINITIONS[tile];
      if (!tileDef.buildingClass) continue;

      // Extend rectangle east
      let maxX = x;
      while (
        maxX + 1 < macroWidth &&
        !used.has(y * macroWidth + maxX + 1) &&
        macroGrid[y][maxX + 1] === tile
      ) {
        maxX++;
      }

      // Extend rectangle south
      let maxY = y;
      outer: while (maxY + 1 < macroHeight) {
        for (let xx = x; xx <= maxX; xx++) {
          const nIdx = (maxY + 1) * macroWidth + xx;
          if (used.has(nIdx) || macroGrid[maxY + 1][xx] !== tile) {
            break outer;
          }
        }
        maxY++;
      }

      // Mark all cells in rectangle as used
      for (let yy = y; yy <= maxY; yy++) {
        for (let xx = x; xx <= maxX; xx++) {
          used.add(yy * macroWidth + xx);
        }
      }

      // Create building
      const id = `building-${buildings.length}`;
      buildings.push({
        id,
        origin: { x: x * size, y: y * size },
        width: (maxX - x + 1) * size,
        height: (maxY - y + 1) * size,
        rooms: [],
        entryPoints: [],
        objects: [],
      });
      buildingClasses.set(id, tileDef.buildingClass);
    }
  }

  return { buildings, buildingClasses };
}

// ---------------------------------------------------------------------------
// Debug visualisation
// ---------------------------------------------------------------------------

const DEBUG_CHARS: Record<MacroTileType, string> = {
  [MacroTileType.ROAD_NS]: '│',
  [MacroTileType.ROAD_EW]: '─',
  [MacroTileType.ROAD_TURN_NE]: '└',
  [MacroTileType.ROAD_TURN_NW]: '┘',
  [MacroTileType.ROAD_TURN_SE]: '┌',
  [MacroTileType.ROAD_TURN_SW]: '┐',
  [MacroTileType.ROAD_T_N]: '┬',
  [MacroTileType.ROAD_T_S]: '┴',
  [MacroTileType.ROAD_T_E]: '├',
  [MacroTileType.ROAD_T_W]: '┤',
  [MacroTileType.ROAD_CROSS]: '┼',
  [MacroTileType.BUILDING_RESIDENTIAL]: 'R',
  [MacroTileType.BUILDING_COMMERCIAL]: 'C',
  [MacroTileType.BUILDING_INDUSTRIAL]: 'I',
  [MacroTileType.PARK]: 'P',
  [MacroTileType.PARKING_LOT]: '▒',
  [MacroTileType.EMPTY_LOT]: '·',
};

/**
 * Render a macro grid as a compact string for debugging.
 * Each cell is one character showing its type.
 */
export function debugMacroGrid(
  macroGrid: MacroTileType[][],
  height: number,
): string {
  return macroGrid
    .slice(0, height)
    .map((row) => row.map((t) => DEBUG_CHARS[t] ?? '?').join(''))
    .join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a city layout using Wave Function Collapse.
 *
 * @param seed      String seed for deterministic generation.
 * @param options   Optional grid dimensions (default 32×32 macro tiles).
 * @returns CityLayout with tile grid + building footprints, plus a building
 *          class map for the BSP interior generator.
 */
export function generateCityLayout(
  seed: string,
  options?: { width?: number; height?: number },
): CityGenerationResult {
  const width = options?.width ?? WFC.GRID_WIDTH;
  const height = options?.height ?? WFC.GRID_HEIGHT;

  if (width < 2 || height < 2) {
    throw new Error(
      `generateCityLayout: grid must be at least 2×2, got ${width}×${height}`,
    );
  }
  if (width > 128 || height > 128) {
    throw new Error(
      `generateCityLayout: grid exceeds maximum 128×128, got ${width}×${height}`,
    );
  }

  // Try WFC with derived seeds per attempt
  for (let attempt = 0; attempt < WFC.MAX_RETRIES; attempt++) {
    const rng = seedrandom(`${seed}-wfc-${attempt}`);
    const macroGrid = solveMacroGrid(width, height, rng);
    if (macroGrid && validateMacroGrid(macroGrid, width, height)) {
      return buildResult(macroGrid, width, height, seed);
    }
  }

  // Fallback: deterministic simple grid
  const fallbackRng = seedrandom(`${seed}-fallback`);
  const macroGrid = generateFallbackGrid(width, height, fallbackRng);
  return buildResult(macroGrid, width, height, seed);
}

/** Assemble a CityGenerationResult from a collapsed macro grid. */
function buildResult(
  macroGrid: MacroTileType[][],
  macroWidth: number,
  macroHeight: number,
  seed: string,
): CityGenerationResult {
  const tiles = expandMacroGrid(macroGrid, macroWidth, macroHeight);
  const { buildings, buildingClasses } = extractBuildings(
    macroGrid,
    macroWidth,
    macroHeight,
  );

  const layout: CityLayout = {
    widthTiles: macroWidth * WFC.MACRO_TILE_SIZE,
    heightTiles: macroHeight * WFC.MACRO_TILE_SIZE,
    tiles,
    buildings,
    seed,
  };

  return { layout, buildingClasses };
}
