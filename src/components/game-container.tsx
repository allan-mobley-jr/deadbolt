"use client";

import { useEffect, useState } from "react";
import { connectBridge, type BridgeConnection } from "@/lib/bridge";
import { useGameStore } from "@/stores/useGameStore";
import { useMinimapStore } from "@/stores/useMinimapStore";

export default function GameContainer() {
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;
    let bridge: BridgeConnection | null = null;

    import("@/game/PhaserGame")
      .then(({ createGame, destroyGame, getActiveBus, getActiveSeed, getActiveMinimapInit }) => {
        if (cancelled) return;
        createGame("game-container");
        destroy = destroyGame;

        // Connect the bridge once the bus is available.
        // The bus is set synchronously in GameScene.create(), which runs
        // during scene boot after createGame(). Poll briefly in case
        // the scene hasn't initialised yet (e.g. assets still loading).
        const MAX_BRIDGE_RETRIES = 300; // ~5 seconds at 60fps
        let retries = 0;

        const tryConnect = () => {
          if (cancelled) return;
          const bus = getActiveBus();
          if (bus) {
            bridge = connectBridge(bus);
            // Pull seed and minimap init from PhaserGame module — these events
            // fired before the bridge connected, so we read them directly.
            const seed = getActiveSeed();
            if (seed) {
              useGameStore.getState().setSeed(seed);
            }
            const minimapInit = getActiveMinimapInit();
            if (minimapInit) {
              useMinimapStore.getState().setMapBounds(
                minimapInit.mapWidth,
                minimapInit.mapHeight,
                minimapInit.safehouseCenter,
              );
            }
          } else if (retries++ < MAX_BRIDGE_RETRIES) {
            requestAnimationFrame(tryConnect);
          } else {
            const e = new Error(
              "Event bus not available after timeout. " +
                "The game scene may have failed to initialize.",
            );
            console.error("[GameContainer]", e);
            setError(e);
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
      useMinimapStore.getState().reset();
      destroy?.();
    };
  }, []);

  if (error) {
    throw error; // Caught by the /play error.tsx boundary
  }

  return <div id="game-container" className="h-full w-full bg-black" />;
}
