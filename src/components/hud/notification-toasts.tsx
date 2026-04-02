"use client";

import { useEffect, useCallback } from "react";
import { useUIStore } from "@/stores/useUIStore";
import type { Notification } from "@/stores/useUIStore";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of toasts visible at once. */
const MAX_VISIBLE = 5;

/** Auto-dismiss delay per notification type (ms). */
const AUTO_DISMISS_MS: Record<Notification["type"], number> = {
  info: 4_000,
  success: 4_000,
  warning: 5_000,
  danger: 8_000,
};

/** Left-border color per notification type. */
const BORDER_COLOR: Record<Notification["type"], string> = {
  info: "border-l-blue-400",
  success: "border-l-emerald-400",
  warning: "border-l-amber-400",
  danger: "border-l-red-500",
};

/** Text color per notification type. */
const TEXT_COLOR: Record<Notification["type"], string> = {
  info: "text-zinc-200",
  success: "text-zinc-200",
  warning: "text-zinc-200",
  danger: "text-red-300",
};

// ---------------------------------------------------------------------------
// Sub-component
// ---------------------------------------------------------------------------

/**
 * A single notification toast with auto-dismiss timer.
 */
function NotificationItem({ notification }: { notification: Notification }) {
  const dismiss = useCallback(() => {
    useUIStore.getState().dismissNotification(notification.id);
  }, [notification.id]);

  useEffect(() => {
    const ms = AUTO_DISMISS_MS[notification.type];
    const timer = setTimeout(dismiss, ms);
    return () => clearTimeout(timer);
  }, [notification.id, notification.type, dismiss]);

  return (
    <div
      className={`border-l-4 ${BORDER_COLOR[notification.type]} ${TEXT_COLOR[notification.type]} rounded-r bg-zinc-900/90 px-3 py-2 text-sm backdrop-blur-sm`}
      role="status"
      data-testid="notification-item"
    >
      <div className="flex items-start justify-between gap-2">
        <span>{notification.message}</span>
        <button
          onClick={dismiss}
          className="pointer-events-auto shrink-0 text-zinc-500 hover:text-zinc-300"
          aria-label="Dismiss notification"
          data-testid="notification-dismiss"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Notification toast stack — renders the most recent notifications
 * from the UIStore as auto-dismissing toasts.
 *
 * Positioned in the bottom-right of the viewport, above the inventory bar.
 * Inherits pointer-events-none from the HUD overlay so gameplay is not
 * interrupted (dismiss buttons opt back in via pointer-events-auto).
 */
export function NotificationToasts() {
  const notifications = useUIStore((s) => s.notifications);

  const visible = notifications.slice(-MAX_VISIBLE);

  if (visible.length === 0) return null;

  return (
    <div
      className="absolute bottom-20 right-4 flex w-72 flex-col gap-2"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      data-testid="hud-notification-toasts"
    >
      {visible.map((n) => (
        <NotificationItem key={n.id} notification={n} />
      ))}
    </div>
  );
}
