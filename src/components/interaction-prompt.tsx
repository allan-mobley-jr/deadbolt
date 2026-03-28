"use client";

import { useUIStore } from "@/stores/useUIStore";

/**
 * Interaction prompt overlay — shows object name and available actions
 * when the player is near an interactable object.
 *
 * Positioned at the bottom-center of the game viewport as a fixed HUD
 * element (not world-positioned). This avoids the complexity of
 * world-to-screen coordinate conversion and provides a consistent UX.
 */
export function InteractionPrompt() {
  const prompt = useUIStore((s) => s.interactionPrompt);

  if (!prompt) return null;

  const hint = getInteractionHint(prompt.interactionType, prompt.immovable);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
      <div className="rounded-lg border border-zinc-700 bg-zinc-900/90 px-4 py-2 text-center shadow-lg backdrop-blur-sm">
        <p className="font-mono text-sm font-semibold text-zinc-100">
          {prompt.displayName}
        </p>
        <p className="font-mono text-xs text-zinc-400">{hint}</p>
      </div>
    </div>
  );
}

function getInteractionHint(
  type: "pickup" | "open" | "push" | "search",
  immovable: boolean,
): string {
  if (immovable) {
    return "[E] Examine / Click & drag to push";
  }
  switch (type) {
    case "pickup":
      return "[E] Pick up";
    case "open":
      return "[E] Open";
    case "search":
      return "[E] Search";
    case "push":
      return "Click & drag to push";
  }
}
