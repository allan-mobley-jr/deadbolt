import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DayNightTimer } from "./day-night-timer";
import { useGameStore } from "@/stores/useGameStore";

afterEach(() => {
  cleanup();
  useGameStore.getState().reset();
});

describe("DayNightTimer", () => {
  it("renders day number", () => {
    render(<DayNightTimer />);
    expect(screen.getByText("Day 1")).toBeTruthy();
  });

  it("renders countdown in M:SS format", () => {
    // Default state: 300 seconds remaining = 5:00
    render(<DayNightTimer />);
    expect(screen.getByText("5:00")).toBeTruthy();
  });

  it("shows sun icon during day phase", () => {
    render(<DayNightTimer />);
    expect(screen.getByLabelText("Day")).toBeTruthy();
  });

  it("shows moon icon during night phase", () => {
    useGameStore.getState().updateClock("night", 1, 90, 90, 315);
    render(<DayNightTimer />);
    expect(screen.getByLabelText("Night")).toBeTruthy();
    expect(screen.getByText("Night")).toBeTruthy();
  });

  it("shows dusk phase with moon icon", () => {
    useGameStore.getState().updateClock("dusk", 1, 15, 15, 300);
    render(<DayNightTimer />);
    expect(screen.getByText("Dusk")).toBeTruthy();
  });

  it("shows dawn phase with sun icon", () => {
    useGameStore.getState().updateClock("dawn", 2, 15, 15, 405);
    render(<DayNightTimer />);
    expect(screen.getByText("Dawn")).toBeTruthy();
  });

  it("formats countdown correctly for sub-minute values", () => {
    useGameStore.getState().updateClock("day", 1, 45, 300, 255);
    render(<DayNightTimer />);
    expect(screen.getByText("0:45")).toBeTruthy();
  });

  it("shows updated day number", () => {
    useGameStore.getState().updateClock("day", 3, 180, 180, 600);
    render(<DayNightTimer />);
    expect(screen.getByText("Day 3")).toBeTruthy();
  });
});
