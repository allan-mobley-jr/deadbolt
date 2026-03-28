import React from "react";
import { expect, test, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";

const mockCreateGame = vi.fn();
const mockDestroyGame = vi.fn();

vi.mock("@/game/PhaserGame", () => ({
  createGame: mockCreateGame,
  destroyGame: mockDestroyGame,
}));

import GameContainer from "@/components/game-container";

/** Minimal error boundary for testing the throw-on-render path. */
class TestErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return <p data-testid="boundary-error">{this.state.error.message}</p>;
    }
    return this.props.children;
  }
}

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

test("does not call createGame if unmounted before import resolves", async () => {
  const { unmount } = render(<GameContainer />);
  // Unmount immediately before the dynamic import can resolve
  unmount();
  // Let any pending microtasks flush
  await new Promise((r) => setTimeout(r, 0));
  expect(mockCreateGame).not.toHaveBeenCalled();
});

test("throws to error boundary when createGame fails", async () => {
  // Make createGame throw to trigger the .catch → setError → throw path
  mockCreateGame.mockImplementation(() => {
    throw new Error("WebGL not supported");
  });
  // Suppress the console.error from GameContainer's catch handler
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  render(
    <TestErrorBoundary>
      <GameContainer />
    </TestErrorBoundary>,
  );

  // Wait for the error to propagate through the catch → setState → re-render → throw → boundary
  await vi.waitFor(() => {
    expect(screen.getByTestId("boundary-error")).toBeInTheDocument();
  });
  expect(screen.getByTestId("boundary-error").textContent).toBe(
    "WebGL not supported",
  );

  consoleSpy.mockRestore();
});

test("does not set error state if import fails after unmount", async () => {
  // Make createGame throw — but the component will unmount first
  mockCreateGame.mockImplementation(() => {
    throw new Error("late failure");
  });
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  const { unmount } = render(
    <TestErrorBoundary>
      <GameContainer />
    </TestErrorBoundary>,
  );
  // Unmount immediately before dynamic import resolves
  unmount();
  // Flush microtasks so the .catch handler runs (with cancelled=true)
  await new Promise((r) => setTimeout(r, 0));

  // The error boundary should NOT have caught anything — cancelled guard returns early
  expect(screen.queryByTestId("boundary-error")).not.toBeInTheDocument();

  consoleSpy.mockRestore();
});
