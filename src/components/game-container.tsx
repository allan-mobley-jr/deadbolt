"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Mounts a Phaser game instance into the DOM.
 *
 * Phaser and the game scenes are dynamically imported inside useEffect
 * to guarantee they only run in the browser (Phaser accesses window,
 * document, and canvas APIs that are unavailable during SSR).
 *
 * The game is created on mount and destroyed on unmount to prevent
 * resource leaks when navigating away.
 */
export default function GameContainer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let destroyed = false;

    async function boot() {
      try {
        // Dynamic imports ensure Phaser is never bundled server-side.
        const Phaser = await import("phaser");
        const { BootScene } = await import("@/game/scenes/boot-scene");
        const { GameScene } = await import("@/game/scenes/game-scene");

        // Guard against unmount during async import.
        if (destroyed || !containerRef.current) return;

        gameRef.current = new Phaser.Game({
          type: Phaser.AUTO,
          parent: containerRef.current,
          width: 800,
          height: 600,
          backgroundColor: "#000000",
          physics: {
            default: "matter",
            matter: {
              gravity: { x: 0, y: 0 },
              debug: false,
            },
          },
          scene: [BootScene, GameScene],
          scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
          },
        });
      } catch (err) {
        console.error("[GameContainer] Failed to boot game:", err);
        if (!destroyed) {
          setError(
            err instanceof Error ? err.message : "Failed to start the game engine",
          );
        }
      }
    }

    boot();

    return () => {
      destroyed = true;
      if (gameRef.current) {
        try {
          gameRef.current.destroy(true);
        } catch (err) {
          console.error("[GameContainer] Error during cleanup:", err);
        }
        gameRef.current = null;
      }
    };
  }, []);

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-black">
        <p className="font-mono text-sm text-red-400">
          Failed to load game engine
        </p>
        <p className="max-w-md text-center font-mono text-xs text-muted-foreground">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center bg-black"
    />
  );
}
