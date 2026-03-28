/**
 * Day/night cycle system — tracks elapsed game time, manages phase
 * transitions, and emits events for other systems to react to.
 *
 * Runs as a fixed-tick system (60 Hz). Writes to ctx.clockState which
 * the lighting render system reads each frame.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import type { SystemFn } from "./system-runner";
import type { SceneContext } from "./scene-context";
import { safeEmit } from "@/game/events/event-bus";
import {
  DAY_NIGHT,
  getPhaseDuration,
  getNextPhase,
} from "./day-night-constants";

/**
 * Create the day/night cycle system.
 *
 * The system accumulates `dt` each tick and transitions between phases
 * when the accumulated time exceeds the current phase's duration.
 * Phase changes update `ctx.clockState` and emit events on `ctx.eventBus`.
 */
export function createDayNightSystem(ctx: SceneContext): SystemFn {
  let phaseElapsed = 0;
  let ticksSinceLastEmit = 0;

  return (dt: number): void => {
    const { clockState, eventBus } = ctx;

    // Paused clock does not advance.
    if (clockState.paused) return;

    // Accumulate time in the current phase.
    phaseElapsed += dt;
    clockState.elapsedTotal += dt;

    // Check for phase transition.
    const duration = getPhaseDuration(clockState.phase, clockState.dayNumber);

    if (phaseElapsed >= duration) {
      const previousPhase = clockState.phase;
      const nextPhase = getNextPhase(previousPhase);

      // Dawn → Day increments the day counter.
      if (previousPhase === "dawn") {
        clockState.dayNumber += 1;
      }

      // Carry over excess time into the new phase.
      phaseElapsed = phaseElapsed - duration;

      // Update clock state.
      clockState.phase = nextPhase;
      const newDuration = getPhaseDuration(nextPhase, clockState.dayNumber);
      clockState.phaseDuration = newDuration;
      clockState.timeRemainingInPhase = Math.max(0, newDuration - phaseElapsed);

      // Emit phase-change event.
      safeEmit(eventBus, "phase-change", {
        phase: nextPhase,
        previousPhase,
        dayNumber: clockState.dayNumber,
        timeRemainingInPhase: clockState.timeRemainingInPhase,
      });

      // Reset tick-event counter so HUD gets an immediate update.
      ticksSinceLastEmit = DAY_NIGHT.TICK_EVENT_INTERVAL;
    } else {
      // Normal tick — update remaining time.
      clockState.timeRemainingInPhase = Math.max(0, duration - phaseElapsed);
    }

    // Throttled clock-tick event (~4 Hz at 60 Hz fixed tick).
    ticksSinceLastEmit += 1;
    if (ticksSinceLastEmit >= DAY_NIGHT.TICK_EVENT_INTERVAL) {
      ticksSinceLastEmit = 0;
      safeEmit(eventBus, "clock-tick", {
        phase: clockState.phase,
        dayNumber: clockState.dayNumber,
        timeRemainingInPhase: clockState.timeRemainingInPhase,
        phaseDuration: clockState.phaseDuration,
        elapsedTotal: clockState.elapsedTotal,
      });
    }
  };
}
