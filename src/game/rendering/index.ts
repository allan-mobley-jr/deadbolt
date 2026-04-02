// Palette
export { PALETTE, resolveColor, colorByHpTier } from "./palette";

// Sprite registry
export {
  SpriteRegistry,
  getSpriteRegistry,
  initializeSpriteRegistry,
  resetSpriteRegistry,
  ATLAS_KEYS,
} from "./sprite-registry";
export type { SpriteEntry } from "./sprite-registry";

// Entity sprite generators
export { getEntitySpriteGenerator, getGeneratorKeys } from "./generators/entity-sprites";
export type { EntitySpriteGenerator } from "./generators/entity-sprites";

// Object sprite generators
export { getObjectSpriteGenerator, getObjectGeneratorKeys } from "./generators/object-sprites";

// UI icon generators
export { getUiSpriteGenerator, getUiGeneratorKeys } from "./generators/ui-sprites";

// Tile sprite generators
export { getTileSpriteDrawFn } from "./generators/tile-sprites";
export type { TileSpriteDrawFn } from "./generators/tile-sprites";

// Particle sprite generators
export { PARTICLE_GENERATORS } from "./generators/particle-sprites";

// Animation constants
export { PLAYER_ANIMS, ZOMBIE_ANIMS, ANIM_FPS, DIRECTION_SUFFIXES, getZombieWalkFps } from "./animation-constants";
export type { AnimDef } from "./animation-constants";
