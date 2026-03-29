import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";
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

  it("renderableEntities excludes entities with only renderable (no position)", () => {
    world.add({ renderable: { spriteKey: "test" } });
    expect(renderableEntities.size).toBe(0);
  });

  it("renderableEntities excludes entities with only position (no renderable)", () => {
    world.add({ position: { x: 0, y: 0 } });
    expect(renderableEntities.size).toBe(0);
  });

  it("physicsBodies excludes entities with only physicsBody (no position)", () => {
    world.add({ physicsBody: { bodyId: 1 } });
    expect(physicsBodies.size).toBe(0);
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

    it("appears in all relevant queries", () => {
      createZombieEntity(0, 0, 1);
      expect(movingEntities.size).toBe(1);
      expect(renderableEntities.size).toBe(1);
      expect(physicsBodies.size).toBe(1);
      expect(damageableEntities.size).toBe(1);
    });
  });

  describe("createBarricadeEntity", () => {
    it("creates barricade without velocity", () => {
      const barricade = createBarricadeEntity(10, 20, 3, "wooden_plank", 0, [101, 102], 60);
      expect(barricade.position).toEqual({ x: 10, y: 20 });
      expect(barricade.renderable.spriteKey).toBe("wooden_plank");
      expect(barricade.physicsBody.bodyId).toBe(3);
      expect(barricade.health).toEqual({ current: 60, max: 60 });
      expect(barricade.barricade).toEqual({
        constraintIds: [101, 102],
        entryPointIndex: 0,
        sourceObjectType: "wooden_plank",
        maxDurability: 60,
        currentDurability: 60,
      });
    });

    it("is not in movingEntities query (no velocity)", () => {
      createBarricadeEntity(0, 0, 1, "metal_sheet", 0, [201], 160);
      expect(movingEntities.size).toBe(0);
    });

    it("appears in all other relevant queries", () => {
      createBarricadeEntity(0, 0, 1, "metal_sheet", 0, [201], 160);
      expect(renderableEntities.size).toBe(1);
      expect(physicsBodies.size).toBe(1);
      expect(damageableEntities.size).toBe(1);
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

    it("appears in all other relevant queries", () => {
      createProjectileEntity(0, 0, 1, 0, 1);
      expect(movingEntities.size).toBe(1);
      expect(renderableEntities.size).toBe(1);
      expect(physicsBodies.size).toBe(1);
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

// ---------------------------------------------------------------------------
// Component mutation and reference identity
// ---------------------------------------------------------------------------

describe("component mutation", () => {
  it("entity references are live — mutations are visible via queries", () => {
    const entity = world.add({
      position: { x: 0, y: 0 },
      velocity: { vx: 0, vy: 0 },
    });
    entity.position!.x = 42;
    entity.velocity!.vy = 7;

    const [found] = movingEntities.entities;
    expect(found.position.x).toBe(42);
    expect(found.velocity.vy).toBe(7);
  });

  it("mutating one entity does not affect another", () => {
    const z1 = createZombieEntity(0, 0, 1);
    const z2 = createZombieEntity(100, 200, 2);

    z1.position.x = 999;
    expect(z2.position.x).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Multi-entity independence
// ---------------------------------------------------------------------------

describe("multi-entity independence", () => {
  it("spawning multiple entities of the same archetype creates independent entries", () => {
    const z1 = createZombieEntity(0, 0, 1);
    const z2 = createZombieEntity(100, 200, 2);
    const z3 = createZombieEntity(300, 400, 3);

    expect(world.size).toBe(3);
    expect(z1.position).toEqual({ x: 0, y: 0 });
    expect(z2.position).toEqual({ x: 100, y: 200 });
    expect(z3.position).toEqual({ x: 300, y: 400 });
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("removing an entity twice is a no-op", () => {
    const entity = world.add({ position: { x: 0, y: 0 } });
    world.remove(entity);
    world.remove(entity);
    expect(world.size).toBe(0);
  });

  it("adding the same entity reference twice does not duplicate", () => {
    const entity = world.add({ position: { x: 0, y: 0 } });
    world.add(entity);
    expect(world.size).toBe(1);
  });

  it("resetWorld on an empty world is a no-op", () => {
    resetWorld();
    expect(world.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Boundary values — document contracts for falsy and edge-case inputs
// ---------------------------------------------------------------------------

describe("boundary values", () => {
  it("physicsBody with bodyId=0 is a valid physics entity", () => {
    const entity = world.add({
      position: { x: 0, y: 0 },
      physicsBody: { bodyId: 0 },
    });
    expect(physicsBodies.size).toBe(1);
    expect(physicsBodies.entities[0].physicsBody.bodyId).toBe(0);
    expect(entity.physicsBody!.bodyId).toBe(0);
  });

  it("entity with zero health is still in damageableEntities", () => {
    world.add({ health: { current: 0, max: 100 } });
    expect(damageableEntities.size).toBe(1);
    expect(damageableEntities.entities[0].health.current).toBe(0);
  });

  it("entity with current > max is accepted (no runtime enforcement)", () => {
    const entity = world.add({ health: { current: 150, max: 100 } });
    expect(damageableEntities.size).toBe(1);
    expect(entity.health!.current).toBe(150);
    expect(entity.health!.max).toBe(100);
  });

  it("entity with empty spriteKey string is in renderableEntities", () => {
    world.add({
      position: { x: 0, y: 0 },
      renderable: { spriteKey: "" },
    });
    expect(renderableEntities.size).toBe(1);
    expect(renderableEntities.entities[0].renderable.spriteKey).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Progressive query membership — verify query reindexing as components change
// ---------------------------------------------------------------------------

describe("progressive query membership", () => {
  it("entity progressively enters queries as components are added", () => {
    const entity: Entity = world.add({});
    expect(movingEntities.size).toBe(0);
    expect(renderableEntities.size).toBe(0);
    expect(damageableEntities.size).toBe(0);
    expect(physicsBodies.size).toBe(0);
    expect(playerEntities.size).toBe(0);

    world.addComponent(entity, "position", { x: 0, y: 0 });
    expect(movingEntities.size).toBe(0);

    world.addComponent(entity, "health", { current: 10, max: 10 });
    expect(damageableEntities.size).toBe(1);

    world.addComponent(entity, "velocity", { vx: 1, vy: 0 });
    expect(movingEntities.size).toBe(1);

    world.addComponent(entity, "renderable", { spriteKey: "test" });
    expect(renderableEntities.size).toBe(1);

    world.addComponent(entity, "physicsBody", { bodyId: 1 });
    expect(physicsBodies.size).toBe(1);

    world.addComponent(entity, "playerControlled", { active: true });
    expect(playerEntities.size).toBe(1);
  });

  it("entity with all components appears in all 5 queries", () => {
    world.add({
      position: { x: 0, y: 0 },
      velocity: { vx: 1, vy: 1 },
      renderable: { spriteKey: "full" },
      playerControlled: { active: true },
      physicsBody: { bodyId: 1 },
      health: { current: 100, max: 100 },
    });
    expect(movingEntities.size).toBe(1);
    expect(renderableEntities.size).toBe(1);
    expect(playerEntities.size).toBe(1);
    expect(physicsBodies.size).toBe(1);
    expect(damageableEntities.size).toBe(1);
  });

  it("removing a component from a factory entity drops it from the correct query only", () => {
    const player = createPlayerEntity(0, 0, 1);
    expect(playerEntities.size).toBe(1);
    expect(movingEntities.size).toBe(1);
    expect(renderableEntities.size).toBe(1);
    expect(physicsBodies.size).toBe(1);
    expect(damageableEntities.size).toBe(1);

    world.removeComponent(player, "playerControlled");
    expect(playerEntities.size).toBe(0);
    expect(movingEntities.size).toBe(1);
    expect(renderableEntities.size).toBe(1);
    expect(physicsBodies.size).toBe(1);
    expect(damageableEntities.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Post-reset query accuracy
// ---------------------------------------------------------------------------

describe("post-reset query accuracy", () => {
  it("entities added after reset appear in correct queries based on components", () => {
    createPlayerEntity(0, 0, 1);
    resetWorld();

    const barricade = createBarricadeEntity(10, 10, 2, "wooden_plank", 0, [301, 302], 60);
    const bullet = createProjectileEntity(20, 20, 5, -3, 3);

    expect(world.size).toBe(2);
    // Barricade: no velocity → not in movingEntities, but in damageableEntities
    expect(damageableEntities.size).toBe(1);
    expect(damageableEntities.entities[0]).toBe(barricade);
    expect(movingEntities.size).toBe(1);
    expect(movingEntities.entities[0]).toBe(bullet);
    // Both in renderableEntities and physicsBodies
    expect(renderableEntities.size).toBe(2);
    expect(physicsBodies.size).toBe(2);
    // Neither is a player
    expect(playerEntities.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Import boundary — static analysis of the game-boundary rule
// ---------------------------------------------------------------------------

describe("import boundary", () => {
  it("ECS source files contain no phaser or react imports", () => {
    const ecsDir = resolve(__dirname);
    const ecsFiles = readdirSync(ecsDir).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
    );

    expect(ecsFiles.length).toBeGreaterThan(0);

    for (const file of ecsFiles) {
      const content = readFileSync(resolve(ecsDir, file), "utf-8");
      expect(content).not.toMatch(/from\s+["']react/);
      expect(content).not.toMatch(/from\s+["']phaser/);
      expect(content).not.toMatch(/import\s+["']react/);
      expect(content).not.toMatch(/import\s+["']phaser/);
    }
  });
});
