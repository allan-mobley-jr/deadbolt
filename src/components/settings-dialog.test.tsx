import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SettingsDialog } from "./settings-dialog";
import { useUIStore } from "@/stores/useUIStore";
import { useSettingsStore } from "@/stores/useSettingsStore";

// Mock localStorage
const store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn(),
});

afterEach(() => {
  cleanup();
  useUIStore.getState().reset();
  useSettingsStore.getState().resetToDefaults();
});

describe("SettingsDialog", () => {
  it("renders nothing when activeMenu is not settings", () => {
    const { container } = render(<SettingsDialog />);
    expect(container.innerHTML).toBe("");
  });

  it("renders settings when activeMenu is settings", () => {
    useUIStore.getState().openMenu("settings");
    render(<SettingsDialog />);
    expect(screen.getByTestId("settings-dialog")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
  });

  it("shows audio section with volume labels", () => {
    useUIStore.getState().openMenu("settings");
    render(<SettingsDialog />);
    expect(screen.getByText("Audio")).toBeTruthy();
    expect(screen.getByText("Master Volume")).toBeTruthy();
    expect(screen.getByText("SFX Volume")).toBeTruthy();
    expect(screen.getByText("Music Volume")).toBeTruthy();
  });

  it("shows display toggles", () => {
    useUIStore.getState().openMenu("settings");
    render(<SettingsDialog />);
    expect(screen.getByText("Display")).toBeTruthy();
    expect(screen.getByText("Screen Shake")).toBeTruthy();
    expect(screen.getByText("FPS Counter")).toBeTruthy();
  });

  it("shows graphics quality buttons", () => {
    useUIStore.getState().openMenu("settings");
    render(<SettingsDialog />);
    expect(screen.getByText("Graphics")).toBeTruthy();
    expect(screen.getByText("low")).toBeTruthy();
    expect(screen.getByText("medium")).toBeTruthy();
    expect(screen.getByText("high")).toBeTruthy();
  });

  it("displays current volume as percentage", () => {
    useUIStore.getState().openMenu("settings");
    render(<SettingsDialog />);
    // Default master (0.8) and SFX (0.8) show 80%, music (0.6) shows 60%
    expect(screen.getAllByText("80%")).toHaveLength(2);
    expect(screen.getByText("60%")).toBeTruthy();
  });

  it("Back button returns to pause menu", () => {
    useUIStore.getState().openMenu("settings");
    render(<SettingsDialog />);

    fireEvent.click(screen.getByTestId("settings-back-btn"));

    expect(useUIStore.getState().activeMenu).toBe("pause");
  });

  it("quality button changes graphics quality in store", () => {
    useUIStore.getState().openMenu("settings");
    render(<SettingsDialog />);

    fireEvent.click(screen.getByText("high"));

    expect(useSettingsStore.getState().graphicsQuality).toBe("high");
  });
});
