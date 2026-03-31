"use client";

import { useGameStore } from "@/stores/useGameStore";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format seconds as M:SS for compact countdown display. */
function formatCountdown(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const m = Math.floor(clamped / 60);
  const s = Math.floor(clamped % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Map phase to display label. */
function phaseLabel(phase: string): string {
  switch (phase) {
    case "day":
      return "Day";
    case "dusk":
      return "Dusk";
    case "night":
      return "Night";
    case "dawn":
      return "Dawn";
    default:
      return phase;
  }
}

/** Map phase to icon character (sun or moon). */
function phaseIcon(phase: string): string {
  switch (phase) {
    case "day":
    case "dawn":
      return "\u2600"; // ☀
    case "night":
    case "dusk":
      return "\u263E"; // ☾
    default:
      return "";
  }
}

/** Phase-specific accent color for the progress bar indicator. */
function phaseColor(phase: string): string {
  switch (phase) {
    case "day":
      return "bg-amber-400";
    case "dusk":
      return "bg-orange-500";
    case "night":
      return "bg-indigo-500";
    case "dawn":
      return "bg-sky-400";
    default:
      return "bg-primary";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Day/night timer — top-center HUD element showing current phase,
 * day number, and a countdown to the next phase transition.
 */
export function DayNightTimer() {
  const phase = useGameStore((s) => s.phase);
  const dayNumber = useGameStore((s) => s.dayNumber);
  const timeRemaining = useGameStore((s) => s.timeRemainingInPhase);
  const phaseDuration = useGameStore((s) => s.phaseDuration);

  const elapsed = phaseDuration - timeRemaining;
  const progress = phaseDuration > 0
    ? Math.max(0, Math.min(100, (elapsed / phaseDuration) * 100))
    : 0;

  return (
    <div
      className="absolute top-4 left-1/2 -translate-x-1/2 w-44"
      data-testid="hud-day-night-timer"
    >
      {/* Day label and phase icon */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-zinc-300">
          Day {dayNumber}
        </span>
        <span className="flex items-center gap-1 text-xs text-zinc-300">
          <span aria-label={phaseLabel(phase)}>{phaseIcon(phase)}</span>
          <span>{phaseLabel(phase)}</span>
        </span>
      </div>

      {/* Countdown */}
      <div className="text-center mb-1">
        <span className="font-mono text-lg font-bold text-zinc-100">
          {formatCountdown(timeRemaining)}
        </span>
      </div>

      {/* Phase progress bar */}
      <Progress value={progress}>
        <ProgressTrack className="h-1.5 bg-zinc-800">
          <ProgressIndicator
            className={`${phaseColor(phase)} transition-colors duration-500`}
          />
        </ProgressTrack>
      </Progress>
    </div>
  );
}
