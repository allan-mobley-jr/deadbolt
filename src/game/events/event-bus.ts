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
import type { ZombieVariant, MaterialState } from "@/game/ecs/components";

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
  /** Zombie variant for per-type kill tracking. */
  variant: ZombieVariant;
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

/** Emitted at the start of a new run with the seed for UI display. */
export interface RunStartedEvent {
  seed: string;
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
// Event payload types — Combat (issue #26)
// ---------------------------------------------------------------------------

/** Emitted when the player starts a melee swing (for visual feedback). */
export interface MeleeSwingEvent {
  position: { x: number; y: number };
  /** Aim angle in radians. */
  aimAngle: number;
  /** Swing reach in pixels (for visual arc size). */
  range: number;
  /** Equipped item type, or null for bare hands. */
  itemType: string | null;
}

/** Emitted when the player deals damage to a zombie. */
export interface DamageDealtEvent {
  position: { x: number; y: number };
  damage: number;
  targetType: "zombie";
}

/** Emitted when the player takes damage from a zombie. */
export interface PlayerHitEvent {
  position: { x: number; y: number };
  damage: number;
  /** Normalised direction from player toward attacker (for directional screen flash). */
  sourceDirection: { x: number; y: number };
}

// ---------------------------------------------------------------------------
// Event payload types — Material state (issue #28)
// ---------------------------------------------------------------------------

/** Emitted when an entity's material state changes (burning, electrified, inert). */
export interface MaterialStateChangedEvent {
  position: { x: number; y: number };
  objectType: string;
  previousState: MaterialState;
  newState: MaterialState;
}

// ---------------------------------------------------------------------------
// Event payload types — Fire (issue #29)
// ---------------------------------------------------------------------------

/** Emitted when an object ignites (starts burning). */
export interface FireIgnitedEvent {
  position: { x: number; y: number };
  objectType: string;
  /** The object type that caused the ignition, or null for external source. */
  sourceObjectType: string | null;
}

/** Emitted when fire spreads from one object to another. */
export interface FireSpreadEvent {
  sourcePosition: { x: number; y: number };
  targetPosition: { x: number; y: number };
  targetObjectType: string;
}

/** Emitted when fire deals area-of-effect damage. */
export interface FireDamageEvent {
  position: { x: number; y: number };
  damage: number;
  targetType: "zombie" | "player";
}

/** Emitted when a burning object burns out and is destroyed. */
export interface FireBurnoutEvent {
  position: { x: number; y: number };
  objectType: string;
  /** True if the destroyed object was a barricade. */
  wasBarricade: boolean;
}

// ---------------------------------------------------------------------------
// Event payload types — Electricity (issue #30)
// ---------------------------------------------------------------------------

/** Emitted when an electric chain is formed or recalculated with a new size. */
export interface ElectricityChainFormedEvent {
  batteryPosition: { x: number; y: number };
  /** Number of entities in the chain (including the battery). */
  chainSize: number;
}

/** Emitted when an electrified object deals contact damage. */
export interface ElectricityDamageEvent {
  position: { x: number; y: number };
  damage: number;
  targetType: "zombie" | "player";
}

/** Emitted when a car battery runs out of charge. */
export interface ElectricityDepletedEvent {
  batteryPosition: { x: number; y: number };
}

/** Emitted periodically with current battery charge level. */
export interface ElectricityChargeChangedEvent {
  batteryPosition: { x: number; y: number };
  charge: number;
  maxCharge: number;
}

// ---------------------------------------------------------------------------
// Event payload types — Explosion (issue #31)
// ---------------------------------------------------------------------------

/** Emitted when an explosive object detonates. */
export interface ExplosionDetonatedEvent {
  position: { x: number; y: number };
  objectType: string;
  /** Explosive potential of the source (0-1), determines blast magnitude. */
  explosivePotential: number;
  /** Blast radius in pixels. */
  radius: number;
}

/** Emitted when an explosion deals area damage. */
export interface ExplosionDamageEvent {
  position: { x: number; y: number };
  damage: number;
  targetType: "zombie" | "player" | "barricade" | "object";
}

/** Emitted when an explosion destroys a wall tile. */
export interface ExplosionWallDestroyedEvent {
  tilePosition: { x: number; y: number };
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

  // Run lifecycle
  "run-started": [event: RunStartedEvent];

  // Combat / waves
  "wave-started": [event: WaveStartedEvent];
  "wave-ended": [event: WaveEndedEvent];
  "zombie-killed": [event: ZombieKilledEvent];

  // Combat (player melee)
  "melee-swing": [event: MeleeSwingEvent];
  "damage-dealt": [event: DamageDealtEvent];
  "player-hit": [event: PlayerHitEvent];

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

  // Material state
  "material-state-changed": [event: MaterialStateChangedEvent];

  // Fire (issue #29)
  "fire-ignited": [event: FireIgnitedEvent];
  "fire-spread": [event: FireSpreadEvent];
  "fire-damage": [event: FireDamageEvent];
  "fire-burnout": [event: FireBurnoutEvent];

  // Electricity (issue #30)
  "electricity-chain-formed": [event: ElectricityChainFormedEvent];
  "electricity-damage": [event: ElectricityDamageEvent];
  "electricity-depleted": [event: ElectricityDepletedEvent];
  "electricity-charge-changed": [event: ElectricityChargeChangedEvent];

  // Explosion (issue #31)
  "explosion-detonated": [event: ExplosionDetonatedEvent];
  "explosion-damage": [event: ExplosionDamageEvent];
  "explosion-wall-destroyed": [event: ExplosionWallDestroyedEvent];

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
