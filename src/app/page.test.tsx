import { expect, test, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Page from "@/app/page";

afterEach(cleanup);

test("Landing page renders game title as heading", () => {
  render(<Page />);
  expect(
    screen.getByRole("heading", { level: 1, name: /deadbolt/i }),
  ).toBeInTheDocument();
});

test("Landing page renders tagline", () => {
  render(<Page />);
  expect(
    screen.getByText(/zombie survival base builder/i),
  ).toBeInTheDocument();
});

test("Landing page renders feature highlights", () => {
  render(<Page />);
  expect(screen.getByText("Scavenge")).toBeInTheDocument();
  expect(screen.getByText("Barricade")).toBeInTheDocument();
  expect(screen.getByText("Survive")).toBeInTheDocument();
});

test("Landing page renders How to Play section", () => {
  render(<Page />);
  expect(screen.getByText("How to Play")).toBeInTheDocument();
  expect(screen.getByText("WASD")).toBeInTheDocument();
  expect(screen.getByText("ESC")).toBeInTheDocument();
});

test("Landing page renders footer with version", () => {
  render(<Page />);
  expect(screen.getByText(/Deadbolt v0\.1\.0/)).toBeInTheDocument();
});

test("Landing page renders seed input field", () => {
  render(<Page />);
  expect(screen.getByTestId("seed-input")).toBeInTheDocument();
});
