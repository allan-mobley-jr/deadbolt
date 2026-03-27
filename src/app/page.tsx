import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Deadbolt",
  description:
    "A top-down zombie survival base builder that runs entirely in the browser. Fortify, scavenge, survive.",
};

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>
            <h1 className="font-mono text-3xl tracking-tight">Deadbolt</h1>
          </CardTitle>
          <CardDescription>
            Zombie survival base builder. Fortify, scavenge, survive.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <p className="text-sm text-muted-foreground">
            Physics-driven barricading &middot; Permadeath roguelike &middot;
            15-minute runs
          </p>
        </CardContent>

        <CardFooter className="justify-center">
          <Link href="/play">
            <Button size="lg">Play</Button>
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
