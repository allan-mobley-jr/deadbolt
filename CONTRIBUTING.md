# Contributing to Deadbolt

This guide covers what you need to know before submitting code. Read the architecture constraints section carefully — the project has hard boundaries that are easy to violate if you're not aware of them.

## Prerequisites

- **Node.js** >= 18
- **pnpm** — the project pins `pnpm@10.30.2` via the `packageManager` field in `package.json`. Enable [corepack](https://nodejs.org/api/corepack.html) to get the correct version automatically:

```bash
corepack enable
```

## Setup

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and click **Play** to start a run. Run `pnpm test` to start the test watcher.

## Architecture Constraints

### The Game Boundary

`src/game/` must contain **zero React imports**. This is a hard rule.

The game loop runs at a fixed 60Hz timestep, completely decoupled from React's event-driven rendering. If React state or hooks leaked into game code, re-renders could stall the physics simulation or create frame-dependent behavior. This boundary keeps the game deterministic and the engine portable.

**In practice:** if you are working in `src/game/`, you cannot import from `react`, `react-dom`, or any `@/components/` path. If you need to send data to the UI, emit a typed event on the event bus.

### The Bridge Pattern

Game and UI communicate through a typed event bus. The flow is strictly unidirectional in each direction:

```
Game → UI:
  ECS systems ──► safeEmit(bus, event) ──► bridge.ts subscribes ──► Zustand store ──► React selectors

UI → Game:
  React action ──► Zustand store update ──► bridge.ts subscribeWithSelector ──► cmd:* event ──► CommandSystem buffers ──► applied at next tick
```

Key details:

- **`safeEmit()`** wraps each listener in try/catch so a buggy subscriber cannot crash the game loop.
- **`connectBridge(bus)`** returns a `BridgeConnection` with `disconnect()`, managed by the game container's mount/unmount lifecycle.
- **Command events** are prefixed with `cmd:` (e.g., `cmd:pause`, `cmd:resume`, `cmd:settings-changed`). The `CommandSystem` buffers them between ticks and applies them synchronously at tick start. This prevents race conditions between async React updates and game ticks.

Key files:

| File | Purpose |
|------|---------|
| `src/game/events/event-bus.ts` | `GameEventMap` type, `safeEmit()` |
| `src/lib/bridge.ts` | Wires bus events to Zustand stores and vice versa |
| `src/game/systems/command-system.ts` | Consumes `cmd:*` events on the game side |

### State Tiers

| Tier | What | Where | Updated |
|------|------|-------|---------|
| 1. ECS World | All entity data (positions, health, AI state, inventory) | Miniplex | Every tick (60Hz) |
| 2. Phaser Objects | Sprites, tilemaps, particles, audio, physics bodies | Phaser | Interpolated between ticks |
| 3. Zustand Stores | HUD values, menu state, run metadata | `src/stores/` | By bridge listeners |
| 4. Persistence | High scores (IndexedDB, async), settings (localStorage, sync) | `src/lib/` | On save/load |

**Rule of thumb:** game logic → ECS system on Miniplex components. UI display data → Zustand store updated via the bridge.

### ECS-Only Game Logic

All game state lives in Miniplex entities and components. Systems are stateless functions that read and write components — they never hold mutable state of their own.

```typescript
// System signature
type SystemFn = (dt: number) => void;

// Factory pattern — closes over SceneContext, returns a SystemFn
function createMovementSystem(ctx: SceneContext): SystemFn {
  return (dt: number): void => {
    for (const entity of ctx.world.with("position", "velocity")) {
      entity.position.x += entity.velocity.vx * dt;
      entity.position.y += entity.velocity.vy * dt;
    }
  };
}
```

## System Execution Order

Systems run synchronously in array order. Mutations from system N are visible to system N+1 within the same tick. Insertion position matters — if your system depends on physics results, it must run after PhysicsSyncSystem.

**Fixed-timestep systems** (60Hz):

| # | System | Purpose |
|---|--------|---------|
| 1 | CommandSystem | Process buffered UI commands |
| 2 | InputSystem | Sample keyboard/mouse state |
| 3 | InventorySystem | Manage inventory slots and carry weight |
| 4 | InteractionSystem | Handle pickup, drag, and object interaction |
| 5 | BarricadeSystem | Anchor/damage barricades |
| 6 | DayNightSystem | Advance day/night clock |
| 7 | WaveSystem | Spawn zombie waves |
| 8 | MovementSystem | Apply velocity to positions |
| 9 | NoiseSystem | Propagate noise for zombie hearing |
| 10 | ZombieAISystem | Pathfinding and state machine |
| 11 | CombatSystem | Melee attacks, damage, knockback |
| 12 | StatsSystem | Track run statistics |
| 13 | PhysicsSyncSystem | Sync ECS positions to/from Matter.js |
| 14 | MaterialSystem | Material state transitions |
| 15 | FireSystem | Fire spread and burn damage |
| 16 | ExplosionSystem | Area damage and knockback |
| 17 | ElectricitySystem | Electricity propagation |
| 18 | MinimapDataSystem | Update minimap entity positions |
| 19 | AudioSystem | Spatial audio and music |

**Render-phase systems** (once per frame, after all fixed timesteps):

| # | System | Purpose |
|---|--------|---------|
| 20 | CameraSystem | Follow player, screen shake |
| 21 | RenderSyncSystem | Sync ECS state to Phaser sprites |
| 22 | ParticleSystem | Particle emitter updates |
| 23 | LightingSystem | Day/night ambient lighting |

Each system has an error budget of 5. After 5 uncaught errors, the system auto-disables for the session to prevent cascade failures.

The canonical source for system ordering is `src/game/scenes/game-scene.ts`.

## Code Conventions

- **Path alias:** `@/*` maps to `./src/*`
- **TypeScript:** strict mode enabled
- **Dark mode:** default (`className="dark"` on `<html>`)
- **Static generation:** SSG only — no server-side data fetching, no API routes
- **No backend:** no database, no authentication, no environment variables
- **Tile size:** 32x32 pixels, top-down perspective
- **PRNG:** seeded for all gameplay-affecting randomness (cosmetic-only effects may use `Math.random()`)

## Quality Checklist

Run all four before submitting a PR:

```bash
pnpm lint                    # ESLint
pnpm exec tsc --noEmit       # Type checking
pnpm test:run                # Vitest (single run)
pnpm build                   # Production build
```

All four must pass with zero errors. `pnpm build` is the final gate — it catches SSR/SSG issues that lint and type-check miss.
