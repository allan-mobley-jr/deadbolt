import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Minimap } from "./minimap";
import { useMinimapStore } from "@/stores/useMinimapStore";

afterEach(() => {
  cleanup();
  useMinimapStore.getState().reset();
});

describe("Minimap", () => {
  it("renders nothing when map is not initialised", () => {
    const { container } = render(<Minimap />);
    expect(container.innerHTML).toBe("");
  });

  it("renders a canvas element when initialised", () => {
    useMinimapStore.getState().setMapBounds(8192, 8192, { x: 4096, y: 4096 });
    render(<Minimap />);
    expect(screen.getByTestId("hud-minimap")).toBeTruthy();
    expect(screen.getByLabelText("Minimap")).toBeTruthy();
    expect(screen.getByLabelText("Minimap").tagName).toBe("CANVAS");
  });

  it("calls canvas drawing methods when positions update", () => {
    // Mock canvas context
    const fillRect = vi.fn();
    const arc = vi.fn();
    const beginPath = vi.fn();
    const fill = vi.fn();
    const strokeRect = vi.fn();
    const scale = vi.fn();

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      fillRect,
      arc,
      beginPath,
      fill,
      strokeRect,
      scale,
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      globalAlpha: 1,
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    useMinimapStore.getState().setMapBounds(8192, 8192, { x: 4096, y: 4096 });
    useMinimapStore
      .getState()
      .updatePositions({ x: 100, y: 200 }, [{ x: 300, y: 400 }]);

    render(<Minimap />);

    // Canvas drawing should have been called
    expect(fillRect).toHaveBeenCalled();
    expect(beginPath).toHaveBeenCalled();
  });

  it("has rounded border styling", () => {
    useMinimapStore.getState().setMapBounds(8192, 8192, { x: 4096, y: 4096 });
    render(<Minimap />);
    const container = screen.getByTestId("hud-minimap");
    expect(container.className).toContain("rounded-lg");
    expect(container.className).toContain("border");
  });
});
