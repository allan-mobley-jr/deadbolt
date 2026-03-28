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
// Event payload types — Game → UI
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

/** Emitted when the player's health changes (damage or healing). */
export interface PlayerHealthChangedEvent {
  current: number;
  max: number;
  /** Positive = heal, negative = damage. */
  delta: number;
}

/** A single inventory slot for display purposes. */
export interface InventorySlot {
  itemType: string;
  quantity: number;
  slotIndex: number;
}

/** Emitted when the player's inventory contents change. */
export interface InventoryChangedEvent {
  slots: InventorySlot[];
  carryWeight: number;
  maxCarryWeight: number;
}

/** Emitted when a zombie wave begins. */
export interface WaveStartedEvent {
  waveNumber: number;
  zombieCount: number;
  dayNumber: number;
}

/** Emitted when all zombies in a wave are cleared. */
export interface WaveEndedEvent {
  waveNumber: number;
  zombiesKilled: number;
  dayNumber: number;
}

/** Emitted each time a zombie is killed. */
export interface ZombieKilledEvent {
  position: { x: number; y: number };
  totalKills: number;
}

/** Emitted when the player places a barricade. */
export interface BarricadePlacedEvent {
  position: { x: number; y: number };
  health: number;
  maxHealth: number;
}

/** Emitted when a barricade is destroyed. */
export interface BarricadeBrokenEvent {
  position: { x: number; y: number };
}

/** Emitted when the player picks up an item. */
export interface ItemPickedUpEvent {
  itemType: string;
  quantity: number;
}

/** Emitted when the player dies (permadeath). */
export interface PlayerDiedEvent {
  dayNumber: number;
  totalKills: number;
  /** Total survival time in seconds. */
  survivalTime: number;
  cause: string;
}

// ---------------------------------------------------------------------------
// Event payload types — UI → Game commands
// ---------------------------------------------------------------------------

/** Emitted by UI to pause the game. */
export interface PauseCommandEvent {
  source: "ui";
}

/** Emitted by UI to resume the game. */
export interface ResumeCommandEvent {
  source: "ui";
}

/** Emitted by UI when a setting changes at runtime. */
export interface SettingsChangedEvent {
  key: string;
  value: unknown;
}

// ---------------------------------------------------------------------------
// Event map — maps event names to handler signatures
// ---------------------------------------------------------------------------

export interface GameEventMap {
  // Clock / day-night cycle
  "phase-change": [event: PhaseChangeEvent];
  "clock-tick": [event: ClockTickEvent];

  // Player state
  "player-health-changed": [event: PlayerHealthChangedEvent];
  "inventory-changed": [event: InventoryChangedEvent];
  "player-died": [event: PlayerDiedEvent];

  // Combat / waves
  "wave-started": [event: WaveStartedEvent];
  "wave-ended": [event: WaveEndedEvent];
  "zombie-killed": [event: ZombieKilledEvent];

  // Building / items
  "barricade-placed": [event: BarricadePlacedEvent];
  "barricade-broken": [event: BarricadeBrokenEvent];
  "item-picked-up": [event: ItemPickedUpEvent];

  // UI → Game commands (prefixed with cmd:)
  "cmd:pause": [event: PauseCommandEvent];
  "cmd:resume": [event: ResumeCommandEvent];
  "cmd:settings-changed": [event: SettingsChangedEvent];
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
