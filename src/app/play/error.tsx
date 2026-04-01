"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function PlayError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isRuntimeCrash = error.message.includes("Game loop crashed");

  useEffect(() => {
    console.error(
      isRuntimeCrash ? "Game crashed during play:" : "Game failed to load:",
      error,
    );
  }, [error, isRuntimeCrash]);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-black">
      <p className="font-mono text-sm text-destructive">
        {isRuntimeCrash
          ? "The game crashed unexpectedly."
          : "Failed to load the game."}
      </p>
      <p className="text-sm text-muted-foreground">
        {isRuntimeCrash
          ? "Try starting a new run."
          : "Check your connection and try again."}
      </p>
      <Button variant="link" onClick={reset} className="font-mono">
        {isRuntimeCrash ? "Restart" : "Retry"}
      </Button>
    </div>
  );
}
