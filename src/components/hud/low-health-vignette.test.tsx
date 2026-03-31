import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LowHealthVignette } from "./low-health-vignette";
import { usePlayerStore } from "@/stores/usePlayerStore";

afterEach(() => {
  cleanup();
  usePlayerStore.getState().reset();
});

describe("LowHealthVignette", () => {
  it("renders nothing when health is above 30%", () => {
    usePlayerStore.getState().updateHealth(50, 100);
    const { container } = render(<LowHealthVignette />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing at exactly 31% health", () => {
    usePlayerStore.getState().updateHealth(31, 100);
    const { container } = render(<LowHealthVignette />);
    expect(container.innerHTML).toBe("");
  });

  it("renders vignette at exactly 30% health", () => {
    usePlayerStore.getState().updateHealth(30, 100);
    render(<LowHealthVignette />);
    expect(screen.getByTestId("hud-low-health-vignette")).toBeTruthy();
  });

  it("renders vignette when health is critically low", () => {
    usePlayerStore.getState().updateHealth(10, 100);
    render(<LowHealthVignette />);
    const vignette = screen.getByTestId("hud-low-health-vignette");
    expect(vignette.className).toContain("animate-pulse");
  });

  it("renders nothing when health and max are both zero", () => {
    // fraction = 1 (fallback), which is > 0.3
    usePlayerStore.getState().updateHealth(0, 0);
    const { container } = render(<LowHealthVignette />);
    expect(container.innerHTML).toBe("");
  });
});
