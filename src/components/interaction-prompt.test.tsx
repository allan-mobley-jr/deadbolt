import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { InteractionPrompt } from "./interaction-prompt";
import { useUIStore } from "@/stores/useUIStore";

afterEach(() => {
  cleanup();
  useUIStore.getState().reset();
});

describe("InteractionPrompt", () => {
  it("renders nothing when no prompt is active", () => {
    const { container } = render(<InteractionPrompt />);
    expect(container.innerHTML).toBe("");
  });

  it("shows object name and pickup hint for movable objects", () => {
    useUIStore.getState().setInteractionPrompt({
      objectType: "wooden_plank",
      displayName: "Wooden Plank",
      interactionType: "pickup",
      immovable: false,
      worldX: 100,
      worldY: 100,
    });

    render(<InteractionPrompt />);

    expect(screen.getByText("Wooden Plank")).toBeTruthy();
    expect(screen.getByText("[E] Pick up")).toBeTruthy();
  });

  it("shows examine and drag hints for immovable objects", () => {
    useUIStore.getState().setInteractionPrompt({
      objectType: "bookshelf",
      displayName: "Bookshelf",
      interactionType: "push",
      immovable: true,
      worldX: 100,
      worldY: 100,
    });

    render(<InteractionPrompt />);

    expect(screen.getByText("Bookshelf")).toBeTruthy();
    expect(
      screen.getByText("[E] Examine / Click & drag to push"),
    ).toBeTruthy();
  });

  it("hides when prompt is cleared", () => {
    useUIStore.getState().setInteractionPrompt({
      objectType: "gas_can",
      displayName: "Gas Can",
      interactionType: "pickup",
      immovable: false,
      worldX: 100,
      worldY: 100,
    });

    const { container, rerender } = render(<InteractionPrompt />);
    expect(screen.getByText("Gas Can")).toBeTruthy();

    useUIStore.getState().clearInteractionPrompt();
    rerender(<InteractionPrompt />);

    expect(container.innerHTML).toBe("");
  });

  it("shows search hint for search interaction type", () => {
    useUIStore.getState().setInteractionPrompt({
      objectType: "cardboard_box",
      displayName: "Cardboard Box",
      interactionType: "search",
      immovable: false,
      worldX: 100,
      worldY: 100,
    });

    render(<InteractionPrompt />);
    expect(screen.getByText("[E] Search")).toBeTruthy();
  });

  it("shows open hint for open interaction type", () => {
    useUIStore.getState().setInteractionPrompt({
      objectType: "fridge",
      displayName: "Fridge",
      interactionType: "open",
      immovable: false,
      worldX: 100,
      worldY: 100,
    });

    render(<InteractionPrompt />);
    expect(screen.getByText("[E] Open")).toBeTruthy();
  });
});
