/**
 * Pool manager — aggregates all entity pools for diagnostics and lifecycle.
 *
 * Provides a single `clearAll()` call for run boundaries (permadeath restart)
 * and aggregate stats for debug overlays.
 *
 * NO React imports — this is pure TypeScript.
 */

import type { EntityPool, PoolStats } from "./pool";
import type { Entity } from "./entity";

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: PoolManager | null = null;

/** Get the global pool manager instance (null before initialisation). */
export function getPoolManager(): PoolManager | null {
  return instance;
}

/** Set the global pool manager instance (called from GameScene.create). */
export function setPoolManager(pm: PoolManager | null): void {
  instance = pm;
}

// ---------------------------------------------------------------------------
// Manager class
// ---------------------------------------------------------------------------

export class PoolManager {
  private pools = new Map<string, EntityPool<Entity>>();

  /** Register a pool under a unique name. */
  register<T extends Entity>(name: string, pool: EntityPool<T>): void {
    this.pools.set(name, pool as unknown as EntityPool<Entity>);
  }

  /** Retrieve a registered pool by name. */
  get(name: string): EntityPool<Entity> | undefined {
    return this.pools.get(name);
  }

  /** Clear all registered pools (dormant entities drained, stats reset). */
  clearAll(): void {
    for (const pool of this.pools.values()) {
      pool.clear();
    }
  }

  /** Snapshot of all pool stats. */
  allStats(): PoolStats[] {
    return Array.from(this.pools.values()).map((p) => p.stats);
  }

  /** Formatted multi-line string for debug overlays. */
  debugString(): string {
    const lines: string[] = [];
    for (const pool of this.pools.values()) {
      const s = pool.stats;
      lines.push(
        `${s.name}: ${s.active} active / ${s.available} avail / ${s.peak} peak / ${s.growEvents} grows`,
      );
    }
    return lines.join("\n");
  }
}
