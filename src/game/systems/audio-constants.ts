/**
 * Audio system constants and sound key registry.
 *
 * All tunable parameters for spatial audio, music crossfading,
 * and sound effect configuration. Sound keys are the asset keys
 * that the audio system uses to play sounds via Phaser.
 *
 * NO React imports — this is pure TypeScript.
 */

// ---------------------------------------------------------------------------
// Spatial audio
// ---------------------------------------------------------------------------

export const AUDIO = {
  /** Pixels beyond which spatial SFX are completely silent. */
  SPATIAL_MAX_RANGE: 800,

  /** Pixels at which spatial volume is at full strength (1.0). */
  SPATIAL_REF_DISTANCE: 50,

  /** Inverse-distance rolloff exponent (higher = faster falloff). */
  SPATIAL_ROLLOFF: 1.5,

  /** Maximum stereo pan value (+/- 1.0). */
  PAN_MAX: 1.0,

  // --- Music ---

  /** Duration of music crossfade in seconds. */
  MUSIC_CROSSFADE_DURATION: 2.0,

  /** Base night music volume (0-1). */
  NIGHT_MUSIC_BASE_VOLUME: 0.6,

  /** Volume increase per wave pulse during night. */
  NIGHT_INTENSITY_RAMP: 0.1,

  /** Maximum night music volume after ramping. */
  NIGHT_MUSIC_MAX_VOLUME: 1.0,

  /** Day music volume target (0-1). */
  DAY_MUSIC_VOLUME: 0.4,

  // --- Zombie groans ---

  /** Minimum seconds between groan triggers for a given zombie. */
  ZOMBIE_GROAN_COOLDOWN: 4.0,

  /** Detune minimum in cents for pitch randomization. */
  ZOMBIE_GROAN_PITCH_MIN: -300,

  /** Detune maximum in cents for pitch randomization. */
  ZOMBIE_GROAN_PITCH_MAX: 300,

  /** Maximum distance (pixels) at which zombie groans are audible. */
  ZOMBIE_GROAN_RANGE: 400,

  /** Maximum concurrent zombie groan sounds. */
  ZOMBIE_GROAN_MAX_CONCURRENT: 6,

  // --- Heartbeat ---

  /** Health fraction at or below which heartbeat starts. */
  HEARTBEAT_HEALTH_THRESHOLD: 0.25,

  /** Seconds between heartbeat sounds. */
  HEARTBEAT_INTERVAL: 0.8,

  // --- Concurrent SFX limits ---

  /** Maximum concurrent explosion sounds. */
  MAX_CONCURRENT_EXPLOSIONS: 4,

  /** Maximum concurrent fire sounds. */
  MAX_CONCURRENT_FIRE: 4,

  // --- Mute ---

  /** Keyboard key string for mute toggle. */
  MUTE_KEY: "M",
} as const;

// ---------------------------------------------------------------------------
// Sound key registry
// ---------------------------------------------------------------------------

/** All sound asset keys used by the audio system. */
export const SOUND_KEYS = {
  // Music
  MUSIC_DAY: "music_day",
  MUSIC_NIGHT: "music_night",

  // Combat SFX
  SFX_MELEE_SWING: "sfx_melee_swing",
  SFX_HIT_IMPACT: "sfx_hit_impact",
  SFX_PLAYER_HURT: "sfx_player_hurt",
  SFX_ZOMBIE_DEATH: "sfx_zombie_death",
  SFX_ZOMBIE_GROAN: "sfx_zombie_groan",

  // Building SFX
  SFX_BARRICADE_PLACE: "sfx_barricade_place",
  SFX_BARRICADE_HIT: "sfx_barricade_hit",
  SFX_BARRICADE_BREAK: "sfx_barricade_break",

  // Item SFX
  SFX_ITEM_PICKUP: "sfx_item_pickup",
  SFX_INVENTORY_FULL: "sfx_inventory_full",

  // Environment SFX
  SFX_FIRE_IGNITE: "sfx_fire_ignite",
  SFX_FIRE_CRACKLING: "sfx_fire_crackling",
  SFX_EXPLOSION: "sfx_explosion",
  SFX_ELECTRIC_HUM: "sfx_electric_hum",
  SFX_ELECTRIC_ZAP: "sfx_electric_zap",

  // Feedback SFX
  SFX_HEARTBEAT: "sfx_heartbeat",
  SFX_WAVE_ALARM: "sfx_wave_alarm",
  SFX_PHASE_TRANSITION: "sfx_phase_transition",
} as const;

/** Array of all sound keys for iteration (e.g., placeholder generation). */
export const ALL_SOUND_KEYS: readonly string[] = Object.values(SOUND_KEYS);
