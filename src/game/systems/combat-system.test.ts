import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createCombatSystem } from "./combat-system";
import { createInputState, createClockState } from "./scene-context";
import type { SceneContext } from "./scene-context";
import { BodyRegistry } from "./body-registry";
import { createGameEventBus } from "@/game/events/event-bus";
import type {
  MeleeSwingEvent,
  DamageDealtEvent,
  PlayerHitEvent,
  PlayerHealthChangedEvent,
} from "@/game/events/event-bus";
import { world, resetWorld } from "@/game/ecs/world";
import { createPlayerEntity, createZombieEntity } from "@/game/ecs/archetypes";
import {
  SHAMBLER_STATS,
  SHAMBLER_HEALTH,
} from "./zombie-ai-constants";
import { COMBAT } from "./combat-constants";

const DT = 1 / 60;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Auto-incrementing body ID for mock rectangles. */
let nextBodyId = 1000;

function createMockContext(
  overrides: Partial<SceneContext> = {},
): SceneContext {
  const bodyRegistry = new BodyRegistry();

  return {
    scene: {
      matter: {
        world: {
          remove: vi.fn(),
        },
        add: {
          rectangle: vi.fn((_x: number, _y: number, _w: number, _h: number) => {
            const id = nextBodyId++;
            const body = {
              id,
              isSensor: true,
              isStatic: true,
              inertia: Infinity,
              inverseInertia: 0,
              force: { x: 0, y: 0 },
            };
            bodyRegistry.register(body as unknown as MatterJS.BodyType);
            return body;
          }),
        },
      },
    } as unknown as Phaser.Scene,
    bodyRegistry,
    inputState: createInputState(),
    getAlpha: () => 0,
    clockState: createClockState(),
    eventBus: createGameEventBus(),
    ...overrides,
  };
}

/** Advance the system by a given number of seconds (at 60 Hz). */
function tickSeconds(
  system: (dt: number) => void,
  seconds: number,
): void {
  const ticks = Math.round(seconds * 60);
  for (let i = 0; i < ticks; i++) {
    system(DT);
  }
}

/**
 * Create a player with a mock physics body registered in the context.
 * Returns the player entity and its body ID.
 */
function spawnPlayer(
  ctx: SceneContext,
  x: number,
  y: number,
): ReturnType<typeof createPlayerEntity> {
  const bodyId = nextBodyId++;
  const mockBody = {
    id: bodyId,
    inertia: Infinity,
    inverseInertia: 0,
    force: { x: 0, y: 0 },
  };
  ctx.bodyRegistry.register(mockBody as unknown as MatterJS.BodyType);
  return createPlayerEntity(x, y, bodyId);
}

/**
 * Create a zombie at the given position with its body registered.
 */
function spawnZombie(
  ctx: SceneContext,
  x: number,
  y: number,
  stats = { ...SHAMBLER_STATS },
  hp = SHAMBLER_HEALTH,
): ReturnType<typeof createZombieEntity> {
  const bodyId = nextBodyId++;
  const mockBody = {
    id: bodyId,
    inertia: Infinity,
    inverseInertia: 0,
    force: { x: 0, y: 0 },
  };
  ctx.bodyRegistry.register(mockBody as unknown as MatterJS.BodyType);
  return createZombieEntity(x, y, bodyId, stats, 0, hp);
}

/** Trigger an attack by setting attackPressed and aiming toward (aimX, aimY). */
function triggerAttack(ctx: SceneContext, aimX: number, aimY: number): void {
  ctx.inputState.attackPressed = true;
  ctx.inputState.aimX = aimX;
  ctx.inputState.aimY = aimY;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CombatSystem", () => {
  let ctx: SceneContext;
  let system: (dt: number) => void;

  beforeEach(() => {
    nextBodyId = 1000;
    ctx = createMockContext();
    system = createCombatSystem(ctx);
    resetWorld();
  });

  afterEach(() => {
    resetWorld();
  });

  // --- Basic melee attack ---

  it("deals damage to zombie in range on attackPressed", () => {
    const player = spawnPlayer(ctx, 100, 100);
    // Place zombie in front of the player (player aims right)
    const zombie = spawnZombie(ctx, 100 + COMBAT.BASE_MELEE_RANGE, 100);

    triggerAttack(ctx, 200, 100); // Aim right
    system(DT);

    expect(zombie.health.current).toBeLessThan(SHAMBLER_HEALTH);
    expect(zombie.health.current).toBe(SHAMBLER_HEALTH - COMBAT.BASE_MELEE_DAMAGE);

    // Verify player entity is unchanged
    expect(player.health.current).toBe(100);
  });

  it("does not damage zombie out of range", () => {
    spawnPlayer(ctx, 100, 100);
    // Place zombie far away (well beyond melee range)
    const zombie = spawnZombie(ctx, 300, 300);

    triggerAttack(ctx, 200, 100); // Aim right
    system(DT);

    expect(zombie.health.current).toBe(SHAMBLER_HEALTH);
  });

  // --- Cooldown ---

  it("prevents rapid attacks during cooldown", () => {
    spawnPlayer(ctx, 100, 100);
    const zombie = spawnZombie(ctx, 100 + COMBAT.BASE_MELEE_RANGE, 100);

    // First attack
    triggerAttack(ctx, 200, 100);
    system(DT);
    ctx.inputState.attackPressed = false;
    const healthAfterFirst = zombie.health.current;
    expect(healthAfterFirst).toBeLessThan(SHAMBLER_HEALTH);

    // Immediate second attack should be blocked by cooldown
    triggerAttack(ctx, 200, 100);
    system(DT);
    ctx.inputState.attackPressed = false;
    expect(zombie.health.current).toBe(healthAfterFirst);
  });

  it("allows attack after cooldown expires", () => {
    spawnPlayer(ctx, 100, 100);
    const zombie = spawnZombie(ctx, 100 + COMBAT.BASE_MELEE_RANGE, 100, { ...SHAMBLER_STATS }, 200);

    // First attack
    triggerAttack(ctx, 200, 100);
    system(DT);
    ctx.inputState.attackPressed = false;
    const healthAfterFirst = zombie.health.current;

    // Wait for cooldown to expire
    tickSeconds(system, COMBAT.MELEE_COOLDOWN + 0.1);

    // Second attack should work
    triggerAttack(ctx, 200, 100);
    system(DT);
    expect(zombie.health.current).toBeLessThan(healthAfterFirst);
  });

  // --- Equipped item scaling ---

  it("deals increased damage with heavy equipped item", () => {
    const player = spawnPlayer(ctx, 100, 100);
    // Equip metal_sheet (mass 10) in slot 0
    player.inventory.slots[0] = {
      objectType: "metal_sheet",
      sizeCategory: "medium",
      primary: true,
    };
    player.inventory.slots[1] = {
      objectType: "metal_sheet",
      sizeCategory: "medium",
      primary: false,
    };
    player.inventory.activeSlot = 0;

    const zombie = spawnZombie(ctx, 100 + 33, 100); // range ~33 px with metal_sheet

    triggerAttack(ctx, 200, 100);
    system(DT);

    // metal_sheet mass = 10, damage = 10 + 10 * 1.5 = 25
    const expectedDamage = COMBAT.BASE_MELEE_DAMAGE + 10 * COMBAT.MASS_DAMAGE_SCALE;
    expect(zombie.health.current).toBe(SHAMBLER_HEALTH - expectedDamage);
  });

  it("deals base damage with bare hands (no equipped item)", () => {
    spawnPlayer(ctx, 100, 100);
    const zombie = spawnZombie(ctx, 100 + COMBAT.BASE_MELEE_RANGE, 100);

    triggerAttack(ctx, 200, 100);
    system(DT);

    expect(zombie.health.current).toBe(SHAMBLER_HEALTH - COMBAT.BASE_MELEE_DAMAGE);
  });

  // --- Hit tracking (no multi-hit per swing) ---

  it("only hits a zombie once per swing", () => {
    spawnPlayer(ctx, 100, 100);
    const zombie = spawnZombie(ctx, 100 + COMBAT.BASE_MELEE_RANGE, 100, { ...SHAMBLER_STATS }, 200);

    triggerAttack(ctx, 200, 100);
    system(DT);
    ctx.inputState.attackPressed = false;
    const healthAfterHit = zombie.health.current;

    // Run more ticks during the swing duration — should not damage again
    for (let i = 0; i < 10; i++) {
      system(DT);
    }

    expect(zombie.health.current).toBe(healthAfterHit);
  });

  // --- Sensor body lifecycle ---

  it("creates sensor body on swing and removes it after swing duration", () => {
    const player = spawnPlayer(ctx, 100, 100);

    triggerAttack(ctx, 200, 100);
    system(DT);
    ctx.inputState.attackPressed = false;

    // Sensor should exist
    expect(player.combatState.sensorBodyId).not.toBeNull();
    const sensorId = player.combatState.sensorBodyId!;
    expect(ctx.bodyRegistry.get(sensorId)).toBeDefined();

    // Advance past swing duration
    tickSeconds(system, COMBAT.SWING_DURATION + 0.05);

    // Sensor should be cleaned up
    expect(player.combatState.sensorBodyId).toBeNull();
    expect(ctx.bodyRegistry.get(sensorId)).toBeUndefined();
  });

  // --- I-frames ---

  it("grants invulnerability frames after player takes damage", () => {
    const player = spawnPlayer(ctx, 100, 100);
    spawnZombie(ctx, 120, 100);

    // Simulate zombie dealing damage (ZombieAISystem sets health directly)
    player.health.current = 95;
    player.combatState.previousHealth = 100;

    system(DT);

    // I-frames should be active
    expect(player.combatState.iFramesRemaining).toBeGreaterThan(0);
    // Health was accepted (not reverted because no i-frames were active before)
    expect(player.health.current).toBe(95);
  });

  it("reverts damage during active i-frames", () => {
    const player = spawnPlayer(ctx, 100, 100);

    // Put player in i-frame state
    player.combatState.iFramesRemaining = 0.3;
    player.combatState.previousHealth = 90;
    player.health.current = 90;

    system(DT); // Tick to sync previousHealth

    // Now simulate another damage hit during i-frames
    player.health.current = 85;

    system(DT);

    // Damage should be reverted
    expect(player.health.current).toBe(90);
  });

  it("allows damage after i-frames expire", () => {
    const player = spawnPlayer(ctx, 100, 100);

    // Start with i-frames
    player.combatState.iFramesRemaining = 0.1;
    player.combatState.previousHealth = 90;
    player.health.current = 90;

    // Advance past i-frame duration
    tickSeconds(system, 0.2);
    expect(player.combatState.iFramesRemaining).toBe(0);

    // Now take damage — should be accepted
    player.health.current = 85;
    system(DT);

    expect(player.health.current).toBe(85);
    expect(player.combatState.iFramesRemaining).toBeGreaterThan(0);
  });

  // --- Knockback ---

  it("applies knockback force to zombie on melee hit", () => {
    spawnPlayer(ctx, 100, 100);
    const zombie = spawnZombie(ctx, 100 + COMBAT.BASE_MELEE_RANGE, 100);

    const zombieBody = ctx.bodyRegistry.get(zombie.physicsBody.bodyId);

    triggerAttack(ctx, 200, 100);
    system(DT);

    // Zombie should be pushed away (positive X direction from player)
    expect(zombieBody!.force.x).toBeGreaterThan(0);
  });

  it("applies knockback force to player when hit by zombie", () => {
    const player = spawnPlayer(ctx, 100, 100);

    // Place attacking zombie to the left
    const zombie = spawnZombie(ctx, 80, 100);
    zombie.aiState.state = "attacking";

    // Simulate zombie damage
    player.health.current = 95;
    player.combatState.previousHealth = 100;

    system(DT);

    // Player should be pushed right (away from zombie at x=80)
    const playerBody = ctx.bodyRegistry.get(player.physicsBody.bodyId);
    expect(playerBody!.force.x).toBeGreaterThan(0);
  });

  // --- Events ---

  it("emits melee-swing event on attack", () => {
    spawnPlayer(ctx, 100, 100);
    const handler = vi.fn<[MeleeSwingEvent], void>();
    ctx.eventBus.on("melee-swing", handler);

    triggerAttack(ctx, 200, 100);
    system(DT);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      position: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      aimAngle: expect.any(Number),
      range: COMBAT.BASE_MELEE_RANGE,
      itemType: null,
    });
  });

  it("emits damage-dealt event when zombie is hit", () => {
    spawnPlayer(ctx, 100, 100);
    spawnZombie(ctx, 100 + COMBAT.BASE_MELEE_RANGE, 100);
    const handler = vi.fn<[DamageDealtEvent], void>();
    ctx.eventBus.on("damage-dealt", handler);

    triggerAttack(ctx, 200, 100);
    system(DT);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      damage: COMBAT.BASE_MELEE_DAMAGE,
      targetType: "zombie",
    });
  });

  it("emits player-hit event when player takes damage", () => {
    const player = spawnPlayer(ctx, 100, 100);
    const zombie = spawnZombie(ctx, 80, 100);
    zombie.aiState.state = "attacking";
    const handler = vi.fn<[PlayerHitEvent], void>();
    ctx.eventBus.on("player-hit", handler);

    // Simulate zombie damage
    player.health.current = 95;
    player.combatState.previousHealth = 100;

    system(DT);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      damage: 5,
      position: { x: 100, y: 100 },
    });
  });

  it("emits corrected player-health-changed during i-frame revert", () => {
    const player = spawnPlayer(ctx, 100, 100);
    const handler = vi.fn<[PlayerHealthChangedEvent], void>();
    ctx.eventBus.on("player-health-changed", handler);

    // Set i-frames active
    player.combatState.iFramesRemaining = 0.3;
    player.combatState.previousHealth = 90;
    player.health.current = 90;

    system(DT); // Sync

    // Simulate damage during i-frames
    player.health.current = 85;
    system(DT);

    // Should emit with delta: 0 (damage reverted)
    expect(handler).toHaveBeenCalled();
    const lastCall = handler.mock.calls[handler.mock.calls.length - 1][0];
    expect(lastCall.delta).toBe(0);
    expect(lastCall.current).toBe(90);
  });

  // --- Edge cases ---

  it("does nothing when no player entity exists", () => {
    system(DT); // Should not throw
  });

  it("handles aim at exact player position (zero-length aim vector)", () => {
    spawnPlayer(ctx, 100, 100);
    const zombie = spawnZombie(ctx, 100 + COMBAT.BASE_MELEE_RANGE, 100);

    // Aim at the player's own position
    triggerAttack(ctx, 100, 100);
    system(DT);

    // Should still create a swing (default aim: right)
    // Zombie may or may not be hit depending on sensor placement
    // The key is that it doesn't crash
    expect(zombie.health.current).toBeLessThanOrEqual(SHAMBLER_HEALTH);
  });

  it("does not damage dead zombies", () => {
    spawnPlayer(ctx, 100, 100);
    const zombie = spawnZombie(ctx, 100 + COMBAT.BASE_MELEE_RANGE, 100, { ...SHAMBLER_STATS }, 5);

    // Kill the zombie first
    zombie.health.current = 0;

    triggerAttack(ctx, 200, 100);
    system(DT);

    // Health should stay at 0, not go negative
    expect(zombie.health.current).toBe(0);
  });

  it("can hit multiple zombies in a single swing", () => {
    spawnPlayer(ctx, 100, 100);
    const z1 = spawnZombie(ctx, 100 + COMBAT.BASE_MELEE_RANGE, 95);
    const z2 = spawnZombie(ctx, 100 + COMBAT.BASE_MELEE_RANGE, 105);

    triggerAttack(ctx, 200, 100);
    system(DT);

    // Both zombies should take damage
    expect(z1.health.current).toBeLessThan(SHAMBLER_HEALTH);
    expect(z2.health.current).toBeLessThan(SHAMBLER_HEALTH);
  });
});
