"use client";

import { useUIStore } from "@/stores/useUIStore";
import { HealthBar } from "./health-bar";
import { DayNightTimer } from "./day-night-timer";
import { WaveIndicator } from "./wave-indicator";
import { InventoryBar } from "./inventory-bar";
import { Minimap } from "./minimap";
import { LowHealthVignette } from "./low-health-vignette";
import { NotificationToasts } from "./notification-toasts";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Top-level HUD overlay — positioned absolutely over the Phaser canvas.
 *
 * Uses pointer-events-none so all mouse events pass through to the game.
 * Fades out when a menu is active (pause, death, settings) and fades
 * back in when gameplay resumes.
 *
 * Each child component subscribes to its own Zustand selectors so only
 * the affected HUD element re-renders on state changes.
 */
export function HudOverlay() {
  const activeMenu = useUIStore((s) => s.activeMenu);
  const isVisible = activeMenu === "none";

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-40 transition-opacity duration-300 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
      data-testid="hud-overlay"
      aria-hidden={!isVisible}
    >
      <HealthBar />
      <DayNightTimer />
      <WaveIndicator />
      <Minimap />
      <InventoryBar />
      <LowHealthVignette />
      <NotificationToasts />
    </div>
  );
}
