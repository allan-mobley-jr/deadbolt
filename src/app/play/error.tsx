"use client";

/**
 * Error boundary for the /play route.
 *
 * Catches rendering errors from GameShell, the dynamic import, or any
 * child component and shows a retry-able error screen instead of a
 * dead page.
 */
export default function PlayError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-black">
      <h2 className="font-mono text-lg font-bold text-red-400">
        Something went wrong
      </h2>
      <p className="max-w-md text-center font-mono text-sm text-muted-foreground">
        {error.message || "An unexpected error occurred while loading the game."}
      </p>
      <button
        onClick={reset}
        className="rounded border border-zinc-700 px-4 py-2 font-mono text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
      >
        Try again
      </button>
    </div>
  );
}
