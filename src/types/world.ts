/**
 * World data types — the integration contract between procedural generation,
 * the LoadingScene orchestrator, and the GameScene consumer.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import type { CityLayout, BuildingClass, SafehouseResult, SpawnZone, PathfindingGrid } from './procgen';
import type { RunConfig } from './run';

// ---------------------------------------------------------------------------
// Generation progress
// ---------------------------------------------------------------------------

/** Named stages of world generation, in execution order. */
export enum GenerationStage {
  CityLayout = 'city_layout',
  BuildingInteriors = 'building_interiors',
  SafehouseSelection = 'safehouse_selection',
  ObjectPlacement = 'object_placement',
  NavigationGrid = 'navigation_grid',
}

/** Progress update yielded by the world generator between stages. */
export interface GenerationProgress {
  /** Current stage being completed. */
  stage: GenerationStage;
  /** Human-readable status message for display. */
  message: string;
  /** Completion fraction in [0, 1]. */
  progress: number;
}

// ---------------------------------------------------------------------------
// World data bundle
// ---------------------------------------------------------------------------

/**
 * Complete world state produced by the generation pipeline.
 *
 * Passed from LoadingScene to GameScene via Phaser's scene.start data
 * parameter (by reference — no serialization).
 */
export interface WorldData {
  /** Tile grid and building footprints. */
  layout: CityLayout;
  /** Building class lookup for BSP room-type assignment. */
  buildingClasses: Map<string, BuildingClass>;
  /** Selected safehouse and its defensive properties. */
  safehouse: SafehouseResult;
  /** A* pathfinding grid with runtime walkability updates. */
  pathfinding: PathfindingGrid;
  /** Zombie spawn zones (edge + far-building). */
  spawnZones: SpawnZone[];
  /** Run configuration (seed, difficulty, timing). */
  config: RunConfig;
}
