"use client";

import { useEffect, useState } from "react";
import { connectBridge } from "@/lib/bridge";
import type { BridgeConnection } from "@/lib/bridge";

export default function GameContainer() {
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;
    let bridge: BridgeConnection | null = null;

    import("@/game/PhaserGame")
      .then(({ createGame, destroyGame, getActiveBus }) => {
        if (cancelled) return;
        createGame("game-container");
        destroy = destroyGame;

        // Connect the bridge once the bus is available.
        // The bus is set synchronously in GameScene.create(), which runs
        // during scene boot after createGame(). Poll briefly in case
        // the scene hasn't initialised yet (e.g. assets still loading).
        const tryConnect = () => {
          if (cancelled) return;
          const bus = getActiveBus();
          if (bus) {
            bridge = connectBridge(bus);
          } else {
            // Retry on the next frame — BootScene/LoadingScene are still active.
            requestAnimationFrame(tryConnect);
          }
        };
        tryConnect();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const e = err instanceof Error ? err : new Error(String(err));
        console.error("[GameContainer] Failed to initialize game:", e);
        setError(e);
      });

    return () => {
      cancelled = true;
      bridge?.disconnect();
      destroy?.();
    };
  }, []);

  if (error) {
    throw error; // Caught by the /play error.tsx boundary
  }

  return <div id="game-container" className="h-full w-full bg-black" />;
}
