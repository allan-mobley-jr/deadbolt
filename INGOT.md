# Deadbolt — Architectural Specification

> Materialized from [Ingot #2](https://github.com/allan-mobley-jr/deadbolt/issues/2)

A top-down zombie survival base builder that runs entirely in the browser. Players scavenge a procedurally generated city during the day, drag objects to barricade their safehouse, and survive escalating zombie waves at night. Physics-driven barricading is the core differentiator — every object has physical properties and the fun comes from creative improvisation, not preset defenses. Permadeath roguelike runs target 15–20 minutes.

---

## Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Phaser 3 over raw Canvas or PixiJS | Complete game framework (scenes, assets, input, audio, camera, physics). ~150KB gzipped justified by massive reduction in custom infrastructure. Official Next.js template confirms compatibility. |
| 2 | Matter.js over Rapier | First-class Phaser plugin, zero setup. Rapier (WASM, 2-5x faster) is the documented upgrade path but unnecessary for <200 active bodies. |
| 3 | Miniplex ECS over bitECS | Gentler API with full TypeScript inference. For 200-500 entities, performance difference is negligible. bitECS upgrade path exists if needed at 10K+ entities. |
| 4 | Zustand for bridge pattern | Store model maps cleanly to event-boundary state updates. Jotai scatters state; Redux adds unnecessary complexity. |
| 5 | Phaser audio over Howler.js | Avoids two competing Web Audio contexts. Phaser's built-in audio integrates with scene lifecycle natively. |
| 6 | WFC + BSP hybrid for procgen | Wave Function Collapse for macro city layout, Binary Space Partitioning for building interiors. Both well-documented with JS implementations. |
| 7 | Fixed-timestep accumulator | Deterministic physics across frame rates. Critical for barricading — a fridge must block identically at 30fps and 144fps. |
| 8 | Unidirectional bridge pattern | Event bus between 60Hz game loop and React UI. Prevents re-render storms while keeping React for UI components. |
| 9 | Single dynamic import boundary | One `dynamic()` import with `ssr: false` for the game page. Landing page stays Server Component for SEO. Simplest possible split. |
| 10 | Seeded PRNG | Reproducible runs. Seed displayed on death screen for sharing interesting maps. |
| 11 | Desktop-only for v1 | Physics drag-and-drop barricading is fundamentally a mouse interaction. Mobile adaptation requires different interaction model. |
| 12 | No backend, no database, no auth | Entire game client-side. Server only serves two statically generated pages via Vercel CDN. |
| 13 | 32x32 tile size | Enough detail for recognizable objects while keeping art pipeline manageable. 16x16 too small; 64x64 requires more detailed art. |
| 14 | 4 zombie archetypes for v1 | Shambler, Runner, Brute, Horde cover the core strategic spectrum. Additional types are natural post-v1 additions. |

## Approaches Rejected

| # | Approach | Why Rejected |
|---|----------|--------------|
| 1 | Rapier physics (Rust→WASM) | Requires manual Phaser integration and WASM loading. Overkill for <200 bodies. Matter.js is a first-class Phaser plugin. |
| 2 | Howler.js for audio | Would create competing Web Audio contexts with Phaser. Built-in Phaser audio handles spatial sound, distance-based volume, and stereo panning. |
| 3 | Zustand for all game state | Writing to Zustand at 60Hz for every moving entity would cause catastrophic React re-render storms. Hot-path data stays in ECS. |
| 4 | bitECS | Structure-of-Arrays layout matters at 10K+ entities, not 200-500. Miniplex's TypeScript inference and gentler API wins at this scale. |
| 5 | Jotai for state | Atomic model scatters state across many atoms with unclear ownership. Zustand's store model maps cleanly to the bridge pattern. |
| 6 | Mobile/touch input in v1 | Physics drag mechanic requires mouse. Tap-to-place is a fundamentally different interaction model — separate design effort. |
| 7 | Meta-progression in v1 | Persistent unlockables add state management complexity. v1 focuses on self-contained roguelike runs with permadeath. |
| 8 | Vercel Blob for assets | Pixel art game's total asset budget stays under 50MB. `public/` via Vercel CDN is simpler and faster. |
| 9 | LDtk over Tiled | LDtk is modern but Tiled has broader Phaser integration support. |
| 10 | Separate lighting engine | Phaser's rendering pipeline handles ambient lighting shifts and light cones. No need for additional lighting library. |

---

## Platform and Stack

- **Framework**: Next.js 16 (App Router) with TypeScript, Tailwind CSS, pnpm
- **Deployment**: Vercel (static generation, CDN-served assets, zero backend)
- **Game engine**: Phaser 3 with Matter.js physics (integrated as Phaser plugin)
- **Entity management**: Miniplex ECS
- **Procedural generation**: WFC for city layout, BSP for building interiors
- **Pathfinding**: PathFinding.js (A* with Manhattan heuristic)
- **State management**: Zustand for UI display state, Miniplex ECS for hot game state, IndexedDB for persistence
- **UI components**: shadcn/ui for menus, HUD overlays, and game chrome
- **Audio**: Phaser's built-in Web Audio system

## Phased Delivery

1. **Foundation** — Player movement, Phaser + Next.js + ECS + fixed-timestep loop
2. **Procedural World** — WFC city, BSP interiors, object placement, safehouse selection
3. **Core Gameplay Loop** — Day/night, barricading, inventory, zombies, waves, combat, permadeath
4. **Traps and Emergent Interactions** — Fire chain, electricity chain, explosions, noise propagation
5. **Polish and UI** — Full HUD, menus, audio, camera effects, particles, persistence
6. **Performance and Distribution** — Bundle optimization, entity pooling, accessibility, PWA evaluation

For the full specification, see [Ingot #2](https://github.com/allan-mobley-jr/deadbolt/issues/2).
