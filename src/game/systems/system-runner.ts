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
 */
export function runSystems(systems: readonly SystemFn[], dt: number): void {
  for (let i = 0; i < systems.length; i++) {
    systems[i](dt);
  }
}
