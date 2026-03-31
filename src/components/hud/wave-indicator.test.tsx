import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { WaveIndicator } from "./wave-indicator";
import { useGameStore } from "@/stores/useGameStore";

afterEach(() => {
  cleanup();
  useGameStore.getState().reset();
});

describe("WaveIndicator", () => {
  it("renders nothing when no wave is active", () => {
    const { container } = render(<WaveIndicator />);
    expect(container.innerHTML).toBe("");
  });

  it("renders wave number when a wave is active", () => {
    useGameStore.getState().setWaveStarted(2, 15);
    render(<WaveIndicator />);
    expect(screen.getByText("Wave 2")).toBeTruthy();
  });

  it("shows kill progress as killed/total", () => {
    useGameStore.getState().setWaveStarted(1, 10);
    // Simulate 3 kills
    useGameStore.getState().decrementZombiesRemaining();
    useGameStore.getState().decrementZombiesRemaining();
    useGameStore.getState().decrementZombiesRemaining();
    render(<WaveIndicator />);
    expect(screen.getByText("3/10")).toBeTruthy();
  });

  it("hides again when wave ends", () => {
    useGameStore.getState().setWaveStarted(1, 5);
    const { container, rerender } = render(<WaveIndicator />);
    expect(screen.getByText("Wave 1")).toBeTruthy();

    useGameStore.getState().setWaveEnded();
    rerender(<WaveIndicator />);
    expect(container.innerHTML).toBe("");
  });

  it("has pulsing animation on the wave label", () => {
    useGameStore.getState().setWaveStarted(3, 25);
    render(<WaveIndicator />);
    const label = screen.getByText("Wave 3");
    expect(label.className).toContain("animate-pulse");
  });

  it("clamps remaining at zero", () => {
    useGameStore.getState().setWaveStarted(1, 2);
    useGameStore.getState().decrementZombiesRemaining();
    useGameStore.getState().decrementZombiesRemaining();
    useGameStore.getState().decrementZombiesRemaining(); // extra call
    const state = useGameStore.getState();
    expect(state.zombiesRemainingInWave).toBe(0);
  });
});
