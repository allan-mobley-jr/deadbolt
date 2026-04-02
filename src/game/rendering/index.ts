// Palette
export { PALETTE, resolveColor, colorByHpTier } from "./palette";

// Sprite registry
export {
  SpriteRegistry,
  getSpriteRegistry,
  initializeSpriteRegistry,
  resetSpriteRegistry,
} from "./sprite-registry";
export type { SpriteEntry } from "./sprite-registry";

// Entity sprite generators
export { getEntitySpriteGenerator, getGeneratorKeys } from "./generators/entity-sprites";
export type { EntitySpriteGenerator } from "./generators/entity-sprites";
