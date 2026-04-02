/**
 * Animation definitions for entity sprite playback.
 *
 * Each animation is a named sequence of global frame indices into the
 * entity's texture strip. The animation controller in render-sync-system
 * advances through these frames at the specified FPS.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Definition for a single named animation. */
export interface AnimDef {
  /** Global frame indices into the texture strip. */
  frames: readonly number[];
  /** Whether the animation loops when it reaches the end. */
  loop: boolean;
}

// ---------------------------------------------------------------------------
// Player animation definitions
// ---------------------------------------------------------------------------

/**
 * Player frame layout (12 frames, 3 per direction):
 *   0-2: South (idle, walk1, walk2)
 *   3-5: East  (idle, walk1, walk2)
 *   6-8: North (idle, walk1, walk2)
 *   9-11: West (idle, walk1, walk2)
 */
export const PLAYER_ANIMS: Readonly<Record<string, AnimDef>> = {
  // South
  idle_s:   { frames: [0], loop: true },
  walk_s:   { frames: [0, 1, 0, 2], loop: true },
  attack_s: { frames: [0], loop: false },
  // East
  idle_e:   { frames: [3], loop: true },
  walk_e:   { frames: [3, 4, 3, 5], loop: true },
  attack_e: { frames: [3], loop: false },
  // North
  idle_n:   { frames: [6], loop: true },
  walk_n:   { frames: [6, 7, 6, 8], loop: true },
  attack_n: { frames: [6], loop: false },
  // West
  idle_w:   { frames: [9], loop: true },
  walk_w:   { frames: [9, 10, 9, 11], loop: true },
  attack_w: { frames: [9], loop: false },
};

// ---------------------------------------------------------------------------
// Zombie animation definitions
// ---------------------------------------------------------------------------

/**
 * Zombie frame layout (2 frames per archetype):
 *   0: neutral/idle pose
 *   1: walk alternate pose
 */
export const ZOMBIE_ANIMS: Readonly<Record<string, AnimDef>> = {
  idle:    { frames: [0], loop: true },
  walk:    { frames: [0, 1], loop: true },
  attack:  { frames: [1], loop: false },
  stagger: { frames: [0], loop: false },
};

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

export const ANIM_FPS = {
  /** Player walk cycle frame rate. */
  PLAYER_WALK: 7,
  /** Zombie walk cycle frame rate (shambler/horde feel). */
  ZOMBIE_WALK: 5,
  /** Runner zombie frame rate (faster, more jittery). */
  ZOMBIE_RUNNER_WALK: 8,
  /** Brute zombie frame rate (slow, heavy). */
  ZOMBIE_BRUTE_WALK: 3,
  /** Horde zombie frame rate (quick, jittery). */
  ZOMBIE_HORDE_WALK: 9,
} as const;

// ---------------------------------------------------------------------------
// Direction helpers
// ---------------------------------------------------------------------------

/**
 * Map from angleToDirectionFrame() return values to animation name suffixes.
 * Index 0=South, 1=East, 2=North, 3=West.
 */
export const DIRECTION_SUFFIXES: readonly string[] = ["s", "e", "n", "w"];

/**
 * Get the walk FPS for a zombie variant.
 */
export function getZombieWalkFps(variant: string): number {
  switch (variant) {
    case "runner": return ANIM_FPS.ZOMBIE_RUNNER_WALK;
    case "brute": return ANIM_FPS.ZOMBIE_BRUTE_WALK;
    case "horde": return ANIM_FPS.ZOMBIE_HORDE_WALK;
    default: return ANIM_FPS.ZOMBIE_WALK;
  }
}
