"use client";

import { useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/useUIStore";

// ---------------------------------------------------------------------------
// Keybinding data
// ---------------------------------------------------------------------------

const KEYBINDINGS = [
  { keys: ["W", "A", "S", "D"], label: "Movement" },
  { keys: ["Mouse"], label: "Aim" },
  { keys: ["Left Click"], label: "Attack / Drag objects" },
  { keys: ["E"], label: "Interact with objects" },
  { keys: ["1", "2", "3", "4", "5"], label: "Quick-select inventory" },
  { keys: ["ESC"], label: "Pause menu" },
  { keys: ["F3"], label: "Toggle FPS counter" },
] as const;

// ---------------------------------------------------------------------------
// Sub-component
// ---------------------------------------------------------------------------

function KeyBadge({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-zinc-600 bg-zinc-800 px-1.5 font-mono text-xs text-zinc-200">
      {children}
    </kbd>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Controls reference screen — displays keybindings as an overlay.
 *
 * Shown when the "controls" overlay is pushed onto the UIStore overlay stack.
 * Sits on top of the pause menu (both use z-50 but controls renders later).
 */
export function ControlsReference() {
  const isOpen = useUIStore((s) => s.overlays.includes("controls"));

  const handleBack = useCallback(() => {
    useUIStore.getState().popOverlay("controls");
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 animate-in fade-in duration-200"
      data-testid="controls-reference"
    >
      <Card className="w-full max-w-xs bg-card/95 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              data-testid="controls-back-btn"
              aria-label="Back to pause menu"
            >
              &larr;
            </Button>
            <CardTitle className="text-lg font-bold">Controls</CardTitle>
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-3">
            {KEYBINDINGS.map((binding, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1">
                  {binding.keys.map((key) => (
                    <KeyBadge key={key}>{key}</KeyBadge>
                  ))}
                </div>
                <span className="text-sm text-zinc-400">{binding.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
