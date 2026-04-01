/**
 * A system is a pure function that advances game state by one fixed timestep.
 * @param dt Fixed timestep duration in seconds (e.g. 1/60).
 */
export type SystemFn = (dt: number) => void;

/**
 * Execute an ordered array of systems with the given fixed timestep.
 *
 * Systems run synchronously in array order — mutations from system N
 * are visible to system N+1 within the same tick.
 *
 * This is the original unguarded runner. Errors propagate immediately
 * and halt downstream systems. Use {@link SystemRunner} for per-system
 * error isolation.
 */
export function runSystems(systems: readonly SystemFn[], dt: number): void {
  for (let i = 0; i < systems.length; i++) {
    systems[i](dt);
  }
}

// ---------------------------------------------------------------------------
// Per-system error-isolated runner
// ---------------------------------------------------------------------------

/** Default maximum errors before a system is disabled. */
const DEFAULT_ERROR_BUDGET = 5;

/** Configuration options for {@link SystemRunner}. */
export interface SystemRunnerOptions {
  /**
   * Maximum errors a system may throw before it is permanently disabled
   * for this runner instance. Default: 5.
   */
  errorBudget?: number;
  /**
   * Optional human-readable names for each system, used in log messages.
   * Length must match the systems array. Falls back to index-based
   * identification when omitted.
   */
  names?: readonly string[];
  /** Called on each system error (after incrementing the count). */
  onError?: (index: number, name: string, error: unknown, errorCount: number) => void;
  /** Called once when a system is disabled after exhausting its budget. */
  onDisabled?: (index: number, name: string) => void;
}

/**
 * Error-isolated system executor with per-system error budgets.
 *
 * Wraps each system call in its own try-catch so a single failing
 * system cannot prevent others from running. Systems that exceed
 * their error budget are permanently disabled for the session.
 *
 * Call {@link reset} between runs to re-enable all systems and
 * clear error counts.
 */
export class SystemRunner {
  private readonly systems: readonly SystemFn[];
  private readonly errorCounts: number[];
  private readonly disabledFlags: boolean[];
  private readonly errorBudget: number;
  private readonly names: readonly string[];
  private readonly _onError?: (index: number, name: string, error: unknown, errorCount: number) => void;
  private readonly _onDisabled?: (index: number, name: string) => void;

  constructor(systems: readonly SystemFn[], options?: SystemRunnerOptions) {
    const budget = options?.errorBudget ?? DEFAULT_ERROR_BUDGET;
    if (budget < 1 || !Number.isInteger(budget)) {
      throw new Error(
        `[SystemRunner] errorBudget must be a positive integer, got ${budget}`,
      );
    }
    if (options?.names && options.names.length !== systems.length) {
      throw new Error(
        `[SystemRunner] names length (${options.names.length}) must match ` +
        `systems length (${systems.length})`,
      );
    }
    this.systems = systems;
    this.errorBudget = budget;
    this.names = options?.names ?? systems.map((_, i) => `System[${i}]`);
    this._onError = options?.onError;
    this._onDisabled = options?.onDisabled;
    this.errorCounts = new Array<number>(systems.length).fill(0);
    this.disabledFlags = new Array<boolean>(systems.length).fill(false);
  }

  /**
   * Run all non-disabled systems with per-system error isolation.
   *
   * Systems execute in array order — mutations from system N are
   * visible to system N+1 within the same tick (same as {@link runSystems}).
   */
  run(dt: number): void {
    for (let i = 0; i < this.systems.length; i++) {
      if (this.disabledFlags[i]) continue;
      try {
        this.systems[i](dt);
      } catch (err) {
        const count = ++this.errorCounts[i];
        const name = this.names[i];

        console.error(
          `[${name}] System error ${count}/${this.errorBudget}:`,
          err,
        );
        try { this._onError?.(i, name, err, count); } catch { /* swallow — callback must not break isolation */ }

        if (count >= this.errorBudget) {
          this.disabledFlags[i] = true;
          console.warn(
            `[${name}] Disabled after ${count} errors`,
          );
          try { this._onDisabled?.(i, name); } catch { /* swallow — callback must not break isolation */ }
        }
      }
    }
  }

  /** True if the system at this index has been disabled. */
  isDisabled(index: number): boolean {
    return this.disabledFlags[index] ?? false;
  }

  /** Number of currently disabled systems. */
  get disabledCount(): number {
    let count = 0;
    for (let i = 0; i < this.disabledFlags.length; i++) {
      if (this.disabledFlags[i]) count++;
    }
    return count;
  }

  /** Reset all error counts and re-enable all systems. */
  reset(): void {
    this.errorCounts.fill(0);
    this.disabledFlags.fill(false);
  }
}
