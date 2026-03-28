import type { Metadata } from "next";
import GameShell from "@/components/game-shell";

export const metadata: Metadata = {
  title: "Play | Deadbolt",
  description:
    "Play Deadbolt — a zombie survival base builder in your browser",
};

export default function PlayPage() {
  return <GameShell />;
}
