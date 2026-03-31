"use client";

import { useGameStore } from "@/stores/useGameStore";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Wave indicator — appears below the day/night timer during active waves.
 *
 * Shows the current wave number, kill progress, and remaining count.
 * Only renders when a wave is active (night phase).
 */
export function WaveIndicator() {
  const waveActive = useGameStore((s) => s.waveActive);
  const waveNumber = useGameStore((s) => s.waveNumber);
  const zombiesInWave = useGameStore((s) => s.zombiesInWave);
  const zombiesRemaining = useGameStore((s) => s.zombiesRemainingInWave);

  if (!waveActive) return null;

  const killed = zombiesInWave - zombiesRemaining;
  const progress = zombiesInWave > 0 ? (killed / zombiesInWave) * 100 : 0;

  return (
    <div
      className="absolute top-[5.5rem] left-1/2 -translate-x-1/2 w-40"
      data-testid="hud-wave-indicator"
    >
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-semibold text-red-400 animate-pulse">
          Wave {waveNumber}
        </span>
        <span className="font-mono text-xs text-zinc-400">
          {killed}/{zombiesInWave}
        </span>
      </div>

      <Progress value={progress}>
        <ProgressTrack className="h-1.5 bg-zinc-800">
          <ProgressIndicator className="bg-red-500 transition-all duration-300" />
        </ProgressTrack>
      </Progress>
    </div>
  );
}
