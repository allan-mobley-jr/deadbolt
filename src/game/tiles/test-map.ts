/**
 * Hand-authored test map for validating the tilemap pipeline.
 *
 * Layout: 30 columns x 20 rows.
 * - Grass border around the edges
 * - A horizontal road with sidewalk flanks crossing the map
 * - A 10x8 building in the upper-left area with 3 rooms, doors, and windows
 * - Player spawns inside the building on a floor tile
 *
 * This map is temporary — the procedural generator will replace it.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import { TileType } from './tile-types';

const W = TileType.Wall;
const F = TileType.Floor;
const D = TileType.Door;
const N = TileType.Window;   // N for wiNdow (W is taken by Wall)
const R = TileType.Road;
const S = TileType.Sidewalk;
const G = TileType.Grass;

export const TEST_MAP_WIDTH = 30;
export const TEST_MAP_HEIGHT = 20;

/**
 * Create the test map data as a 2D tile grid.
 *
 * Indexed as `tiles[row][col]` (y-major, consistent with Phaser and the
 * procgen CityLayout convention on other branches).
 */
export function createTestMap(): TileType[][] {
  // prettier-ignore
  return [
    //  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29
    [G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G], // row 0
    [G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G], // row 1
    [G, G, W, W, W, N, W, W, N, W, W, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G], // row 2
    [G, G, W, F, F, F, F, F, F, F, W, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G], // row 3
    [G, G, W, F, F, F, W, F, F, F, W, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G], // row 4
    [G, G, W, F, F, F, W, F, F, F, N, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G], // row 5
    [G, G, W, F, F, F, D, F, F, F, W, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G], // row 6
    [G, G, W, F, F, F, W, F, F, F, W, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G], // row 7
    [G, G, W, W, D, W, W, W, W, W, W, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G], // row 8
    [G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G], // row 9
    [S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S], // row 10
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R], // row 11
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R], // row 12
    [S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S], // row 13
    [G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G], // row 14
    [G, G, G, G, G, G, G, G, G, G, G, G, G, G, W, W, W, N, W, W, N, W, W, G, G, G, G, G, G, G], // row 15
    [G, G, G, G, G, G, G, G, G, G, G, G, G, G, W, F, F, F, F, F, F, F, W, G, G, G, G, G, G, G], // row 16
    [G, G, G, G, G, G, G, G, G, G, G, G, G, G, W, F, F, F, W, F, F, F, W, G, G, G, G, G, G, G], // row 17
    [G, G, G, G, G, G, G, G, G, G, G, G, G, G, W, W, D, W, W, W, D, W, W, G, G, G, G, G, G, G], // row 18
    [G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G], // row 19
  ];
}

/** Player spawn position in tile coordinates (col, row). */
export const PLAYER_SPAWN = { x: 4, y: 4 } as const;
