# Deadbolt — Grading Criteria

Quality evaluation criteria for the Temperer's review process. Informed by Anthropic's four evaluation dimensions from ["Harness design for long-running application development"](https://www.anthropic.com/engineering/harness-design-long-running-apps), adapted for a top-down zombie survival game.

The Temperer evaluates each implementation against these criteria **in addition to** the issue's acceptance criteria. Acceptance criteria define what must work; grading criteria define how good it should be.

---

## 1. Gameplay Feel

Does the implementation contribute to a game that feels tight, responsive, and satisfying?

- **Input responsiveness:** Player actions (movement, interaction, barricade placement) feel immediate with no perceptible lag
- **Physics consistency:** Objects behave predictably and deterministically. A fridge blocking a doorway works the same way every time.
- **Feedback loops:** Actions produce clear visual/audio feedback. Hitting a zombie, placing a barricade, triggering a trap — the player should feel the impact.
- **Pacing:** Day/night transitions, wave escalation, and resource scarcity create tension without frustration.

## 2. Visual Identity

Does the implementation look and feel like a cohesive game, not a collection of programmer art?

- **Consistent art style:** Pixel art at 32x32 tile size with a limited, intentional color palette. Dark/grayscale base with neon accents for interactive elements.
- **Readability:** Silhouettes are instantly distinguishable — player, zombie archetypes, key objects (gas can, car battery, furniture) identifiable at a glance during hectic gameplay.
- **UI cohesion:** HUD, menus, and game chrome use shadcn/ui with consistent dark theme, Geist fonts, and layout patterns.
- **Lighting and atmosphere:** Day/night transitions feel distinct. Night creates genuine tension through reduced visibility and warm light sources.

## 3. Technical Craft

Is the implementation well-structured and following the project's established patterns?

- **ECS discipline:** Game state lives in Miniplex ECS, not React state. No React imports in `src/game/`. The bridge pattern is respected — only display-relevant changes cross to Zustand.
- **Performance:** No visible frame drops during normal gameplay. Physics simulation stable at 60Hz fixed timestep. Staggered AI pathfinding keeps CPU manageable.
- **Code patterns:** Follows existing project conventions — atomic commits, proper TypeScript types, no `any` casts, tests for critical systems.
- **Error handling:** Game degrades gracefully on edge cases (entity cleanup, physics constraint release, wave timer boundaries). *Honer annotation (2026-04-01 audit): "Graceful degradation" must include observability — bare `catch {}` blocks that silently swallow errors make debugging impossible. Systems should log first-occurrence errors and surface critical failures to the UI. Silent no-ops for core subsystems (material interactions, camera, audio) are NOT graceful — they are invisible breakage.*
- **Configuration hygiene:** No debug flags, development-only features, or placeholder configurations reach production. *Added by Honer (2026-04-01 audit): Matter.js `debug: true` was left in the production physics config from the initial commit, exposing wireframe rendering to all users with 10-15% frame overhead. Every new configuration flag should be reviewed for production correctness.*
- **PRNG determinism:** All gameplay-affecting randomness uses the seeded PRNG from `src/lib/rng.ts`. `Math.random()` is only acceptable for cosmetic effects (particle jitter, audio pitch variation) that do not affect game outcomes. *Added by Honer (2026-04-01 audit): Fire spread used `Math.random()`, breaking run reproducibility for a gameplay-critical system. The CLAUDE.md invariant ("Seeded PRNG for all procedural generation") must be enforced in review.*

## 4. Functionality

Does the implementation work correctly and completely?

- **Acceptance criteria met:** Every criterion in the issue is satisfied.
- **Edge cases handled:** Boundary conditions (empty inventory, zero durability, last zombie in wave, day/night transition mid-action) don't crash or produce undefined behavior.
- **Integration:** New systems integrate cleanly with existing ones. The event bus carries new events. ECS queries compose correctly.
- **Testable:** Critical logic has unit tests. Complex interactions have integration tests.

## 5. Deployment Readiness

Is the implementation compatible with the production environment?

- **SSR/SSG safety:** Code that runs at module initialization time must not access browser-only APIs (`localStorage`, `window`, `document`) without environment guards. Next.js evaluates modules server-side during static generation. *Added by Honer (2026-04-01 audit): `loadSettings()` accessed `localStorage` at module init time, causing `ReferenceError` during SSG that was accidentally caught by an outer try-catch. Fragile patterns that rely on accidental error handling must be caught in review.*
- **Security headers:** `vercel.json` includes Content Security Policy, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy headers before any public deployment.
- **Build cleanliness:** `pnpm build` produces zero errors and zero warnings. Build warnings indicate fragile patterns that should be fixed, not ignored.

---

## Usage

The **Temperer** reads this file during review and evaluates against all four dimensions. A feature that meets acceptance criteria but produces janky gameplay feel, generic visuals, or messy code structure should be flagged.

The **Honer** may adjust this file after audits — appending new criteria or annotating existing ones based on observed patterns across the codebase.

Criteria are append-only. Existing entries are never removed.
