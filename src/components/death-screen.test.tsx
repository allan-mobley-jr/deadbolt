import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DeathScreen } from "./death-screen";
import { useUIStore } from "@/stores/useUIStore";
import { useGameStore } from "@/stores/useGameStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { usePersistenceStore } from "@/stores/usePersistenceStore";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock the next-run-seed module
const mockSetNextRunSeed = vi.fn();
vi.mock("@/lib/next-run-seed", () => ({
  setNextRunSeed: (...args: unknown[]) => mockSetNextRunSeed(...args),
}));

beforeEach(() => {
  useUIStore.getState().reset();
  useGameStore.getState().reset();
  usePlayerStore.getState().reset();
  usePersistenceStore.setState({
    loaded: true,
    available: true,
    loadError: null,
    saveError: null,
    runHistory: [],
    leaderboard: [],
    lifetimeStats: {
      totalRuns: 0,
      totalKills: 0,
      killsByType: {},
      totalBarricadesBuilt: 0,
      totalTimePlayed: 0,
      longestRunTime: 0,
      highestDay: 0,
      highestScore: 0,
    },
  });
  mockPush.mockClear();
  mockSetNextRunSeed.mockClear();
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

    it("displays day reached", () => {
      useGameStore.setState({ dayNumber: 3 });
      render(<DeathScreen />);
      expect(screen.getByText("3")).toBeTruthy();
    });

    it("displays wave reached", () => {
      useGameStore.setState({ waveNumber: 4 });
      render(<DeathScreen />);
      expect(screen.getByText("4")).toBeTruthy();
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

    it("displays distance traveled in meters", () => {
      useGameStore.setState({ distanceTraveled: 640 });
      render(<DeathScreen />);
      expect(screen.getByText("20m")).toBeTruthy();
    });

    it("displays items collected count", () => {
      useGameStore.setState({ objectsUsed: 15 });
      render(<DeathScreen />);
      expect(screen.getByText("15")).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Composite score
  // -------------------------------------------------------------------------

  describe("composite score", () => {
    it("displays the computed score", () => {
      useUIStore.getState().openMenu("death");
      useGameStore.setState({
        dayNumber: 3,
        totalKills: 42,
        barricadesBuilt: 5,
        elapsedTotal: 600,
      });
      render(<DeathScreen />);
      // Score = 3*1000 + 42 + 5*10 + 600 = 3,692
      expect(screen.getByText("3,692")).toBeTruthy();
      expect(screen.getByText("Score")).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Kills by type
  // -------------------------------------------------------------------------

  describe("kills by type", () => {
    it("shows zombie variant breakdown when kills exist", () => {
      useUIStore.getState().openMenu("death");
      useGameStore.setState({
        killsByType: { shambler: 10, runner: 5, brute: 2 },
      });
      render(<DeathScreen />);
      expect(screen.getByText("Kills by Type")).toBeTruthy();
      expect(screen.getByText("Shamblers:")).toBeTruthy();
      expect(screen.getByText("10")).toBeTruthy();
      expect(screen.getByText("Runners:")).toBeTruthy();
      expect(screen.getByText("Brutes:")).toBeTruthy();
    });

    it("hides kills breakdown when no kills by type", () => {
      useUIStore.getState().openMenu("death");
      render(<DeathScreen />);
      expect(screen.queryByText("Kills by Type")).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Personal best indicators
  // -------------------------------------------------------------------------

  describe("personal best indicators", () => {
    it("shows 'New Record!' when score beats previous highest", () => {
      // Set a previous high score
      usePersistenceStore.setState({
        lifetimeStats: {
          totalRuns: 5,
          totalKills: 100,
          killsByType: {},
          totalBarricadesBuilt: 10,
          totalTimePlayed: 1500,
          longestRunTime: 300,
          highestDay: 2,
          highestScore: 1000,
        },
      });

      useUIStore.getState().openMenu("death");
      // This run scores more than 1000
      useGameStore.setState({
        dayNumber: 3,
        totalKills: 50,
        barricadesBuilt: 5,
        elapsedTotal: 600,
      });

      render(<DeathScreen />);
      expect(screen.getByTestId("new-record-score")).toBeTruthy();
    });

    it("does not show 'New Record!' when score is below previous best", () => {
      usePersistenceStore.setState({
        lifetimeStats: {
          totalRuns: 5,
          totalKills: 100,
          killsByType: {},
          totalBarricadesBuilt: 10,
          totalTimePlayed: 1500,
          longestRunTime: 300,
          highestDay: 5,
          highestScore: 99999,
        },
      });

      useUIStore.getState().openMenu("death");
      useGameStore.setState({
        dayNumber: 1,
        totalKills: 2,
        barricadesBuilt: 0,
        elapsedTotal: 60,
      });

      render(<DeathScreen />);
      expect(screen.queryByTestId("new-record-score")).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Seed display and copy
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

    it("shows a copy button when seed is available", () => {
      useGameStore.setState({ seed: "test-seed" });
      render(<DeathScreen />);
      expect(screen.getByTestId("copy-seed-btn")).toBeTruthy();
      expect(screen.getByText("Copy")).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Button handlers
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Save error display
  // -------------------------------------------------------------------------

  describe("save error display", () => {
    it("shows save error banner when saveError is set", () => {
      useUIStore.getState().openMenu("death");
      usePersistenceStore.setState({ saveError: "This run may not have been saved." });
      render(<DeathScreen />);
      expect(screen.getByTestId("persistence-save-error")).toBeTruthy();
      expect(screen.getByText(/may not have been saved/)).toBeTruthy();
    });

    it("does not show save error banner when saveError is null", () => {
      useUIStore.getState().openMenu("death");
      usePersistenceStore.setState({ saveError: null });
      render(<DeathScreen />);
      expect(screen.queryByTestId("persistence-save-error")).toBeNull();
    });

    it("still shows all run stats when save fails", () => {
      useUIStore.getState().openMenu("death");
      useGameStore.setState({ totalKills: 42, dayNumber: 3 });
      usePersistenceStore.setState({ saveError: "This run may not have been saved." });
      render(<DeathScreen />);
      expect(screen.getByText("42")).toBeTruthy();
      expect(screen.getByText("3")).toBeTruthy();
      expect(screen.getByText("YOU DIED")).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Button handlers
  // -------------------------------------------------------------------------

  describe("Try Again button", () => {
    it("resets all stores and increments runKey", () => {
      useUIStore.getState().openMenu("death");
      useGameStore.setState({ totalKills: 50, seed: "old-seed" });
      usePlayerStore.getState().setDead();
      const initialRunKey = useGameStore.getState().runKey;

      render(<DeathScreen />);
      fireEvent.click(screen.getByTestId("try-again-btn"));

      expect(useGameStore.getState().totalKills).toBe(0);
      expect(useGameStore.getState().seed).toBeNull();
      expect(usePlayerStore.getState().alive).toBe(true);
      expect(useUIStore.getState().activeMenu).toBe("none");
      expect(useGameStore.getState().runKey).toBe(initialRunKey + 1);
    });
  });

  describe("Try Same Seed button", () => {
    it("sets the next run seed and increments runKey", () => {
      useUIStore.getState().openMenu("death");
      useGameStore.setState({ seed: "replay-seed" });

      render(<DeathScreen />);
      fireEvent.click(screen.getByTestId("try-same-seed-btn"));

      expect(mockSetNextRunSeed).toHaveBeenCalledWith("replay-seed");
      expect(useGameStore.getState().runKey).toBeGreaterThan(0);
    });

    it("is not shown when seed is null", () => {
      useUIStore.getState().openMenu("death");
      render(<DeathScreen />);
      expect(screen.queryByTestId("try-same-seed-btn")).toBeNull();
    });
  });

  describe("Return to Menu button", () => {
    it("resets all stores and navigates to '/'", () => {
      useUIStore.getState().openMenu("death");
      useGameStore.setState({ totalKills: 50 });
      usePlayerStore.getState().setDead();

      render(<DeathScreen />);
      fireEvent.click(screen.getByTestId("return-menu-btn"));

      expect(useGameStore.getState().totalKills).toBe(0);
      expect(usePlayerStore.getState().alive).toBe(true);
      expect(useUIStore.getState().activeMenu).toBe("none");
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });
});
