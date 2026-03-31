"use client";

import { usePlayerStore } from "@/stores/usePlayerStore";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";

// ---------------------------------------------------------------------------
// Health thresholds for color changes
// ---------------------------------------------------------------------------

/** Below this fraction health bar turns red with pulse. */
const CRITICAL_THRESHOLD = 0.25;
/** Below this fraction health bar turns amber. */
const LOW_THRESHOLD = 0.5;

function getHealthColor(fraction: number): string {
  if (fraction <= CRITICAL_THRESHOLD) return "bg-red-500";
  if (fraction <= LOW_THRESHOLD) return "bg-amber-500";
  return "bg-emerald-500";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Health bar — top-left HUD element showing current/max HP.
 *
 * Uses shadcn/ui Progress with color that shifts from green → amber → red
 * as health decreases. Numeric value displayed in Geist Mono.
 */
export function HealthBar() {
  const health = usePlayerStore((s) => s.health);
  const maxHealth = usePlayerStore((s) => s.maxHealth);

  const fraction = maxHealth > 0 ? health / maxHealth : 1;
  const percentage = Math.round(fraction * 100);

  return (
    <div className="absolute top-4 left-4 w-48" data-testid="hud-health-bar">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-semibold text-zinc-400">HP</span>
        <span className="font-mono text-xs text-zinc-200">
          {Math.round(health)}/{maxHealth}
        </span>
      </div>
      <Progress value={percentage}>
        <ProgressTrack className="h-2 bg-zinc-800">
          <ProgressIndicator
            className={`${getHealthColor(fraction)} transition-colors duration-300`}
          />
        </ProgressTrack>
      </Progress>
    </div>
  );
}
