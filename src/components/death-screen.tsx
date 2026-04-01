"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/useUIStore";
import { useGameStore } from "@/stores/useGameStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useMinimapStore } from "@/stores/useMinimapStore";
import { usePersistenceStore } from "@/stores/usePersistenceStore";
import { computeRunScore } from "@/types/persistence";
import { setNextRunSeed } from "@/lib/next-run-seed";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format seconds as MM:SS. */
function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Pixels per tile for display conversion (32px = 1 tile ~ 1m). */
const PIXELS_PER_TILE = 32;

/** Convert pixel distance to a human-friendly meter string. */
function formatDistance(pixels: number): string {
  return `${Math.round(pixels / PIXELS_PER_TILE)}m`;
}

/** Reset all Zustand stores to initial values for a fresh run. */
function resetAllStores(): void {
  useUIStore.getState().reset();
  useGameStore.getState().reset();
  usePlayerStore.getState().reset();
  useMinimapStore.getState().reset();
}

/** Zombie variant display names. */
const VARIANT_LABELS: Record<string, string> = {
  shambler: "Shamblers",
  runner: "Runners",
  brute: "Brutes",
  horde: "Horde",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Comprehensive death screen with full run statistics, personal best
 * comparison, shareable seed, and screenshot-friendly layout.
 *
 * Shows detailed breakdown of the run including kills by zombie type,
 * composite score, and "New Record" indicators when personal bests
 * are broken. Persists run to IndexedDB on first render.
 */
export function DeathScreen() {
  const router = useRouter();
  const activeMenu = useUIStore((s) => s.activeMenu);

  // --- Run stats from game store ---
  const elapsedTotal = useGameStore((s) => s.elapsedTotal);
  const dayNumber = useGameStore((s) => s.dayNumber);
  const totalKills = useGameStore((s) => s.totalKills);
  const killsByType = useGameStore((s) => s.killsByType);
  const waveNumber = useGameStore((s) => s.waveNumber);
  const barricadesBuilt = useGameStore((s) => s.barricadesBuilt);
  const distanceTraveled = useGameStore((s) => s.distanceTraveled);
  const objectsUsed = useGameStore((s) => s.objectsUsed);
  const seed = useGameStore((s) => s.seed);

  // --- Clipboard state ---
  const [copied, setCopied] = useState(false);

  // --- Composite score ---
  const score = computeRunScore({ dayNumber, totalKills, barricadesBuilt, elapsedTotal });

  // --- Personal best detection (compare against PREVIOUS bests, before this run is saved) ---
  // Uses React's "adjusting state when props change" pattern: state is updated
  // during render when activeMenu transitions to "death", capturing the pre-save
  // lifetime stats before the effect persists the current run.
  const [prevMenu, setPrevMenu] = useState<string | null>(null);
  const [records, setRecords] = useState({ score: false, day: false, time: false });

  if (activeMenu === "death" && prevMenu !== "death") {
    setPrevMenu("death");
    const prev = usePersistenceStore.getState().lifetimeStats;
    setRecords({
      score: score > prev.highestScore,
      day: dayNumber > prev.highestDay,
      time: elapsedTotal > prev.longestRunTime,
    });
  } else if (activeMenu !== "death" && prevMenu === "death") {
    setPrevMenu(activeMenu);
    setRecords({ score: false, day: false, time: false });
  }

  // --- Persist run data to IndexedDB when the death screen opens ---
  const hasSaved = useRef(false);

  useEffect(() => {
    if (activeMenu !== "death" || hasSaved.current) return;
    hasSaved.current = true;

    usePersistenceStore.getState().recordRun({
      seed: seed ?? "unknown",
      elapsedTotal,
      dayNumber,
      waveNumber,
      totalKills,
      killsByType,
      barricadesBuilt,
      distanceTraveled,
      objectsUsed,
    });
  }, [activeMenu, seed, elapsedTotal, dayNumber, waveNumber, totalKills, killsByType, barricadesBuilt, distanceTraveled, objectsUsed]);

  // --- Handlers ---

  const handleTryAgain = useCallback(() => {
    hasSaved.current = false;
    setCopied(false);
    try {
      resetAllStores();
      useGameStore.getState().incrementRunKey();
    } catch (err) {
      console.error("[DeathScreen] Failed to restart game:", err);
      window.location.reload();
    }
  }, []);

  const handleTrySameSeed = useCallback(() => {
    hasSaved.current = false;
    setCopied(false);
    try {
      if (seed) setNextRunSeed(seed);
      resetAllStores();
      useGameStore.getState().incrementRunKey();
    } catch (err) {
      console.error("[DeathScreen] Failed to restart with same seed:", err);
      window.location.reload();
    }
  }, [seed]);

  const handleReturnToMenu = useCallback(() => {
    hasSaved.current = false;
    setCopied(false);
    try {
      resetAllStores();
      router.push("/");
    } catch (err) {
      console.error("[DeathScreen] Failed to return to menu:", err);
      window.location.href = "/";
    }
  }, [router]);

  const handleCopySeed = useCallback(() => {
    if (!seed) return;
    navigator.clipboard.writeText(seed).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {
        // Clipboard API may fail — fall back silently
      },
    );
  }, [seed]);

  if (activeMenu !== "death") return null;

  // --- Kills by type breakdown ---
  const killEntries = Object.entries(killsByType).filter(
    ([, count]) => (count ?? 0) > 0,
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Death screen"
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 animate-in fade-in duration-500"
      data-testid="death-screen"
    >
      <Card className="w-full max-w-md border-destructive/30 bg-card/95 backdrop-blur-sm">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-bold tracking-widest text-destructive">
            YOU DIED
          </CardTitle>
          {/* Composite score */}
          <div className="mt-1">
            <span className="font-mono text-3xl font-bold text-foreground">
              {score.toLocaleString()}
            </span>
            <p className="text-xs text-muted-foreground">Score</p>
            {records.score && (
              <span
                className="inline-block mt-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-400 animate-in zoom-in duration-300"
                data-testid="new-record-score"
              >
                New Record!
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-0">
          {/* Primary stats grid */}
          <div className="grid grid-cols-3 gap-2">
            <StatItem
              label="Time Survived"
              value={formatTime(elapsedTotal)}
              isRecord={records.time}
            />
            <StatItem
              label="Day Reached"
              value={String(dayNumber)}
              isRecord={records.day}
            />
            <StatItem
              label="Wave Reached"
              value={String(waveNumber)}
            />
          </div>

          {/* Combat stats */}
          <div className="grid grid-cols-3 gap-2">
            <StatItem label="Zombies Killed" value={String(totalKills)} />
            <StatItem label="Barricades Built" value={String(barricadesBuilt)} />
            <StatItem label="Items Collected" value={String(objectsUsed)} />
          </div>

          {/* Distance */}
          <div className="grid grid-cols-1 gap-2">
            <div className="rounded-lg border border-border/30 bg-muted/20 px-3 py-1.5 text-center">
              <span className="text-xs text-muted-foreground">Distance: </span>
              <span className="font-mono text-sm font-semibold text-foreground">
                {formatDistance(distanceTraveled)}
              </span>
            </div>
          </div>

          {/* Kills by type breakdown */}
          {killEntries.length > 0 && (
            <div className="rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
              <p className="text-xs text-muted-foreground mb-1.5">Kills by Type</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {killEntries.map(([variant, count]) => (
                  <span key={variant} className="text-sm text-foreground">
                    <span className="text-muted-foreground">
                      {VARIANT_LABELS[variant] ?? variant}:
                    </span>{" "}
                    <span className="font-mono font-semibold">{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Seed with copy button */}
          {seed && (
            <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Run Seed</p>
                  <p className="font-mono text-sm text-foreground select-all">{seed}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-xs"
                  onClick={handleCopySeed}
                  data-testid="copy-seed-btn"
                >
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-2">
          <div className="flex w-full gap-2">
            <Button
              variant="default"
              size="lg"
              className="flex-1"
              onClick={handleTryAgain}
              data-testid="try-again-btn"
            >
              Try Again
            </Button>
            {seed && (
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={handleTrySameSeed}
                data-testid="try-same-seed-btn"
              >
                Same Seed
              </Button>
            )}
          </div>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={handleReturnToMenu}
            data-testid="return-menu-btn"
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

function StatItem({
  label,
  value,
  isRecord = false,
}: {
  label: string;
  value: string;
  isRecord?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/30 bg-muted/20 px-2 py-1.5 text-center">
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
      <p className="font-mono text-lg font-semibold text-foreground">{value}</p>
      {isRecord && (
        <span
          className="text-[9px] font-semibold text-amber-400"
          data-testid="new-record-indicator"
        >
          NEW BEST
        </span>
      )}
    </div>
  );
}
