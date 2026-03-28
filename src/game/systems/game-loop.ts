import { type SystemFn, runSystems } from "./system-runner";

/** Fixed physics tick rate: 60 Hz (~16.67 ms per step). */
export const FIXED_DT = 1 / 60;

/** Maximum physics steps per frame to prevent spiral of death. */
export const MAX_STEPS_PER_FRAME = 5;

/** Snapshot of game loop metrics for debug display. */
export interface GameLoopStats {
  /** Smoothed render FPS (frames per second). */
  fps: number;
  /** Number of physics ticks executed in the most recent frame. */
  physicsTicks: number;
  /** Interpolation alpha [0, 1) for rendering between physics states. */
  alpha: number;
}

/**
 * Fixed-timestep accumulator that decouples physics (60 Hz) from
 * the browser's variable render rate. Includes a spiral-of-death
 * guard that caps physics steps per frame.
 */
export class GameLoop {
  private accumulator = 0;
  private _alpha = 0;
  private _physicsTicks = 0;

  // Exponential moving average for smooth FPS readout
  private _fps = 60;
  private static readonly SMOOTHING = 0.05;

  private readonly fixedDt: number;
  private readonly maxSteps: number;
  private readonly systems: readonly SystemFn[];

  constructor(
    systems: readonly SystemFn[],
    fixedDt: number = FIXED_DT,
    maxSteps: number = MAX_STEPS_PER_FRAME,
  ) {
    if (fixedDt <= 0) {
      throw new Error(`[GameLoop] fixedDt must be positive, got ${fixedDt}`);
    }
    if (maxSteps < 1 || !Number.isInteger(maxSteps)) {
      throw new Error(
        `[GameLoop] maxSteps must be a positive integer, got ${maxSteps}`,
      );
    }
    this.systems = systems;
    this.fixedDt = fixedDt;
    this.maxSteps = maxSteps;
  }

  /**
   * Advance the simulation by one render frame.
   *
   * @param dtSeconds Elapsed time since last frame **in seconds**.
   *   Phaser provides delta in milliseconds — the caller must convert:
   *   `gameLoop.tick(delta / 1000)`.
   */
  tick(dtSeconds: number): void {
    // Clamp non-positive deltas (e.g. browser timer glitches on tab resume)
    if (dtSeconds <= 0) {
      return;
    }

    // --- FPS (exponential moving average) ---
    this._fps += GameLoop.SMOOTHING * (1 / dtSeconds - this._fps);

    // --- Accumulator ---
    this.accumulator += dtSeconds;

    // Spiral-of-death guard: clamp accumulated time so we never
    // execute more than maxSteps physics ticks in a single frame.
    const cap = this.fixedDt * this.maxSteps;
    if (this.accumulator > cap) {
      this.accumulator = cap;
    }

    // --- Fixed-timestep physics ticks ---
    let steps = 0;
    while (this.accumulator >= this.fixedDt) {
      runSystems(this.systems, this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps++;
    }
    this._physicsTicks = steps;

    // --- Interpolation alpha ---
    // How far between the last physics tick and the next [0, 1).
    // Render systems will use this to interpolate sprite positions.
    this._alpha = this.accumulator / this.fixedDt;
  }

  /** Interpolation alpha [0, 1) for rendering between physics states. */
  get alpha(): number {
    return this._alpha;
  }

  /** Physics ticks executed in the most recent frame. */
  get physicsTicks(): number {
    return this._physicsTicks;
  }

  /** Smoothed render FPS. */
  get fps(): number {
    return this._fps;
  }

  /** Snapshot of all loop metrics. */
  get stats(): GameLoopStats {
    return {
      fps: this._fps,
      physicsTicks: this._physicsTicks,
      alpha: this._alpha,
    };
  }
}
