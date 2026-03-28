// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  getObjectDef,
  getAllObjectDefs,
  getAllObjectTypes,
} from './object-defs';
import { ObjectCategory } from '@/types/procgen';

// ---------------------------------------------------------------------------
// Required object types from the acceptance criteria
// ---------------------------------------------------------------------------

const REQUIRED_TYPES = [
  'fridge',
  'bookshelf',
  'wooden_chair',
  'metal_shelving',
  'table',
  'sofa',
  'bed',
  'gas_can',
  'car_battery',
  'wire_spool',
  'wooden_plank',
  'metal_sheet',
  'cardboard_box',
  'trash_can',
  'tire',
];

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

describe('object definitions completeness', () => {
  it('defines at least 15 object types', () => {
    expect(getAllObjectDefs().length).toBeGreaterThanOrEqual(15);
  });

  it.each(REQUIRED_TYPES)('defines required type: %s', (type) => {
    const def = getObjectDef(type);
    expect(def).toBeDefined();
    expect(def!.type).toBe(type);
  });

  it('has no duplicate type keys', () => {
    const types = getAllObjectTypes();
    expect(new Set(types).size).toBe(types.length);
  });
});

// ---------------------------------------------------------------------------
// Physical properties
// ---------------------------------------------------------------------------

describe('physical properties', () => {
  it.each(getAllObjectDefs().map((d) => [d.type, d]))(
    '%s has positive mass',
    (_, def) => {
      expect(def.physics.mass).toBeGreaterThan(0);
    },
  );

  it.each(getAllObjectDefs().map((d) => [d.type, d]))(
    '%s has durability in [0, 1]',
    (_, def) => {
      expect(def.physics.durability).toBeGreaterThanOrEqual(0);
      expect(def.physics.durability).toBeLessThanOrEqual(1);
    },
  );

  it.each(getAllObjectDefs().map((d) => [d.type, d]))(
    '%s has flammability in [0, 1]',
    (_, def) => {
      expect(def.physics.flammability).toBeGreaterThanOrEqual(0);
      expect(def.physics.flammability).toBeLessThanOrEqual(1);
    },
  );

  it.each(getAllObjectDefs().map((d) => [d.type, d]))(
    '%s has conductivity in [0, 1]',
    (_, def) => {
      expect(def.physics.conductivity).toBeGreaterThanOrEqual(0);
      expect(def.physics.conductivity).toBeLessThanOrEqual(1);
    },
  );
});

// ---------------------------------------------------------------------------
// Category assignments
// ---------------------------------------------------------------------------

describe('category assignments', () => {
  const lootTypes = ['gas_can', 'car_battery', 'wire_spool', 'wooden_plank', 'metal_sheet'];
  const furnitureTypes = ['bookshelf', 'wooden_chair', 'table', 'sofa', 'bed'];
  const containerTypes = ['fridge', 'metal_shelving', 'cardboard_box', 'trash_can'];
  const debrisTypes = ['tire'];

  it.each(lootTypes)('%s is categorised as Loot', (type) => {
    expect(getObjectDef(type)!.category).toBe(ObjectCategory.Loot);
  });

  it.each(furnitureTypes)('%s is categorised as Furniture', (type) => {
    expect(getObjectDef(type)!.category).toBe(ObjectCategory.Furniture);
  });

  it.each(containerTypes)('%s is categorised as Container', (type) => {
    expect(getObjectDef(type)!.category).toBe(ObjectCategory.Container);
  });

  it.each(debrisTypes)('%s is categorised as Debris', (type) => {
    expect(getObjectDef(type)!.category).toBe(ObjectCategory.Debris);
  });
});

// ---------------------------------------------------------------------------
// Gameplay flags
// ---------------------------------------------------------------------------

describe('gameplay flags', () => {
  it('immovable objects have blocksMovement set', () => {
    for (const def of getAllObjectDefs()) {
      if (def.immovable) {
        expect(def.blocksMovement).toBe(true);
      }
    }
  });

  it('fridge, bookshelf, sofa, and bed are flagged as immovable', () => {
    const shouldBeImmovable = ['fridge', 'bookshelf', 'sofa', 'bed', 'metal_shelving'];
    for (const type of shouldBeImmovable) {
      expect(getObjectDef(type)!.immovable).toBe(true);
    }
  });

  it('loot items are not immovable', () => {
    for (const def of getAllObjectDefs()) {
      if (def.category === ObjectCategory.Loot) {
        expect(def.immovable).toBe(false);
      }
    }
  });

  it('every definition has a render color', () => {
    for (const def of getAllObjectDefs()) {
      expect(def.renderColor).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

describe('getObjectDef', () => {
  it('returns undefined for unknown types', () => {
    expect(getObjectDef('nonexistent')).toBeUndefined();
    expect(getObjectDef('')).toBeUndefined();
  });

  it('returns the correct definition by type key', () => {
    const def = getObjectDef('fridge');
    expect(def).toBeDefined();
    expect(def!.displayName).toBe('Fridge');
    expect(def!.category).toBe(ObjectCategory.Container);
  });
});
