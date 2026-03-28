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

test("Landing page renders Play button linking to /play", () => {
  render(<Page />);
  const link = screen.getByRole("link", { name: /play/i });
  expect(link).toBeInTheDocument();
  expect(link).toHaveAttribute("href", "/play");
});
