// @vitest-environment node
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const nextDir = join(root, ".next");
const chunksDir = join(nextDir, "static", "chunks");

const hasBuild = existsSync(join(nextDir, "build-manifest.json"));

describe("code splitting verification", () => {
  describe.skipIf(!hasBuild)("build output analysis", () => {
    it("build-manifest.json exists", () => {
      expect(existsSync(join(nextDir, "build-manifest.json"))).toBe(true);
    });

    it("Phaser chunk is NOT referenced in landing page manifest", () => {
      const manifestPath = join(
        nextDir,
        "server",
        "app",
        "page_client-reference-manifest.js",
      );
      expect(existsSync(manifestPath)).toBe(true);

      const src = readFileSync(manifestPath, "utf-8");

      // Find the Phaser chunk: largest JS chunk in the chunks directory
      let phaserChunkName = "";
      let maxSize = 0;
      for (const file of readdirSync(chunksDir)) {
        if (!file.endsWith(".js")) continue;
        const size = statSync(join(chunksDir, file)).size;
        if (size > maxSize) {
          maxSize = size;
          phaserChunkName = file;
        }
      }

      // Phaser chunk should be > 500KB (it's ~1.3MB)
      expect(maxSize).toBeGreaterThan(500_000);

      // Landing page manifest should NOT reference the Phaser chunk
      expect(src).not.toContain(phaserChunkName);
    });

    it("play page manifest references game-shell", () => {
      const manifestPath = join(
        nextDir,
        "server",
        "app",
        "play",
        "page_client-reference-manifest.js",
      );
      expect(existsSync(manifestPath)).toBe(true);

      const src = readFileSync(manifestPath, "utf-8");
      expect(src).toContain("game-shell");
    });

    it("landing page has fewer entry JS chunks than play page", () => {
      const landingManifestPath = join(
        nextDir,
        "server",
        "app",
        "page_client-reference-manifest.js",
      );
      const playManifestPath = join(
        nextDir,
        "server",
        "app",
        "play",
        "page_client-reference-manifest.js",
      );

      const parseEntryJS = (path: string) => {
        const src = readFileSync(path, "utf-8");
        const match = src.match(/=\s*(\{[\s\S]+\})\s*;?\s*$/);
        if (!match) return {};
        return JSON.parse(match[1]).entryJSFiles || {};
      };

      const landingEntries = parseEntryJS(landingManifestPath);
      const playEntries = parseEntryJS(playManifestPath);

      // Collect unique chunks per route
      const landingChunks = new Set(Object.values(landingEntries).flat());
      const playChunks = new Set(Object.values(playEntries).flat());

      // Play page should have more chunks (game-shell, stores, etc.)
      expect(playChunks.size).toBeGreaterThan(landingChunks.size);
    });
  });
});

describe("source-level code splitting patterns", () => {
  it("game-shell uses dynamic import for GameContainer", () => {
    const src = readFileSync(
      resolve(root, "src/components/game-shell.tsx"),
      "utf-8",
    );
    expect(src).toContain("dynamic(");
    expect(src).toContain("ssr: false");
  });

  it("game-container uses dynamic import() for PhaserGame", () => {
    const src = readFileSync(
      resolve(root, "src/components/game-container.tsx"),
      "utf-8",
    );
    expect(src).toContain('import("@/game/PhaserGame")');
  });

  it("game-shell lazy-loads overlay components", () => {
    const src = readFileSync(
      resolve(root, "src/components/game-shell.tsx"),
      "utf-8",
    );
    // These components should be lazy-loaded, not statically imported
    expect(src).toContain("lazy(");
    expect(src).toContain("Suspense");
    expect(src).toMatch(/lazy\(\(\)\s*=>\s*import\("@\/components\/death-screen"\)/);
    expect(src).toMatch(/lazy\(\(\)\s*=>\s*import\("@\/components\/pause-menu"\)/);
    expect(src).toMatch(/lazy\(\(\)\s*=>\s*import\("@\/components\/settings-dialog"\)/);
    expect(src).toMatch(
      /lazy\(\(\)\s*=>\s*import\("@\/components\/controls-reference"\)/,
    );
  });

  it("landing page does NOT import Phaser or game modules", () => {
    const src = readFileSync(resolve(root, "src/app/page.tsx"), "utf-8");
    expect(src).not.toContain("phaser");
    expect(src).not.toContain("@/game/");
    expect(src).not.toContain("game-shell");
    expect(src).not.toContain("game-container");
  });

  it("src/game/ has zero React imports", () => {
    // Verify the architectural boundary: game code must not import React
    const gameDir = resolve(root, "src/game");
    const checkDir = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          // Skip __mocks__ directories (they may have React for test doubles)
          if (entry.name === "__mocks__") continue;
          checkDir(join(dir, entry.name));
        } else if (
          entry.name.endsWith(".ts") &&
          !entry.name.endsWith(".test.ts")
        ) {
          const content = readFileSync(join(dir, entry.name), "utf-8");
          expect(content).not.toMatch(/from\s+['"]react['"]/);
        }
      }
    };
    checkDir(gameDir);
  });
});
