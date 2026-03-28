/**
 * Typed event bus for game-to-game and game-to-UI communication.
 *
 * Uses eventemitter3 with a strict event map so listeners receive
 * correctly typed payloads. This module lives in src/game/ and
 * contains ZERO React imports.
 *
 * The bus instance is passed into SceneContext so any system can emit
 * events. UI-side Zustand stores can import the bus to subscribe.
 */

import EventEmitter from "eventemitter3";
import type { DayPhase } from "@/game/systems/day-night-constants";

// ---------------------------------------------------------------------------
// Event payload types
// ---------------------------------------------------------------------------

/** Emitted once when the day/night phase transitions. */
export interface PhaseChangeEvent {
  phase: DayPhase;
  previousPhase: DayPhase;
  dayNumber: number;
  timeRemainingInPhase: number;
}

/** Emitted periodically (~4 Hz) with current clock state for HUD updates. */
export interface ClockTickEvent {
  phase: DayPhase;
  dayNumber: number;
  timeRemainingInPhase: number;
  phaseDuration: number;
  elapsedTotal: number;
}

// ---------------------------------------------------------------------------
// Event map — maps event names to handler signatures
// ---------------------------------------------------------------------------

export interface GameEventMap {
  "phase-change": [event: PhaseChangeEvent];
  "clock-tick": [event: ClockTickEvent];
}

// ---------------------------------------------------------------------------
// Typed event bus
// ---------------------------------------------------------------------------

export type GameEventBus = EventEmitter<GameEventMap>;

/**
 * Create a fresh event bus instance. Call once per game session
 * (in GameScene.create) so listeners from a prior session are
 * not carried over.
 */
export function createGameEventBus(): GameEventBus {
  return new EventEmitter<GameEventMap>();
}

/**
 * Emit an event on the bus, catching and logging any exceptions thrown
 * by listeners. This prevents a buggy subscriber from crashing the
 * fixed-timestep game loop (which would permanently freeze the game).
 *
 * Iterates `bus.listeners()` so each listener gets its own try/catch.
 * This means `bus.once()` auto-removal is bypassed — once-registered
 * listeners will fire on every safeEmit. All current callers use
 * `bus.on()`, which is unaffected.
 *
 * Generic over the event name so callers get full type checking on the
 * payload without needing per-event overloads. The inner cast is needed
 * because eventemitter3's listeners() returns untyped function refs.
 */
export function safeEmit<K extends keyof GameEventMap>(
  bus: GameEventBus,
  event: K,
  payload: GameEventMap[K][0],
): void {
  const listeners = (bus as EventEmitter<GameEventMap>).listeners(event);
  for (const fn of listeners) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fn(payload as any);
    } catch (err) {
      console.error(`[EventBus] Listener threw on "${String(event)}":`, err);
    }
  }
}
