import { describe, it, expect, beforeEach, vi } from "vitest";
import { createAudioSystem } from "./audio-system";
import { createGameEventBus, safeEmit } from "@/game/events/event-bus";
import type { GameEventBus } from "@/game/events/event-bus";
import type { SceneContext, ClockState } from "./scene-context";
import { SOUND_KEYS } from "./audio-constants";
import { world } from "@/game/ecs/world";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockSoundManager() {
  return {
    play: vi.fn(),
    add: vi.fn().mockReturnValue({
      play: vi.fn(),
      stop: vi.fn(),
      setVolume: vi.fn(),
      destroy: vi.fn(),
      isPlaying: false,
    }),
    volume: 1,
    mute: false,
    locked: false,
    pauseAll: vi.fn(),
    resumeAll: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
}

function createMockClockState(): ClockState {
  return {
    phase: "day",
    dayNumber: 1,
    timeRemainingInPhase: 300,
    phaseDuration: 300,
    elapsedTotal: 0,
    paused: false,
  };
}

function makeContext(
  bus: GameEventBus,
  soundManager: ReturnType<typeof createMockSoundManager>,
  clockState: ClockState,
): SceneContext {
  return {
    scene: {
      sound: soundManager,
      input: {
        keyboard: {
          addKey: vi.fn().mockReturnValue({ isDown: false }),
        },
      },
    } as unknown as SceneContext["scene"],
    bodyRegistry: {} as SceneContext["bodyRegistry"],
    inputState: {} as SceneContext["inputState"],
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

describe("createAudioSystem", () => {
  describe("event-to-SFX mapping", () => {
    it("plays melee-swing SFX on melee-swing event", () => {
      const bus = createGameEventBus();
      const sound = createMockSoundManager();
      const ctx = makeContext(bus, sound, createMockClockState());
      createAudioSystem(ctx);
      addPlayerEntity(100, 100);

      safeEmit(bus, "melee-swing", {
        position: { x: 120, y: 100 },
        aimAngle: 0,
        range: 32,
        itemType: null,
      });

      expect(sound.play).toHaveBeenCalledWith(
        SOUND_KEYS.SFX_MELEE_SWING,
        expect.objectContaining({ volume: expect.any(Number) }),
      );
    });

    it("plays player-hurt SFX on player-hit event", () => {
      const bus = createGameEventBus();
      const sound = createMockSoundManager();
      const ctx = makeContext(bus, sound, createMockClockState());
      createAudioSystem(ctx);
      addPlayerEntity(100, 100);

      safeEmit(bus, "player-hit", {
        position: { x: 100, y: 100 },
        damage: 10,
        sourceDirection: { x: 1, y: 0 },
      });

      expect(sound.play).toHaveBeenCalledWith(
        SOUND_KEYS.SFX_PLAYER_HURT,
        expect.objectContaining({ volume: expect.any(Number) }),
      );
    });

    it("plays explosion SFX on explosion-detonated event", () => {
      const bus = createGameEventBus();
      const sound = createMockSoundManager();
      const ctx = makeContext(bus, sound, createMockClockState());
      createAudioSystem(ctx);
      addPlayerEntity(100, 100);

      safeEmit(bus, "explosion-detonated", {
        position: { x: 200, y: 100 },
        objectType: "gas_can",
        explosivePotential: 0.8,
        radius: 128,
      });

      expect(sound.play).toHaveBeenCalledWith(
        SOUND_KEYS.SFX_EXPLOSION,
        expect.objectContaining({ volume: expect.any(Number), pan: expect.any(Number) }),
      );
    });

    it("plays item-pickup SFX on item-picked-up event", () => {
      const bus = createGameEventBus();
      const sound = createMockSoundManager();
      const ctx = makeContext(bus, sound, createMockClockState());
      createAudioSystem(ctx);

      safeEmit(bus, "item-picked-up", { itemType: "medkit", quantity: 1 });

      expect(sound.play).toHaveBeenCalledWith(
        SOUND_KEYS.SFX_ITEM_PICKUP,
        expect.objectContaining({ volume: expect.any(Number) }),
      );
    });

    it("plays wave alarm on wave-started event", () => {
      const bus = createGameEventBus();
      const sound = createMockSoundManager();
      const ctx = makeContext(bus, sound, createMockClockState());
      createAudioSystem(ctx);

      safeEmit(bus, "wave-started", {
        waveNumber: 1,
        zombieCount: 10,
        dayNumber: 1,
      });

      expect(sound.play).toHaveBeenCalledWith(
        SOUND_KEYS.SFX_WAVE_ALARM,
        expect.objectContaining({ volume: expect.any(Number) }),
      );
    });
  });

  describe("spatial volume", () => {
    it("plays louder for nearby events", () => {
      const bus = createGameEventBus();
      const sound = createMockSoundManager();
      const ctx = makeContext(bus, sound, createMockClockState());
      createAudioSystem(ctx);
      addPlayerEntity(100, 100);

      safeEmit(bus, "barricade-placed", {
        position: { x: 110, y: 100 },
        health: 50,
        maxHealth: 50,
      });

      const closeCall = sound.play.mock.calls[0];
      sound.play.mockClear();

      safeEmit(bus, "barricade-placed", {
        position: { x: 600, y: 100 },
        health: 50,
        maxHealth: 50,
      });

      const farCall = sound.play.mock.calls[0];
      expect(closeCall[1].volume).toBeGreaterThan(farCall[1].volume);
    });

    it("does not play when source is beyond max range", () => {
      const bus = createGameEventBus();
      const sound = createMockSoundManager();
      const ctx = makeContext(bus, sound, createMockClockState());
      createAudioSystem(ctx);
      addPlayerEntity(100, 100);

      safeEmit(bus, "barricade-placed", {
        position: { x: 2000, y: 100 },
        health: 50,
        maxHealth: 50,
      });

      expect(sound.play).not.toHaveBeenCalled();
    });
  });

  describe("stereo panning", () => {
    it("pans right for sources to the right of player", () => {
      const bus = createGameEventBus();
      const sound = createMockSoundManager();
      const ctx = makeContext(bus, sound, createMockClockState());
      createAudioSystem(ctx);
      addPlayerEntity(100, 100);

      safeEmit(bus, "zombie-killed", {
        position: { x: 400, y: 100 },
        totalKills: 1,
        variant: "shambler",
      });

      expect(sound.play).toHaveBeenCalledWith(
        SOUND_KEYS.SFX_ZOMBIE_DEATH,
        expect.objectContaining({ pan: expect.any(Number) }),
      );
      const pan = sound.play.mock.calls[0][1].pan;
      expect(pan).toBeGreaterThan(0);
    });
  });

  describe("music crossfade", () => {
    it("starts music on phase-change to night", () => {
      const bus = createGameEventBus();
      const sound = createMockSoundManager();
      const ctx = makeContext(bus, sound, createMockClockState());
      createAudioSystem(ctx);

      safeEmit(bus, "phase-change", {
        phase: "night",
        previousPhase: "dusk",
        dayNumber: 1,
        timeRemainingInPhase: 90,
      });

      expect(sound.add).toHaveBeenCalledWith(
        SOUND_KEYS.MUSIC_NIGHT,
        expect.objectContaining({ loop: true }),
      );
    });

    it("plays phase transition SFX on phase-change", () => {
      const bus = createGameEventBus();
      const sound = createMockSoundManager();
      const ctx = makeContext(bus, sound, createMockClockState());
      createAudioSystem(ctx);

      safeEmit(bus, "phase-change", {
        phase: "dusk",
        previousPhase: "day",
        dayNumber: 1,
        timeRemainingInPhase: 15,
      });

      expect(sound.play).toHaveBeenCalledWith(
        SOUND_KEYS.SFX_PHASE_TRANSITION,
        expect.any(Object),
      );
    });
  });

  describe("pause/resume sync", () => {
    it("calls pauseAll when game is paused", () => {
      const bus = createGameEventBus();
      const sound = createMockSoundManager();
      const clock = createMockClockState();
      const ctx = makeContext(bus, sound, clock);
      const system = createAudioSystem(ctx);

      clock.paused = true;
      system(DT);

      expect(sound.pauseAll).toHaveBeenCalledTimes(1);
    });

    it("calls resumeAll when game is unpaused", () => {
      const bus = createGameEventBus();
      const sound = createMockSoundManager();
      const clock = createMockClockState();
      const ctx = makeContext(bus, sound, clock);
      const system = createAudioSystem(ctx);

      clock.paused = true;
      system(DT);
      clock.paused = false;
      system(DT);

      expect(sound.resumeAll).toHaveBeenCalledTimes(1);
    });

    it("does not call pauseAll repeatedly while paused", () => {
      const bus = createGameEventBus();
      const sound = createMockSoundManager();
      const clock = createMockClockState();
      const ctx = makeContext(bus, sound, clock);
      const system = createAudioSystem(ctx);

      clock.paused = true;
      system(DT);
      system(DT);
      system(DT);

      expect(sound.pauseAll).toHaveBeenCalledTimes(1);
    });
  });

  describe("volume settings", () => {
    it("updates master volume from settings-changed event", () => {
      const bus = createGameEventBus();
      const sound = createMockSoundManager();
      const ctx = makeContext(bus, sound, createMockClockState());
      createAudioSystem(ctx);

      safeEmit(bus, "cmd:settings-changed", { key: "masterVolume", value: 0.5 });

      expect(sound.volume).toBe(0.5);
    });

    it("caches sfxVolume for spatial calculations", () => {
      const bus = createGameEventBus();
      const sound = createMockSoundManager();
      const ctx = makeContext(bus, sound, createMockClockState());
      createAudioSystem(ctx);
      addPlayerEntity(100, 100);

      // Set sfxVolume to 0 — no SFX should play
      safeEmit(bus, "cmd:settings-changed", { key: "sfxVolume", value: 0 });

      safeEmit(bus, "barricade-placed", {
        position: { x: 110, y: 100 },
        health: 50,
        maxHealth: 50,
      });

      expect(sound.play).not.toHaveBeenCalled();
    });
  });

  describe("autoplay lock", () => {
    it("does not play sounds when audio is locked", () => {
      const bus = createGameEventBus();
      const sound = createMockSoundManager();
      sound.locked = true;
      const ctx = makeContext(bus, sound, createMockClockState());
      createAudioSystem(ctx);

      safeEmit(bus, "item-picked-up", { itemType: "medkit", quantity: 1 });

      expect(sound.play).not.toHaveBeenCalled();
    });
  });

  describe("no player entity", () => {
    it("still plays non-spatial SFX without a player", () => {
      const bus = createGameEventBus();
      const sound = createMockSoundManager();
      const ctx = makeContext(bus, sound, createMockClockState());
      createAudioSystem(ctx);
      // No player entity added

      safeEmit(bus, "item-picked-up", { itemType: "medkit", quantity: 1 });

      expect(sound.play).toHaveBeenCalledWith(
        SOUND_KEYS.SFX_ITEM_PICKUP,
        expect.any(Object),
      );
    });

    it("skips spatial SFX without a player", () => {
      const bus = createGameEventBus();
      const sound = createMockSoundManager();
      const ctx = makeContext(bus, sound, createMockClockState());
      createAudioSystem(ctx);
      // No player entity added

      safeEmit(bus, "barricade-placed", {
        position: { x: 100, y: 100 },
        health: 50,
        maxHealth: 50,
      });

      expect(sound.play).not.toHaveBeenCalled();
    });
  });
});
