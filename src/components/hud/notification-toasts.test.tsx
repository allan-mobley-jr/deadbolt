import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NotificationToasts } from "./notification-toasts";
import { useUIStore } from "@/stores/useUIStore";

afterEach(() => {
  cleanup();
  useUIStore.getState().reset();
  vi.useRealTimers();
});

function addNotification(
  overrides: Partial<{
    id: string;
    message: string;
    type: "info" | "warning" | "danger" | "success";
  }> = {},
) {
  useUIStore.getState().addNotification({
    id: overrides.id ?? `test-${Date.now()}-${Math.random()}`,
    message: overrides.message ?? "Test notification",
    type: overrides.type ?? "info",
    timestamp: Date.now(),
  });
}

describe("NotificationToasts", () => {
  it("renders nothing when notification queue is empty", () => {
    const { container } = render(<NotificationToasts />);
    expect(container.innerHTML).toBe("");
  });

  it("renders a notification when one exists", () => {
    addNotification({ message: "Hello world" });
    render(<NotificationToasts />);
    expect(screen.getByText("Hello world")).toBeTruthy();
  });

  it("renders at most 5 visible notifications", () => {
    for (let i = 0; i < 8; i++) {
      addNotification({ id: `n-${i}`, message: `Msg ${i}` });
    }
    render(<NotificationToasts />);
    const items = screen.getAllByTestId("notification-item");
    expect(items).toHaveLength(5);
  });

  it("applies danger border and text styling", () => {
    addNotification({ type: "danger", message: "Critical" });
    render(<NotificationToasts />);
    const item = screen.getByTestId("notification-item");
    expect(item.className).toContain("border-l-red-500");
    expect(item.className).toContain("text-red-300");
  });

  it("applies warning border styling", () => {
    addNotification({ type: "warning", message: "Watch out" });
    render(<NotificationToasts />);
    const item = screen.getByTestId("notification-item");
    expect(item.className).toContain("border-l-amber-400");
  });

  it("applies success border styling", () => {
    addNotification({ type: "success", message: "Good job" });
    render(<NotificationToasts />);
    const item = screen.getByTestId("notification-item");
    expect(item.className).toContain("border-l-emerald-400");
  });

  it("applies info border styling", () => {
    addNotification({ type: "info", message: "FYI" });
    render(<NotificationToasts />);
    const item = screen.getByTestId("notification-item");
    expect(item.className).toContain("border-l-blue-400");
  });

  it("dismisses notification when dismiss button is clicked", () => {
    addNotification({ id: "dismiss-me", message: "Dismiss me" });
    render(<NotificationToasts />);

    expect(screen.getByText("Dismiss me")).toBeTruthy();

    const dismissBtn = screen.getByTestId("notification-dismiss");
    fireEvent.click(dismissBtn);

    expect(useUIStore.getState().notifications).toHaveLength(0);
  });

  it("auto-dismisses info notifications after timeout", () => {
    vi.useFakeTimers();

    addNotification({ id: "auto-info", type: "info", message: "Temp" });
    render(<NotificationToasts />);

    expect(useUIStore.getState().notifications).toHaveLength(1);

    vi.advanceTimersByTime(4_000);

    expect(useUIStore.getState().notifications).toHaveLength(0);
  });

  it("auto-dismisses danger notifications after longer timeout", () => {
    vi.useFakeTimers();

    addNotification({ id: "auto-danger", type: "danger", message: "Critical" });
    render(<NotificationToasts />);

    // Should still be visible after 5 seconds (danger = 8s)
    vi.advanceTimersByTime(5_000);
    expect(useUIStore.getState().notifications).toHaveLength(1);

    // Should be dismissed after 8 seconds
    vi.advanceTimersByTime(3_000);
    expect(useUIStore.getState().notifications).toHaveLength(0);
  });

  it("displays system-disabled notification with system name and restart hint", () => {
    addNotification({
      id: "sys-disabled-1",
      type: "danger",
      message: '"MovementSystem" was disabled due to repeated errors. Consider restarting the run.',
    });
    render(<NotificationToasts />);

    expect(screen.getByText(/MovementSystem/)).toBeTruthy();
    expect(screen.getByText(/restart/i)).toBeTruthy();
  });

  it("has accessible role and aria attributes", () => {
    addNotification({ message: "Accessible" });
    render(<NotificationToasts />);

    const container = screen.getByTestId("hud-notification-toasts");
    expect(container.getAttribute("role")).toBe("log");
    expect(container.getAttribute("aria-live")).toBe("polite");
  });
});
