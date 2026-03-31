# Deadbolt — Architectural Specification

A top-down zombie survival base builder that runs entirely in the browser. Players scavenge a procedurally generated city during the day, drag objects to barricade their safehouse, and survive escalating zombie waves at night. Physics-driven barricading is the core differentiator — every object has physical properties and the fun comes from creative improvisation, not preset defenses. Permadeath roguelike runs target 15–20 minutes.

---

## Key Decisions

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | Phaser 3 over raw Canvas or PixiJS | Complete game framework (scenes, assets, input, audio, camera, physics). ~150KB gzipped justified by massive reduction in custom infrastructure. Official Next.js template confirms compatibility. | 2026-03-26 |
| 2 | Matter.js over Rapier | First-class Phaser plugin, zero setup. Rapier (WASM, 2-5x faster) is the documented upgrade path but unnecessary for <200 active bodies. | 2026-03-26 |
| 3 | Miniplex ECS over bitECS | Gentler API with full TypeScript inference. For 200-500 entities, performance difference is negligible. bitECS upgrade path exists if needed at 10K+ entities. | 2026-03-26 |
| 4 | Zustand for bridge pattern | Store model maps cleanly to event-boundary state updates. Jotai scatters state; Redux adds unnecessary complexity. | 2026-03-26 |
| 5 | Phaser audio over Howler.js | Avoids two competing Web Audio contexts. Phaser's built-in audio integrates with scene lifecycle natively. | 2026-03-26 |
| 6 | WFC + BSP hybrid for procgen | Wave Function Collapse for macro city layout, Binary Space Partitioning for building interiors. Both well-documented with JS implementations. | 2026-03-26 |
| 7 | Fixed-timestep accumulator | Deterministic physics across frame rates. Critical for barricading — a fridge must block identically at 30fps and 144fps. | 2026-03-26 |
| 8 | Unidirectional bridge pattern | Event bus between 60Hz game loop and React UI. Prevents re-render storms while keeping React for UI components. | 2026-03-26 |
| 9 | Single dynamic import boundary | One `dynamic()` import with `ssr: false` for the game page. Landing page stays Server Component for SEO. Simplest possible split. | 2026-03-26 |
| 10 | Seeded PRNG | Reproducible runs. Seed displayed on death screen for sharing interesting maps. | 2026-03-26 |
| 11 | Desktop-only for v1 | Physics drag-and-drop barricading is fundamentally a mouse interaction. Mobile adaptation requires different interaction model. | 2026-03-26 |
| 12 | No backend, no database, no auth | Entire game client-side. Server only serves two statically generated pages via Vercel CDN. | 2026-03-26 |
| 13 | 32x32 tile size | Enough detail for recognizable objects while keeping art pipeline manageable. 16x16 too small; 64x64 requires more detailed art. | 2026-03-26 |
| 14 | 4 zombie archetypes for v1 | Shambler, Runner, Brute, Horde cover the core strategic spectrum. Additional types are natural post-v1 additions. | 2026-03-26 |

## Approaches Rejected

| # | Approach | Why Rejected | Date |
|---|----------|--------------|------|
| 1 | Rapier physics (Rust→WASM) | Requires manual Phaser integration and WASM loading. Overkill for <200 bodies. Matter.js is a first-class Phaser plugin. | 2026-03-26 |
| 2 | Howler.js for audio | Would create competing Web Audio contexts with Phaser. Built-in Phaser audio handles spatial sound, distance-based volume, and stereo panning. | 2026-03-26 |
| 3 | Zustand for all game state | Writing to Zustand at 60Hz for every moving entity would cause catastrophic React re-render storms. Hot-path data stays in ECS. | 2026-03-26 |
| 4 | bitECS | Structure-of-Arrays layout matters at 10K+ entities, not 200-500. Miniplex's TypeScript inference and gentler API wins at this scale. | 2026-03-26 |
| 5 | Jotai for state | Atomic model scatters state across many atoms with unclear ownership. Zustand's store model maps cleanly to the bridge pattern. | 2026-03-26 |
| 6 | Mobile/touch input in v1 | Physics drag mechanic requires mouse. Tap-to-place is a fundamentally different interaction model — separate design effort. | 2026-03-26 |
| 7 | Meta-progression in v1 | Persistent unlockables add state management complexity. v1 focuses on self-contained roguelike runs with permadeath. | 2026-03-26 |
| 8 | Vercel Blob for assets | Pixel art game's total asset budget stays under 50MB. `public/` via Vercel CDN is simpler and faster. | 2026-03-26 |
| 9 | LDtk over Tiled | LDtk is modern but Tiled has broader Phaser integration support. | 2026-03-26 |
| 10 | Separate lighting engine | Phaser's rendering pipeline handles ambient lighting shifts and light cones. No need for additional lighting library. | 2026-03-26 |

---

## 1. Platform and Stack

- **Framework**: Next.js 16 (App Router) with TypeScript, Tailwind CSS, pnpm
- **Deployment**: Vercel (static generation, CDN-served assets, zero backend)
- **Game engine**: Phaser 3 with Matter.js physics (integrated as Phaser plugin)
- **Entity management**: Miniplex ECS (TypeScript-inferred entity queries, gentle API)
- **Procedural generation**: Wave Function Collapse for city layout, Binary Space Partitioning for building interiors
- **Pathfinding**: PathFinding.js (A* with Manhattan heuristic, dynamic grid updates)
- **State management**: Zustand for UI display state, Miniplex ECS for hot game state, IndexedDB for persistence
- **UI components**: shadcn/ui for menus, HUD overlays, and game chrome
- **Audio**: Phaser's built-in Web Audio system (no additional audio libraries)

There is no backend, no database, no authentication, no multiplayer, and no server-side game logic. The only server-side concern is serving two statically generated pages.

---

## 2. Project Structure

The project uses the `src/` directory convention with a clear separation between three domains:

### Application shell (`src/app/`)
Two routes only. The landing page at `/` is a Server Component — statically generated for SEO, metadata, and Open Graph images, with a call-to-action linking to the game. The game page at `/play` is a static shell that dynamically imports the game container with SSR disabled, ensuring Phaser and all game code are code-split into a separate bundle that only loads when the player navigates to play.

### React UI layer (`src/components/`)
- **Landing page components** (Server Components): hero section, feature highlights, footer
- **Game UI components** (Client Components): game container (Phaser mount point and bridge), HUD elements (health bar, inventory panel, day/night timer, wave indicator, minimap), menu screens (main menu, pause menu, death screen, settings dialog, run summary), and loading screen
- **shadcn/ui primitives**: Button, Card, Dialog, Sheet, Progress, and other components used across both landing and game UI

### Game engine (`src/game/`)
Pure TypeScript with zero React imports. This is where all game logic lives — rendering, physics, ECS systems, procedural generation, AI, audio, and input handling. This separation is architecturally critical: the game loop runs at 60Hz and must never trigger React re-renders.

### Supporting directories
- `src/stores/` — Zustand stores for UI display state
- `src/lib/` — Utilities including shadcn's `cn()` helper, IndexedDB persistence wrapper, localStorage settings wrapper, font configuration, and seeded PRNG
- `src/types/` — Shared type definitions for game entities, ECS components, and event bus payloads

---

## 3. Core Architecture

### 3.1 The Bridge Pattern

The central architectural challenge is that the game loop (60Hz fixed timestep) and React rendering (event-driven, batched) must not interfere with each other. The solution is a **unidirectional bridge** using a typed event emitter.

**Game-to-UI flow**: ECS systems detect meaningful state changes and emit typed events on an event bus. Zustand store subscribers listen and update UI state. React components re-render via Zustand selectors.

**UI-to-Game flow**: User actions in React emit command events on the same bus. The game loop's input system reads these commands each tick.

### 3.2 State Tiers

**Tier 1 — ECS World (Miniplex)**: All entity data. Read and written every tick. Never touches React.
**Tier 2 — Phaser Objects**: Sprites, tilemaps, particle emitters, physics bodies.
**Tier 3 — Zustand Stores**: HUD values, menu state, run metadata.
**Tier 4 — Persistence**: IndexedDB for high scores, localStorage for settings.

### 3.3 Game Loop

Fixed-timestep accumulator at 60Hz. Spiral-of-death guard caps at 5 physics steps per frame.

**Per-tick execution order**: Input → Movement → Zombie AI → Physics sync → Matter.js step → Physics read-back → Combat → Barricade → Interaction → Wave spawner → Day/night → Cleanup → Event bus flush.

---

## 4. Procedural Generation Pipeline

Seeded PRNG drives all randomness (reproducible runs). Generated once per run during loading.

1. **City Layout (WFC)** — ~40×40 macro grid with adjacency constraints
2. **Building Interiors (BSP)** — Room subdivision with min 3×3, max depth 4
3. **Object Placement** — Weighted loot tables per room type
4. **Safehouse Selection** — Scored by entry points, proximity, size, existing objects
5. **Pathfinding Grid** — Walkability grid for PathFinding.js, dynamically updated

**Performance target**: Under 2 seconds on a mid-range device.

---

## 5. Physics-Driven Barricading System

Every interactive object has four properties: **mass** (stacking stability), **durability** (HP against zombie attacks), **flammability** (fire spread), **conductivity** (electricity transmission).

Barricading uses Matter.js constraints (joints) to anchor objects in doorways/windows. Asymmetric placement and diagonal bracing create stronger structures — emergent, not prescriptive.

**Trap interactions**: Fire chain (ignition → spread → explosion), Electricity chain (battery → conductors → field), Noise chain (explosions → spatial noise map → zombie attraction).

---

## 6. Zombie AI

Four archetypes: **Shambler** (Night 1+, baseline), **Runner** (Night 2+, fast, vaults low barriers), **Brute** (Night 3+, high HP, breaks barricades 3x faster), **Horde** (Night 3+, groups of 5-10 individually weak).

A* pathfinding on dynamic grid. Noise attraction overrides pathfinding. AI pathfinding staggered across frames.

---

## 7. Day/Night Cycle

4 cycles targeting 15-20 minute runs. Day shrinks (5→4→3→2 min), night grows (1.5→2→2.5→3 min). Most players die during Night 3 or early Night 4.

Night waves attack in pulses with brief respites for repair.

---

## 8. Phased Delivery

1. **Foundation** — Player movement, Phaser + Next.js + ECS + fixed-timestep loop
2. **Procedural World** — WFC city, BSP interiors, object placement, safehouse selection
3. **Core Gameplay Loop** — Day/night, barricading, inventory, zombies, waves, combat, permadeath
4. **Traps and Emergent Interactions** — Fire chain, electricity chain, explosions, noise propagation
5. **Polish and UI** — Full HUD, menus, audio, camera effects, particles, persistence
6. **Performance and Distribution** — Bundle optimization, entity pooling, accessibility, PWA evaluation
