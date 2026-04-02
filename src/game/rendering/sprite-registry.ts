/**
 * Sprite registry — maps spriteKey strings to Phaser texture metadata.
 *
 * Initialized in BootScene. For each known spriteKey, the registry either
 * reuses an existing atlas texture (hot-swap path for future hand-drawn art)
 * or generates a white canvas texture at the correct dimensions. White base
 * textures allow `Sprite.setTint(color)` to produce the same visual as the
 * old `Rectangle.setFillStyle(color)` — white × color = color.
 *
 * Downstream systems call `getSpriteRegistry().get(key)` and never know
 * which source provided the texture.
 *
 * NO React imports allowed — this is pure TypeScript.
 */

import type Phaser from "phaser";
import { getObjectDef, getAllObjectDefs } from "@/game/procgen/object-defs";
import { getEntitySpriteGenerator } from "./generators/entity-sprites";
import { getObjectSpriteGenerator } from "./generators/object-sprites";
import { getUiSpriteGenerator } from "./generators/ui-sprites";
import type { EntitySpriteGenerator } from "./generators/entity-sprites";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Metadata for a single sprite entry. */
export interface SpriteEntry {
  /** Phaser texture key to pass to `scene.add.sprite()`. */
  textureKey: string;
  /** Default frame index or name (undefined = use full texture). */
  defaultFrame?: string | number;
  /** Visual display width in pixels. */
  width: number;
  /** Visual display height in pixels. */
  height: number;
}

// ---------------------------------------------------------------------------
// Size constants (migrated from render-sync-system)
// ---------------------------------------------------------------------------

const PLAYER_VISUAL_SIZE = 24;
const BULLET_VISUAL_SIZE = 6;
const OBJECT_SIZE = 16;
const IMMOVABLE_OBJECT_SIZE = 32;

/**
 * Visual sizes per zombie variant sprite key.
 *
 * These are intentionally slightly smaller than the physics body sizes
 * (defined in VARIANT_STATS.bodySize) so that zombies don't visually
 * overlap when packed together. The physics body handles collision; the
 * visual sprite is purely cosmetic.
 */
const ZOMBIE_VISUAL_SIZES: Readonly<Record<string, number>> = {
  zombie: 20,
  zombie_runner: 18,
  zombie_brute: 28,
  zombie_horde: 12,
};

// ---------------------------------------------------------------------------
// Texture key prefix
// ---------------------------------------------------------------------------

/**
 * Prefix for registry-generated texture keys. Avoids collisions with
 * textures created elsewhere (e.g. "player" in boot-scene, "tileset").
 */
const TEX_PREFIX = "spr_";

// ---------------------------------------------------------------------------
// Known entity sprite keys (hard-coded manifest)
// ---------------------------------------------------------------------------

interface ManifestEntry {
  spriteKey: string;
  width: number;
  height: number;
}

function buildManifest(): ManifestEntry[] {
  const entries: ManifestEntry[] = [
    { spriteKey: "player", width: PLAYER_VISUAL_SIZE, height: PLAYER_VISUAL_SIZE },
    { spriteKey: "bullet", width: BULLET_VISUAL_SIZE, height: BULLET_VISUAL_SIZE },
  ];

  // Zombie variants
  for (const [key, size] of Object.entries(ZOMBIE_VISUAL_SIZES)) {
    entries.push({ spriteKey: key, width: size, height: size });
  }

  // All world object types from object-defs
  for (const def of getAllObjectDefs()) {
    const size = def.immovable ? IMMOVABLE_OBJECT_SIZE : OBJECT_SIZE;
    entries.push({ spriteKey: def.type, width: size, height: size });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Default fallback entry for unknown keys. */
const FALLBACK_ENTRY: SpriteEntry = {
  textureKey: `${TEX_PREFIX}__fallback`,
  width: PLAYER_VISUAL_SIZE,
  height: PLAYER_VISUAL_SIZE,
};

export class SpriteRegistry {
  private readonly entries = new Map<string, SpriteEntry>();
  private initialized = false;

  /**
   * Generate canvas textures for all known sprite keys.
   *
   * Call once in BootScene.create() before transitioning to LoadingScene.
   * Skips texture generation for keys that already have a loaded texture
   * (atlas hot-swap path).
   */
  initialize(scene: Phaser.Scene): void {
    if (this.initialized) return;

    const manifest = buildManifest();

    for (const { spriteKey, width, height } of manifest) {
      const textureKey = `${TEX_PREFIX}${spriteKey}`;

      // Hot-swap: if an atlas already provides this texture, skip generation
      if (!scene.textures.exists(textureKey)) {
        const generator = getEntitySpriteGenerator(spriteKey) ?? getObjectSpriteGenerator(spriteKey);
        if (generator) {
          this.generateEntityTexture(scene, textureKey, generator);
        } else {
          this.generateWhiteTexture(scene, textureKey, width, height);
        }
      }

      // For multi-frame generators, use per-frame dimensions and set defaultFrame
      const generator = getEntitySpriteGenerator(spriteKey) ?? getObjectSpriteGenerator(spriteKey);
      if (generator && generator.frameCount > 1) {
        this.entries.set(spriteKey, {
          textureKey,
          width: generator.frameWidth,
          height: generator.height,
          defaultFrame: 0,
        });
      } else {
        this.entries.set(spriteKey, { textureKey, width, height });
      }
    }

    // Generate 16×16 UI icon textures for inventory display
    for (const def of getAllObjectDefs()) {
      const uiKey = `ui_${def.type}`;
      const uiTextureKey = `${TEX_PREFIX}${uiKey}`;
      if (!scene.textures.exists(uiTextureKey)) {
        const uiGen = getUiSpriteGenerator(def.type);
        if (uiGen) {
          this.generateEntityTexture(scene, uiTextureKey, uiGen);
        } else {
          this.generateWhiteTexture(scene, uiTextureKey, 16, 16);
        }
      }
      this.entries.set(uiKey, { textureKey: uiTextureKey, width: 16, height: 16 });
    }

    // Generate fallback texture
    if (!scene.textures.exists(FALLBACK_ENTRY.textureKey)) {
      this.generateWhiteTexture(
        scene,
        FALLBACK_ENTRY.textureKey,
        FALLBACK_ENTRY.width,
        FALLBACK_ENTRY.height,
      );
    }

    this.initialized = true;
  }

  /**
   * Look up sprite metadata by spriteKey.
   *
   * Never returns undefined — falls back to a default entry for unknown keys.
   * For unknown world object keys not in the manifest, dynamically resolves
   * size from the object definition.
   */
  get(spriteKey: string): SpriteEntry {
    const existing = this.entries.get(spriteKey);
    if (existing) return existing;

    // Dynamic resolution for object types not in the pre-built manifest
    const def = getObjectDef(spriteKey);
    if (def) {
      const size = def.immovable ? IMMOVABLE_OBJECT_SIZE : OBJECT_SIZE;
      const entry: SpriteEntry = {
        textureKey: FALLBACK_ENTRY.textureKey,
        width: size,
        height: size,
      };
      // Cache for subsequent lookups
      this.entries.set(spriteKey, entry);
      return entry;
    }

    return FALLBACK_ENTRY;
  }

  /** Check whether the registry has been initialized. */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Generate a canvas texture using a custom entity sprite generator.
   *
   * For multi-frame sprites (e.g. player directional strip), defines
   * individual frame regions on the underlying Phaser Texture so
   * `sprite.setFrame(index)` works at runtime.
   */
  private generateEntityTexture(
    scene: Phaser.Scene,
    key: string,
    generator: EntitySpriteGenerator,
  ): void {
    const canvas = scene.textures.createCanvas(key, generator.width, generator.height);
    if (!canvas) {
      throw new Error(
        `[SpriteRegistry] Failed to create canvas texture "${key}" (${generator.width}x${generator.height})`,
      );
    }

    const ctx = canvas.getContext();
    generator.draw(ctx);
    canvas.refresh();

    // Define frame regions for multi-frame strips
    if (generator.frameCount > 1) {
      const tex = scene.textures.get(key);
      for (let i = 0; i < generator.frameCount; i++) {
        tex.add(i, 0, i * generator.frameWidth, 0, generator.frameWidth, generator.height);
      }
    }
  }

  /**
   * Generate a solid white canvas texture.
   *
   * White fill is critical: `Sprite.setTint(0x4ade80)` on a white
   * texture produces pure green, matching the old
   * `Rectangle.setFillStyle(0x4ade80)` output.
   */
  private generateWhiteTexture(
    scene: Phaser.Scene,
    key: string,
    width: number,
    height: number,
  ): void {
    const canvas = scene.textures.createCanvas(key, width, height);
    if (!canvas) {
      throw new Error(
        `[SpriteRegistry] Failed to create canvas texture "${key}" (${width}x${height})`,
      );
    }

    const ctx = canvas.getContext();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    canvas.refresh();
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton (mirrors setActiveBus / setActiveSeed pattern)
// ---------------------------------------------------------------------------

let _instance: SpriteRegistry | null = null;

/**
 * Initialize the global sprite registry. Call once from BootScene.
 *
 * Follows the same module-level singleton pattern used by
 * `setActiveBus()` and `setActiveSeed()` in PhaserGame.ts.
 */
export function initializeSpriteRegistry(scene: Phaser.Scene): SpriteRegistry {
  _instance = new SpriteRegistry();
  _instance.initialize(scene);
  return _instance;
}

/**
 * Retrieve the global sprite registry.
 *
 * @throws If the registry has not been initialized via `initializeSpriteRegistry()`.
 */
export function getSpriteRegistry(): SpriteRegistry {
  if (!_instance) {
    throw new Error(
      "SpriteRegistry not initialized. Call initializeSpriteRegistry() in BootScene first.",
    );
  }
  return _instance;
}

/**
 * Reset the global singleton (for testing).
 * @internal
 */
export function resetSpriteRegistry(): void {
  _instance = null;
}
