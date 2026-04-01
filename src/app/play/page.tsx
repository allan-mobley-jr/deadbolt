import type { Metadata } from "next";
import GameShell from "@/components/game-shell";

export const metadata: Metadata = {
  title: "Play | Deadbolt",
  description:
    "Play Deadbolt — a zombie survival base builder in your browser",
  openGraph: {
    title: "Play Deadbolt",
    description:
      "Physics-driven barricading. Permadeath roguelike. 15-minute runs. Play in your browser.",
    url: "/play",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Play Deadbolt",
    description:
      "Physics-driven barricading. Permadeath roguelike. 15-minute runs.",
  },
};

export default function PlayPage() {
  return <GameShell />;
}
