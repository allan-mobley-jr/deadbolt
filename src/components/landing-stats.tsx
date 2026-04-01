"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { usePersistenceStore } from "@/stores/usePersistenceStore";
import { setNextRunSeed } from "@/lib/next-run-seed";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format seconds as Xh Ym or Ym Xs for total time played. */
function formatTotalTime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Client Component island for the landing page.
 *
 * Loads lifetime stats from IndexedDB and displays career highlights.
 * Also provides a seed input field for starting a specific seed and
 * mobile detection notice. Embedded in the Server Component landing page.
 */
export function LandingStats() {
  const loaded = usePersistenceStore((s) => s.loaded);
  const loadError = usePersistenceStore((s) => s.loadError);
  const lifetimeStats = usePersistenceStore((s) => s.lifetimeStats);
  const leaderboard = usePersistenceStore((s) => s.leaderboard);

  // --- Load persistence data on mount ---
  useEffect(() => {
    if (!loaded) {
      usePersistenceStore.getState().loadFromDB();
    }
  }, [loaded]);

  // --- Seed input state ---
  const [seedInput, setSeedInput] = useState("");

  // Mobile detection handled via CSS (Tailwind `md:hidden`).

  const hasStats = loaded && lifetimeStats.totalRuns > 0;
  const bestRun = leaderboard.length > 0 ? leaderboard[0] : null;

  const handlePlayWithSeed = () => {
    const trimmed = seedInput.trim();
    if (trimmed) {
      setNextRunSeed(trimmed);
    }
  };

  return (
    <div className="space-y-6">
      {/* --- Play Button --- */}
      <div className="flex flex-col items-center gap-3">
        <Button
          size="lg"
          className="w-full text-lg"
          render={
            <Link
              href="/play"
              onClick={handlePlayWithSeed}
            />
          }
        >
          {hasStats ? "New Run" : "Play"}
        </Button>

        {/* Seed input */}
        <div className="flex w-full gap-2">
          <input
            type="text"
            placeholder="Enter seed (optional)"
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            className="flex-1 rounded-md border border-border bg-muted/30 px-3 py-1.5 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="Run seed"
            data-testid="seed-input"
          />
        </div>
      </div>

      {/* --- Mobile notice (visible < md, hidden on md+) --- */}
      <div
        className="block md:hidden rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-400"
        data-testid="mobile-notice"
      >
        Best played on desktop with mouse and keyboard
      </div>

      {/* --- Persistence load error --- */}
      {loaded && loadError && (
        <div
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-400"
          data-testid="persistence-load-error"
          role="alert"
        >
          {loadError}
        </div>
      )}

      {/* --- Lifetime stats (only when data exists) --- */}
      {hasStats && (
        <div className="space-y-3" data-testid="lifetime-stats">
          <h2 className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your Stats
          </h2>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Runs" value={String(lifetimeStats.totalRuns)} />
            <MiniStat
              label="Best Score"
              value={lifetimeStats.highestScore.toLocaleString()}
            />
            <MiniStat
              label="Total Kills"
              value={lifetimeStats.totalKills.toLocaleString()}
            />
            <MiniStat
              label="Highest Day"
              value={String(lifetimeStats.highestDay)}
            />
            <MiniStat
              label="Time Played"
              value={formatTotalTime(lifetimeStats.totalTimePlayed)}
            />
            <MiniStat
              label="Barricades"
              value={lifetimeStats.totalBarricadesBuilt.toLocaleString()}
            />
          </div>

          {/* Best run seed for quick replay */}
          {bestRun && (
            <div className="rounded-lg border border-border/30 bg-muted/20 px-3 py-2 text-center">
              <p className="text-[10px] text-muted-foreground">
                Best Run Seed
              </p>
              <p className="font-mono text-xs text-foreground select-all">
                {bestRun.seed}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/30 bg-muted/20 px-2 py-1.5 text-center">
      <p className="text-[10px] text-muted-foreground leading-tight">
        {label}
      </p>
      <p className="font-mono text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}
