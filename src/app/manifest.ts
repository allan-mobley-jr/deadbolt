import type { MetadataRoute } from "next";

/**
 * Web App Manifest — enables PWA install prompts and "Add to Home Screen."
 *
 * Uses the Next.js file convention: exporting from `src/app/manifest.ts`
 * auto-generates `/manifest.webmanifest` and adds the link tag.
 *
 * The game is fully client-side with no backend. Offline play is
 * technically feasible but deferred (see docs/pwa-evaluation.md).
 * The manifest alone enables browser install prompts.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Deadbolt",
    short_name: "Deadbolt",
    description:
      "A top-down zombie survival base builder that runs entirely in the browser",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0f",
    theme_color: "#1a1a1a",
    orientation: "landscape",
    categories: ["games"],
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
