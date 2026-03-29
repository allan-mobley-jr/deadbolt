import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DeathScreen } from "./death-screen";
import { useUIStore } from "@/stores/useUIStore";
import { useGameStore } from "@/stores/useGameStore";
import { usePlayerStore } from "@/stores/usePlayerStore";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

beforeEach(() => {
  useUIStore.getState().reset();
  useGameStore.getState().reset();
  usePlayerStore.getState().reset();
  mockPush.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("DeathScreen", () => {
  // -------------------------------------------------------------------------
  // Conditional rendering
  // -------------------------------------------------------------------------

  describe("conditional rendering", () => {
    it("renders nothing when activeMenu is 'none'", () => {
      const { container } = render(<DeathScreen />);
      expect(container.innerHTML).toBe("");
    });

    it("renders nothing when activeMenu is 'pause'", () => {
      useUIStore.getState().openMenu("pause");
      const { container } = render(<DeathScreen />);
      expect(container.innerHTML).toBe("");
    });

    it("renders the death screen when activeMenu is 'death'", () => {
      useUIStore.getState().openMenu("death");
      render(<DeathScreen />);
      expect(screen.getByText("YOU DIED")).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Statistics display
  // -------------------------------------------------------------------------

  describe("statistics display", () => {
    beforeEach(() => {
      useUIStore.getState().openMenu("death");
    });

    it("displays formatted survival time as MM:SS", () => {
      useGameStore.setState({ elapsedTotal: 125 });
      render(<DeathScreen />);
      expect(screen.getByText("02:05")).toBeTruthy();
    });

    it("formats zero seconds as 00:00", () => {
      useGameStore.setState({ elapsedTotal: 0 });
      render(<DeathScreen />);
      expect(screen.getByText("00:00")).toBeTruthy();
    });

    it("formats large times correctly", () => {
      useGameStore.setState({ elapsedTotal: 3661 });
      render(<DeathScreen />);
      expect(screen.getByText("61:01")).toBeTruthy();
    });

    it("displays day reached", () => {
      useGameStore.setState({ dayNumber: 3 });
      render(<DeathScreen />);
      expect(screen.getByText("3")).toBeTruthy();
    });

    it("displays zombie kill count", () => {
      useGameStore.setState({ totalKills: 42 });
      render(<DeathScreen />);
      expect(screen.getByText("42")).toBeTruthy();
    });

    it("displays barricades built", () => {
      useGameStore.setState({ barricadesBuilt: 7 });
      render(<DeathScreen />);
      expect(screen.getByText("7")).toBeTruthy();
    });

    it("displays distance traveled in meters (pixels / 32, rounded)", () => {
      useGameStore.setState({ distanceTraveled: 640 });
      render(<DeathScreen />);
      expect(screen.getByText("20m")).toBeTruthy();
    });

    it("rounds distance to nearest integer meter", () => {
      // 48px / 32 = 1.5 -> rounds to 2
      useGameStore.setState({ distanceTraveled: 48 });
      render(<DeathScreen />);
      expect(screen.getByText("2m")).toBeTruthy();
    });

    it("displays items collected count", () => {
      useGameStore.setState({ objectsUsed: 15 });
      render(<DeathScreen />);
      expect(screen.getByText("15")).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Seed display
  // -------------------------------------------------------------------------

  describe("seed display", () => {
    beforeEach(() => {
      useUIStore.getState().openMenu("death");
    });

    it("shows seed when seed is set", () => {
      useGameStore.setState({ seed: "test-seed-123" });
      render(<DeathScreen />);
      expect(screen.getByText("test-seed-123")).toBeTruthy();
      expect(screen.getByText("Run Seed")).toBeTruthy();
    });

    it("hides seed section when seed is null", () => {
      render(<DeathScreen />);
      expect(screen.queryByText("Run Seed")).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Button handlers
  // -------------------------------------------------------------------------

  describe("Try Again button", () => {
    it("resets all stores and increments runKey", () => {
      // Set up dirty state
      useUIStore.getState().openMenu("death");
      useGameStore.setState({ totalKills: 50, seed: "old-seed" });
      usePlayerStore.getState().setDead();
      const initialRunKey = useGameStore.getState().runKey;

      render(<DeathScreen />);
      fireEvent.click(screen.getByText("Try Again"));

      // Stores are reset
      expect(useGameStore.getState().totalKills).toBe(0);
      expect(useGameStore.getState().seed).toBeNull();
      expect(usePlayerStore.getState().alive).toBe(true);
      expect(useUIStore.getState().activeMenu).toBe("none");

      // runKey incremented
      expect(useGameStore.getState().runKey).toBe(initialRunKey + 1);
    });
  });

  describe("Return to Menu button", () => {
    it("resets all stores and navigates to '/'", () => {
      // Set up dirty state
      useUIStore.getState().openMenu("death");
      useGameStore.setState({ totalKills: 50 });
      usePlayerStore.getState().setDead();

      render(<DeathScreen />);
      fireEvent.click(screen.getByText("Return to Menu"));

      // Stores are reset
      expect(useGameStore.getState().totalKills).toBe(0);
      expect(usePlayerStore.getState().alive).toBe(true);
      expect(useUIStore.getState().activeMenu).toBe("none");

      // Navigation triggered
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });
});
