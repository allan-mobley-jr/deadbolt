import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LandingStats } from "@/components/landing-stats";

export const metadata: Metadata = {
  title: "Deadbolt",
  description:
    "A top-down zombie survival base builder that runs entirely in the browser. Fortify, scavenge, survive.",
  openGraph: {
    title: "Deadbolt",
    description:
      "Physics-driven barricading. Permadeath roguelike. 15-minute runs.",
    type: "website",
  },
};

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        {/* --- Hero --- */}
        <Card className="text-center">
          <CardHeader className="pb-2">
            <CardTitle>
              <h1 className="font-mono text-4xl font-bold tracking-tight">
                Deadbolt
              </h1>
            </CardTitle>
            <CardDescription className="text-base">
              Zombie survival base builder. Fortify, scavenge, survive.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 pt-0">
            <p className="text-sm text-muted-foreground">
              Physics-driven barricading &middot; Permadeath roguelike &middot;
              15-minute runs
            </p>
          </CardContent>

          <CardFooter className="flex flex-col px-6 pb-6">
            {/* Client Component island: play button, seed input, stats */}
            <LandingStats />
          </CardFooter>
        </Card>

        {/* --- Feature highlights --- */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FeatureCard
            icon="&#x1F50D;"
            title="Scavenge"
            description="Explore a procedurally generated city. Loot buildings for supplies and barricade materials."
          />
          <FeatureCard
            icon="&#x1F6E1;"
            title="Barricade"
            description="Drag objects to block doorways. Physics matters — heavy objects hold longer."
          />
          <FeatureCard
            icon="&#x1F9DF;"
            title="Survive"
            description="Waves of zombies attack at night. Four archetypes, each with unique behaviors."
          />
        </div>

        {/* --- How to Play --- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              How to Play
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <ControlRow keys="WASD" action="Move" />
              <ControlRow keys="Mouse" action="Aim" />
              <ControlRow keys="Click" action="Attack / Drag" />
              <ControlRow keys="E" action="Interact" />
              <ControlRow keys="1-5" action="Quick select" />
              <ControlRow keys="ESC" action="Pause" />
            </div>
            <p className="pt-1 text-xs text-muted-foreground/70">
              Scavenge during the day, barricade at dusk, survive the night.
              Each run uses a unique seed — share yours from the death screen.
            </p>
          </CardContent>
        </Card>

        {/* --- Footer --- */}
        <footer className="text-center text-xs text-muted-foreground/50">
          <p>
            Deadbolt v0.1.0 &middot; Built with Next.js, Phaser &amp;
            Matter.js
          </p>
        </footer>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-components (Server Components — no client JS)
// ---------------------------------------------------------------------------

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border/30 bg-card/50 p-4 text-center">
      <div className="text-2xl" aria-hidden="true">
        {icon}
      </div>
      <h3 className="mt-1 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function ControlRow({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="flex items-center gap-2">
      <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-zinc-600 bg-zinc-800 px-1 font-mono text-[10px] text-zinc-300">
        {keys}
      </kbd>
      <span>{action}</span>
    </div>
  );
}
