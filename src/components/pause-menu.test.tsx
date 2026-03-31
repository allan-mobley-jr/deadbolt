import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PauseMenu } from "./pause-menu";
import { useUIStore } from "@/stores/useUIStore";
import { useGameStore } from "@/stores/useGameStore";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  })),
}));

afterEach(() => {
  cleanup();
  useUIStore.getState().reset();
  useGameStore.getState().reset();
});

describe("PauseMenu", () => {
  it("renders nothing when activeMenu is not pause", () => {
    const { container } = render(<PauseMenu />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the pause menu when activeMenu is pause", () => {
    useUIStore.getState().openMenu("pause");
    render(<PauseMenu />);
    expect(screen.getByTestId("pause-menu")).toBeTruthy();
    expect(screen.getByText("PAUSED")).toBeTruthy();
  });

  it("shows all four menu buttons", () => {
    useUIStore.getState().openMenu("pause");
    render(<PauseMenu />);
    expect(screen.getByText("Resume")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Controls")).toBeTruthy();
    expect(screen.getByText("Abandon Run")).toBeTruthy();
  });

  it("Resume button closes menu and unpauses game", () => {
    useUIStore.getState().openMenu("pause");
    useGameStore.getState().setPaused(true);
    render(<PauseMenu />);

    fireEvent.click(screen.getByTestId("pause-resume-btn"));

    expect(useUIStore.getState().activeMenu).toBe("none");
    expect(useGameStore.getState().paused).toBe(false);
  });

  it("Settings button opens settings menu", () => {
    useUIStore.getState().openMenu("pause");
    render(<PauseMenu />);

    fireEvent.click(screen.getByTestId("pause-settings-btn"));

    expect(useUIStore.getState().activeMenu).toBe("settings");
  });

  it("Controls button pushes controls overlay", () => {
    useUIStore.getState().openMenu("pause");
    render(<PauseMenu />);

    fireEvent.click(screen.getByTestId("pause-controls-btn"));

    expect(useUIStore.getState().overlays).toContain("controls");
  });

  it("Abandon Run button opens confirmation dialog", () => {
    useUIStore.getState().openMenu("pause");
    render(<PauseMenu />);

    fireEvent.click(screen.getByTestId("pause-abandon-btn"));

    expect(screen.getByText("Abandon Run?")).toBeTruthy();
    expect(screen.getByText(/progress will be lost/i)).toBeTruthy();
  });
});
