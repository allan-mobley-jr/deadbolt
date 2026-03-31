"use client";

import { usePlayerStore } from "@/stores/usePlayerStore";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Health fraction at or below which the vignette appears. */
const VIGNETTE_THRESHOLD = 0.3;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Low-health vignette — full-screen red pulsing overlay that appears
 * when the player's health drops below 30%.
 *
 * Uses a CSS box-shadow inset for the vignette effect with a keyframe
 * pulse animation. Inherits pointer-events-none from the HUD container
 * so gameplay is not interrupted.
 */
export function LowHealthVignette() {
  const health = usePlayerStore((s) => s.health);
  const maxHealth = usePlayerStore((s) => s.maxHealth);

  const fraction = maxHealth > 0 ? health / maxHealth : 1;

  if (fraction > VIGNETTE_THRESHOLD) return null;

  return (
    <div
      className="absolute inset-0 animate-pulse"
      data-testid="hud-low-health-vignette"
      style={{
        boxShadow: "inset 0 0 80px rgba(220, 38, 38, 0.4)",
      }}
    />
  );
}
