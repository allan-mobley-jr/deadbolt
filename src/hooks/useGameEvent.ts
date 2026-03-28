"use client";

/**
 * React hook for subscribing to game events directly.
 *
 * Use this for ephemeral effects (screen shake, damage flash, kill feed)
 * that don't need to persist in a Zustand store. For persistent UI state,
 * prefer the bridge + Zustand store pattern.
 *
 * The handler should be wrapped in useCallback by the caller to avoid
 * unnecessary re-subscriptions.
 */

import { useEffect } from "react";
import type { GameEventBus, GameEventMap } from "@/game/events";

/**
 * Subscribe to a typed game event for the lifetime of the component.
 *
 * @param bus - The game event bus instance (null before game initialises).
 * @param event - The event name from GameEventMap.
 * @param handler - Callback receiving the typed event payload.
 */
export function useGameEvent<K extends keyof GameEventMap>(
  bus: GameEventBus | null,
  event: K,
  handler: (payload: GameEventMap[K][0]) => void,
): void {
  useEffect(() => {
    if (!bus) return;
    bus.on(event, handler);
    return () => {
      bus.off(event, handler);
    };
  }, [bus, event, handler]);
}
