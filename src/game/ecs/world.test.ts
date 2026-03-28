import { describe, it, expect, afterEach } from "vitest";
import {
  world,
  resetWorld,
  createPlayerEntity,
  createZombieEntity,
  createBarricadeEntity,
  createProjectileEntity,
  movingEntities,
  renderableEntities,
  playerEntities,
  physicsBodies,
  damageableEntities,
} from "@/game/ecs";
import type { Entity } from "@/game/ecs";

afterEach(() => {
  resetWorld();
});

// ---------------------------------------------------------------------------
// World instance
// ---------------------------------------------------------------------------

describe("world instance", () => {
  it("starts empty", () => {
    expect(world.size).toBe(0);
  });

  it("exposes entities array", () => {
    expect(world.entities).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Entity lifecycle
// ---------------------------------------------------------------------------

describe("entity lifecycle", () => {
  it("can add a bare entity", () => {
    const entity = world.add({});
    expect(world.size).toBe(1);
    expect(world.has(entity)).toBe(true);
  });

  it("can add an entity with components", () => {
    const entity = world.add({
      position: { x: 10, y: 20 },
      health: { current: 50, max: 50 },
    });
    expect(entity.position).toEqual({ x: 10, y: 20 });
    expect(entity.health).toEqual({ current: 50, max: 50 });
  });

  it("tracks entity count via world.size", () => {
    world.add({});
    world.add({});
    world.add({});
    expect(world.size).toBe(3);
  });

  it("can remove an entity", () => {
    const entity = world.add({ position: { x: 0, y: 0 } });
    world.remove(entity);
    expect(world.size).toBe(0);
    expect(world.has(entity)).toBe(false);
  });

  it("can add a component to an existing entity", () => {
    const entity: Entity = world.add({ position: { x: 0, y: 0 } });
    world.addComponent(entity, "velocity", { vx: 1, vy: 2 });
    expect(entity.velocity).toEqual({ vx: 1, vy: 2 });
  });

  it("can remove a component from an entity", () => {
    const entity = world.add({
      position: { x: 0, y: 0 },
      velocity: { vx: 1, vy: 2 },
    });
    world.removeComponent(entity, "velocity");
    expect(entity.velocity).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

describe("queries", () => {
  it("movingEntities contains entities with position + velocity", () => {
    world.add({ position: { x: 0, y: 0 }, velocity: { vx: 1, vy: 0 } });
    expect(movingEntities.size).toBe(1);
  });

  it("movingEntities excludes entities with only position", () => {
    world.add({ position: { x: 0, y: 0 } });
    expect(movingEntities.size).toBe(0);
  });

  it("renderableEntities contains entities with position + renderable", () => {
    world.add({
      position: { x: 0, y: 0 },
      renderable: { spriteKey: "test" },
    });
    expect(renderableEntities.size).toBe(1);
  });

  it("playerEntities narrows to player-controlled entities", () => {
    world.add({
      position: { x: 0, y: 0 },
      velocity: { vx: 0, vy: 0 },
      playerControlled: { active: true },
    });
    world.add({
      position: { x: 5, y: 5 },
      velocity: { vx: 1, vy: 0 },
    });
    expect(playerEntities.size).toBe(1);
  });

  it("physicsBodies contains entities with position + physicsBody", () => {
    world.add({
      position: { x: 0, y: 0 },
      physicsBody: { bodyId: 42 },
    });
    expect(physicsBodies.size).toBe(1);
  });

  it("damageableEntities contains entities with health", () => {
    world.add({ health: { current: 10, max: 10 } });
    expect(damageableEntities.size).toBe(1);
  });

  it("queries update when components are added to existing entities", () => {
    const entity: Entity = world.add({ position: { x: 0, y: 0 } });
    expect(movingEntities.size).toBe(0);

    world.addComponent(entity, "velocity", { vx: 1, vy: 0 });
    expect(movingEntities.size).toBe(1);
  });

  it("queries update when entities are removed from the world", () => {
    const entity = world.add({
      position: { x: 0, y: 0 },
      velocity: { vx: 1, vy: 0 },
    });
    expect(movingEntities.size).toBe(1);

    world.remove(entity);
    expect(movingEntities.size).toBe(0);
  });

  it("queries update when components are removed from entities", () => {
    const entity = world.add({
      position: { x: 0, y: 0 },
      velocity: { vx: 1, vy: 0 },
    });
    expect(movingEntities.size).toBe(1);

    world.removeComponent(entity, "velocity");
    expect(movingEntities.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Archetype factories
// ---------------------------------------------------------------------------

describe("archetype factories", () => {
  describe("createPlayerEntity", () => {
    it("adds the entity to the world", () => {
      createPlayerEntity(100, 200, 1);
      expect(world.size).toBe(1);
    });

    it("sets position from arguments", () => {
      const player = createPlayerEntity(100, 200, 1);
      expect(player.position).toEqual({ x: 100, y: 200 });
    });

    it("initialises velocity to zero", () => {
      const player = createPlayerEntity(0, 0, 1);
      expect(player.velocity).toEqual({ vx: 0, vy: 0 });
    });

    it("sets spriteKey to player", () => {
      const player = createPlayerEntity(0, 0, 1);
      expect(player.renderable.spriteKey).toBe("player");
    });

    it("marks player as actively controlled", () => {
      const player = createPlayerEntity(0, 0, 1);
      expect(player.playerControlled.active).toBe(true);
    });

    it("sets physics body ID from argument", () => {
      const player = createPlayerEntity(0, 0, 42);
      expect(player.physicsBody.bodyId).toBe(42);
    });

    it("starts with 100 health", () => {
      const player = createPlayerEntity(0, 0, 1);
      expect(player.health).toEqual({ current: 100, max: 100 });
    });

    it("appears in playerEntities query", () => {
      createPlayerEntity(0, 0, 1);
      expect(playerEntities.size).toBe(1);
    });

    it("appears in all relevant queries", () => {
      createPlayerEntity(0, 0, 1);
      expect(movingEntities.size).toBe(1);
      expect(renderableEntities.size).toBe(1);
      expect(physicsBodies.size).toBe(1);
      expect(damageableEntities.size).toBe(1);
    });
  });

  describe("createZombieEntity", () => {
    it("creates zombie with correct defaults", () => {
      const zombie = createZombieEntity(50, 60, 2);
      expect(zombie.position).toEqual({ x: 50, y: 60 });
      expect(zombie.velocity).toEqual({ vx: 0, vy: 0 });
      expect(zombie.renderable.spriteKey).toBe("zombie");
      expect(zombie.physicsBody.bodyId).toBe(2);
      expect(zombie.health).toEqual({ current: 50, max: 50 });
    });

    it("is not in playerEntities query", () => {
      createZombieEntity(0, 0, 1);
      expect(playerEntities.size).toBe(0);
    });
  });

  describe("createBarricadeEntity", () => {
    it("creates barricade without velocity", () => {
      const barricade = createBarricadeEntity(10, 20, 3);
      expect(barricade.position).toEqual({ x: 10, y: 20 });
      expect(barricade.renderable.spriteKey).toBe("barricade");
      expect(barricade.physicsBody.bodyId).toBe(3);
      expect(barricade.health).toEqual({ current: 200, max: 200 });
    });

    it("is not in movingEntities query (no velocity)", () => {
      createBarricadeEntity(0, 0, 1);
      expect(movingEntities.size).toBe(0);
    });
  });

  describe("createProjectileEntity", () => {
    it("creates projectile with initial velocity", () => {
      const bullet = createProjectileEntity(0, 0, 10, -5, 4);
      expect(bullet.position).toEqual({ x: 0, y: 0 });
      expect(bullet.velocity).toEqual({ vx: 10, vy: -5 });
      expect(bullet.renderable.spriteKey).toBe("bullet");
      expect(bullet.physicsBody.bodyId).toBe(4);
    });

    it("is not in damageableEntities query (no health)", () => {
      createProjectileEntity(0, 0, 1, 0, 1);
      expect(damageableEntities.size).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// resetWorld
// ---------------------------------------------------------------------------

describe("resetWorld", () => {
  it("removes all entities from the world", () => {
    createPlayerEntity(0, 0, 1);
    createZombieEntity(10, 10, 2);
    expect(world.size).toBe(2);

    resetWorld();
    expect(world.size).toBe(0);
  });

  it("clears all queries", () => {
    createPlayerEntity(0, 0, 1);
    expect(playerEntities.size).toBe(1);

    resetWorld();
    expect(playerEntities.size).toBe(0);
    expect(movingEntities.size).toBe(0);
    expect(damageableEntities.size).toBe(0);
  });

  it("allows the world to be repopulated after reset", () => {
    createPlayerEntity(0, 0, 1);
    resetWorld();

    createZombieEntity(5, 5, 2);
    expect(world.size).toBe(1);
    expect(movingEntities.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Iteration
// ---------------------------------------------------------------------------

describe("iteration", () => {
  it("can iterate the world with for...of", () => {
    world.add({ position: { x: 1, y: 1 } });
    world.add({ position: { x: 2, y: 2 } });

    const positions: Array<{ x: number; y: number }> = [];
    for (const entity of world) {
      if (entity.position) {
        positions.push(entity.position);
      }
    }
    expect(positions).toHaveLength(2);
  });

  it("can iterate queries with for...of", () => {
    createPlayerEntity(10, 20, 1);
    createZombieEntity(30, 40, 2);

    const xs: number[] = [];
    for (const entity of movingEntities) {
      xs.push(entity.position.x);
    }
    expect(xs).toHaveLength(2);
    expect(xs).toContain(10);
    expect(xs).toContain(30);
  });
});
