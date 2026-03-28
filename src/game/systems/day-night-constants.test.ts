import { describe, it, expect } from "vitest";
import {
  DAY_NIGHT,
  LIGHTING,
  getPhaseDuration,
  getNextPhase,
} from "./day-night-constants";
import type { DayPhase } from "./day-night-constants";

describe("DAY_NIGHT constants", () => {
  it("has 4 escalation entries", () => {
    expect(DAY_NIGHT.ESCALATION).toHaveLength(4);
  });

  it("Day 1 is 5 min day / 1.5 min night", () => {
    expect(DAY_NIGHT.ESCALATION[0].day).toBe(300);
    expect(DAY_NIGHT.ESCALATION[0].night).toBe(90);
  });

  it("Day 2 is 4 min day / 2 min night", () => {
    expect(DAY_NIGHT.ESCALATION[1].day).toBe(240);
    expect(DAY_NIGHT.ESCALATION[1].night).toBe(120);
  });

  it("Day 3 is 3 min day / 2.5 min night", () => {
    expect(DAY_NIGHT.ESCALATION[2].day).toBe(180);
    expect(DAY_NIGHT.ESCALATION[2].night).toBe(150);
  });

  it("Day 4+ is 2 min day / 3 min night", () => {
    expect(DAY_NIGHT.ESCALATION[3].day).toBe(120);
    expect(DAY_NIGHT.ESCALATION[3].night).toBe(180);
  });

  it("dusk duration is 15 seconds", () => {
    expect(DAY_NIGHT.DUSK_DURATION).toBe(15);
  });

  it("dawn duration is 15 seconds", () => {
    expect(DAY_NIGHT.DAWN_DURATION).toBe(15);
  });

  it("initial phase is day", () => {
    expect(DAY_NIGHT.INITIAL_PHASE).toBe("day");
  });

  it("initial day is 1", () => {
    expect(DAY_NIGHT.INITIAL_DAY).toBe(1);
  });

  it("escalation curve has decreasing day durations", () => {
    for (let i = 1; i < DAY_NIGHT.ESCALATION.length; i++) {
      expect(DAY_NIGHT.ESCALATION[i].day).toBeLessThan(
        DAY_NIGHT.ESCALATION[i - 1].day,
      );
    }
  });

  it("escalation curve has increasing night durations", () => {
    for (let i = 1; i < DAY_NIGHT.ESCALATION.length; i++) {
      expect(DAY_NIGHT.ESCALATION[i].night).toBeGreaterThan(
        DAY_NIGHT.ESCALATION[i - 1].night,
      );
    }
  });
});

describe("LIGHTING constants", () => {
  it("day overlay alpha is 0 (no darkness)", () => {
    expect(LIGHTING.DAY_OVERLAY_ALPHA).toBe(0);
  });

  it("night overlay alpha is between 0 and 1", () => {
    expect(LIGHTING.NIGHT_OVERLAY_ALPHA).toBeGreaterThan(0);
    expect(LIGHTING.NIGHT_OVERLAY_ALPHA).toBeLessThan(1);
  });

  it("visibility radius is positive", () => {
    expect(LIGHTING.VISIBILITY_RADIUS).toBeGreaterThan(0);
  });
});

describe("getPhaseDuration", () => {
  it("returns day duration from escalation curve for day 1", () => {
    expect(getPhaseDuration("day", 1)).toBe(300);
  });

  it("returns night duration from escalation curve for day 1", () => {
    expect(getPhaseDuration("night", 1)).toBe(90);
  });

  it("returns fixed dusk duration regardless of day number", () => {
    expect(getPhaseDuration("dusk", 1)).toBe(15);
    expect(getPhaseDuration("dusk", 5)).toBe(15);
  });

  it("returns fixed dawn duration regardless of day number", () => {
    expect(getPhaseDuration("dawn", 1)).toBe(15);
    expect(getPhaseDuration("dawn", 5)).toBe(15);
  });

  it("uses escalation entry for day 2", () => {
    expect(getPhaseDuration("day", 2)).toBe(240);
    expect(getPhaseDuration("night", 2)).toBe(120);
  });

  it("uses escalation entry for day 3", () => {
    expect(getPhaseDuration("day", 3)).toBe(180);
    expect(getPhaseDuration("night", 3)).toBe(150);
  });

  it("clamps to last entry for day 4+", () => {
    expect(getPhaseDuration("day", 4)).toBe(120);
    expect(getPhaseDuration("night", 4)).toBe(180);
    expect(getPhaseDuration("day", 10)).toBe(120);
    expect(getPhaseDuration("night", 100)).toBe(180);
  });

  it("clamps to first entry for dayNumber 0 or negative", () => {
    // Defensive: dayNumber < 1 should not crash
    expect(getPhaseDuration("day", 0)).toBe(300);
    expect(getPhaseDuration("day", -1)).toBe(300);
    expect(getPhaseDuration("night", 0)).toBe(90);
  });
});

describe("getNextPhase", () => {
  it("day -> dusk", () => {
    expect(getNextPhase("day")).toBe("dusk");
  });

  it("dusk -> night", () => {
    expect(getNextPhase("dusk")).toBe("night");
  });

  it("night -> dawn", () => {
    expect(getNextPhase("night")).toBe("dawn");
  });

  it("dawn -> day", () => {
    expect(getNextPhase("dawn")).toBe("day");
  });

  it("full cycle returns to day", () => {
    let phase: DayPhase = "day";
    phase = getNextPhase(phase); // dusk
    phase = getNextPhase(phase); // night
    phase = getNextPhase(phase); // dawn
    phase = getNextPhase(phase); // day
    expect(phase).toBe("day");
  });
});
