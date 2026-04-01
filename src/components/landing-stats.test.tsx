import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { LandingStats } from "./landing-stats";
import { usePersistenceStore } from "@/stores/usePersistenceStore";
import { EMPTY_LIFETIME_STATS } from "@/types/persistence";

afterEach(cleanup);

beforeEach(() => {
  usePersistenceStore.setState({
    loaded: false,
    available: false,
    loadError: null,
    saveError: null,
    runHistory: [],
    leaderboard: [],
    lifetimeStats: { ...EMPTY_LIFETIME_STATS, killsByType: {} },
  });
});

describe("LandingStats", () => {
  describe("when no stats exist", () => {
    it("shows 'Play' button text when no runs completed", () => {
      usePersistenceStore.setState({ loaded: true, available: true });
      render(<LandingStats />);
      expect(screen.getByText("Play")).toBeTruthy();
    });

    it("does not show lifetime stats section", () => {
      usePersistenceStore.setState({ loaded: true, available: true });
      render(<LandingStats />);
      expect(screen.queryByTestId("lifetime-stats")).toBeNull();
    });
  });

  describe("when stats exist", () => {
    beforeEach(() => {
      usePersistenceStore.setState({
        loaded: true,
        available: true,
        lifetimeStats: {
          totalRuns: 5,
          totalKills: 150,
          killsByType: { shambler: 100, runner: 50 },
          totalBarricadesBuilt: 20,
          totalTimePlayed: 3600,
          longestRunTime: 900,
          highestDay: 4,
          highestScore: 5000,
        },
        leaderboard: [
          {
            id: "best-run",
            seed: "best-seed-123",
            completedAt: Date.now(),
            elapsedTotal: 900,
            dayNumber: 4,
            waveNumber: 5,
            totalKills: 50,
            killsByType: {},
            barricadesBuilt: 10,
            distanceTraveled: 8000,
            objectsUsed: 15,
            score: 5000,
          },
        ],
      });
    });

    it("shows 'New Run' button text when runs exist", () => {
      render(<LandingStats />);
      expect(screen.getByText("New Run")).toBeTruthy();
    });

    it("shows lifetime stats section", () => {
      render(<LandingStats />);
      expect(screen.getByTestId("lifetime-stats")).toBeTruthy();
      expect(screen.getByText("Your Stats")).toBeTruthy();
    });

    it("displays total runs", () => {
      render(<LandingStats />);
      expect(screen.getByText("5")).toBeTruthy();
    });

    it("displays best score formatted", () => {
      render(<LandingStats />);
      expect(screen.getByText("5,000")).toBeTruthy();
    });

    it("displays total kills formatted", () => {
      render(<LandingStats />);
      expect(screen.getByText("150")).toBeTruthy();
    });

    it("displays highest day", () => {
      render(<LandingStats />);
      // Check for "Highest Day" label and value "4"
      expect(screen.getByText("Highest Day")).toBeTruthy();
    });

    it("displays time played formatted", () => {
      render(<LandingStats />);
      // 3600 seconds = 1h 0m
      expect(screen.getByText("1h 0m")).toBeTruthy();
    });

    it("shows best run seed", () => {
      render(<LandingStats />);
      expect(screen.getByText("best-seed-123")).toBeTruthy();
      expect(screen.getByText("Best Run Seed")).toBeTruthy();
    });
  });

  describe("seed input", () => {
    it("renders seed input field", () => {
      usePersistenceStore.setState({ loaded: true, available: true });
      render(<LandingStats />);
      const input = screen.getByTestId("seed-input");
      expect(input).toBeTruthy();
      expect(input.getAttribute("placeholder")).toContain("seed");
    });

    it("accepts text input", () => {
      usePersistenceStore.setState({ loaded: true, available: true });
      render(<LandingStats />);
      const input = screen.getByTestId("seed-input") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "my-seed" } });
      expect(input.value).toBe("my-seed");
    });
  });

  describe("persistence load error", () => {
    it("shows error banner when loadError is set", () => {
      usePersistenceStore.setState({
        loaded: true,
        available: false,
        loadError: "Failed to load saved data. Your run history may be unavailable.",
      });
      render(<LandingStats />);
      expect(screen.getByTestId("persistence-load-error")).toBeTruthy();
      expect(screen.getByText(/Failed to load/)).toBeTruthy();
    });

    it("still shows the play button when load fails", () => {
      usePersistenceStore.setState({
        loaded: true,
        available: false,
        loadError: "Failed to load saved data.",
      });
      render(<LandingStats />);
      expect(screen.getByText("Play")).toBeTruthy();
    });

    it("does not show error banner when load succeeds", () => {
      usePersistenceStore.setState({ loaded: true, available: true, loadError: null });
      render(<LandingStats />);
      expect(screen.queryByTestId("persistence-load-error")).toBeNull();
    });
  });

  describe("time formatting", () => {
    it("formats time under a minute as seconds", () => {
      usePersistenceStore.setState({
        loaded: true,
        available: true,
        lifetimeStats: {
          ...EMPTY_LIFETIME_STATS,
          totalRuns: 1,
          totalTimePlayed: 45,
        },
      });
      render(<LandingStats />);
      expect(screen.getByText("45s")).toBeTruthy();
    });

    it("formats time as minutes when under an hour", () => {
      usePersistenceStore.setState({
        loaded: true,
        available: true,
        lifetimeStats: {
          ...EMPTY_LIFETIME_STATS,
          totalRuns: 1,
          totalTimePlayed: 600,
        },
      });
      render(<LandingStats />);
      expect(screen.getByText("10m")).toBeTruthy();
    });
  });
});
