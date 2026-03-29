import type Phaser from "phaser";
import type { SystemFn } from "./system-runner";
import type { SceneContext } from "./scene-context";
import { playerEntities, renderableEntities, inventoryEntities } from "@/game/ecs/queries";
import type { Entity } from "@/game/ecs/entity";
import { getObjectDef } from "@/game/procgen/object-defs";

// ---------------------------------------------------------------------------
// Visual config
// ---------------------------------------------------------------------------

/** Colour map for sprite keys (temporary until real sprites exist). */
const SPRITE_COLOURS: Record<string, number> = {
  player: 0x4ade80, // green
  zombie: 0xef4444, // red
  barricade: 0x94a3b8, // slate
  bullet: 0xfacc15, // yellow
};

const FALLBACK_COLOUR = 0xffffff;

/** Player rectangle dimensions. */
const PLAYER_SIZE = 24;

/** Length of the aiming direction indicator line. */
const AIM_LINE_LENGTH = 32;

/** Size of the equipped item indicator square. */
const EQUIP_INDICATOR_SIZE = 8;

/** Offset from player centre for the equipped item indicator. */
const EQUIP_OFFSET_X = 10;
const EQUIP_OFFSET_Y = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function spriteColour(key: string): number {
  if (SPRITE_COLOURS[key] !== undefined) return SPRITE_COLOURS[key];
  // Fall back to object definition render colour
  const def = getObjectDef(key);
  if (def) return def.renderColor;
  return FALLBACK_COLOUR;
}

/** Size of world objects (immovable objects are full tile size). */
const OBJECT_SIZE = 16;
const IMMOVABLE_OBJECT_SIZE = 32;

function getVisualSize(key: string): number {
  if (key === "bullet") return 6;
  const def = getObjectDef(key);
  if (def) return def.immovable ? IMMOVABLE_OBJECT_SIZE : OBJECT_SIZE;
  return PLAYER_SIZE;
}

function createVisual(
  scene: Phaser.Scene,
  key: string,
  x: number,
  y: number,
): Phaser.GameObjects.Rectangle {
  const size = getVisualSize(key);
  return scene.add.rectangle(x, y, size, size, spriteColour(key));
}

// ---------------------------------------------------------------------------
// System factory
// ---------------------------------------------------------------------------

/**
 * Factory that returns a RenderSyncSystem.
 *
 * Runs once per render frame (not per fixed tick). For each Renderable
 * entity it lazily creates a Phaser Rectangle, then positions it using
 * linear interpolation between previousPosition and position based on
 * the GameLoop alpha.
 *
 * Also draws an aim-direction indicator line for the player entity and
 * wires Phaser camera follow on the first player sprite it creates.
 */
export function createRenderSyncSystem(ctx: SceneContext): SystemFn {
  /** Entity reference → Phaser visual. */
  const sprites = new Map<Entity, Phaser.GameObjects.Rectangle>();

  /** Aim indicator graphics object (created lazily). */
  let aimGfx: Phaser.GameObjects.Graphics | null = null;

  /** Equipped item indicator rectangle (created lazily). */
  let equipGfx: Phaser.GameObjects.Rectangle | null = null;

  /** Whether camera follow has been wired. */
  let cameraFollowWired = false;

  return (_dt: number): void => {
    const alpha = ctx.getAlpha();
    const { scene, inputState } = ctx;

    // --- Sync visuals ---
    for (const entity of renderableEntities) {
      let sprite = sprites.get(entity);

      if (!sprite) {
        // Lazy-create the Phaser visual
        sprite = createVisual(
          scene,
          entity.renderable.spriteKey,
          entity.position.x,
          entity.position.y,
        );
        sprites.set(entity, sprite);

        // Wire camera follow on first player sprite
        if (
          !cameraFollowWired &&
          entity.playerControlled !== undefined
        ) {
          const cam = scene.cameras.main;
          if (cam) {
            cam.startFollow(sprite, true, 0.08, 0.08);
            cameraFollowWired = true;
          }
        }
      }

      // Interpolate between previous and current physics positions
      const prev = entity.previousPosition ?? entity.position;
      const curr = entity.position;
      sprite.x = prev.x + (curr.x - prev.x) * alpha;
      sprite.y = prev.y + (curr.y - prev.y) * alpha;
    }

    // --- Clean up sprites for removed entities ---
    const activeEntities = new Set<Entity>(renderableEntities);
    for (const [entity, sprite] of sprites) {
      if (!activeEntities.has(entity)) {
        sprite.destroy();
        sprites.delete(entity);
      }
    }

    // --- Aim direction indicator ---
    const player = playerEntities.entities[0];
    if (player) {
      const playerSprite = sprites.get(player);
      if (playerSprite) {
        if (!aimGfx) {
          aimGfx = scene.add.graphics();
        }

        aimGfx.clear();
        aimGfx.lineStyle(2, 0xffffff, 0.7);

        const dx = inputState.aimX - playerSprite.x;
        const dy = inputState.aimY - playerSprite.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
          const nx = dx / dist;
          const ny = dy / dist;
          aimGfx.beginPath();
          aimGfx.moveTo(playerSprite.x, playerSprite.y);
          aimGfx.lineTo(
            playerSprite.x + nx * AIM_LINE_LENGTH,
            playerSprite.y + ny * AIM_LINE_LENGTH,
          );
          aimGfx.strokePath();
        }

        // --- Equipped item indicator ---
        const invPlayer = inventoryEntities.entities[0];
        if (invPlayer) {
          const inv = invPlayer.inventory;
          const activeSlot =
            inv.activeSlot >= 0 ? inv.slots[inv.activeSlot] : null;

          if (activeSlot && activeSlot.primary) {
            const itemDef = getObjectDef(activeSlot.objectType);
            const color = itemDef?.renderColor ?? FALLBACK_COLOUR;

            if (!equipGfx) {
              equipGfx = scene.add.rectangle(
                0,
                0,
                EQUIP_INDICATOR_SIZE,
                EQUIP_INDICATOR_SIZE,
                color,
              );
              equipGfx.setDepth(Number.MAX_SAFE_INTEGER - 1);
            }

            equipGfx.setFillStyle(color);
            equipGfx.setPosition(
              playerSprite.x + EQUIP_OFFSET_X,
              playerSprite.y + EQUIP_OFFSET_Y,
            );
            equipGfx.setVisible(true);
          } else if (equipGfx) {
            equipGfx.setVisible(false);
          }
        }
      }
    }
  };
}
