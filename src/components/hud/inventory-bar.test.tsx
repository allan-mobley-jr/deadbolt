import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { InventoryBar } from "./inventory-bar";
import { usePlayerStore } from "@/stores/usePlayerStore";

afterEach(() => {
  cleanup();
  usePlayerStore.getState().reset();
});

describe("InventoryBar", () => {
  it("renders 8 inventory slots", () => {
    render(<InventoryBar />);
    for (let i = 0; i < 8; i++) {
      expect(screen.getByTestId(`inventory-slot-${i}`)).toBeTruthy();
    }
  });

  it("shows quick-select numbers 1-5 on first five slots", () => {
    render(<InventoryBar />);
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
  });

  it("shows weight meter with formatted values", () => {
    render(<InventoryBar />);
    // Default: 0/50kg
    expect(screen.getByText("0.0/50kg")).toBeTruthy();
  });

  it("highlights the active slot with amber border", () => {
    usePlayerStore.getState().updateActiveSlot(2);
    render(<InventoryBar />);
    const activeSlot = screen.getByTestId("inventory-slot-2");
    expect(activeSlot.className).toContain("border-amber-400");
  });

  it("shows item placeholder when slot is occupied", () => {
    usePlayerStore.getState().updateInventory(
      [
        { itemType: "wooden_plank", slotIndex: 0, sizeCategory: "small", primary: true },
        { itemType: "metal_pipe", slotIndex: 3, sizeCategory: "medium", primary: true },
        { itemType: "metal_pipe", slotIndex: 4, sizeCategory: "medium", primary: false },
      ],
      5.5,
      50,
    );
    render(<InventoryBar />);

    // Slot 0 should have a green item (small)
    const slot0 = screen.getByTestId("inventory-slot-0");
    const item0 = slot0.querySelector("[title='wooden_plank']");
    expect(item0).toBeTruthy();
    expect(item0?.className).toContain("bg-emerald-600");

    // Slot 3 should have a blue item (medium, primary)
    const slot3 = screen.getByTestId("inventory-slot-3");
    const item3 = slot3.querySelector("[title='metal_pipe']");
    expect(item3).toBeTruthy();
    expect(item3?.className).toContain("bg-sky-600");
  });

  it("dims non-primary continuation slots", () => {
    usePlayerStore.getState().updateInventory(
      [
        { itemType: "metal_pipe", slotIndex: 3, sizeCategory: "medium", primary: true },
        { itemType: "metal_pipe", slotIndex: 4, sizeCategory: "medium", primary: false },
      ],
      3,
      50,
    );
    render(<InventoryBar />);

    // Slot 4 (non-primary) should be dimmed
    const slot4 = screen.getByTestId("inventory-slot-4");
    const item4 = slot4.querySelector("[title='metal_pipe']");
    expect(item4?.className).toContain("opacity-40");
  });

  it("shows amber weight meter when overloaded", () => {
    usePlayerStore.getState().updateInventory([], 42, 50);
    render(<InventoryBar />);
    // 42/50 = 84% > 80% threshold
    expect(screen.getByText("42.0/50kg")).toBeTruthy();
  });
});
