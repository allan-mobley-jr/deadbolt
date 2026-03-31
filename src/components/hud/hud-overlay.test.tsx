import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HudOverlay } from "./hud-overlay";
import { useUIStore } from "@/stores/useUIStore";
import { useGameStore } from "@/stores/useGameStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useMinimapStore } from "@/stores/useMinimapStore";

afterEach(() => {
  cleanup();
  useUIStore.getState().reset();
  useGameStore.getState().reset();
  usePlayerStore.getState().reset();
  useMinimapStore.getState().reset();
});

describe("HudOverlay", () => {
  it("renders with full opacity when no menu is active", () => {
    render(<HudOverlay />);
    const overlay = screen.getByTestId("hud-overlay");
    expect(overlay.className).toContain("opacity-100");
    expect(overlay.getAttribute("aria-hidden")).toBe("false");
  });

  it("fades out when a menu is active", () => {
    useUIStore.getState().openMenu("pause");
    render(<HudOverlay />);
    const overlay = screen.getByTestId("hud-overlay");
    expect(overlay.className).toContain("opacity-0");
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
  });

  it("fades out during death screen", () => {
    useUIStore.getState().openMenu("death");
    render(<HudOverlay />);
    const overlay = screen.getByTestId("hud-overlay");
    expect(overlay.className).toContain("opacity-0");
  });

  it("has pointer-events-none to pass clicks through to game", () => {
    render(<HudOverlay />);
    const overlay = screen.getByTestId("hud-overlay");
    expect(overlay.className).toContain("pointer-events-none");
  });

  it("renders all HUD child components", () => {
    render(<HudOverlay />);
    expect(screen.getByTestId("hud-health-bar")).toBeTruthy();
    expect(screen.getByTestId("hud-day-night-timer")).toBeTruthy();
    expect(screen.getByTestId("hud-inventory-bar")).toBeTruthy();
    // Minimap hidden until initialised, wave indicator hidden until active
  });
});
