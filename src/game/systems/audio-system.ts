/**
 * Audio system — spatial SFX, ambient music, and feedback sounds.
 *
 * Hybrid architecture: event-bus listeners trigger one-shot SFX immediately
 * (no tick latency), while the per-tick function handles crossfading,
 * looping sound position updates, heartbeat timing, and mute/pause sync.
 *
 * Uses Phaser's built-in WebAudio manager. All spatial calculations use
 * pure math utilities from audio-spatial.ts. Placeholder silent audio
 * assets are generated in BootScene — actual sound design is separate.
 *
 * NO React imports — this is pure game-side TypeScript.
 */

import type { SceneContext } from "./scene-context";
import type { SystemFn } from "./system-runner";
import { AUDIO, SOUND_KEYS } from "./audio-constants";
import {
  computeSpatialVolume,
  computeStereoPan,
  computeEffectiveVolume,
} from "./audio-spatial";
import { playerEntities, zombieEntities } from "@/game/ecs/queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MusicState {
  phase: "idle" | "crossfading";
  currentKey: string | null;
  currentSound: Phaser.Sound.BaseSound | null;
  incomingKey: string | null;
  incomingSound: Phaser.Sound.BaseSound | null;
  fadeProgress: number; // 0 to 1
  targetVolume: number;
  /** Volume of the outgoing track at crossfade start (for smooth fade-out). */
  outgoingVolume: number;
}

// ---------------------------------------------------------------------------
// System factory
// ---------------------------------------------------------------------------

export function createAudioSystem(ctx: SceneContext): SystemFn {
  const soundManager = ctx.scene.sound;

  // --- Volume settings cache ---
  let masterVolume = 1.0;
  let sfxVolume = 0.8;
  let musicVolume = 0.6;

  // --- Mute state ---
  let muted = false;
  let prevMuteKeyDown = false;
  let muteKey: Phaser.Input.Keyboard.Key | null = null;

  // Capture M key for mute toggle
  const kb = ctx.scene.input?.keyboard;
  if (kb) {
    muteKey = kb.addKey(AUDIO.MUTE_KEY);
  }

  // --- Pause tracking ---
  let wasPausedLastTick = false;

  // --- Music crossfade state ---
  const music: MusicState = {
    phase: "idle",
    currentKey: null,
    currentSound: null,
    incomingKey: null,
    incomingSound: null,
    fadeProgress: 0,
    targetVolume: AUDIO.DAY_MUSIC_VOLUME,
    outgoingVolume: 0,
  };

  // --- Heartbeat state ---
  let heartbeatTimer = 0;

  // --- Concurrent SFX counters ---
  let activeExplosions = 0;
  let activeFires = 0;
  let activeGroans = 0;

  // --- Zombie groan cooldowns (keyed by entity reference) ---
  const groanCooldowns = new Map<unknown, number>();

  // --- Night wave intensity ---
  let nightIntensity = 0;

  // --- Autoplay lock tracking ---
  let audioUnlocked = false;

  // Check initial unlock state
  if (soundManager && "locked" in soundManager) {
    const sm = soundManager as Phaser.Sound.WebAudioSoundManager;
    audioUnlocked = !sm.locked;
    if (sm.locked && sm.on) {
      sm.on("unlocked", () => {
        audioUnlocked = true;
      });
    }
  } else {
    // Fallback: assume unlocked (HTML5 audio or test environment)
    audioUnlocked = true;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /** Get the player position, or null if no player entity. */
  function getPlayerPos(): { x: number; y: number } | null {
    const players = playerEntities.entities;
    return players.length > 0 ? players[0].position : null;
  }

  /** Play a non-spatial (UI/feedback) SFX. */
  function playUiSfx(key: string): void {
    if (!audioUnlocked || !soundManager) return;
    const vol = computeEffectiveVolume(1.0, masterVolume, sfxVolume);
    if (vol <= 0) return;
    try {
      soundManager.play(key, { volume: vol });
    } catch {
      // Sound may not be loaded — silently skip
    }
  }

  /** Play a spatial SFX at a world position. */
  function playSpatialSfx(
    key: string,
    worldX: number,
    worldY: number,
    extraConfig?: { detune?: number },
  ): void {
    if (!audioUnlocked || !soundManager) return;

    const listener = getPlayerPos();
    if (!listener) return;

    const spatialVol = computeSpatialVolume(
      worldX, worldY,
      listener.x, listener.y,
    );
    if (spatialVol <= 0) return;

    const vol = computeEffectiveVolume(spatialVol, masterVolume, sfxVolume);
    if (vol <= 0) return;

    const pan = computeStereoPan(worldX, worldY, listener.x, listener.y);

    try {
      soundManager.play(key, {
        volume: vol,
        pan,
        ...extraConfig,
      });
    } catch {
      // Sound may not be loaded — silently skip
    }
  }

  /** Start or crossfade to a new music track. */
  function startMusic(key: string, volume: number): void {
    if (!audioUnlocked || !soundManager) return;

    if (music.currentKey === key && music.phase === "idle") {
      // Already playing the right track — just update volume
      music.targetVolume = volume;
      return;
    }

    // Clean up any in-progress crossfade to prevent sound leaks
    if (music.incomingSound && "stop" in music.incomingSound) {
      try {
        (music.incomingSound as Phaser.Sound.WebAudioSound).stop();
        music.incomingSound.destroy();
      } catch { /* ignore */ }
    }

    // Begin crossfade — store outgoing volume for smooth fade-out
    music.outgoingVolume = music.targetVolume;
    music.incomingKey = key;
    music.targetVolume = volume;
    music.fadeProgress = 0;
    music.phase = "crossfading";

    try {
      const musicVol = computeEffectiveVolume(1.0, masterVolume, musicVolume);
      music.incomingSound = soundManager.add(key, {
        volume: 0,
        loop: true,
      });
      if (music.incomingSound && "play" in music.incomingSound) {
        (music.incomingSound as Phaser.Sound.WebAudioSound).play();
        (music.incomingSound as Phaser.Sound.WebAudioSound).setVolume(
          0.001 * musicVol,
        );
      }
    } catch {
      music.phase = "idle";
    }
  }

  /** Update music volumes during crossfade tick. */
  function tickMusicCrossfade(dt: number): void {
    if (music.phase !== "crossfading") return;

    music.fadeProgress += dt / AUDIO.MUSIC_CROSSFADE_DURATION;

    const musicVol = computeEffectiveVolume(1.0, masterVolume, musicVolume);

    if (music.fadeProgress >= 1.0) {
      // Crossfade complete
      if (music.currentSound && "stop" in music.currentSound) {
        try {
          (music.currentSound as Phaser.Sound.WebAudioSound).stop();
          music.currentSound.destroy();
        } catch { /* ignore */ }
      }

      music.currentKey = music.incomingKey;
      music.currentSound = music.incomingSound;
      music.incomingKey = null;
      music.incomingSound = null;
      music.phase = "idle";

      // Set final volume
      if (music.currentSound && "setVolume" in music.currentSound) {
        (music.currentSound as Phaser.Sound.WebAudioSound).setVolume(
          music.targetVolume * musicVol,
        );
      }
      return;
    }

    // Interpolate volumes
    const t = music.fadeProgress;

    if (music.currentSound && "setVolume" in music.currentSound) {
      (music.currentSound as Phaser.Sound.WebAudioSound).setVolume(
        (1 - t) * music.outgoingVolume * musicVol,
      );
    }
    if (music.incomingSound && "setVolume" in music.incomingSound) {
      (music.incomingSound as Phaser.Sound.WebAudioSound).setVolume(
        t * music.targetVolume * musicVol,
      );
    }
  }

  // =========================================================================
  // Event listeners (wired once at factory time)
  // =========================================================================

  // --- Combat SFX ---

  ctx.eventBus.on("melee-swing", (e) => {
    playSpatialSfx(SOUND_KEYS.SFX_MELEE_SWING, e.position.x, e.position.y);
  });

  ctx.eventBus.on("damage-dealt", (e) => {
    playSpatialSfx(SOUND_KEYS.SFX_HIT_IMPACT, e.position.x, e.position.y);
  });

  ctx.eventBus.on("player-hit", () => {
    playUiSfx(SOUND_KEYS.SFX_PLAYER_HURT);
  });

  ctx.eventBus.on("zombie-killed", (e) => {
    playSpatialSfx(SOUND_KEYS.SFX_ZOMBIE_DEATH, e.position.x, e.position.y);
  });

  // --- Barricade SFX ---

  ctx.eventBus.on("barricade-placed", (e) => {
    playSpatialSfx(SOUND_KEYS.SFX_BARRICADE_PLACE, e.position.x, e.position.y);
  });

  ctx.eventBus.on("barricade-damaged", (e) => {
    playSpatialSfx(SOUND_KEYS.SFX_BARRICADE_HIT, e.position.x, e.position.y);
  });

  ctx.eventBus.on("barricade-broken", (e) => {
    playSpatialSfx(SOUND_KEYS.SFX_BARRICADE_BREAK, e.position.x, e.position.y);
  });

  // --- Item SFX ---

  ctx.eventBus.on("item-picked-up", () => {
    playUiSfx(SOUND_KEYS.SFX_ITEM_PICKUP);
  });

  ctx.eventBus.on("inventory-full", () => {
    playUiSfx(SOUND_KEYS.SFX_INVENTORY_FULL);
  });

  // --- Fire SFX ---

  ctx.eventBus.on("fire-ignited", (e) => {
    if (activeFires < AUDIO.MAX_CONCURRENT_FIRE) {
      activeFires++;
      playSpatialSfx(SOUND_KEYS.SFX_FIRE_IGNITE, e.position.x, e.position.y);
      setTimeout(() => { activeFires = Math.max(0, activeFires - 1); }, 1500);
    }
  });

  // --- Explosion SFX ---

  ctx.eventBus.on("explosion-detonated", (e) => {
    if (activeExplosions < AUDIO.MAX_CONCURRENT_EXPLOSIONS) {
      activeExplosions++;
      playSpatialSfx(SOUND_KEYS.SFX_EXPLOSION, e.position.x, e.position.y);
      // Decrement after approximate sound duration
      setTimeout(() => { activeExplosions = Math.max(0, activeExplosions - 1); }, 1000);
    }
  });

  // --- Electricity SFX ---

  ctx.eventBus.on("electricity-damage", (e) => {
    playSpatialSfx(SOUND_KEYS.SFX_ELECTRIC_ZAP, e.position.x, e.position.y);
  });

  // --- Phase change (music) ---

  ctx.eventBus.on("phase-change", (e) => {
    if (e.phase === "day" || e.phase === "dawn") {
      nightIntensity = 0;
      startMusic(SOUND_KEYS.MUSIC_DAY, AUDIO.DAY_MUSIC_VOLUME);
    } else if (e.phase === "night" || e.phase === "dusk") {
      startMusic(SOUND_KEYS.MUSIC_NIGHT, AUDIO.NIGHT_MUSIC_BASE_VOLUME);
    }
    playUiSfx(SOUND_KEYS.SFX_PHASE_TRANSITION);
  });

  // --- Wave events ---

  ctx.eventBus.on("wave-started", () => {
    playUiSfx(SOUND_KEYS.SFX_WAVE_ALARM);
    // Ramp night music intensity
    nightIntensity = Math.min(
      AUDIO.NIGHT_MUSIC_MAX_VOLUME,
      nightIntensity + AUDIO.NIGHT_INTENSITY_RAMP,
    );
  });

  // --- Settings changes ---

  ctx.eventBus.on("cmd:settings-changed", (e) => {
    if (e.key === "masterVolume" && typeof e.value === "number") {
      masterVolume = e.value;
      if (soundManager) soundManager.volume = e.value;
    }
    if (e.key === "sfxVolume" && typeof e.value === "number") {
      sfxVolume = e.value;
    }
    if (e.key === "musicVolume" && typeof e.value === "number") {
      musicVolume = e.value;
    }
  });

  // =========================================================================
  // Per-tick function (60 Hz)
  // =========================================================================

  return function audioSystem(dt: number): void {
    if (!audioUnlocked || !soundManager) return;

    // --- Pause sync ---
    const isPaused = ctx.clockState.paused;
    if (isPaused && !wasPausedLastTick) {
      try { soundManager.pauseAll(); } catch { /* ignore */ }
      wasPausedLastTick = true;
      return;
    }
    if (!isPaused && wasPausedLastTick) {
      try { soundManager.resumeAll(); } catch { /* ignore */ }
      wasPausedLastTick = false;
    }
    if (isPaused) return;

    // --- Mute toggle (M key, edge-detected) ---
    if (muteKey) {
      const muteDown = muteKey.isDown;
      if (muteDown && !prevMuteKeyDown) {
        muted = !muted;
        soundManager.mute = muted;
      }
      prevMuteKeyDown = muteDown;
    }

    // --- Music crossfade ---
    tickMusicCrossfade(dt);

    // --- Update music volume for night intensity ---
    if (
      music.phase === "idle" &&
      music.currentKey === SOUND_KEYS.MUSIC_NIGHT &&
      music.currentSound &&
      "setVolume" in music.currentSound
    ) {
      const targetVol = Math.min(
        AUDIO.NIGHT_MUSIC_MAX_VOLUME,
        AUDIO.NIGHT_MUSIC_BASE_VOLUME + nightIntensity,
      );
      const musicVol = computeEffectiveVolume(1.0, masterVolume, musicVolume);
      (music.currentSound as Phaser.Sound.WebAudioSound).setVolume(
        targetVol * musicVol,
      );
    }

    // --- Zombie groans (periodic, spatial) ---
    const listener = getPlayerPos();
    if (listener) {
      const zombies = zombieEntities.entities;
      for (let i = 0; i < zombies.length; i++) {
        const z = zombies[i];
        if (z.aiState.state === "dead") continue;

        // Decrement cooldown
        const remaining = groanCooldowns.get(z) ?? 0;
        if (remaining > 0) {
          groanCooldowns.set(z, remaining - dt);
          continue;
        }

        // Check if within audible range
        const dx = z.position.x - listener.x;
        const dy = z.position.y - listener.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > AUDIO.ZOMBIE_GROAN_RANGE) continue;

        // Random chance to groan this tick (low probability per tick)
        if (Math.random() > 0.02) continue;

        if (activeGroans >= AUDIO.ZOMBIE_GROAN_MAX_CONCURRENT) continue;

        // Play groan with randomized pitch
        const detune =
          AUDIO.ZOMBIE_GROAN_PITCH_MIN +
          Math.random() * (AUDIO.ZOMBIE_GROAN_PITCH_MAX - AUDIO.ZOMBIE_GROAN_PITCH_MIN);

        activeGroans++;
        playSpatialSfx(SOUND_KEYS.SFX_ZOMBIE_GROAN, z.position.x, z.position.y, { detune });
        groanCooldowns.set(z, AUDIO.ZOMBIE_GROAN_COOLDOWN);

        // Decrement after approximate groan duration
        setTimeout(() => { activeGroans = Math.max(0, activeGroans - 1); }, 2000);
      }
    }

    // --- Heartbeat (low health warning) ---
    const players = playerEntities.entities;
    if (players.length > 0) {
      const player = players[0];
      if ("health" in player) {
        const hp = player.health as { current: number; max: number };
        const fraction = hp.max > 0 ? hp.current / hp.max : 1;

        if (fraction <= AUDIO.HEARTBEAT_HEALTH_THRESHOLD && fraction > 0) {
          heartbeatTimer -= dt;
          if (heartbeatTimer <= 0) {
            playUiSfx(SOUND_KEYS.SFX_HEARTBEAT);
            heartbeatTimer = AUDIO.HEARTBEAT_INTERVAL;
          }
        } else {
          heartbeatTimer = 0;
        }
      }
    }

    // --- Clean up groan cooldowns for dead/removed entities ---
    if (groanCooldowns.size > 100) {
      // Periodic cleanup to prevent memory leak
      for (const [entity] of groanCooldowns) {
        const z = entity as { aiState?: { state: string } };
        if (!z.aiState || z.aiState.state === "dead") {
          groanCooldowns.delete(entity);
        }
      }
    }
  };
}
