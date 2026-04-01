/**
 * Sensor body pool — recycles Matter.js sensor bodies used for melee swings.
 *
 * Melee attacks create a short-lived sensor body (~0.2s) to detect hits.
 * Rather than creating and destroying bodies each swing, this pool
 * deactivates sensors and moves them off-screen when not in use.
 *
 * NO React imports — this is pure TypeScript.
 */

import type { BodyRegistry } from "@/game/systems/body-registry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal interface for Phaser's Matter factory. */
export interface SensorMatterFactory {
  rectangle(
    x: number,
    y: number,
    width: number,
    height: number,
    options?: Record<string, unknown>,
  ): MatterJS.BodyType;
}

export interface SensorPoolStats {
  active: number;
  available: number;
  peak: number;
  totalAllocations: number;
  growEvents: number;
}

// ---------------------------------------------------------------------------
// Pool
// ---------------------------------------------------------------------------

export class SensorBodyPool {
  private dormant: MatterJS.BodyType[] = [];
  private activeSet = new Set<MatterJS.BodyType>();
  private _peak = 0;
  private _totalAllocations = 0;
  private _growEvents = 0;

  constructor(
    private readonly matterAdd: SensorMatterFactory,
    private readonly bodyRegistry: BodyRegistry,
    private readonly sensorWidth: number,
    private readonly sensorHeight: number,
    initialSize: number = 3,
  ) {
    this.prewarm(initialSize);
  }

  /** Pre-allocate sensor bodies. */
  prewarm(count: number): void {
    for (let i = 0; i < count; i++) {
      const body = this.createBody();
      this.dormant.push(body);
    }
  }

  /**
   * Acquire a sensor body at the given position.
   * The body is registered in the BodyRegistry.
   */
  acquire(x: number, y: number): MatterJS.BodyType {
    let body = this.dormant.shift();

    if (!body) {
      body = this.createBody();
      this._growEvents++;
      console.warn(
        `[SensorBodyPool] Pool exhausted — auto-growing (total: ${this._totalAllocations})`,
      );
    }

    // Reposition and activate
    body.position.x = x;
    body.position.y = y;
    // Sensor bodies are always static + sensor (that's their normal mode)
    // Just make sure they're visible to collision detection
    this.bodyRegistry.register(body);

    this.activeSet.add(body);
    if (this.activeSet.size > this._peak) {
      this._peak = this.activeSet.size;
    }

    return body;
  }

  /**
   * Release a sensor body back to the pool.
   * Unregisters from BodyRegistry and moves off-screen.
   */
  release(body: MatterJS.BodyType): void {
    this.bodyRegistry.unregister(body.id);

    // Move off-screen
    body.position.x = -9999;
    body.position.y = -9999;

    this.activeSet.delete(body);
    this.dormant.push(body);
  }

  /** Clear all tracked bodies. */
  clear(): void {
    this.dormant.length = 0;
    this.activeSet.clear();
    this._peak = 0;
    this._growEvents = 0;
  }

  get stats(): SensorPoolStats {
    return {
      active: this.activeSet.size,
      available: this.dormant.length,
      peak: this._peak,
      totalAllocations: this._totalAllocations,
      growEvents: this._growEvents,
    };
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private createBody(): MatterJS.BodyType {
    const body = this.matterAdd.rectangle(
      -9999, -9999,
      this.sensorWidth, this.sensorHeight,
      { isSensor: true, isStatic: true },
    );
    this._totalAllocations++;
    return body;
  }
}
