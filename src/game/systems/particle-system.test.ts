import { describe, it, expect, beforeEach, vi } from "vitest";
import { createParticleSystem } from "./particle-system";
import { createGameEventBus, safeEmit } from "@/game/events/event-bus";
import type { GameEventBus } from "@/game/events/event-bus";
import { createInputState, createClockState } from "./scene-context";
import type { SceneContext, InputState } from "./scene-context";
import { PARTICLES } from "./particle-constants";
import { world } from "@/game/ecs/world";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockEmitter() {
  return {
    setDepth: vi.fn().mockReturnThis(),
    setPosition: vi.fn(),
    explode: vi.fn(),
    destroy: vi.fn(),
    active: true,
  };
}

function makeContext(
  bus: GameEventBus,
  inputState: InputState,
): SceneContext {
  const mockEmitter = createMockEmitter();

  return {
    scene: {
      add: {
        particles: vi.fn().mockReturnValue(mockEmitter),
      },
    } as unknown as SceneContext["scene"],
    bodyRegistry: {} as SceneContext["bodyRegistry"],
    inputState,
    getAlpha: () => 0,
    clockState: createClockState(),
    eventBus: bus,
  };
}

function addPlayerEntity(x: number, y: number, vx = 0, vy = 0) {
  return world.add({
    playerControlled: { active: true },
    position: { x, y },
    velocity: { vx, vy },
  });
}

function addBurningEntity(x: number, y: number) {
  return world.add({
    position: { x, y },
    material: {
      category: "wood" as const,
      flammability: 0.8,
      conductivity: 0,
      explosivePotential: 0,
      state: "burning" as const,
    },
  });
}

function addElectrifiedEntity(x: number, y: number) {
  return world.add({
    position: { x, y },
    material: {
      category: "metal" as const,
      flammability: 0,
      conductivity: 0.9,
      explosivePotential: 0,
      state: "electrified" as const,
    },
  });
}

const DT = 1 / 60;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  for (const entity of [...world.entities]) {
    world.remove(entity);
  }
});

describe("createParticleSystem", () => {
  describe("one-shot event effects", () => {
    it("emits explosion particles on explosion-detonated event", () => {
      const bus = createGameEventBus();
      const ctx = makeContext(bus, createInputState());
      createParticleSystem(ctx);

      safeEmit(bus, "explosion-detonated", {
        position: { x: 200, y: 200 },
        objectType: "gas_can",
        explosivePotential: 0.9,
        radius: 96,
      });

      const addParticles = ctx.scene.add.particles as ReturnType<typeof vi.fn>;
      expect(addParticles).toHaveBeenCalled();
      expect(addParticles.mock.calls[0][0]).toBe(200); // x
      expect(addParticles.mock.calls[0][1]).toBe(200); // y
    });

    it("emits blood particles on player-hit event", () => {
      const bus = createGameEventBus();
      const ctx = makeContext(bus, createInputState());
      createParticleSystem(ctx);

      safeEmit(bus, "player-hit", {
        position: { x: 100, y: 100 },
        damage: 10,
        sourceDirection: { x: 1, y: 0 },
      });

      const addParticles = ctx.scene.add.particles as ReturnType<typeof vi.fn>;
      expect(addParticles).toHaveBeenCalled();
    });

    it("emits blood particles on damage-dealt event", () => {
      const bus = createGameEventBus();
      const ctx = makeContext(bus, createInputState());
      createParticleSystem(ctx);

      safeEmit(bus, "damage-dealt", {
        position: { x: 150, y: 150 },
        damage: 15,
        targetType: "zombie",
      });

      const addParticles = ctx.scene.add.particles as ReturnType<typeof vi.fn>;
      expect(addParticles).toHaveBeenCalled();
    });

    it("emits death burst on zombie-killed event", () => {
      const bus = createGameEventBus();
      const ctx = makeContext(bus, createInputState());
      createParticleSystem(ctx);

      safeEmit(bus, "zombie-killed", {
        position: { x: 300, y: 300 },
        totalKills: 1,
        variant: "shambler",
      });

      const addParticles = ctx.scene.add.particles as ReturnType<typeof vi.fn>;
      expect(addParticles).toHaveBeenCalled();
    });

    it("emits swing trail on melee-swing event", () => {
      const bus = createGameEventBus();
      const ctx = makeContext(bus, createInputState());
      createParticleSystem(ctx);

      safeEmit(bus, "melee-swing", {
        position: { x: 100, y: 100 },
        aimAngle: 0,
        range: 32,
        itemType: null,
      });

      const addParticles = ctx.scene.add.particles as ReturnType<typeof vi.fn>;
      expect(addParticles).toHaveBeenCalled();
    });

    it("emits splinters on barricade-broken event", () => {
      const bus = createGameEventBus();
      const ctx = makeContext(bus, createInputState());
      createParticleSystem(ctx);

      safeEmit(bus, "barricade-broken", {
        position: { x: 200, y: 200 },
      });

      const addParticles = ctx.scene.add.particles as ReturnType<typeof vi.fn>;
      expect(addParticles).toHaveBeenCalled();
    });

    it("emits fire burst on fire-ignited event", () => {
      const bus = createGameEventBus();
      const ctx = makeContext(bus, createInputState());
      createParticleSystem(ctx);

      safeEmit(bus, "fire-ignited", {
        position: { x: 100, y: 100 },
        objectType: "wooden_plank",
        sourceObjectType: null,
      });

      const addParticles = ctx.scene.add.particles as ReturnType<typeof vi.fn>;
      expect(addParticles).toHaveBeenCalled();
    });

    it("emits electric sparks on electricity-damage event", () => {
      const bus = createGameEventBus();
      const ctx = makeContext(bus, createInputState());
      createParticleSystem(ctx);

      safeEmit(bus, "electricity-damage", {
        position: { x: 100, y: 100 },
        damage: 5,
        targetType: "zombie",
      });

      const addParticles = ctx.scene.add.particles as ReturnType<typeof vi.fn>;
      expect(addParticles).toHaveBeenCalled();
    });
  });

  describe("graphics quality", () => {
    it("does not emit particles when quality is low", () => {
      const bus = createGameEventBus();
      const ctx = makeContext(bus, createInputState());
      createParticleSystem(ctx);

      // Set quality to low
      safeEmit(bus, "cmd:settings-changed", { key: "graphicsQuality", value: "low" });

      // Try to emit
      safeEmit(bus, "explosion-detonated", {
        position: { x: 200, y: 200 },
        objectType: "gas_can",
        explosivePotential: 0.9,
        radius: 96,
      });

      const addParticles = ctx.scene.add.particles as ReturnType<typeof vi.fn>;
      expect(addParticles).not.toHaveBeenCalled();
    });

    it("emits particles when quality is high", () => {
      const bus = createGameEventBus();
      const ctx = makeContext(bus, createInputState());
      createParticleSystem(ctx);

      safeEmit(bus, "cmd:settings-changed", { key: "graphicsQuality", value: "high" });

      safeEmit(bus, "explosion-detonated", {
        position: { x: 200, y: 200 },
        objectType: "gas_can",
        explosivePotential: 0.9,
        radius: 96,
      });

      const addParticles = ctx.scene.add.particles as ReturnType<typeof vi.fn>;
      expect(addParticles).toHaveBeenCalled();
    });
  });

  describe("ongoing fire emitters", () => {
    it("creates continuous emitter for burning entities", () => {
      const bus = createGameEventBus();
      const ctx = makeContext(bus, createInputState());
      const system = createParticleSystem(ctx);

      addBurningEntity(100, 100);

      system(DT);

      const addParticles = ctx.scene.add.particles as ReturnType<typeof vi.fn>;
      expect(addParticles).toHaveBeenCalled();
    });

    it("creates continuous emitter for electrified entities", () => {
      const bus = createGameEventBus();
      const ctx = makeContext(bus, createInputState());
      const system = createParticleSystem(ctx);

      addElectrifiedEntity(200, 200);

      system(DT);

      const addParticles = ctx.scene.add.particles as ReturnType<typeof vi.fn>;
      expect(addParticles).toHaveBeenCalled();
    });

    it("destroys emitter when entity stops burning", () => {
      const bus = createGameEventBus();
      const ctx = makeContext(bus, createInputState());
      const system = createParticleSystem(ctx);

      const entity = addBurningEntity(100, 100);
      system(DT);

      const mockEmitter = (ctx.scene.add.particles as ReturnType<typeof vi.fn>).mock.results[0].value;

      // Change state to inert
      (entity.material as { state: string }).state = "inert";
      system(DT);

      expect(mockEmitter.destroy).toHaveBeenCalled();
    });

    it("updates emitter position when entity moves", () => {
      const bus = createGameEventBus();
      const ctx = makeContext(bus, createInputState());
      const system = createParticleSystem(ctx);

      const entity = addBurningEntity(100, 100);
      system(DT);

      const mockEmitter = (ctx.scene.add.particles as ReturnType<typeof vi.fn>).mock.results[0].value;

      // Move entity
      (entity.position as { x: number; y: number }).x = 150;
      system(DT);

      expect(mockEmitter.setPosition).toHaveBeenCalledWith(150, 100);
    });
  });

  describe("dust particles", () => {
    it("emits dust when player moves fast", () => {
      const bus = createGameEventBus();
      const inputState = createInputState();
      const ctx = makeContext(bus, inputState);
      const system = createParticleSystem(ctx);

      // Add a fast-moving player
      addPlayerEntity(100, 100, 200, 0);

      // Run enough frames to trigger dust emission
      for (let i = 0; i < 30; i++) system(DT);

      const addParticles = ctx.scene.add.particles as ReturnType<typeof vi.fn>;
      expect(addParticles).toHaveBeenCalled();
    });

    it("does not emit dust when player moves slowly", () => {
      const bus = createGameEventBus();
      const inputState = createInputState();
      const ctx = makeContext(bus, inputState);
      const system = createParticleSystem(ctx);

      // Add a slow-moving player (below threshold)
      addPlayerEntity(100, 100, 50, 0);

      system(DT);

      const addParticles = ctx.scene.add.particles as ReturnType<typeof vi.fn>;
      expect(addParticles).not.toHaveBeenCalled();
    });
  });

  describe("particle sets depth", () => {
    it("sets particle depth to PARTICLES.DEPTH", () => {
      const bus = createGameEventBus();
      const ctx = makeContext(bus, createInputState());
      createParticleSystem(ctx);

      safeEmit(bus, "explosion-detonated", {
        position: { x: 200, y: 200 },
        objectType: "gas_can",
        explosivePotential: 0.9,
        radius: 96,
      });

      const mockEmitter = (ctx.scene.add.particles as ReturnType<typeof vi.fn>).mock.results[0].value;
      expect(mockEmitter.setDepth).toHaveBeenCalledWith(PARTICLES.DEPTH);
    });
  });

  describe("no-op without scene", () => {
    it("does not crash when quality is low and events fire", () => {
      const bus = createGameEventBus();
      const ctx = makeContext(bus, createInputState());
      const system = createParticleSystem(ctx);

      safeEmit(bus, "cmd:settings-changed", { key: "graphicsQuality", value: "low" });

      // None of these should crash
      system(DT);
      safeEmit(bus, "explosion-detonated", {
        position: { x: 100, y: 100 },
        objectType: "gas_can",
        explosivePotential: 0.5,
        radius: 64,
      });
      system(DT);
    });
  });
});
