# Deadbolt

A top-down zombie survival base builder that runs entirely in the browser.

[**Play Now →**](https://deadbolt.vercel.app)

## About

Deadbolt is a permadeath roguelike where you scavenge a procedurally generated city during the day, drag furniture and debris to barricade your safehouse at dusk, and fight to survive escalating zombie waves at night. Physics-driven barricading is the core differentiator — every object has mass, durability, and physical properties, so the fun comes from creative improvisation rather than preset defenses. Runs target 15–20 minutes, and each run's seed is displayed on the death screen for sharing and replay.

## Tech Stack

| Technology | Role |
|---|---|
| [Next.js 16](https://nextjs.org/) (App Router) | Framework, static generation, routing |
| [React 19](https://react.dev/) | UI components, HUD overlays |
| [Phaser 3](https://phaser.io/) + [Matter.js](https://brm.io/matter-js/) | Game engine, 2D rendering, physics |
| [Miniplex 2](https://github.com/hmans/miniplex) | Entity-component system (ECS) |
| [Zustand 5](https://zustand.docs.pmnd.rs/) | UI display state management |
| [eventemitter3](https://github.com/primus/eventemitter3) | Typed event bus (game ↔ UI bridge) |
| [seedrandom](https://github.com/davidbau/seedrandom) | Deterministic PRNG for procedural generation |
| [PathFinding.js](https://github.com/qiao/PathFinding.js) | A\* pathfinding with dynamic grid updates |
| [Tailwind CSS 4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) | Styling and UI primitives |
| [Vitest](https://vitest.dev/) | Testing framework |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/)

### Install and run

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the landing page, then click **Play** to start a run.

### Production build

```bash
pnpm build
pnpm start
```

## Scripts

| Script | Command | Description |
|---|---|---|
| `pnpm dev` | `next dev` | Start the development server (Turbopack) |
| `pnpm build` | `next build` | Create a production build |
| `pnpm start` | `next start` | Serve the production build locally |
| `pnpm lint` | `eslint` | Run ESLint across the codebase |
| `pnpm test` | `vitest` | Run tests in watch mode |
| `pnpm test:run` | `vitest run` | Run tests once (CI) |
| `pnpm analyze` | `ANALYZE=true next build` | Production build with bundle analysis |
| `pnpm check:bundle` | `node scripts/check-bundle-size.mjs` | Check bundle sizes against budget |

## Project Structure

```
src/
├── app/              Next.js App Router — landing page (/) and game page (/play)
├── components/       React components
│   ├── hud/          In-game HUD (health bar, inventory, minimap, wave indicator)
│   └── ui/           shadcn/ui primitives (Button, Card, Dialog, Progress, etc.)
├── game/             Pure TypeScript game engine — zero React imports
│   ├── ecs/          Miniplex world, component definitions, entity archetypes
│   ├── events/       Typed event bus (eventemitter3)
│   ├── physics/      Matter.js body definitions and physics helpers
│   ├── procgen/      Procedural generation (WFC city layout, BSP interiors, loot)
│   ├── scenes/       Phaser scenes (Boot, Loading, Game)
│   ├── systems/      ECS systems (movement, combat, AI, day/night, waves, etc.)
│   └── tiles/        Tile types and tileset generation
├── hooks/            Custom React hooks
├── lib/              Utilities (keybindings, PRNG, persistence, bridge)
├── stores/           Zustand stores (game, player, UI, settings, minimap, persistence)
└── types/            Shared TypeScript type definitions
public/
└── assets/
    ├── sprites/      PNG spritesheets and JSON atlases
    ├── tilemaps/     Tileset images and building templates
    └── audio/        Sound effects (OGG + MP3 fallback)
```

## How to Play

### Controls

| Input | Action |
|---|---|
| **W A S D** | Move |
| **Mouse** | Aim |
| **Left Click** | Attack / Drag objects |
| **E** | Interact with objects |
| **1 – 5** | Quick-select inventory slot |
| **ESC** | Pause menu |
| **F3** | Toggle FPS counter |

### Core Loop

1. **Day** — Explore the procedurally generated city. Scavenge weapons, supplies, and barricade materials.
2. **Dusk** — Return to your safehouse. Drag objects into doorways and windows to build barricades.
3. **Night** — Survive waves of zombies. Repair barricades between pulses.
4. **Repeat** — Each day is shorter, each night is longer, and the zombies get tougher.

Death is permanent. Your run seed is shown on the death screen — share it to challenge others with the same map.

## Running Tests

```bash
# Watch mode (development)
pnpm test

# Single run (CI)
pnpm test:run
```

Tests are co-located with source files (`*.test.ts`) and in the `tests/` directory for integration tests.

## License

License TBD.
