import { expect, test, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

const mockCreateGame = vi.fn();
const mockDestroyGame = vi.fn();

vi.mock("@/game/PhaserGame", () => ({
  createGame: mockCreateGame,
  destroyGame: mockDestroyGame,
}));

import GameContainer from "@/components/game-container";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("renders a div with id game-container", () => {
  render(<GameContainer />);
  const container = document.getElementById("game-container");
  expect(container).toBeInTheDocument();
});

test("calls createGame on mount", async () => {
  render(<GameContainer />);
  // Dynamic import resolves as a microtask — flush it
  await vi.waitFor(() => {
    expect(mockCreateGame).toHaveBeenCalledWith("game-container");
  });
});

test("calls destroyGame on unmount", async () => {
  const { unmount } = render(<GameContainer />);
  // Wait for mount to complete so destroy ref is captured
  await vi.waitFor(() => {
    expect(mockCreateGame).toHaveBeenCalled();
  });
  unmount();
  expect(mockDestroyGame).toHaveBeenCalled();
});
