"use client";

import { useEffect } from "react";

export default function GameContainer() {
  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;

    import("@/game/PhaserGame").then(({ createGame, destroyGame }) => {
      if (cancelled) return;
      createGame("game-container");
      destroy = destroyGame;
    });

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, []);

  return <div id="game-container" className="h-full w-full bg-black" />;
}
