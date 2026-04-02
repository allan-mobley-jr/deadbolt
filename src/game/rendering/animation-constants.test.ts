import { describe, it, expect } from "vitest";
import {
  PLAYER_ANIMS,
  ZOMBIE_ANIMS,
  ANIM_FPS,
  DIRECTION_SUFFIXES,
  getZombieWalkFps,
} from "./animation-constants";

describe("PLAYER_ANIMS", () => {
  it("defines 12 player animations (4 directions × 3 states)", () => {
    expect(Object.keys(PLAYER_ANIMS)).toHaveLength(12);
  });

  it("all animations have at least one frame", () => {
    for (const [name, def] of Object.entries(PLAYER_ANIMS)) {
      expect(def.frames.length, name).toBeGreaterThan(0);
    }
  });

  it("all frame indices are within the 12-frame strip", () => {
    for (const [name, def] of Object.entries(PLAYER_ANIMS)) {
      for (const f of def.frames) {
        expect(f, `${name} frame ${f}`).toBeGreaterThanOrEqual(0);
        expect(f, `${name} frame ${f}`).toBeLessThan(12);
      }
    }
  });

  it("walk animations loop", () => {
    for (const key of Object.keys(PLAYER_ANIMS)) {
      if (key.startsWith("walk_")) {
        expect(PLAYER_ANIMS[key].loop, key).toBe(true);
      }
    }
  });

  it("idle animations loop", () => {
    for (const key of Object.keys(PLAYER_ANIMS)) {
      if (key.startsWith("idle_")) {
        expect(PLAYER_ANIMS[key].loop, key).toBe(true);
      }
    }
  });

  it("attack animations do not loop", () => {
    for (const key of Object.keys(PLAYER_ANIMS)) {
      if (key.startsWith("attack_")) {
        expect(PLAYER_ANIMS[key].loop, key).toBe(false);
      }
    }
  });
});

describe("ZOMBIE_ANIMS", () => {
  it("defines 4 zombie animations", () => {
    expect(Object.keys(ZOMBIE_ANIMS)).toHaveLength(4);
  });

  it("all frame indices are within the 2-frame strip", () => {
    for (const [name, def] of Object.entries(ZOMBIE_ANIMS)) {
      for (const f of def.frames) {
        expect(f, `${name} frame ${f}`).toBeGreaterThanOrEqual(0);
        expect(f, `${name} frame ${f}`).toBeLessThan(2);
      }
    }
  });

  it("walk animation loops", () => {
    expect(ZOMBIE_ANIMS.walk.loop).toBe(true);
  });
});

describe("ANIM_FPS", () => {
  it("all FPS values are positive", () => {
    for (const [key, value] of Object.entries(ANIM_FPS)) {
      expect(value, key).toBeGreaterThan(0);
    }
  });
});

describe("DIRECTION_SUFFIXES", () => {
  it("has 4 entries", () => {
    expect(DIRECTION_SUFFIXES).toHaveLength(4);
  });

  it("maps S=0, E=1, N=2, W=3", () => {
    expect(DIRECTION_SUFFIXES[0]).toBe("s");
    expect(DIRECTION_SUFFIXES[1]).toBe("e");
    expect(DIRECTION_SUFFIXES[2]).toBe("n");
    expect(DIRECTION_SUFFIXES[3]).toBe("w");
  });
});

describe("getZombieWalkFps", () => {
  it("returns variant-specific FPS", () => {
    expect(getZombieWalkFps("runner")).toBe(ANIM_FPS.ZOMBIE_RUNNER_WALK);
    expect(getZombieWalkFps("brute")).toBe(ANIM_FPS.ZOMBIE_BRUTE_WALK);
    expect(getZombieWalkFps("horde")).toBe(ANIM_FPS.ZOMBIE_HORDE_WALK);
  });

  it("returns default FPS for shambler", () => {
    expect(getZombieWalkFps("shambler")).toBe(ANIM_FPS.ZOMBIE_WALK);
  });
});
