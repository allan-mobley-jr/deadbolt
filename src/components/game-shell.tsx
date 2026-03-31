"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { InteractionPrompt } from "@/components/interaction-prompt";
import { DeathScreen } from "@/components/death-screen";
import { HudOverlay } from "@/components/hud/hud-overlay";
import { PauseMenu } from "@/components/pause-menu";
import { SettingsDialog } from "@/components/settings-dialog";
import { ControlsReference } from "@/components/controls-reference";
import { useGameStore } from "@/stores/useGameStore";
import { useUIStore } from "@/stores/useUIStore";

const GameContainer = dynamic(
  () => import("@/components/game-container"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-black">
        <p className="font-mono text-sm text-muted-foreground animate-pulse">
          Loading game&hellip;
        </p>
      </div>
    ),
  },
);

export default function GameShell() {
  const runKey = useGameStore((s) => s.runKey);

  // --- ESC key handler — context-sensitive menu navigation ---
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();

      const { activeMenu, overlays } = useUIStore.getState();

      // Controls overlay open → close it (back to pause)
      if (overlays.includes("controls")) {
        useUIStore.getState().popOverlay("controls");
        return;
      }

      // Settings open → back to pause
      if (activeMenu === "settings") {
        useUIStore.getState().openMenu("pause");
        return;
      }

      // Pause menu open → resume game
      if (activeMenu === "pause") {
        useUIStore.getState().closeMenu();
        useGameStore.getState().setPaused(false);
        return;
      }

      // Death screen → do nothing
      if (activeMenu === "death") return;

      // Gameplay (no menu) → open pause
      if (activeMenu === "none") {
        useUIStore.getState().openMenu("pause");
        useGameStore.getState().setPaused(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="relative h-screen w-screen">
      <GameContainer key={runKey} />
      <HudOverlay />
      <InteractionPrompt />
      <PauseMenu />
      <SettingsDialog />
      <ControlsReference />
      <DeathScreen />
    </div>
  );
}
