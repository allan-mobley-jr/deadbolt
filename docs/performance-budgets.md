# Performance Budgets

Deadbolt's performance budget ensures the landing page loads fast (no game code) and the game page stays within acceptable limits for a Phaser-based browser game.

## Budget Thresholds

| Route | Metric | Budget | Current |
|-------|--------|--------|---------|
| `/` (landing) | Route-specific JS (gzip) | < 100 KB | ~69 KB |
| `/` (landing) | Phaser code loaded | None | None |
| `/play` (game) | Total JS incl. dynamic (gzip) | < 1 MB | ~634 KB |
| `/play` (game) | Phaser chunk (gzip) | < 500 KB | ~346 KB |

**Note:** Shared framework JS (React, Next.js, polyfills) adds ~168 KB gzip to every page. This is infrastructure overhead, not counted in route-specific budgets.

### Lighthouse Targets

| Metric | Target |
|--------|--------|
| Performance | >= 85 |
| Accessibility | >= 90 |
| Best Practices | >= 90 |
| SEO | >= 90 |

## How to Run

### Bundle Analysis

Generate a visual bundle analysis report:

```bash
pnpm analyze
```

This opens an interactive treemap showing all chunks and their contents. Uses `@next/bundle-analyzer` with the `ANALYZE=true` environment variable.

### Budget Check

Verify all budgets pass after a production build:

```bash
pnpm build
pnpm check:bundle
```

For a detailed report without budget enforcement:

```bash
pnpm check:bundle --report
```

### Lighthouse Audit

Run a Lighthouse audit against the local production server:

```bash
pnpm build && pnpm start
# In a separate terminal:
npx lighthouse http://localhost:3000 --output=json --output-path=docs/lighthouse-landing.json
npx lighthouse http://localhost:3000/play --output=json --output-path=docs/lighthouse-play.json
```

## Architecture

### Code Splitting Strategy

```
/                          /play
Landing Page               Game Page
(Server Component)         (Server Component shell)
     |                          |
     v                          v
LandingStats               GameShell ("use client")
(Client island)                 |
                                +-- GameContainer (dynamic, ssr: false)
                                |       |
                                |       +-- PhaserGame (import() in useEffect)
                                |               |
                                |               +-- Phaser 3 (monolithic ~346KB gzip)
                                |               +-- All game systems
                                |               +-- Procgen, pathfinding, ECS
                                |
                                +-- HudOverlay (static - always visible)
                                +-- InteractionPrompt (static - always visible)
                                +-- PauseMenu (lazy - on ESC key)
                                +-- SettingsDialog (lazy - on menu action)
                                +-- ControlsReference (lazy - on menu action)
                                +-- DeathScreen (lazy - on player death)
```

The landing page loads zero game code. Phaser and all game logic are isolated behind a two-layer dynamic import boundary:
1. `next/dynamic` with `ssr: false` prevents server-side rendering of game code
2. `import()` in useEffect defers Phaser loading until the component mounts

### Dynamic Import Layers

| Layer | Mechanism | Loads When |
|-------|-----------|------------|
| GameContainer | `next/dynamic({ ssr: false })` | Play page renders |
| PhaserGame | `import()` in useEffect | GameContainer mounts |
| Overlay components | `React.lazy()` | Menu state activates |

## Known Constraints

### Phaser Is Not Tree-Shakeable

Phaser 3.90 ships as a monolithic ESM bundle (~1.3 MB minified, ~346 KB gzip). It does not declare `sideEffects: false` and does not support granular imports. Matter.js is bundled inside Phaser.

**Impact:** The Phaser chunk is the single largest JS asset. Custom Phaser builds would require maintaining a fork, which is not practical.

### PathFinding.js

PathFinding.js does not declare `sideEffects: false`. The full library is included even though only A* is used. It is already behind the Phaser dynamic import boundary, so it does not affect the landing page.

### Tree-Shakeable Dependencies

- **miniplex** (`sideEffects: false`) - only used ECS classes are included
- **lucide-react** (`sideEffects: false`) - only imported icons are included
- **zustand** - small footprint, used for bridge pattern stores

### Audio Assets

All audio is currently placeholder (silent AudioBuffers generated at runtime in BootScene). When real audio files are added to `public/assets/audio/`, they will be loaded lazily during game initialization, not during page load.
