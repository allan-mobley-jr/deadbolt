import { describe, it, expect } from "vitest";
import { AUDIO, SOUND_KEYS, ALL_SOUND_KEYS } from "./audio-constants";

describe("AUDIO constants", () => {
  it("spatial max range is positive", () => {
    expect(AUDIO.SPATIAL_MAX_RANGE).toBeGreaterThan(0);
  });

  it("spatial ref distance is positive and less than max range", () => {
    expect(AUDIO.SPATIAL_REF_DISTANCE).toBeGreaterThan(0);
    expect(AUDIO.SPATIAL_REF_DISTANCE).toBeLessThan(AUDIO.SPATIAL_MAX_RANGE);
  });

  it("rolloff is positive", () => {
    expect(AUDIO.SPATIAL_ROLLOFF).toBeGreaterThan(0);
  });

  it("music crossfade duration is positive", () => {
    expect(AUDIO.MUSIC_CROSSFADE_DURATION).toBeGreaterThan(0);
  });

  it("volume values are in 0-1 range", () => {
    expect(AUDIO.DAY_MUSIC_VOLUME).toBeGreaterThanOrEqual(0);
    expect(AUDIO.DAY_MUSIC_VOLUME).toBeLessThanOrEqual(1);
    expect(AUDIO.NIGHT_MUSIC_BASE_VOLUME).toBeGreaterThanOrEqual(0);
    expect(AUDIO.NIGHT_MUSIC_BASE_VOLUME).toBeLessThanOrEqual(1);
    expect(AUDIO.NIGHT_MUSIC_MAX_VOLUME).toBeGreaterThanOrEqual(0);
    expect(AUDIO.NIGHT_MUSIC_MAX_VOLUME).toBeLessThanOrEqual(1);
  });

  it("zombie groan cooldown is positive", () => {
    expect(AUDIO.ZOMBIE_GROAN_COOLDOWN).toBeGreaterThan(0);
  });

  it("heartbeat interval is positive", () => {
    expect(AUDIO.HEARTBEAT_INTERVAL).toBeGreaterThan(0);
  });

  it("heartbeat threshold is between 0 and 1", () => {
    expect(AUDIO.HEARTBEAT_HEALTH_THRESHOLD).toBeGreaterThan(0);
    expect(AUDIO.HEARTBEAT_HEALTH_THRESHOLD).toBeLessThan(1);
  });

  it("concurrent limits are positive integers", () => {
    expect(AUDIO.MAX_CONCURRENT_EXPLOSIONS).toBeGreaterThan(0);
    expect(Number.isInteger(AUDIO.MAX_CONCURRENT_EXPLOSIONS)).toBe(true);
    expect(AUDIO.ZOMBIE_GROAN_MAX_CONCURRENT).toBeGreaterThan(0);
    expect(Number.isInteger(AUDIO.ZOMBIE_GROAN_MAX_CONCURRENT)).toBe(true);
  });
});

describe("SOUND_KEYS", () => {
  it("all keys are non-empty strings", () => {
    for (const [name, key] of Object.entries(SOUND_KEYS)) {
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    }
  });

  it("all keys are unique", () => {
    const values = Object.values(SOUND_KEYS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

describe("ALL_SOUND_KEYS", () => {
  it("contains all keys from SOUND_KEYS", () => {
    expect(ALL_SOUND_KEYS).toHaveLength(Object.keys(SOUND_KEYS).length);
    for (const key of Object.values(SOUND_KEYS)) {
      expect(ALL_SOUND_KEYS).toContain(key);
    }
  });
});
