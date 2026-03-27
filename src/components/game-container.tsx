"use client";

import { useEffect, useRef } from "react";

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

  useEffect(() => {
    let destroyed = false;

    async function boot() {
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
    }

    boot();

    return () => {
      destroyed = true;
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center bg-black"
    />
  );
}
