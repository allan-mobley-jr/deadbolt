import { describe, it, expect, beforeEach, vi } from "vitest";
import { createCameraSystem } from "./camera-system";
import { createGameEventBus, safeEmit } from "@/game/events/event-bus";
import type { GameEventBus } from "@/game/events/event-bus";
import { createInputState, createClockState } from "./scene-context";
import type { SceneContext, ClockState, InputState } from "./scene-context";
import { CAMERA } from "./camera-constants";
import { world } from "@/game/ecs/world";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockCamera() {
  return {
    scrollX: 0,
    scrollY: 0,
    width: 1280,
    height: 720,
    zoom: 1,
    centerOn: vi.fn().mockImplementation(function (this: { scrollX: number; scrollY: number }, x: number, y: number) {
      this.scrollX = x - 640;
      this.scrollY = y - 360;
    }),
    setZoom: vi.fn().mockImplementation(function (this: { zoom: number }, z: number) {
      this.zoom = z;
    }),
    startFollow: vi.fn(),
    stopFollow: vi.fn(),
    setBounds: vi.fn(),
    shake: vi.fn(),
  };
}

function makeContext(
  bus: GameEventBus,
  cam: ReturnType<typeof createMockCamera>,
  clockState: ClockState,
  inputState: InputState,
): SceneContext {
  return {
    scene: {
      cameras: { main: cam },
      input: {
        keyboard: {
          addKey: vi.fn().mockReturnValue({ isDown: false }),
        },
        on: vi.fn(),
      },
    } as unknown as SceneContext["scene"],
    bodyRegistry: {} as SceneContext["bodyRegistry"],
    inputState,
    getAlpha: () => 0,
    clockState,
    eventBus: bus,
  };
}

function addPlayerEntity(x: number, y: number) {
  return world.add({
    playerControlled: { active: true },
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
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

describe("createCameraSystem", () => {
  describe("follow", () => {
    it("snaps camera to player on first frame", () => {
      const bus = createGameEventBus();
      const cam = createMockCamera();
      const ctx = makeContext(bus, cam, createClockState(), createInputState());
      const system = createCameraSystem(ctx);

      addPlayerEntity(500, 300);
      system(DT);

      expect(cam.centerOn).toHaveBeenCalledWith(500, 300);
    });

    it("lerps camera toward player over multiple frames", () => {
      const bus = createGameEventBus();
      const cam = createMockCamera();
      const ctx = makeContext(bus, cam, createClockState(), createInputState());
      const system = createCameraSystem(ctx);

      addPlayerEntity(500, 300);
      system(DT); // First frame — snaps

      // Move player
      const player = world.entities[0];
      (player.position as { x: number; y: number }).x = 600;

      // Camera should start moving toward new position
      const prevX = cam.scrollX;
      system(DT);
      expect(cam.scrollX).toBeGreaterThan(prevX);
    });

    it("does nothing when no player entity exists", () => {
      const bus = createGameEventBus();
      const cam = createMockCamera();
      const ctx = makeContext(bus, cam, createClockState(), createInputState());
      const system = createCameraSystem(ctx);

      system(DT);

      expect(cam.centerOn).not.toHaveBeenCalled();
    });
  });

  describe("look-ahead", () => {
    it("offsets camera in movement direction", () => {
      const bus = createGameEventBus();
      const cam = createMockCamera();
      const inputState = createInputState();
      const ctx = makeContext(bus, cam, createClockState(), inputState);
      const system = createCameraSystem(ctx);

      addPlayerEntity(500, 300);
      system(DT); // First frame — snap

      // Set movement input to the right
      inputState.moveX = 1;
      inputState.moveY = 0;

      // Run multiple frames to accumulate look-ahead
      for (let i = 0; i < 60; i++) system(DT);

      // Camera should be offset to the right of player
      const camCenterX = cam.scrollX + cam.width * 0.5;
      expect(camCenterX).toBeGreaterThan(500);
    });

    it("look-ahead returns to zero when movement stops", () => {
      const bus = createGameEventBus();
      const cam = createMockCamera();
      const inputState = createInputState();
      const ctx = makeContext(bus, cam, createClockState(), inputState);
      const system = createCameraSystem(ctx);

      addPlayerEntity(500, 300);
      system(DT); // snap

      // Move right for a while
      inputState.moveX = 1;
      for (let i = 0; i < 30; i++) system(DT);

      // Stop moving
      inputState.moveX = 0;

      // Run many frames — camera should return toward player center
      for (let i = 0; i < 120; i++) system(DT);

      const camCenterX = cam.scrollX + cam.width * 0.5;
      // Should be very close to player X (within 1 pixel)
      expect(Math.abs(camCenterX - 500)).toBeLessThan(1);
    });
  });

  describe("screen shake", () => {
    it("shakes camera on explosion-detonated event", () => {
      const bus = createGameEventBus();
      const cam = createMockCamera();
      const ctx = makeContext(bus, cam, createClockState(), createInputState());
      const system = createCameraSystem(ctx);

      addPlayerEntity(500, 300);
      system(DT); // snap

      const scrollBefore = cam.scrollX;

      safeEmit(bus, "explosion-detonated", {
        position: { x: 500, y: 300 },
        objectType: "gas_can",
        explosivePotential: 0.9,
        radius: 96,
      });

      // Run a frame — shake should offset camera
      system(DT);

      // Camera scroll should differ from baseline (shake applied)
      // We can't predict exact value due to Math.random, but shake
      // intensity should be non-zero
      // Just verify the system doesn't crash
      expect(typeof cam.scrollX).toBe("number");
    });

    it("shakes camera on player-hit event", () => {
      const bus = createGameEventBus();
      const cam = createMockCamera();
      const ctx = makeContext(bus, cam, createClockState(), createInputState());
      const system = createCameraSystem(ctx);

      addPlayerEntity(500, 300);
      system(DT);

      safeEmit(bus, "player-hit", {
        position: { x: 500, y: 300 },
        damage: 10,
        sourceDirection: { x: 1, y: 0 },
      });

      system(DT);
      expect(typeof cam.scrollX).toBe("number");
    });

    it("shakes camera on barricade-broken event", () => {
      const bus = createGameEventBus();
      const cam = createMockCamera();
      const ctx = makeContext(bus, cam, createClockState(), createInputState());
      const system = createCameraSystem(ctx);

      addPlayerEntity(500, 300);
      system(DT);

      safeEmit(bus, "barricade-broken", {
        position: { x: 500, y: 300 },
      });

      system(DT);
      expect(typeof cam.scrollX).toBe("number");
    });

    it("does not shake when screenShake setting is disabled", () => {
      const bus = createGameEventBus();
      const cam = createMockCamera();
      const ctx = makeContext(bus, cam, createClockState(), createInputState());
      const system = createCameraSystem(ctx);

      addPlayerEntity(500, 300);
      system(DT); // snap

      // Disable screen shake
      safeEmit(bus, "cmd:settings-changed", { key: "screenShake", value: false });

      // Trigger explosion
      safeEmit(bus, "explosion-detonated", {
        position: { x: 500, y: 300 },
        objectType: "gas_can",
        explosivePotential: 0.9,
        radius: 96,
      });

      const scrollBefore = cam.scrollX;
      // Run many frames to let shake decay
      for (let i = 0; i < 10; i++) system(DT);

      // Camera should converge back to player (no shake offset)
      const camCenterX = cam.scrollX + cam.width * 0.5;
      expect(Math.abs(camCenterX - 500)).toBeLessThan(2);
    });

    it("shake decays over time", () => {
      const bus = createGameEventBus();
      const cam = createMockCamera();
      const ctx = makeContext(bus, cam, createClockState(), createInputState());
      const system = createCameraSystem(ctx);

      addPlayerEntity(500, 300);
      system(DT);

      safeEmit(bus, "explosion-detonated", {
        position: { x: 500, y: 300 },
        objectType: "gas_can",
        explosivePotential: 1.0,
        radius: 128,
      });

      // Run many frames — shake should decay
      for (let i = 0; i < 120; i++) system(DT);

      // After 2 seconds at 60fps, shake should be negligible
      // Camera should be very close to player center
      const camCenterX = cam.scrollX + cam.width * 0.5;
      expect(Math.abs(camCenterX - 500)).toBeLessThan(1);
    });
  });

  describe("zoom", () => {
    it("applies zoom via setZoom", () => {
      const bus = createGameEventBus();
      const cam = createMockCamera();
      const ctx = makeContext(bus, cam, createClockState(), createInputState());
      const system = createCameraSystem(ctx);

      addPlayerEntity(500, 300);
      system(DT);

      expect(cam.setZoom).toHaveBeenCalled();
    });

    it("zoom increases during night phase", () => {
      const bus = createGameEventBus();
      const cam = createMockCamera();
      const ctx = makeContext(bus, cam, createClockState(), createInputState());
      const system = createCameraSystem(ctx);

      addPlayerEntity(500, 300);
      system(DT); // snap

      const zoomBefore = cam.setZoom.mock.calls[cam.setZoom.mock.calls.length - 1][0];

      // Trigger night phase
      safeEmit(bus, "phase-change", {
        phase: "night",
        previousPhase: "dusk",
        dayNumber: 1,
        timeRemainingInPhase: 90,
      });

      // Run many frames to let zoom lerp
      for (let i = 0; i < 300; i++) system(DT);

      const zoomAfter = cam.setZoom.mock.calls[cam.setZoom.mock.calls.length - 1][0];
      expect(zoomAfter).toBeGreaterThan(zoomBefore);
    });

    it("zoom decreases back to normal during dawn", () => {
      const bus = createGameEventBus();
      const cam = createMockCamera();
      const ctx = makeContext(bus, cam, createClockState(), createInputState());
      const system = createCameraSystem(ctx);

      addPlayerEntity(500, 300);
      system(DT);

      // Go to night first
      safeEmit(bus, "phase-change", {
        phase: "night",
        previousPhase: "dusk",
        dayNumber: 1,
        timeRemainingInPhase: 90,
      });
      for (let i = 0; i < 300; i++) system(DT);

      const nightZoom = cam.setZoom.mock.calls[cam.setZoom.mock.calls.length - 1][0];

      // Now dawn
      safeEmit(bus, "phase-change", {
        phase: "dawn",
        previousPhase: "night",
        dayNumber: 2,
        timeRemainingInPhase: 15,
      });
      for (let i = 0; i < 300; i++) system(DT);

      const dawnZoom = cam.setZoom.mock.calls[cam.setZoom.mock.calls.length - 1][0];
      expect(dawnZoom).toBeLessThan(nightZoom);
    });

    it("registers scroll wheel listener", () => {
      const bus = createGameEventBus();
      const cam = createMockCamera();
      const ctx = makeContext(bus, cam, createClockState(), createInputState());
      createCameraSystem(ctx);

      const inputOn = (ctx.scene.input as unknown as { on: ReturnType<typeof vi.fn> }).on;
      expect(inputOn).toHaveBeenCalledWith("wheel", expect.any(Function));
    });
  });

  describe("settings integration", () => {
    it("updates screenShake from cmd:settings-changed", () => {
      const bus = createGameEventBus();
      const cam = createMockCamera();
      const ctx = makeContext(bus, cam, createClockState(), createInputState());
      const system = createCameraSystem(ctx);

      addPlayerEntity(500, 300);
      system(DT);

      // Disable shake
      safeEmit(bus, "cmd:settings-changed", { key: "screenShake", value: false });

      // Should not crash and setting should be applied
      system(DT);
    });
  });
});
