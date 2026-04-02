#!/usr/bin/env bash
#
# Push wiki pages to the GitHub Wiki repository.
#
# Prerequisites:
#   1. The wiki must be initialized via the GitHub web UI first:
#      https://github.com/allan-mobley-jr/deadbolt/wiki
#      Click "Create the first page", set the title to "Home",
#      paste the Home page content, and click "Save page".
#   2. gh CLI must be authenticated (gh auth login).
#
# Usage:
#   bash scripts/push-wiki.sh
#
# This script is idempotent — safe to run multiple times.

set -euo pipefail

REPO="allan-mobley-jr/deadbolt"
WIKI_URL="https://github.com/${REPO}.wiki.git"

# ------------------------------------------------------------------
# Pre-flight checks
# ------------------------------------------------------------------

if ! command -v gh &>/dev/null; then
  echo "Error: gh CLI is not installed. Install from https://cli.github.com"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "Error: gh CLI is not authenticated. Run: gh auth login"
  exit 1
fi

if ! git ls-remote "$WIKI_URL" &>/dev/null; then
  echo "Error: Wiki repository not found."
  echo ""
  echo "The wiki must be initialized via the GitHub web UI first:"
  echo "  1. Go to https://github.com/${REPO}/wiki"
  echo "  2. Click 'Create the first page'"
  echo "  3. Set the title to 'Home'"
  echo "  4. Paste the Home page content from issue #148"
  echo "  5. Click 'Save page'"
  echo "  6. Re-run this script"
  exit 1
fi

# ------------------------------------------------------------------
# Clone wiki repo
# ------------------------------------------------------------------

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

echo "Cloning wiki repository..."
git clone "$WIKI_URL" "$WORK_DIR/wiki"
cd "$WORK_DIR/wiki"

# ------------------------------------------------------------------
# Getting-Started.md
# ------------------------------------------------------------------

cat > Getting-Started.md << 'WIKI_EOF'
# Getting Started

## Prerequisites

- **Node.js** — Version compatible with Next.js 16 (18.18+ recommended)
- **pnpm** — The project pins pnpm@10.30.2 via the packageManager field. Install with `npm install -g pnpm@10.30.2` or use Corepack: `corepack enable`

## Installation

```bash
git clone https://github.com/allan-mobley-jr/deadbolt.git
cd deadbolt
pnpm install
```

## Running Locally

```bash
pnpm dev
```

Open http://localhost:3000 to see the landing page. Click **Play** (or navigate to `/play`) to start a game.

> **Note:** Phaser is loaded via `next/dynamic` with `ssr: false`, so the game only renders client-side. The landing page is server-rendered for fast initial load.

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| Dev server | `pnpm dev` | Start the Next.js dev server with Turbopack |
| Build | `pnpm build` | Production build (must pass with zero errors) |
| Start | `pnpm start` | Serve the production build locally |
| Lint | `pnpm lint` | Run ESLint |
| Test (watch) | `pnpm test` | Run Vitest in watch mode for development |
| Test (CI) | `pnpm test:run` | Run Vitest single pass |
| Analyze | `pnpm analyze` | Production build with bundle analyzer |
| Bundle check | `pnpm check:bundle` | Check bundle size against performance budget |

## Running Tests

```bash
# Watch mode (during development)
pnpm test

# Single pass (CI / pre-commit)
pnpm test:run
```

- **Framework:** Vitest with jsdom environment
- **React tests:** @testing-library/react for component tests
- **Game logic tests:** Pure unit tests — no DOM required
- **IndexedDB tests:** Uses fake-indexeddb for persistence tests

## Quality Gates

Run these before submitting a PR:

```bash
pnpm lint                    # ESLint
pnpm exec tsc --noEmit       # Type checking
pnpm test:run                # Tests (single pass)
pnpm build                   # Production build
```

## Project Structure

```
src/
├── app/              Next.js App Router pages and layouts
│   ├── page.tsx          Landing page
│   ├── play/page.tsx     Game viewport
│   └── layout.tsx        Root layout (fonts, dark mode, TooltipProvider)
├── components/       React components
│   ├── hud/              Real-time HUD (health, timer, inventory, minimap, waves)
│   ├── game-shell.tsx    Root client shell for /play route
│   ├── game-container.tsx Mounts Phaser, connects bridge to Zustand
│   ├── pause-menu.tsx    ESC overlay with resume/settings/abandon
│   ├── death-screen.tsx  End-of-run stats and seed sharing
│   ├── settings-dialog.tsx Audio, graphics, and accessibility settings
│   └── ui/               shadcn/ui primitives (Button, Card, Dialog, etc.)
├── game/             Pure TypeScript game engine (zero React imports)
│   ├── ecs/              Miniplex entities, components, queries, archetypes
│   ├── scenes/           Phaser scene hierarchy (Boot → Loading → Game)
│   ├── systems/          ECS systems (input, movement, combat, AI, physics, etc.)
│   ├── procgen/          Procedural generation (WFC, BSP, loot tables, spawn zones)
│   ├── events/           Typed event bus (eventemitter3)
│   ├── physics/          Matter.js body helpers
│   └── tiles/            Tile type definitions and tileset generation
├── stores/           Zustand stores (game, player, UI, minimap, settings, persistence)
├── hooks/            React hooks (useGameEvent)
├── lib/              Utilities (bridge, PRNG, keybindings, persistence)
├── types/            Shared TypeScript type definitions
└── globals.css       Tailwind CSS imports

public/assets/
├── sprites/          PNG spritesheets + JSON atlases
├── tilemaps/         Tileset images + building templates
└── audio/            OGG (primary) + MP3 (Safari fallback)
```
WIKI_EOF

echo "Created Getting-Started.md"

# ------------------------------------------------------------------
# Features.md
# ------------------------------------------------------------------

cat > Features.md << 'WIKI_EOF'
# Features

## Core Gameplay Loop

Deadbolt is a permadeath roguelike with 15-minute runs. Each run follows the same rhythm:

1. **Scavenge** during the day — explore the procedurally generated city, loot buildings for supplies and barricade materials
2. **Barricade** at dusk — drag heavy objects to block doorways and windows before night falls
3. **Survive** the night — fight waves of zombies with melee combat; protect your safehouse

Difficulty escalates each day-night cycle. Eventual death is inevitable — the goal is to survive as long as possible and beat your personal best. Every run uses a unique seed, and you can share seeds from the death screen to let others play the same city layout.

## Procedurally Generated City

Each run generates a unique city using two complementary algorithms:

- **Wave Function Collapse (WFC)** produces the macro city layout — a grid of roads, buildings, and parks with adjacency constraints ensuring realistic neighborhoods
- **Binary Space Partitioning (BSP)** subdivides building footprints into rooms, connecting them with doors and assigning room types based on building class (residential, commercial, industrial)

Loot tables then populate rooms with interactive objects. Higher-tier loot spawns farther from the safehouse, rewarding risky exploration.

All generation is seeded via seedrandom — the same seed always produces the same city.

## Physics-Driven Barricading

This is Deadbolt's core differentiator. Barricading uses real physics, not pre-placed slots:

- **Drag** furniture and objects toward doorways and windows
- Objects **snap** to entry point frames and anchor with physics constraints
- **Material properties matter** — each object has durability, mass, flammability, and conductivity
- Heavier, more durable objects hold longer against zombie attacks
- Barricades can be destroyed by zombies, fire, or explosions
- Brute zombies deal 3x damage to barricades; Runners can vault weak ones

Strategic placement matters. A metal filing cabinet blocks better than a wooden chair, but a wooden chair is easier to find and carry.

## Day/Night Cycle

The game runs on a four-phase clock:

| Phase | Duration | What Happens |
|-------|----------|-------------|
| **Dawn** | 30s | Transition lighting; brief respite |
| **Day** | 120s | Full visibility; scavenge and explore |
| **Dusk** | 60s | Warning phase; prepare barricades |
| **Night** | 120s | Zombie waves attack; reduced visibility |

As days progress, night phases get longer and day phases get shorter, increasing pressure. The HUD displays the current phase, day number, and remaining time.

Visibility shrinks at night — your view radius drops with a soft-edge falloff, and tile lighting shifts through amber (dawn), neutral (day), purple (dusk), and deep blue-black (night).

## Zombie Archetypes

Four distinct enemy types, each with unique behaviors:

### Shambler (Night 1+)
The baseline zombie. Slow but steady. Moderate health, standard attack damage. The most common threat throughout a run.

### Runner (Night 2+)
Fast and aggressive with an extended hearing range. Fragile — low health but hard to avoid. Can vault barricades below 30 durability. Appears from Night 2 onward.

### Brute (Night 3+)
A slow-moving tank with high health and devastating barricade damage (3x multiplier). Visually larger than other zombies. Very hard to stagger. The primary barricade threat.

### Horde (Night 3+)
Individually weak but spawns in clusters of 5-10 within a tight radius. Dangerous in numbers due to overlapping attacks. Designed to overwhelm defenses through quantity.

**AI behavior:** Zombies use an A* pathfinding system with noise-based detection. Actions like attacking, pushing objects, and explosions generate noise events — zombies navigate toward the loudest noise within their hearing range.

## Combat

Combat is melee-only with directional aiming:

- **Aim** with the mouse cursor
- **Click** to swing — creates a hit detection zone in the aim direction
- **Knockback** on hit pushes zombies away
- **Invulnerability frames** after taking damage prevent instant death from overlapping attacks
- Quick-select slots (keys 1-5) let you switch equipped items mid-fight

## Inventory

- **10 fixed slots** in a hotbar display
- Items are sized by category: small (1 slot), medium (2 consecutive slots)
- **Carry weight** limit of 50kg — exceeding it slows movement
- Press **E** to interact with objects (pickup, open containers, search)
- Keys **1-5** for quick-select access to equipped items

## Chain Reactions

Objects have material properties that enable emergent environmental interactions:

### Fire
Flammable objects (wood, fabric) can ignite and spread fire to nearby flammable materials. Fire deals area damage over time to both zombies and the player. Burning objects eventually destroy themselves.

### Electricity
Car batteries power electric chains through conductive objects (metal). Electrified objects deal contact damage. Batteries deplete over time.

### Explosions
High explosive-potential objects detonate with a blast radius, dealing area damage to all entities and potentially destroying wall tiles. Explosions can trigger chain reactions with nearby fire and electricity sources.

## Settings & Accessibility

Access settings from the pause menu (ESC):

**Audio:**
- Master, SFX, and music volume sliders

**Graphics:**
- Quality presets (low, medium, high)
- Screen shake toggle
- FPS counter toggle

**Accessibility:**
- **Color-blind mode** — Shape indicators on zombie types and health states
- **Reduced motion** — Disables screen shake, reduces particles, snaps camera (also respects OS `prefers-reduced-motion`)
- **High contrast** — Stronger borders, visually distinct interactive objects

All settings persist across sessions via localStorage.

## Persistence & Stats

- **Run history** stored in IndexedDB (up to 20 runs)
- **Personal bests** tracked for score, day survived, and time
- **Lifetime stats** accumulate across all runs
- **Death screen** shows run summary with seed for sharing
- Graceful degradation when IndexedDB is unavailable (e.g., private browsing)
WIKI_EOF

echo "Created Features.md"

# ------------------------------------------------------------------
# Architecture.md
# ------------------------------------------------------------------

cat > Architecture.md << 'WIKI_EOF'
# Architecture

## Overview

Deadbolt is a fully static web application — no backend, no database, no authentication, no environment variables. Next.js serves two routes:

- `/` — Server-rendered landing page (SEO-optimized)
- `/play` — Client-side game (Phaser loaded via dynamic import with `ssr: false`)

The game engine runs at 60Hz in a fixed-timestep loop, completely isolated from React. Communication flows through an event bus bridge into Zustand stores, which React reads for HUD rendering.

```
┌─────────────────────────────┐     ┌──────────────────────────┐
│  Game Engine (src/game/)    │     │  React UI (src/components)│
│                             │     │                           │
│  Phaser 3 + Matter.js      │     │  HUD overlay              │
│  Miniplex ECS              │ ──> │  Menus & dialogs          │
│  Systems @ 60Hz            │ bus │  Settings                 │
│  Procedural generation      │     │  Death screen             │
│                             │ <── │                           │
│  (zero React imports)       │ cmd │  (Zustand selectors)      │
└─────────────────────────────┘     └──────────────────────────┘
         │          ^                        │          ^
         v          │                        v          │
    eventemitter3 typed events          Zustand stores
         │          │                        │          │
         └──── bridge.ts ────────────────────┘          │
                    │                                    │
                    └──────── command events ────────────┘
```

## The Game Boundary

The single most important architectural rule:

> `src/game/` contains zero React imports.

The 60Hz fixed-timestep game loop must be completely isolated from React's event-driven rendering model. Mixing them causes frame drops and state race conditions. This boundary ensures:

- Game logic can be tested without a DOM or React
- Physics, AI, and ECS systems run at a stable tick rate regardless of render performance
- The game engine has no framework dependency — it's pure TypeScript

**Inside the boundary:** Phaser scenes, ECS world/components/queries, all game systems, procedural generation, event bus, physics helpers, tile definitions.

**Outside the boundary:** React components, Zustand stores, the bridge module, hooks, Next.js pages.

## Bridge Pattern

The bridge (`src/lib/bridge.ts`) is the single integration point between game and UI:

### Game to UI
1. Game systems call `safeEmit()` on the typed event bus at meaningful state changes
2. Bridge subscribes to bus events and writes into Zustand stores
3. React components read stores via selectors — only affected HUD elements re-render

### UI to Game
1. Bridge subscribes to Zustand store changes (e.g., pause state, settings)
2. Bridge emits `cmd:*` command events on the bus
3. The CommandSystem reads command events each game tick

`safeEmit()` wraps each listener in a try/catch to prevent a buggy subscriber from crashing the game loop. The bridge is created on GameContainer mount and `disconnect()`-ed on unmount, with session stores reset after disconnect.

## State Tiers

All state falls into one of four tiers:

### Tier 1: ECS World (Miniplex)
All entity data — positions, velocities, health, inventory, AI state, physics body IDs, material properties, barricade state. Updated every fixed tick. This is the source of truth during gameplay. Never touches React.

### Tier 2: Phaser Objects
Sprites, tilemaps, particles, audio, physics bodies. Visual representation of ECS entities, interpolated between physics steps for smooth rendering.

### Tier 3: Zustand Stores
Six stores hold UI display state only:

| Store | Manages |
|-------|---------|
| GameStore | Clock phase, day number, wave count, total kills, seed, paused flag |
| PlayerStore | Health, inventory slots, active slot, carry weight, alive flag |
| UIStore | Active menu, overlays, notifications, interaction prompts |
| MinimapStore | Map bounds, entity positions for minimap rendering |
| SettingsStore | Audio volumes, graphics quality, accessibility options |
| PersistenceStore | Run history, personal bests, lifetime stats (backed by IndexedDB) |

Written by event bus listeners, read by React. React never directly reads or mutates ECS entities or Phaser objects.

### Tier 4: Persistence
- IndexedDB for run history and lifetime stats (async, graceful degradation in private browsing)
- localStorage for settings and keybindings (synchronous)

## ECS Architecture

Deadbolt uses Miniplex 2 for entity-component management:

- Components are plain TypeScript interfaces (Position, Velocity, Health, Inventory, AIState, ZombieType, CombatState, Barricade, Material, Battery, etc.)
- Archetypes define entity templates: PlayerEntity, ZombieEntity, BarricadeEntity, ObjectEntity
- Queries filter entities by required component sets at compile time
- Object pools recycle frequently created/destroyed entities (zombies, sensor bodies) to minimize garbage collection

Key design choice: components hold numeric IDs (e.g., `bodyId`, `constraintIds`) instead of direct Phaser/Matter.js references. Registries (BodyRegistry, ConstraintRegistry) map IDs to actual objects. This keeps game logic testable without Phaser.

## Game Loop

The game runs a fixed-timestep accumulator at 60Hz:

- `FIXED_DT = 1/60` second per tick
- The loop accumulates real elapsed time and executes as many physics steps as needed
- Spiral-of-death guard: caps at 5 steps per frame (`MAX_STEPS_PER_FRAME`) to prevent the loop from falling behind
- Interpolation alpha enables smooth rendering between physics states

Systems execute synchronously in array order — mutations from system N are visible to system N+1 within the same tick. Registration order is defined in `GameScene.create()`.

## System Catalog

All systems, organized by responsibility:

**Input & Commands:** InputSystem, CommandSystem

**Movement & Physics:** MovementSystem, PhysicsSyncSystem, RenderSyncSystem, CameraSystem

**Time & Environment:** DayNightSystem, LightingSystem, NoiseSystem

**Player Interaction:** InteractionSystem, InventorySystem, CombatSystem, StatsSystem

**Building & Materials:** BarricadeSystem, MaterialSystem

**Enemies:** ZombieAISystem, WaveSystem

**Environmental Hazards:** FireSystem, ElectricitySystem, ExplosionSystem

**Presentation:** ParticleSystem, AudioSystem, MinimapDataSystem

**Infrastructure:** GameLoop, SystemRunner, BodyRegistry, ConstraintRegistry, WallAnchorRegistry, SceneContext

## Procedural Generation Pipeline

World generation runs as a generator function, yielding progress updates for the loading screen:

1. **WFC City Layout (20%)** — Wave Function Collapse generates a macro grid of zone types (roads, buildings, parks) with adjacency constraints and bitmask propagation
2. **BSP Building Interiors (20%)** — Binary Space Partitioning subdivides building footprints into rooms, guaranteeing connectivity (N-1 interior doors for N rooms)
3. **Safehouse Selection (10%)** — Heuristic scoring identifies a defensible building with clear entry points
4. **Object Placement (30%)** — Loot tables populate rooms based on building class; higher-tier loot farther from safehouse
5. **Navigation Grid (10%)** — Converts tile collision data to an A* walkability grid for zombie pathfinding
6. **Spawn Zones (10%)** — Ring-based spatial partitioning designates zombie spawn areas around the safehouse

All steps use seeded PRNG (seedrandom) for deterministic, replayable generation. Total generation time is under 2 seconds on mid-range hardware.

## Event Bus

The typed event bus (`src/game/events/event-bus.ts`) defines 40+ events via the `GameEventMap` interface:

- **Clock/day-night:** phase changes, time ticks
- **Player state:** health, inventory, death
- **Combat/waves:** attacks, kills, wave start/end
- **Building:** barricade placed/destroyed, durability changes
- **Materials:** fire, electricity, explosion events
- **Interaction:** pickup, examine, proximity prompts
- **Minimap:** entity position updates, topology changes
- **UI commands:** pause, resume, settings changes

A fresh bus is created per game session (in `GameScene.create()`) to prevent listener leaks between runs.

## Phaser Integration

Phaser accesses `window`, `document`, and canvas APIs — it cannot run server-side. The integration strategy:

1. `/play` page uses `next/dynamic` with `ssr: false` to load GameShell
2. GameContainer creates a singleton Phaser game instance on mount
3. Scene hierarchy: BootScene (config) → LoadingScene (assets + world generation with progress bar) → GameScene (gameplay)
4. Module-level variables in `PhaserGame.ts` cache the event bus, seed, and minimap init data to solve bridge connection timing
5. GameContainer destruction tears down the Phaser instance on unmount
WIKI_EOF

echo "Created Architecture.md"

# ------------------------------------------------------------------
# Commit and push
# ------------------------------------------------------------------

git add -A
if git diff --cached --quiet; then
  echo "No changes to commit — wiki pages already exist."
else
  git commit -m "Add Getting Started, Features, and Architecture wiki pages"
  git push
  echo ""
  echo "Wiki pages pushed successfully."
fi

echo ""
echo "View the wiki at: https://github.com/${REPO}/wiki"
