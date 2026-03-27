# Deadbolt

Top-down zombie survival base builder that runs entirely in the browser. Physics-driven barricading is the core differentiator. Permadeath roguelike runs target 15-20 minutes.

## Stack

- **Framework**: Next.js 16 (App Router, Turbopack, React 19)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v4, shadcn/ui (base-nova style, Base UI primitives)
- **Fonts**: Geist Sans (UI text) + Geist Mono (stats, timers, IDs, damage numbers) via next/font
- **Game Engine**: Phaser 3 with Matter.js physics (integrated plugin)
- **ECS**: Miniplex 2 (entity-component system for all game state)
- **State Management**: Zustand 5 (UI display state only, never hot game state)
- **Event Bus**: eventemitter3 (typed events for game-to-UI bridge)
- **Pathfinding**: PathFinding.js (A* with dynamic grid updates)
- **PRNG**: seedrandom (deterministic procedural generation)
- **Package Manager**: pnpm
- **Deployment**: Vercel (static generation, CDN-served, zero backend)

## Directory Layout

```
src/
├── app/            Next.js App Router pages and layouts
├── components/     React components
│   └── ui/         shadcn/ui primitives (Button, Card, Dialog, etc.)
├── game/           Pure TypeScript game engine (ZERO React imports)
│   ├── ecs/        Miniplex entity system, component types, queries
│   ├── scenes/     Phaser scene hierarchy (Boot, Game, etc.)
│   ├── systems/    ECS systems (movement, combat, AI, physics sync, etc.)
│   └── procgen/    Procedural generation (WFC, BSP, loot, safehouse)
├── stores/         Zustand stores (UI display state only)
├── lib/            Shared utilities (cn.ts, PRNG, persistence, etc.)
└── types/          Shared TypeScript type definitions
public/
└── assets/
    ├── sprites/            PNG spritesheets + JSON atlases
    ├── tilemaps/tilesets/   Tileset images + building templates
    └── audio/{sfx,music}/  OGG (primary) + MP3 (Safari fallback)
```

## Architecture Rules

### The Game Boundary (Critical)

`src/game/` must contain **ZERO React imports**. This is a hard architectural boundary that keeps the 60Hz game loop completely isolated from React's event-driven rendering. Every file in this directory is pure TypeScript with no framework dependencies.

### Bridge Pattern

Communication between game and UI is strictly unidirectional:

```
Game (Phaser/ECS) → eventemitter3 bus → Zustand store → React UI
React UI → command events on bus → Game input system reads each tick
```

- Game systems emit typed events on the shared event bus at meaningful change boundaries
- Zustand store subscribers update UI display state from those events
- React components re-render via Zustand selectors (only affected HUD elements)
- React NEVER directly reads or mutates ECS entities or Phaser objects

### State Tiers

1. **ECS World (Miniplex)**: All entity data — positions, velocities, health, inventory, AI state, physics properties. Updated every fixed tick. Never touches React.
2. **Phaser Objects**: Sprites, tilemaps, particles, audio, physics bodies. Visual representation of ECS entities, interpolated between physics steps.
3. **Zustand Stores**: HUD values, menu state, run metadata. Written by event bus listeners, read by React.
4. **Persistence**: IndexedDB for high scores (async), localStorage for settings (sync).

### ECS-Only Game Logic

All game state lives in Miniplex ECS entities and components. Systems read/write ECS components — they never hold mutable state of their own. Zustand stores hold UI display state only.

### Phaser Loading

Phaser accesses `window`, `document`, and canvas APIs — it is strictly client-only. Use a single dynamic import boundary at the `/play` page via `next/dynamic` with `ssr: false`.

## Conventions

- Path alias: `@/*` maps to `./src/*`
- Dark mode is the default (`className="dark"` on `<html>`)
- All pages use static generation (SSG) — no server-side data fetching
- No backend, no database, no authentication, no environment variables
- Seeded PRNG for all procedural generation (runs are reproducible)
- TooltipProvider wraps the app at the layout root
- 32x32 pixel tiles, top-down perspective
- Fixed-timestep game loop at 60Hz with spiral-of-death guard (max 5 steps/frame)

## Quality

- `pnpm lint` — ESLint
- `pnpm exec tsc --noEmit` — Type checking
- `pnpm test:run` — Vitest (single run, for CI)
- `pnpm test` — Vitest (watch mode, for development)
- `pnpm build` — Production build (must pass with zero errors)
