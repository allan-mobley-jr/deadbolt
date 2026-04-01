/**
 * Seed override for the next roguelike run.
 *
 * Module-scoped variable that the death screen's "Try Same Seed" button
 * writes and LoadingScene consumes. Lives in src/lib/ (not src/game/)
 * so React components can import it without pulling in Phaser.
 *
 * NO Phaser imports — safe for SSR and client components.
 */

let nextRunSeed: string | null = null;

/** Set a seed override for the next run ("Try Same Seed" feature). */
export function setNextRunSeed(seed: string | null): void {
  nextRunSeed = seed;
}

/**
 * Consume the next-run seed override (returns and clears it).
 * Called by LoadingScene — if non-null, uses this instead of generating
 * a random seed.
 */
export function consumeNextRunSeed(): string | null {
  const seed = nextRunSeed;
  nextRunSeed = null;
  return seed;
}
