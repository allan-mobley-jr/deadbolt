# PWA Evaluation

Assessment of Progressive Web App feasibility for Deadbolt.

## Verdict: Partially Viable — Manifest Shipped, Service Worker Deferred

### What's Shipped (v1)

- **Web App Manifest** (`src/app/manifest.ts`) — enables browser "Install App" prompts in Chrome/Edge and "Add to Home Screen" on mobile. Provides app name, theme color, orientation hint, and icon.

### What's Deferred

- **Service Worker** — offline caching of JS bundles, HTML pages, and future game assets.

## Viability Analysis

### Arguments FOR Full PWA

| Factor | Assessment |
|--------|-----------|
| No backend dependencies | Game runs entirely client-side. No API calls to fail offline. |
| Static HTML pages | Both `/` and `/play` are statically generated at build time. |
| JS bundles are deterministic | Hashed filenames in `_next/static/chunks/` are cache-friendly. |
| Game assets generated at runtime | Tileset, audio, and sprites are generated programmatically in BootScene. No external asset downloads. |
| IndexedDB persistence | High scores and run history already use IndexedDB, which works offline. |

### Arguments AGAINST Service Worker for v1

| Factor | Assessment |
|--------|-----------|
| Desktop-only game (INGOT Key Decision #11) | PWA install is most valuable on mobile. Desktop users can bookmark. |
| No push notifications or background sync | Single-session game with no server communication. |
| Cache invalidation complexity | Service worker must correctly cache-bust on deployments. Next.js `_next/static` hashed files change on every build — stale game code would break. |
| No stable asset pipeline | `public/assets/` directories are empty (sprites, audio, tilemaps). When real assets arrive, a caching strategy will be needed, but designing it now is premature. |
| TBT already 20.7s on `/play` | Service worker doesn't help with the primary performance bottleneck (synchronous world generation). |
| Lighthouse PWA audit is informational only | Not scored in the 4 main Lighthouse categories (Performance, Accessibility, Best Practices, SEO). |

### Decision

Ship the manifest for basic installability. Service worker caching adds non-trivial complexity (correct cache-busting, handling Next.js hashed filenames, avoiding stale game code) with limited benefit for a desktop-only game with no real assets. Revisit when the asset pipeline is established and mobile support is evaluated.

## Manifest Configuration

| Field | Value | Rationale |
|-------|-------|-----------|
| `display` | `standalone` | Full-screen app experience (no browser chrome). |
| `orientation` | `landscape` | Game is designed for widescreen desktop play. |
| `background_color` | `#0a0a0f` | Matches the deep dark game background. |
| `theme_color` | `#1a1a1a` | Matches the layout viewport theme color. |
| `categories` | `["games"]` | Signals to app stores that this is a game. |
| `start_url` | `/` | Landing page is the entry point. |

## Future Work

When implementing a service worker:
1. Use a cache-first strategy for `_next/static/` (immutable hashed files)
2. Use network-first for HTML pages (to pick up new deployments)
3. Pre-cache the Phaser bundle (~346KB gzip) on install
4. Cache real game assets (sprites, audio, tilemaps) when they're added
5. Implement a stale-content notification ("New version available — refresh")
6. Consider `@serwist/next` for Workbox integration with Next.js
