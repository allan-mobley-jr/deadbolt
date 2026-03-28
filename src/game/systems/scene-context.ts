import type Phaser from "phaser";
import type { BodyRegistry } from "./body-registry";
import type { DayPhase } from "./day-night-constants";
import { DAY_NIGHT } from "./day-night-constants";
import type { GameEventBus } from "@/game/events/event-bus";

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
}

/** Create a zeroed-out input state. */
export function createInputState(): InputState {
  return { moveX: 0, moveY: 0, aimX: 0, aimY: 0 };
}

/** Create a clock state initialised to the start of day 1. */
export function createClockState(): ClockState {
  const { INITIAL_PHASE, INITIAL_DAY, ESCALATION } = DAY_NIGHT;
  const phaseDuration = ESCALATION[0].day; // Day 1 day phase
  return {
    phase: INITIAL_PHASE,
    dayNumber: INITIAL_DAY,
    timeRemainingInPhase: phaseDuration,
    phaseDuration,
    elapsedTotal: 0,
    paused: false,
  };
}
