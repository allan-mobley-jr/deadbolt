import { expect, test, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import PlayError from "@/app/play/error";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("PlayError renders failure message", () => {
  const error = new Error("test error");
  render(<PlayError error={error} reset={() => {}} />);
  expect(screen.getByText(/failed to load the game/i)).toBeInTheDocument();
});

test("PlayError retry button calls reset", () => {
  const error = new Error("test error");
  const reset = vi.fn();
  render(<PlayError error={error} reset={reset} />);
  fireEvent.click(screen.getByRole("button", { name: /retry/i }));
  expect(reset).toHaveBeenCalledOnce();
});

test("PlayError logs error to console on mount", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  const error = new Error("test error");
  render(<PlayError error={error} reset={() => {}} />);
  expect(spy).toHaveBeenCalledWith("Game failed to load:", error);
});
