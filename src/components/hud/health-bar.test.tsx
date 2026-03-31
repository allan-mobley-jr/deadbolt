import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HealthBar } from "./health-bar";
import { usePlayerStore } from "@/stores/usePlayerStore";

afterEach(() => {
  cleanup();
  usePlayerStore.getState().reset();
});

describe("HealthBar", () => {
  it("renders the HP label and numeric value", () => {
    render(<HealthBar />);
    expect(screen.getByText("HP")).toBeTruthy();
    expect(screen.getByText("100/100")).toBeTruthy();
  });

  it("shows green indicator at full health", () => {
    render(<HealthBar />);
    const indicator = document.querySelector("[data-slot='progress-indicator']");
    expect(indicator?.className).toContain("bg-emerald-500");
  });

  it("shows amber indicator when health is below 50%", () => {
    usePlayerStore.getState().updateHealth(40, 100);
    render(<HealthBar />);
    const indicator = document.querySelector("[data-slot='progress-indicator']");
    expect(indicator?.className).toContain("bg-amber-500");
  });

  it("shows red indicator when health is at or below 25%", () => {
    usePlayerStore.getState().updateHealth(20, 100);
    render(<HealthBar />);
    const indicator = document.querySelector("[data-slot='progress-indicator']");
    expect(indicator?.className).toContain("bg-red-500");
  });

  it("displays current and max health numerically", () => {
    usePlayerStore.getState().updateHealth(73, 100);
    render(<HealthBar />);
    expect(screen.getByText("73/100")).toBeTruthy();
  });

  it("handles zero max health gracefully", () => {
    usePlayerStore.getState().updateHealth(0, 0);
    render(<HealthBar />);
    expect(screen.getByText("0/0")).toBeTruthy();
  });
});
