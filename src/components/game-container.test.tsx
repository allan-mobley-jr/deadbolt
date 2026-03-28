import React from "react";
import { expect, test, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";

const mockCreateGame = vi.fn();
const mockDestroyGame = vi.fn();
const mockGetActiveBus = vi.fn().mockReturnValue(null);

vi.mock("@/game/PhaserGame", () => ({
  createGame: mockCreateGame,
  destroyGame: mockDestroyGame,
  getActiveBus: mockGetActiveBus,
}));

const { mockDisconnect, mockConnectBridge } = vi.hoisted(() => {
  const mockDisconnect = vi.fn();
  const mockConnectBridge = vi.fn().mockReturnValue({ disconnect: mockDisconnect });
  return { mockDisconnect, mockConnectBridge };
});

vi.mock("@/lib/bridge", () => ({
  connectBridge: mockConnectBridge,
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
  vi.useRealTimers();
  vi.resetAllMocks();
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

test("throws to error boundary when bridge polling exhausts retries", async () => {
  // mockGetActiveBus returns undefined after resetAllMocks — bus never becomes available.
  // Use fake timers to deterministically advance through 300+ rAF callbacks.
  vi.useFakeTimers();
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  render(
    <TestErrorBoundary>
      <GameContainer />
    </TestErrorBoundary>,
  );

  // Advance timers enough to flush the dynamic import microtask + 300 rAF
  // retries. Each rAF fires on the next frame (~16ms). 320 × 20ms gives
  // generous headroom.
  for (let i = 0; i < 320; i++) {
    await vi.advanceTimersByTimeAsync(20);
  }

  // After 300 retries, setError is called → re-render → throw → boundary.
  expect(screen.getByTestId("boundary-error")).toBeInTheDocument();
  expect(screen.getByTestId("boundary-error").textContent).toContain(
    "Event bus not available after timeout",
  );

  consoleSpy.mockRestore();
});

test("does not set error state if unmounted during bridge polling", async () => {
  vi.useFakeTimers();

  const { unmount } = render(
    <TestErrorBoundary>
      <GameContainer />
    </TestErrorBoundary>,
  );

  // Advance past import resolution + a few rAF polls.
  for (let i = 0; i < 10; i++) {
    await vi.advanceTimersByTimeAsync(20);
  }

  // Unmount mid-polling — sets cancelled=true.
  unmount();

  // Continue advancing — cancelled guard should prevent setError.
  for (let i = 0; i < 400; i++) {
    await vi.advanceTimersByTimeAsync(20);
  }

  expect(screen.queryByTestId("boundary-error")).not.toBeInTheDocument();
});

test("does not set error state if createGame fails after unmount", async () => {
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

test("connects bridge when getActiveBus returns a bus", async () => {
  vi.useFakeTimers();
  const fakeBus = { on: vi.fn(), off: vi.fn(), listeners: vi.fn().mockReturnValue([]) };
  mockGetActiveBus.mockReturnValue(fakeBus);
  mockConnectBridge.mockReturnValue({ disconnect: mockDisconnect });

  render(<GameContainer />);

  // Flush dynamic import microtask + first rAF poll
  await vi.advanceTimersByTimeAsync(20);

  await vi.waitFor(() => {
    expect(mockConnectBridge).toHaveBeenCalledTimes(1);
  });
  expect(mockConnectBridge).toHaveBeenCalledWith(fakeBus);
});

test("disconnects bridge on unmount after successful connection", async () => {
  vi.useFakeTimers();
  const fakeBus = { on: vi.fn(), off: vi.fn(), listeners: vi.fn().mockReturnValue([]) };
  mockGetActiveBus.mockReturnValue(fakeBus);
  mockConnectBridge.mockReturnValue({ disconnect: mockDisconnect });

  const { unmount } = render(<GameContainer />);

  // Flush dynamic import + poll so bridge connects
  await vi.advanceTimersByTimeAsync(20);
  await vi.waitFor(() => {
    expect(mockConnectBridge).toHaveBeenCalled();
  });

  unmount();
  expect(mockDisconnect).toHaveBeenCalledTimes(1);
});
