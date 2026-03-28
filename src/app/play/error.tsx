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
  useEffect(() => {
    console.error("Game failed to load:", error);
  }, [error]);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-black">
      <p className="font-mono text-sm text-destructive">
        Failed to load the game.
      </p>
      <p className="text-sm text-muted-foreground">
        Check your connection and try again.
      </p>
      <Button variant="link" onClick={reset} className="font-mono">
        Retry
      </Button>
    </div>
  );
}
