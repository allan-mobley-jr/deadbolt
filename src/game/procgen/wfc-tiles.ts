/**
 * WFC macro tile definitions, socket compatibility, and expansion patterns.
 *
 * Each macro tile represents an 8×8 block of game tiles. The socket system
 * enforces adjacency constraints: two neighbouring cells are compatible when
 * their shared-edge sockets match according to the compatibility table.
 *
 * Socket types:
 *   R (road)     — road opening, matches only R
 *   S (sidewalk) — building/road edge, matches S or O
 *   O (open)     — open space, matches S or O
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import type { BuildingClass } from '@/types/procgen';
import { TileType } from '@/types/procgen';

// ---------------------------------------------------------------------------
// Macro tile types
// ---------------------------------------------------------------------------

export enum MacroTileType {
  /* Roads — 11 variants by connectivity */
  ROAD_NS = 0,        // North-South straight
  ROAD_EW = 1,        // East-West straight
  ROAD_TURN_NE = 2,   // Turn connecting north and east
  ROAD_TURN_NW = 3,   // Turn connecting north and west
  ROAD_TURN_SE = 4,   // Turn connecting south and east
  ROAD_TURN_SW = 5,   // Turn connecting south and west
  ROAD_T_N = 6,       // T-junction, no north outlet (S/E/W)
  ROAD_T_S = 7,       // T-junction, no south outlet (N/E/W)
  ROAD_T_E = 8,       // T-junction, no east outlet (N/S/W)
  ROAD_T_W = 9,       // T-junction, no west outlet (N/S/E)
  ROAD_CROSS = 10,    // Full crossroads (N/S/E/W)

  /* Building footprints — 3 classes */
  BUILDING_RESIDENTIAL = 11,
  BUILDING_COMMERCIAL = 12,
  BUILDING_INDUSTRIAL = 13,

  /* Open spaces */
  PARK = 14,
  PARKING_LOT = 15,
  EMPTY_LOT = 16,
}

/** Total number of distinct macro tile types. */
export const MACRO_TILE_COUNT = 17;

// ---------------------------------------------------------------------------
// Socket system
// ---------------------------------------------------------------------------

export type Socket = 'R' | 'S' | 'O';

export interface Sockets {
  north: Socket;
  south: Socket;
  east: Socket;
  west: Socket;
}

/**
 * Check whether two sockets on a shared edge are compatible.
 *
 * Compatibility table (symmetric):
 *   R ↔ R only
 *   S ↔ S, O
 *   O ↔ S, O
 */
export function socketsCompatible(a: Socket, b: Socket): boolean {
  if (a === 'R') return b === 'R';
  // S and O are interchangeable — both accept S or O but never R
  return b !== 'R';
}

// ---------------------------------------------------------------------------
// Tile definitions
// ---------------------------------------------------------------------------

export interface MacroTileDefinition {
  type: MacroTileType;
  sockets: Sockets;
  weight: number;
  buildingClass?: BuildingClass;
}

/** Complete tile definition array — index must equal MacroTileType value. */
export const TILE_DEFINITIONS: readonly MacroTileDefinition[] = [
  // --- Roads ---
  { type: MacroTileType.ROAD_NS,      sockets: { north: 'R', south: 'R', east: 'S', west: 'S' }, weight: 0.4 },
  { type: MacroTileType.ROAD_EW,      sockets: { north: 'S', south: 'S', east: 'R', west: 'R' }, weight: 0.4 },
  { type: MacroTileType.ROAD_TURN_NE, sockets: { north: 'R', south: 'S', east: 'R', west: 'S' }, weight: 0.3 },
  { type: MacroTileType.ROAD_TURN_NW, sockets: { north: 'R', south: 'S', east: 'S', west: 'R' }, weight: 0.3 },
  { type: MacroTileType.ROAD_TURN_SE, sockets: { north: 'S', south: 'R', east: 'R', west: 'S' }, weight: 0.3 },
  { type: MacroTileType.ROAD_TURN_SW, sockets: { north: 'S', south: 'R', east: 'S', west: 'R' }, weight: 0.3 },
  { type: MacroTileType.ROAD_T_N,     sockets: { north: 'S', south: 'R', east: 'R', west: 'R' }, weight: 0.2 },
  { type: MacroTileType.ROAD_T_S,     sockets: { north: 'R', south: 'S', east: 'R', west: 'R' }, weight: 0.2 },
  { type: MacroTileType.ROAD_T_E,     sockets: { north: 'R', south: 'R', east: 'S', west: 'R' }, weight: 0.2 },
  { type: MacroTileType.ROAD_T_W,     sockets: { north: 'R', south: 'R', east: 'R', west: 'S' }, weight: 0.2 },
  { type: MacroTileType.ROAD_CROSS,   sockets: { north: 'R', south: 'R', east: 'R', west: 'R' }, weight: 0.1 },

  // --- Buildings ---
  { type: MacroTileType.BUILDING_RESIDENTIAL, sockets: { north: 'S', south: 'S', east: 'S', west: 'S' }, weight: 3.0, buildingClass: 'residential' },
  { type: MacroTileType.BUILDING_COMMERCIAL,  sockets: { north: 'S', south: 'S', east: 'S', west: 'S' }, weight: 2.0, buildingClass: 'commercial' },
  { type: MacroTileType.BUILDING_INDUSTRIAL,  sockets: { north: 'S', south: 'S', east: 'S', west: 'S' }, weight: 1.5, buildingClass: 'industrial' },

  // --- Open spaces ---
  { type: MacroTileType.PARK,        sockets: { north: 'O', south: 'O', east: 'O', west: 'O' }, weight: 0.8 },
  { type: MacroTileType.PARKING_LOT, sockets: { north: 'S', south: 'S', east: 'S', west: 'S' }, weight: 0.5 },
  { type: MacroTileType.EMPTY_LOT,   sockets: { north: 'O', south: 'O', east: 'O', west: 'O' }, weight: 0.4 },
];

// ---------------------------------------------------------------------------
// Expansion patterns — each macro tile → 8×8 game tile pattern
// ---------------------------------------------------------------------------

const R = TileType.Road;
const S = TileType.Sidewalk;
const E = TileType.Empty;

const PATTERN_SIZE = 8;
const VALID_CHARS = new Set(['R', 'S', '.']);

/**
 * Parse a compact string template into an 8×8 tile pattern.
 * Characters: R = Road, S = Sidewalk, . = Empty.
 * Throws on invalid characters or wrong dimensions.
 */
function parsePattern(template: string): TileType[][] {
  const rows = template
    .trim()
    .split('\n')
    .map((row, rowIdx) =>
      [...row.trim()].map((ch, colIdx) => {
        if (!VALID_CHARS.has(ch)) {
          throw new Error(
            `parsePattern: invalid character '${ch}' at row ${rowIdx}, col ${colIdx}`,
          );
        }
        if (ch === 'R') return R;
        if (ch === 'S') return S;
        return E;
      }),
    );
  if (rows.length !== PATTERN_SIZE) {
    throw new Error(
      `parsePattern: expected ${PATTERN_SIZE} rows, got ${rows.length}`,
    );
  }
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length !== PATTERN_SIZE) {
      throw new Error(
        `parsePattern: row ${i} has ${rows[i].length} columns, expected ${PATTERN_SIZE}`,
      );
    }
  }
  return rows;
}

/**
 * 8×8 expansion pattern for each macro tile type.
 *
 * Road patterns place Road tiles where road openings exist and Sidewalk
 * on flanking edges. The patterns are designed so that adjacent tiles with
 * matching R sockets produce seamless road surfaces at the shared boundary.
 *
 * Edge alignment guarantees:
 *   - R socket edge → rows/cols 2-5 of that edge are Road
 *   - S socket edge → that edge is all Sidewalk
 *   - O socket edge → that edge is all Empty
 */
export const EXPANSION_PATTERNS: Record<MacroTileType, TileType[][]> = {
  // --- Road straight N-S: vertical road with sidewalk flanks ---
  [MacroTileType.ROAD_NS]: parsePattern(`
SSRRRRSS
SSRRRRSS
SSRRRRSS
SSRRRRSS
SSRRRRSS
SSRRRRSS
SSRRRRSS
SSRRRRSS`),

  // --- Road straight E-W: horizontal road with sidewalk flanks ---
  [MacroTileType.ROAD_EW]: parsePattern(`
SSSSSSSS
SSSSSSSS
RRRRRRRR
RRRRRRRR
RRRRRRRR
RRRRRRRR
SSSSSSSS
SSSSSSSS`),

  // --- Road turn N-E: north and east openings, L-shaped road ---
  [MacroTileType.ROAD_TURN_NE]: parsePattern(`
SSRRRRSS
SSRRRRSS
SSRRRRRR
SSRRRRRR
SSRRRRRR
SSRRRRRR
SSSSSSSS
SSSSSSSS`),

  // --- Road turn N-W: north and west openings ---
  [MacroTileType.ROAD_TURN_NW]: parsePattern(`
SSRRRRSS
SSRRRRSS
RRRRRRSS
RRRRRRSS
RRRRRRSS
RRRRRRSS
SSSSSSSS
SSSSSSSS`),

  // --- Road turn S-E: south and east openings ---
  [MacroTileType.ROAD_TURN_SE]: parsePattern(`
SSSSSSSS
SSSSSSSS
SSRRRRRR
SSRRRRRR
SSRRRRRR
SSRRRRRR
SSRRRRSS
SSRRRRSS`),

  // --- Road turn S-W: south and west openings ---
  [MacroTileType.ROAD_TURN_SW]: parsePattern(`
SSSSSSSS
SSSSSSSS
RRRRRRSS
RRRRRRSS
RRRRRRSS
RRRRRRSS
SSRRRRSS
SSRRRRSS`),

  // --- T-junction, no north (S/E/W open) ---
  [MacroTileType.ROAD_T_N]: parsePattern(`
SSSSSSSS
SSSSSSSS
RRRRRRRR
RRRRRRRR
RRRRRRRR
RRRRRRRR
SSRRRRSS
SSRRRRSS`),

  // --- T-junction, no south (N/E/W open) ---
  [MacroTileType.ROAD_T_S]: parsePattern(`
SSRRRRSS
SSRRRRSS
RRRRRRRR
RRRRRRRR
RRRRRRRR
RRRRRRRR
SSSSSSSS
SSSSSSSS`),

  // --- T-junction, no east (N/S/W open) ---
  [MacroTileType.ROAD_T_E]: parsePattern(`
SSRRRRSS
SSRRRRSS
RRRRRRSS
RRRRRRSS
RRRRRRSS
RRRRRRSS
SSRRRRSS
SSRRRRSS`),

  // --- T-junction, no west (N/S/E open) ---
  [MacroTileType.ROAD_T_W]: parsePattern(`
SSRRRRSS
SSRRRRSS
SSRRRRRR
SSRRRRRR
SSRRRRRR
SSRRRRRR
SSRRRRSS
SSRRRRSS`),

  // --- Full crossroads (all 4 directions) ---
  [MacroTileType.ROAD_CROSS]: parsePattern(`
SSRRRRSS
SSRRRRSS
RRRRRRRR
RRRRRRRR
RRRRRRRR
RRRRRRRR
SSRRRRSS
SSRRRRSS`),

  // --- Buildings: all Empty (BSP fills with walls/floors later) ---
  [MacroTileType.BUILDING_RESIDENTIAL]: parsePattern(`
........
........
........
........
........
........
........
........`),

  [MacroTileType.BUILDING_COMMERCIAL]: parsePattern(`
........
........
........
........
........
........
........
........`),

  [MacroTileType.BUILDING_INDUSTRIAL]: parsePattern(`
........
........
........
........
........
........
........
........`),

  // --- Park: open space (future system adds trees/benches) ---
  [MacroTileType.PARK]: parsePattern(`
........
........
........
........
........
........
........
........`),

  // --- Parking lot: paved surface ---
  [MacroTileType.PARKING_LOT]: parsePattern(`
RRRRRRRR
RRRRRRRR
RRRRRRRR
RRRRRRRR
RRRRRRRR
RRRRRRRR
RRRRRRRR
RRRRRRRR`),

  // --- Empty lot ---
  [MacroTileType.EMPTY_LOT]: parsePattern(`
........
........
........
........
........
........
........
........`),
};

/** Precomputed weights array indexed by tile type for fast lookup. */
export const TILE_WEIGHTS: readonly number[] = TILE_DEFINITIONS.map(
  (d) => d.weight,
);

/** Precomputed log-weights for entropy calculation. */
export const TILE_WEIGHT_LOG_WEIGHTS: readonly number[] =
  TILE_DEFINITIONS.map((d) => d.weight * Math.log(d.weight));

// ---------------------------------------------------------------------------
// Helpers for checking tile categories
// ---------------------------------------------------------------------------

/** Returns true if the macro tile type is any road variant. */
export function isRoadTile(type: MacroTileType): boolean {
  return type >= MacroTileType.ROAD_NS && type <= MacroTileType.ROAD_CROSS;
}

/** Returns true if the macro tile type is any building variant. */
export function isBuildingTile(type: MacroTileType): boolean {
  return (
    type >= MacroTileType.BUILDING_RESIDENTIAL &&
    type <= MacroTileType.BUILDING_INDUSTRIAL
  );
}
