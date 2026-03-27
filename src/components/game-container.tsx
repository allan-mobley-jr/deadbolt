"use client";

export default function GameContainer() {
  return (
    <div
      id="game-container"
      className="flex h-full w-full items-center justify-center bg-black"
    >
      <p className="font-mono text-sm text-muted-foreground">
        Waiting for game engine&hellip;
      </p>
    </div>
  );
}
