"use client";

import { useEffect, useState } from "react";

export default function GameContainer() {
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;

    import("@/game/PhaserGame")
      .then(({ createGame, destroyGame }) => {
        if (cancelled) return;
        createGame("game-container");
        destroy = destroyGame;
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const e = err instanceof Error ? err : new Error(String(err));
        console.error("[GameContainer] Failed to initialize game:", e);
        setError(e);
      });

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, []);

  if (error) {
    throw error; // Caught by the /play error.tsx boundary
  }

  return <div id="game-container" className="h-full w-full bg-black" />;
}
