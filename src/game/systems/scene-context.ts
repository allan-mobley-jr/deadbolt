import type Phaser from "phaser";
import type { BodyRegistry } from "./body-registry";
import type { ConstraintRegistry } from "./constraint-registry";
import type { WallAnchorRegistry } from "./wall-anchor-registry";
import type { DayPhase } from "./day-night-constants";
import { DAY_NIGHT, getPhaseDuration } from "./day-night-constants";
import type { GameEventBus } from "@/game/events/event-bus";
import type { PathfindingGrid } from "@/game/procgen/pathfinding-grid";
import type { EntryPoint, TileCoord } from "@/types/procgen";

/**
 * Snapshot of normalised input state, written by InputSystem each fixed tick
 * and consumed by downstream systems (movement, aiming).
 *
 * All values are unitless or in world-space pixels:
 *   moveX / moveY  — axis inputs normalised to -1..+1 (diagonal-safe)
 *   aimX  / aimY   — mouse position in world coordinates
 */
export interface InputState {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  /** True only on the tick the E key transitions from up to down. */
  interactPressed: boolean;
  /** Quick-select key index pressed this tick (0-4 for keys 1-5), or -1 if none. */
  quickSelectPressed: number;
  /** True while the primary mouse button is held down. */
  pointerDown: boolean;
  /** True only on the tick the primary button transitions from down to up. */
  pointerReleased: boolean;
  /** World-space X of the pointer (valid when pointerDown is true). */
  pointerWorldX: number;
  /** World-space Y of the pointer (valid when pointerDown is true). */
  pointerWorldY: number;
}

/**
 * Mutable clock state tracking the day/night cycle.
 *
 * Written by the DayNightSystem each fixed tick, read by the
 * LightingSystem each render frame and by the event bus bridge
 * for HUD updates.
 */
export interface ClockState {
  /** Current phase of the day/night cycle. */
  phase: DayPhase;
  /** Current day number (starts at 1, increments after each dawn → day transition). */
  dayNumber: number;
  /** Seconds remaining in the current phase. */
  timeRemainingInPhase: number;
  /** Total duration of the current phase in seconds. */
  phaseDuration: number;
  /** Total elapsed game time in seconds (not counting paused time). */
  elapsedTotal: number;
  /** When true the clock does not advance. */
  paused: boolean;
}

/**
 * Shared context object that system factory functions close over.
 *
 * Keeps the `SystemFn` signature `(dt: number) => void` unchanged while
 * giving every system access to the Phaser scene, the body registry,
 * the normalised input state, and the current interpolation alpha.
 */
export interface SceneContext {
  /** The owning Phaser scene — gives access to matter, input, cameras, add. */
  scene: Phaser.Scene;
  /** Maps ECS PhysicsBody.bodyId to live Matter.js body references. */
  bodyRegistry: BodyRegistry;
  /** Mutable input state written by InputSystem, read by other systems. */
  inputState: InputState;
  /** Returns the GameLoop interpolation alpha [0, 1). */
  getAlpha: () => number;
  /** Mutable day/night clock state written by DayNightSystem. */
  clockState: ClockState;
  /** Typed event bus for game-to-game and game-to-UI communication. */
  eventBus: GameEventBus;
  /** Constraint registry for Matter.js barricade constraint references. */
  constraintRegistry?: ConstraintRegistry;
  /** Wall anchor registry for barricade snap targets at entry points. */
  wallAnchorRegistry?: WallAnchorRegistry;
  /** Pathfinding grid for runtime walkability updates (barricade placement). */
  pathfindingGrid?: PathfindingGrid;
  /** Entry points to defend (from safehouse selection). */
  entryPoints?: EntryPoint[];
  /** Safehouse center in tile coordinates — pathfinding target for zombies. */
  safehouseCenter?: TileCoord;
}

/** Create a zeroed-out input state. */
export function createInputState(): InputState {
  return {
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    interactPressed: false,
    quickSelectPressed: -1,
    pointerDown: false,
    pointerReleased: false,
    pointerWorldX: 0,
    pointerWorldY: 0,
  };
}

/** Create a clock state initialised to the start of day 1. */
export function createClockState(): ClockState {
  const { INITIAL_PHASE, INITIAL_DAY } = DAY_NIGHT;
  const phaseDuration = getPhaseDuration(INITIAL_PHASE, INITIAL_DAY);
  return {
    phase: INITIAL_PHASE,
    dayNumber: INITIAL_DAY,
    timeRemainingInPhase: phaseDuration,
    phaseDuration,
    elapsedTotal: 0,
    paused: false,
  };
}
