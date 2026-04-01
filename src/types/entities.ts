/**
 * Shared entity classification types.
 *
 * These types are used across the types layer (persistence, world)
 * and re-exported by game-internal modules for backward compatibility.
 *
 * NO React imports — pure TypeScript types.
 */

// ---------------------------------------------------------------------------
// Zombie variants
// ---------------------------------------------------------------------------

/** All zombie variant identifiers. */
export type ZombieVariant = 'shambler' | 'runner' | 'brute' | 'horde';
