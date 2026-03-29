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
import type { SizeCategory } from "@/game/procgen/object-defs";

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
  slotIndex: number;
  sizeCategory: SizeCategory;
  /** True for the primary slot of a multi-slot item. */
  primary: boolean;
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

/** Emitted when an object enters or leaves a barricade snap zone. */
export interface BarricadeSnapEvent {
  entryPointIndex: number;
  snapCenter: { x: number; y: number };
  orientation: "horizontal" | "vertical";
  /** True when object is within snap bounds, false when it leaves. */
  snapping: boolean;
}

/** Emitted when a barricade takes damage (for visual feedback). */
export interface BarricadeDamagedEvent {
  position: { x: number; y: number };
  /** Current health as a fraction of max (0-1). */
  healthFraction: number;
  entryPointIndex: number;
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

/** Emitted when an interactable object enters the player's range. */
export interface InteractionPromptEvent {
  objectType: string;
  displayName: string;
  interactionType: "pickup" | "open" | "push" | "search";
  immovable: boolean;
  worldX: number;
  worldY: number;
}

/** Emitted when no interactable object is in range. */
export type InteractionPromptClearEvent = Record<string, never>;

/** Emitted when the player examines an object. */
export interface ObjectExaminedEvent {
  objectType: string;
  displayName: string;
  category: string;
  properties: {
    durability: number;
    flammability: number;
    conductivity: number;
    lootValue: number;
    immovable: boolean;
  };
}

/** Emitted when the player's active quick-select slot changes. */
export interface ActiveSlotChangedEvent {
  activeSlot: number;
  /** The item type in the active slot, or null if empty. */
  itemType: string | null;
}

/** Emitted when a pickup attempt fails because inventory is full. */
export interface InventoryFullEvent {
  /** The item type that could not be picked up. */
  attemptedItemType: string;
  displayName: string;
}

/** Emitted when an item is dropped from inventory. */
export interface ObjectDroppedEvent {
  objectType: string;
  position: { x: number; y: number };
}

/** Emitted when dragging an object generates noise. */
export interface NoiseGeneratedEvent {
  position: { x: number; y: number };
  radius: number;
  source: string;
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

/** Emitted by UI to drop an item from inventory. */
export interface DropItemCommandEvent {
  /** Object type to drop (first matching item removed). */
  objectType?: string;
  /** Slot index to drop from (takes priority over objectType). */
  slotIndex?: number;
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
  "barricade-snap": [event: BarricadeSnapEvent];
  "barricade-damaged": [event: BarricadeDamagedEvent];
  "item-picked-up": [event: ItemPickedUpEvent];
  "active-slot-changed": [event: ActiveSlotChangedEvent];
  "inventory-full": [event: InventoryFullEvent];

  // Interaction
  "interaction-prompt": [event: InteractionPromptEvent];
  "interaction-prompt-clear": [event: InteractionPromptClearEvent];
  "object-examined": [event: ObjectExaminedEvent];
  "object-dropped": [event: ObjectDroppedEvent];
  "noise-generated": [event: NoiseGeneratedEvent];

  // UI → Game commands (prefixed with cmd:)
  "cmd:pause": [event: PauseCommandEvent];
  "cmd:resume": [event: ResumeCommandEvent];
  "cmd:settings-changed": [event: SettingsChangedEvent];
  "cmd:drop-item": [event: DropItemCommandEvent];
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
