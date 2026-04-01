/**
 * Generic entity pool for recycling frequently created and destroyed entities.
 *
 * Pooled entities are removed from the ECS world when dormant and re-added
 * when acquired. This keeps Miniplex queries clean — dormant entities are
 * never iterated by systems.
 *
 * Uses a FIFO queue (not stack) so that recently released entities are
 * reused last. This prevents visual glitches when render-phase cleanup
 * (e.g., death flash) runs one frame after entity release.
 *
 * NO React imports — this is pure TypeScript.
 */

import type { Entity } from "./entity";
import { world } from "./world";

// ---------------------------------------------------------------------------
// Pool statistics
// ---------------------------------------------------------------------------

/** Snapshot of a pool's usage metrics. */
export interface PoolStats {
  /** Name of the pool (for diagnostics). */
  name: string;
  /** Number of entities currently in use (in the ECS world). */
  active: number;
  /** Number of entities available for reuse (dormant). */
  available: number;
  /** Highest value of `active` seen during this session. */
  peak: number;
  /** Total number of entities created (including pre-warmed). */
  totalAllocations: number;
  /** Number of grow events (allocations beyond pre-warmed capacity). */
  growEvents: number;
}

// ---------------------------------------------------------------------------
// Entity pool
// ---------------------------------------------------------------------------

/**
 * Configuration for resetting a pooled entity on acquisition.
 *
 * The reset function receives the entity and must overwrite all mutable
 * component values to their initial state. It should mutate the existing
 * component objects in place rather than replacing them, preserving object
 * identity for external Maps keyed by entity reference.
 */
export type ResetFn<T extends Entity> = (entity: T) => void;

/**
 * Factory function that creates a new entity object (not yet in the world).
 * Called during pre-warming and when the pool needs to grow beyond its
 * pre-warmed capacity.
 */
export type FactoryFn<T extends Entity> = () => T;

export interface PoolConfig {
  /** Pool name for diagnostics. */
  name: string;
  /** Number of entities to pre-allocate. */
  initialSize: number;
  /** Hard cap on pool size. New entities beyond this are still created but
   *  not returned to the pool on release. 0 = unlimited. */
  maxSize: number;
}

/**
 * Generic entity pool supporting any Miniplex entity archetype.
 *
 * Lifecycle:
 * - **prewarm(n)**: create n entities and push to the dormant queue.
 * - **acquire()**: pop from dormant queue → reset → `world.add()` → return.
 * - **release(entity)**: `world.remove()` → push to dormant queue.
 * - **clear()**: drain all dormant entities (active entities are left in the world
 *   for `resetWorld()` to handle).
 */
export class EntityPool<T extends Entity> {
  private dormant: T[] = [];
  private activeSet = new Set<T>();
  private _peak = 0;
  private _totalAllocations = 0;
  private _growEvents = 0;

  constructor(
    private readonly config: PoolConfig,
    private readonly factory: FactoryFn<T>,
    private readonly reset: ResetFn<T>,
  ) {}

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Pre-allocate entities into the dormant queue.
   * Typically called once during scene initialisation.
   */
  prewarm(count: number): void {
    for (let i = 0; i < count; i++) {
      const entity = this.factory();
      this._totalAllocations++;
      this.dormant.push(entity);
    }
  }

  /**
   * Acquire an entity from the pool.
   *
   * If the dormant queue is empty, a new entity is created (auto-grow)
   * and a warning is logged. The entity is reset and added to the ECS world.
   */
  acquire(): T {
    let entity: T | undefined = this.dormant.shift(); // FIFO

    if (!entity) {
      entity = this.factory();
      this._totalAllocations++;
      this._growEvents++;
      console.warn(
        `[EntityPool:${this.config.name}] Pool exhausted — auto-growing (total: ${this._totalAllocations})`,
      );
    }

    this.reset(entity);
    world.add(entity);
    this.activeSet.add(entity);

    if (this.activeSet.size > this._peak) {
      this._peak = this.activeSet.size;
    }

    return entity;
  }

  /**
   * Release an entity back to the pool.
   *
   * Removes the entity from the ECS world and pushes it to the back of
   * the dormant queue (FIFO ensures it won't be reused immediately).
   */
  release(entity: T): void {
    if (!this.activeSet.has(entity)) {
      console.warn(
        `[EntityPool:${this.config.name}] Attempted to release an entity not tracked by this pool.`,
      );
      // Still remove from world as a safety measure
      world.remove(entity);
      return;
    }

    world.remove(entity);
    this.activeSet.delete(entity);

    // Respect max size — don't hoard entities beyond the cap
    if (this.config.maxSize > 0 && this.dormant.length >= this.config.maxSize) {
      return; // Let the entity be GC'd
    }

    this.dormant.push(entity);
  }

  /** Drain all dormant entities. Does NOT touch active entities. */
  clear(): void {
    this.dormant.length = 0;
    this.activeSet.clear();
    this._peak = 0;
    this._growEvents = 0;
  }

  /** Current pool statistics snapshot. */
  get stats(): PoolStats {
    return {
      name: this.config.name,
      active: this.activeSet.size,
      available: this.dormant.length,
      peak: this._peak,
      totalAllocations: this._totalAllocations,
      growEvents: this._growEvents,
    };
  }
}
