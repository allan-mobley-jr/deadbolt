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
- **Error handling:** Game degrades gracefully on edge cases (entity cleanup, physics constraint release, wave timer boundaries).

## 4. Functionality

Does the implementation work correctly and completely?

- **Acceptance criteria met:** Every criterion in the issue is satisfied.
- **Edge cases handled:** Boundary conditions (empty inventory, zero durability, last zombie in wave, day/night transition mid-action) don't crash or produce undefined behavior.
- **Integration:** New systems integrate cleanly with existing ones. The event bus carries new events. ECS queries compose correctly.
- **Testable:** Critical logic has unit tests. Complex interactions have integration tests.

---

## Usage

The **Temperer** reads this file during review and evaluates against all four dimensions. A feature that meets acceptance criteria but produces janky gameplay feel, generic visuals, or messy code structure should be flagged.

The **Honer** may adjust this file after audits — appending new criteria or annotating existing ones based on observed patterns across the codebase.

Criteria are append-only. Existing entries are never removed.
