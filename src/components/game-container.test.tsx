import { expect, test, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import GameContainer from "@/components/game-container";

afterEach(cleanup);

test("GameContainer renders a div with id game-container", () => {
  render(<GameContainer />);
  const container = document.getElementById("game-container");
  expect(container).toBeInTheDocument();
});

test("GameContainer shows placeholder text before Phaser mounts", () => {
  render(<GameContainer />);
  expect(screen.getByText(/waiting for game engine/i)).toBeInTheDocument();
});
