"use client";

import dynamic from "next/dynamic";

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
  return (
    <div className="h-screen w-screen">
      <GameContainer />
    </div>
  );
}
