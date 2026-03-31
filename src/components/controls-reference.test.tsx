import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ControlsReference } from "./controls-reference";
import { useUIStore } from "@/stores/useUIStore";

afterEach(() => {
  cleanup();
  useUIStore.getState().reset();
});

describe("ControlsReference", () => {
  it("renders nothing when controls overlay is not active", () => {
    const { container } = render(<ControlsReference />);
    expect(container.innerHTML).toBe("");
  });

  it("renders when controls overlay is active", () => {
    useUIStore.getState().pushOverlay("controls");
    render(<ControlsReference />);
    expect(screen.getByTestId("controls-reference")).toBeTruthy();
    expect(screen.getByText("Controls")).toBeTruthy();
  });

  it("displays all keybinding labels", () => {
    useUIStore.getState().pushOverlay("controls");
    render(<ControlsReference />);
    expect(screen.getByText("Movement")).toBeTruthy();
    expect(screen.getByText("Aim")).toBeTruthy();
    expect(screen.getByText("Interact with objects")).toBeTruthy();
    expect(screen.getByText("Quick-select inventory")).toBeTruthy();
    expect(screen.getByText("Pause menu")).toBeTruthy();
  });

  it("displays key badges", () => {
    useUIStore.getState().pushOverlay("controls");
    render(<ControlsReference />);
    expect(screen.getByText("W")).toBeTruthy();
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("S")).toBeTruthy();
    expect(screen.getByText("D")).toBeTruthy();
    expect(screen.getByText("E")).toBeTruthy();
    expect(screen.getByText("ESC")).toBeTruthy();
  });

  it("Back button pops the controls overlay", () => {
    useUIStore.getState().pushOverlay("controls");
    render(<ControlsReference />);

    fireEvent.click(screen.getByTestId("controls-back-btn"));

    expect(useUIStore.getState().overlays).not.toContain("controls");
  });
});
