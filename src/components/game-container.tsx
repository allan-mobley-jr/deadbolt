"use client";

import { useEffect, useState } from "react";
import { connectBridge, type BridgeConnection } from "@/lib/bridge";
import { safeEmit } from "@/game/events/event-bus";
import { useGameStore } from "@/stores/useGameStore";
import { useMinimapStore } from "@/stores/useMinimapStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { resetSessionStores } from "@/stores/resetSessionStores";

export default function GameContainer() {
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;
    let bridge: BridgeConnection | null = null;

    import("@/game/PhaserGame")
      .then(({ createGame, destroyGame, getActiveBus, getActiveSeed, getActiveMinimapInit, getActiveError }) => {
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

          // Check for boot/loading errors before checking the bus.
          // These fire on Phaser's native emitter before the typed bus exists.
          const gameError = getActiveError();
          if (gameError) {
            console.error("[GameContainer] Game boot/loading error:", gameError);
            setError(gameError);
            return;
          }

          const bus = getActiveBus();
          if (bus) {
            try {
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
              // Push current settings to game systems on connect
              const SETTINGS_KEYS = [
                "masterVolume", "sfxVolume", "musicVolume",
                "screenShake", "showFps", "graphicsQuality",
                "colorBlindMode", "reducedMotion", "highContrast",
              ] as const;
              const settings = useSettingsStore.getState();
              for (const key of SETTINGS_KEYS) {
                safeEmit(bus, "cmd:settings-changed", { key, value: settings[key] });
              }

              // Poll for runtime crashes after the bridge connects.
              // The tryConnect loop has stopped, so runtime errors (game-crash)
              // need a separate polling path.  One variable read per frame.
              const pollCrash = () => {
                if (cancelled) return;
                const crashError = getActiveError();
                if (crashError) {
                  console.error("[GameContainer] Game runtime crash:", crashError);
                  setError(crashError);
                  return;
                }
                requestAnimationFrame(pollCrash);
              };
              requestAnimationFrame(pollCrash);
            } catch (err) {
              const e = err instanceof Error ? err : new Error(String(err));
              console.error("[GameContainer] Bridge connection failed:", e);
              setError(e);
              return;
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
      try {
        bridge?.disconnect();
      } catch (err) {
        console.error("[GameContainer] Bridge disconnect failed:", err);
      }
      resetSessionStores();
      destroy?.();
    };
  }, []);

  if (error) {
    throw error; // Caught by the /play error.tsx boundary
  }

  return <div id="game-container" className="h-full w-full bg-black" />;
}
