"use client";

import { lazy, Suspense, useEffect } from "react";
import dynamic from "next/dynamic";
import { InteractionPrompt } from "@/components/interaction-prompt";
import { HudOverlay } from "@/components/hud/hud-overlay";
import { useGameStore } from "@/stores/useGameStore";
import { useUIStore } from "@/stores/useUIStore";
import { usePersistenceStore } from "@/stores/usePersistenceStore";

// Lazy-loaded overlays — only rendered when their menu state is active
const DeathScreen = lazy(() =>
  import("@/components/death-screen").then((m) => ({ default: m.DeathScreen })),
);
const PauseMenu = lazy(() =>
  import("@/components/pause-menu").then((m) => ({ default: m.PauseMenu })),
);
const SettingsDialog = lazy(() =>
  import("@/components/settings-dialog").then((m) => ({
    default: m.SettingsDialog,
  })),
);
const ControlsReference = lazy(() =>
  import("@/components/controls-reference").then((m) => ({
    default: m.ControlsReference,
  })),
);

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

  // --- Load persistence data from IndexedDB on mount ---
  useEffect(() => {
    usePersistenceStore.getState().loadFromDB();
  }, []);

  // --- ESC key handler — context-sensitive menu navigation ---
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (e.repeat) return; // Ignore key-repeat to prevent rapid state oscillation
      e.preventDefault();

      const { activeMenu, overlays } = useUIStore.getState();

      // Abandon Run confirmation dialog is open → dismiss it
      if (overlays.includes("confirm-abandon")) {
        useUIStore.getState().popOverlay("confirm-abandon");
        return;
      }

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
      <Suspense fallback={null}>
        <PauseMenu />
      </Suspense>
      <Suspense fallback={null}>
        <SettingsDialog />
      </Suspense>
      <Suspense fallback={null}>
        <ControlsReference />
      </Suspense>
      <Suspense fallback={null}>
        <DeathScreen />
      </Suspense>
    </div>
  );
}
