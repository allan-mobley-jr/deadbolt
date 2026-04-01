// @vitest-environment node
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

describe("bundle analysis tooling", () => {
  it("performance-budget.json exists and has valid structure", () => {
    const budgetPath = resolve(root, "performance-budget.json");
    expect(existsSync(budgetPath)).toBe(true);

    const budget = JSON.parse(readFileSync(budgetPath, "utf-8"));
    expect(budget).toHaveProperty("budgets.landing");
    expect(budget).toHaveProperty("budgets.play");
    expect(budget.budgets.landing).toHaveProperty("routeJsGzippedBytes");
    expect(budget.budgets.landing).toHaveProperty("noPhaserChunk");
    expect(budget.budgets.play).toHaveProperty("totalJsGzippedBytes");
    expect(budget.budgets.play).toHaveProperty("phaserChunkGzippedBytes");
  });

  it("performance budgets are realistic numbers", () => {
    const budget = JSON.parse(
      readFileSync(resolve(root, "performance-budget.json"), "utf-8"),
    );

    // Landing route JS budget: 50KB–200KB gzip range
    expect(budget.budgets.landing.routeJsGzippedBytes).toBeGreaterThan(50_000);
    expect(budget.budgets.landing.routeJsGzippedBytes).toBeLessThan(200_000);

    // Play page total budget: 500KB–2MB gzip range
    expect(budget.budgets.play.totalJsGzippedBytes).toBeGreaterThan(500_000);
    expect(budget.budgets.play.totalJsGzippedBytes).toBeLessThan(2_000_000);

    // Phaser chunk budget: 200KB–600KB gzip range
    expect(budget.budgets.play.phaserChunkGzippedBytes).toBeGreaterThan(
      200_000,
    );
    expect(budget.budgets.play.phaserChunkGzippedBytes).toBeLessThan(600_000);
  });

  it("@next/bundle-analyzer is in devDependencies", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf-8"),
    );
    expect(pkg.devDependencies).toHaveProperty("@next/bundle-analyzer");
  });

  it('package.json has "analyze" script', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf-8"),
    );
    expect(pkg.scripts).toHaveProperty("analyze");
    expect(pkg.scripts.analyze).toContain("ANALYZE=true");
  });

  it('package.json has "check:bundle" script', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf-8"),
    );
    expect(pkg.scripts).toHaveProperty("check:bundle");
  });

  it("next.config.ts imports bundle-analyzer", () => {
    const config = readFileSync(
      resolve(root, "next.config.ts"),
      "utf-8",
    );
    expect(config).toContain("@next/bundle-analyzer");
    expect(config).toContain("ANALYZE");
  });

  it("check-bundle-size.mjs script exists", () => {
    expect(existsSync(resolve(root, "scripts/check-bundle-size.mjs"))).toBe(
      true,
    );
  });
});
