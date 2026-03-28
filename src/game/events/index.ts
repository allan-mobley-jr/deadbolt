// Event bus
export { createGameEventBus, safeEmit } from "./event-bus";
export type { GameEventBus, GameEventMap } from "./event-bus";

// Event payloads — Game → UI
export type {
  PhaseChangeEvent,
  ClockTickEvent,
  PlayerHealthChangedEvent,
  InventorySlot,
  InventoryChangedEvent,
  WaveStartedEvent,
  WaveEndedEvent,
  ZombieKilledEvent,
  BarricadePlacedEvent,
  BarricadeBrokenEvent,
  ItemPickedUpEvent,
  PlayerDiedEvent,
} from "./event-bus";

// Event payloads — UI → Game commands
export type {
  PauseCommandEvent,
  ResumeCommandEvent,
  SettingsChangedEvent,
} from "./event-bus";
