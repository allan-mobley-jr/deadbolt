"use client";

import dynamic from "next/dynamic";
import { InteractionPrompt } from "@/components/interaction-prompt";
import { DeathScreen } from "@/components/death-screen";
import { HudOverlay } from "@/components/hud/hud-overlay";
import { useGameStore } from "@/stores/useGameStore";

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

  return (
    <div className="relative h-screen w-screen">
      <GameContainer key={runKey} />
      <HudOverlay />
      <InteractionPrompt />
      <DeathScreen />
    </div>
  );
}
