/**
 * Bundle size verification script.
 *
 * Reads the production build output from .next/ and checks that JS chunks
 * stay within the performance budgets defined in performance-budget.json.
 *
 * Usage:
 *   node scripts/check-bundle-size.mjs          # check budgets
 *   node scripts/check-bundle-size.mjs --report  # print detailed report only
 *
 * Requires a production build to exist (.next/build-manifest.json).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = resolve(process.cwd());
const NEXT_DIR = join(ROOT, ".next");
const CHUNKS_DIR = join(NEXT_DIR, "static", "chunks");
const BUILD_MANIFEST = join(NEXT_DIR, "build-manifest.json");
const BUDGET_FILE = join(ROOT, "performance-budget.json");

const REPORT_ONLY = process.argv.includes("--report");

/* ---------- helpers ---------- */

function fatal(msg) {
  console.error(`\x1b[31m[FATAL]\x1b[0m ${msg}`);
  process.exit(1);
}

function warn(msg) {
  console.warn(`\x1b[33m[WARN]\x1b[0m ${msg}`);
}

function pass(msg) {
  console.log(`\x1b[32m[PASS]\x1b[0m ${msg}`);
}

function info(msg) {
  console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`);
}

function formatKB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function gzipSize(filePath) {
  const buf = readFileSync(filePath);
  return gzipSync(buf, { level: 9 }).length;
}

/**
 * Parse a client-reference-manifest.js and extract the entryJSFiles map.
 * The file assigns to globalThis.__RSC_MANIFEST["/path"] = { ... entryJSFiles: { ... } }
 */
function parseClientManifestEntryJS(filePath) {
  if (!existsSync(filePath)) return {};
  const src = readFileSync(filePath, "utf-8");
  // Extract the JSON object assigned to globalThis.__RSC_MANIFEST[...]
  const match = src.match(/=\s*(\{[\s\S]+\})\s*;?\s*$/);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[1]);
    return parsed.entryJSFiles || {};
  } catch {
    return {};
  }
}

/* ---------- pre-flight ---------- */

if (!existsSync(BUILD_MANIFEST)) {
  fatal(
    "No production build found. Run `pnpm build` first, then `pnpm check:bundle`.",
  );
}

if (!existsSync(BUDGET_FILE)) {
  fatal("performance-budget.json not found at project root.");
}

const budget = JSON.parse(readFileSync(BUDGET_FILE, "utf-8"));
const buildManifest = JSON.parse(readFileSync(BUILD_MANIFEST, "utf-8"));

/* ---------- collect chunk metadata ---------- */

/** Map of relative chunk path → { raw, gzip } */
const chunkSizes = new Map();

if (existsSync(CHUNKS_DIR)) {
  for (const file of readdirSync(CHUNKS_DIR)) {
    if (!file.endsWith(".js")) continue;
    const abs = join(CHUNKS_DIR, file);
    const raw = statSync(abs).size;
    const gz = gzipSize(abs);
    // Store with the relative path format used in manifests
    chunkSizes.set(`static/chunks/${file}`, { raw, gzip: gz, abs });
  }
}

/* ---------- identify chunk groups ---------- */

// Framework + runtime chunks (loaded on every page)
const rootMainFiles = buildManifest.rootMainFiles || [];
const polyfillFiles = buildManifest.polyfillFiles || [];
const lowPriorityFiles = buildManifest.lowPriorityFiles || [];

// Per-route entry JS files from client reference manifests
const landingManifest = parseClientManifestEntryJS(
  join(NEXT_DIR, "server", "app", "page_client-reference-manifest.js"),
);
const playManifest = parseClientManifestEntryJS(
  join(NEXT_DIR, "server", "app", "play", "page_client-reference-manifest.js"),
);

// Collect unique entry JS files per route
function collectEntryJS(manifest) {
  const files = new Set();
  for (const chunks of Object.values(manifest)) {
    for (const f of chunks) {
      files.add(f);
    }
  }
  return [...files];
}

const landingEntryJS = collectEntryJS(landingManifest);
const playEntryJS = collectEntryJS(playManifest);

// Build the full list of JS files loaded on each route
function uniqueFiles(...lists) {
  return [...new Set(lists.flat())];
}

const sharedFramework = uniqueFiles(rootMainFiles, polyfillFiles);
const landingAll = uniqueFiles(sharedFramework, landingEntryJS);
const playAll = uniqueFiles(sharedFramework, playEntryJS);

// Landing route-specific = landing chunks minus shared framework
const landingRouteOnly = landingEntryJS.filter(
  (f) => !sharedFramework.includes(f),
);

// Play route-specific = play chunks minus framework chunks shared with landing
const playRouteOnly = playEntryJS.filter((f) => !sharedFramework.includes(f));

// Find the Phaser chunk: largest chunk not in any entry manifest
// (it's loaded via dynamic import() at runtime)
const allManifestChunks = new Set([...landingAll, ...playAll]);
let phaserChunk = null;
let phaserGzip = 0;

for (const [path, sizes] of chunkSizes) {
  if (!allManifestChunks.has(path) && sizes.raw > 500_000) {
    // Phaser is the only chunk > 500KB not in manifests
    phaserChunk = path;
    phaserGzip = sizes.gzip;
    break;
  }
}

// Collect all dynamic chunks (not in manifests) for play page total
const dynamicChunks = [];
for (const [path, sizes] of chunkSizes) {
  if (!allManifestChunks.has(path) && !lowPriorityFiles.includes(path)) {
    dynamicChunks.push({ path, ...sizes });
  }
}

/* ---------- compute totals ---------- */

function sumGzip(files) {
  let total = 0;
  for (const f of files) {
    const entry = chunkSizes.get(f);
    if (entry) total += entry.gzip;
  }
  return total;
}

const landingRouteGzip = sumGzip(landingRouteOnly);
const landingTotalGzip = sumGzip(landingAll);
const playEntryGzip = sumGzip(playAll);
const dynamicTotalGzip = dynamicChunks.reduce((s, c) => s + c.gzip, 0);
const playTotalGzip = playEntryGzip + dynamicTotalGzip;

/* ---------- report ---------- */

console.log("\n=== Deadbolt Bundle Analysis ===\n");

info("Framework + Runtime (shared across all routes):");
for (const f of sharedFramework) {
  const s = chunkSizes.get(f);
  if (s) console.log(`    ${f}  ${formatKB(s.raw)} raw / ${formatKB(s.gzip)} gzip`);
}
console.log(`    TOTAL: ${formatKB(sumGzip(sharedFramework))} gzip\n`);

info("Landing Page (/) route-specific:");
for (const f of landingRouteOnly) {
  const s = chunkSizes.get(f);
  if (s) console.log(`    ${f}  ${formatKB(s.raw)} raw / ${formatKB(s.gzip)} gzip`);
}
console.log(`    Route JS: ${formatKB(landingRouteGzip)} gzip`);
console.log(`    Total JS: ${formatKB(landingTotalGzip)} gzip\n`);

info("Play Page (/play) route-specific:");
for (const f of playRouteOnly) {
  const s = chunkSizes.get(f);
  if (s) console.log(`    ${f}  ${formatKB(s.raw)} raw / ${formatKB(s.gzip)} gzip`);
}
console.log(`    Entry JS: ${formatKB(playEntryGzip)} gzip`);

if (dynamicChunks.length > 0) {
  console.log("    Dynamic imports (loaded on demand):");
  for (const c of dynamicChunks) {
    const label = c.path === phaserChunk ? " [PHASER]" : "";
    console.log(`      ${c.path}  ${formatKB(c.raw)} raw / ${formatKB(c.gzip)} gzip${label}`);
  }
  console.log(`    Dynamic JS: ${formatKB(dynamicTotalGzip)} gzip`);
}
console.log(`    Total JS (entry + dynamic): ${formatKB(playTotalGzip)} gzip\n`);

if (phaserChunk) {
  info(`Phaser chunk identified: ${phaserChunk}`);
  const ps = chunkSizes.get(phaserChunk);
  if (ps) console.log(`    ${formatKB(ps.raw)} raw / ${formatKB(ps.gzip)} gzip\n`);
} else {
  warn("Could not identify Phaser chunk (no chunk >500KB outside manifests)\n");
}

/* ---------- budget checks ---------- */

if (REPORT_ONLY) {
  console.log("(report only mode — skipping budget checks)\n");
  process.exit(0);
}

console.log("=== Budget Checks ===\n");
let failures = 0;

// 1. Landing page route-specific JS under budget (excludes shared framework)
const landingBudget = budget.budgets.landing.routeJsGzippedBytes;
if (landingRouteGzip > landingBudget) {
  warn(
    `Landing page route JS: ${formatKB(landingRouteGzip)} gzip > budget ${formatKB(landingBudget)}`,
  );
  failures++;
} else {
  pass(
    `Landing page route JS: ${formatKB(landingRouteGzip)} gzip <= budget ${formatKB(landingBudget)} (total with framework: ${formatKB(landingTotalGzip)})`,
  );
}

// 2. No Phaser chunk in landing page
const landingHasPhaser =
  phaserChunk !== null && landingAll.includes(phaserChunk);
if (landingHasPhaser) {
  warn("Landing page loads Phaser chunk — code splitting is broken!");
  failures++;
} else {
  pass("Landing page does NOT load Phaser chunk");
}

// 3. Play page total under budget
const playBudget = budget.budgets.play.totalJsGzippedBytes;
if (playTotalGzip > playBudget) {
  warn(
    `Play page total JS: ${formatKB(playTotalGzip)} gzip > budget ${formatKB(playBudget)}`,
  );
  failures++;
} else {
  pass(
    `Play page total JS: ${formatKB(playTotalGzip)} gzip <= budget ${formatKB(playBudget)}`,
  );
}

// 4. Phaser chunk size under budget
if (phaserChunk) {
  const phaserBudget = budget.budgets.play.phaserChunkGzippedBytes;
  if (phaserGzip > phaserBudget) {
    warn(
      `Phaser chunk: ${formatKB(phaserGzip)} gzip > budget ${formatKB(phaserBudget)}`,
    );
    failures++;
  } else {
    pass(
      `Phaser chunk: ${formatKB(phaserGzip)} gzip <= budget ${formatKB(phaserBudget)}`,
    );
  }
}

console.log();

if (failures > 0) {
  fatal(`${failures} budget check(s) failed.`);
} else {
  pass("All budget checks passed!\n");
}
