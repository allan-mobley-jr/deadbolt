import { describe, it, expect } from "vitest";
import { getAllObjectTypes } from "@/game/procgen/object-defs";
import { MATERIAL, MATERIAL_ASSIGNMENTS } from "./material-constants";
import type { MaterialAssignment } from "./material-constants";

describe("MATERIAL_ASSIGNMENTS", () => {
  it("covers every registered object type", () => {
    const allTypes = getAllObjectTypes();
    const missing = allTypes.filter((t) => !(t in MATERIAL_ASSIGNMENTS));
    expect(missing).toEqual([]);
  });

  it("has valid category for every entry", () => {
    const validCategories = new Set(["wood", "metal", "fabric", "fuel", "electronic"]);
    for (const [type, assignment] of Object.entries(MATERIAL_ASSIGNMENTS)) {
      expect(validCategories.has(assignment.category)).toBe(true);
    }
  });

  it("has explosivePotential in 0-1 range for every entry", () => {
    for (const [type, assignment] of Object.entries(MATERIAL_ASSIGNMENTS)) {
      expect(assignment.explosivePotential).toBeGreaterThanOrEqual(0);
      expect(assignment.explosivePotential).toBeLessThanOrEqual(1);
    }
  });

  it("assigns gas_can as fuel with high explosive potential", () => {
    const gasCanAssignment = MATERIAL_ASSIGNMENTS["gas_can"] as MaterialAssignment;
    expect(gasCanAssignment.category).toBe("fuel");
    expect(gasCanAssignment.explosivePotential).toBeGreaterThanOrEqual(0.8);
  });

  it("assigns metal_sheet as metal with no explosive potential", () => {
    const metalSheetAssignment = MATERIAL_ASSIGNMENTS["metal_sheet"] as MaterialAssignment;
    expect(metalSheetAssignment.category).toBe("metal");
    expect(metalSheetAssignment.explosivePotential).toBe(0);
  });

  it("assigns wooden items as wood", () => {
    const woodTypes = ["bookshelf", "wooden_chair", "table", "wooden_plank"];
    for (const type of woodTypes) {
      expect(MATERIAL_ASSIGNMENTS[type]?.category).toBe("wood");
    }
  });

  it("assigns fabric items as fabric", () => {
    const fabricTypes = ["sofa", "bed", "cardboard_box"];
    for (const type of fabricTypes) {
      expect(MATERIAL_ASSIGNMENTS[type]?.category).toBe("fabric");
    }
  });

  it("assigns electronic items as electronic", () => {
    const electronicTypes = ["car_battery", "wire_spool", "fridge"];
    for (const type of electronicTypes) {
      expect(MATERIAL_ASSIGNMENTS[type]?.category).toBe("electronic");
    }
  });
});

describe("MATERIAL constants", () => {
  it("has positive fire spread radius", () => {
    expect(MATERIAL.FIRE_SPREAD_RADIUS).toBeGreaterThan(0);
  });

  it("has positive explosion radius", () => {
    expect(MATERIAL.EXPLOSION_RADIUS).toBeGreaterThan(0);
  });

  it("explosion radius exceeds fire spread radius", () => {
    expect(MATERIAL.EXPLOSION_RADIUS).toBeGreaterThan(MATERIAL.FIRE_SPREAD_RADIUS);
  });

  it("thresholds are in valid range", () => {
    expect(MATERIAL.FLAMMABILITY_THRESHOLD).toBeGreaterThan(0);
    expect(MATERIAL.FLAMMABILITY_THRESHOLD).toBeLessThan(1);
    expect(MATERIAL.CONDUCTIVITY_THRESHOLD).toBeGreaterThan(0);
    expect(MATERIAL.CONDUCTIVITY_THRESHOLD).toBeLessThan(1);
    expect(MATERIAL.EXPLOSIVE_THRESHOLD).toBeGreaterThan(0);
    expect(MATERIAL.EXPLOSIVE_THRESHOLD).toBeLessThan(1);
  });
});
