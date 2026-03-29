"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/useUIStore";
import { useGameStore } from "@/stores/useGameStore";
import { usePlayerStore } from "@/stores/usePlayerStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format seconds as MM:SS. */
function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Convert pixel distance to a human-friendly meter string (32px = 1 tile ≈ 1m). */
function formatDistance(pixels: number): string {
  const meters = Math.round(pixels / 32);
  return `${meters}m`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Full-viewport death screen overlay rendered over the frozen game canvas.
 *
 * Reads run statistics from Zustand stores and provides "Try Again"
 * (remounts game via runKey) and "Return to Menu" (navigates to /).
 */
export function DeathScreen() {
  const router = useRouter();
  const activeMenu = useUIStore((s) => s.activeMenu);

  // Run stats selectors
  const elapsedTotal = useGameStore((s) => s.elapsedTotal);
  const dayNumber = useGameStore((s) => s.dayNumber);
  const totalKills = useGameStore((s) => s.totalKills);
  const barricadesBuilt = useGameStore((s) => s.barricadesBuilt);
  const distanceTraveled = useGameStore((s) => s.distanceTraveled);
  const objectsUsed = useGameStore((s) => s.objectsUsed);
  const seed = useGameStore((s) => s.seed);

  const handleTryAgain = useCallback(() => {
    // Reset all stores (runKey preserved by useGameStore.reset)
    useUIStore.getState().reset();
    useGameStore.getState().reset();
    usePlayerStore.getState().reset();

    // Increment runKey to trigger GameContainer remount → new game instance
    useGameStore.getState().incrementRunKey();
  }, []);

  const handleReturnToMenu = useCallback(() => {
    // Reset all stores
    useUIStore.getState().reset();
    useGameStore.getState().reset();
    usePlayerStore.getState().reset();

    // Navigate away — GameContainer unmount handles Phaser destruction
    router.push("/");
  }, [router]);

  if (activeMenu !== "death") return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 animate-in fade-in duration-500">
      <Card className="w-full max-w-sm border-destructive/30 bg-card/95 backdrop-blur-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold tracking-widest text-destructive">
            YOU DIED
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatItem label="Time Survived" value={formatTime(elapsedTotal)} />
            <StatItem label="Day Reached" value={String(dayNumber)} />
            <StatItem label="Zombies Killed" value={String(totalKills)} />
            <StatItem label="Barricades Built" value={String(barricadesBuilt)} />
            <StatItem label="Distance Traveled" value={formatDistance(distanceTraveled)} />
            <StatItem label="Items Collected" value={String(objectsUsed)} />
          </div>

          {/* Seed for sharing */}
          {seed && (
            <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground">Run Seed</p>
              <p className="font-mono text-sm text-foreground select-all">{seed}</p>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex gap-2">
          <Button
            variant="default"
            size="lg"
            className="flex-1"
            onClick={handleTryAgain}
          >
            Try Again
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={handleReturnToMenu}
          >
            Return to Menu
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
