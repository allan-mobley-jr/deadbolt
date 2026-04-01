/**
 * Centralized ID generation utilities.
 *
 * Run IDs use crypto.randomUUID() for collision resistance (122-bit entropy).
 * Ephemeral IDs use a monotonic counter for zero-cost uniqueness within a session.
 *
 * @module
 */

/**
 * Generate a unique run ID for IndexedDB persistence.
 * Uses crypto.randomUUID() — 122 bits of entropy, effectively zero collision risk.
 */
export function generateRunId(): string {
  return `run-${crypto.randomUUID()}`;
}

/** Module-scoped monotonic counter for ephemeral IDs. */
let ephemeralCounter = 0;

/**
 * Generate a unique ephemeral ID for notifications, noise indicators, etc.
 * Uses a monotonic counter — guaranteed unique within a single page session.
 * Cheaper than crypto and sufficient for short-lived React keys.
 *
 * @param prefix - A descriptive prefix (e.g. "hit", "pickup", "noise").
 */
export function generateEphemeralId(prefix: string): string {
  return `${prefix}-${++ephemeralCounter}`;
}

/**
 * Reset the ephemeral counter. Only for testing.
 * @internal
 */
export function _resetEphemeralCounter(): void {
  ephemeralCounter = 0;
}
