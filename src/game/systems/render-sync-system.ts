import type Phaser from "phaser";
import type { SystemFn } from "./system-runner";
import type { SceneContext } from "./scene-context";
import { playerEntities, renderableEntities, inventoryEntities, barricadeEntities } from "@/game/ecs/queries";
import type { Entity } from "@/game/ecs/entity";
import { getObjectDef } from "@/game/procgen/object-defs";
import type { BarricadeSnapEvent } from "@/game/events/event-bus";

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

/** Barricade health bar dimensions. */
const HEALTH_BAR_WIDTH = 28;
const HEALTH_BAR_HEIGHT = 4;
const HEALTH_BAR_OFFSET_Y = -20;

/** Barricade health bar colours by HP fraction tier. */
const HEALTH_COLOR_GOOD = 0x4ade80;    // green
const HEALTH_COLOR_WARNING = 0xf59e0b; // amber
const HEALTH_COLOR_DANGER = 0xef4444;  // red
const HEALTH_BG_COLOR = 0x1a1a2e;      // dark background

/** Snap indicator colour and opacity. */
const SNAP_COLOR = 0x60a5fa;           // blue-400
const SNAP_ALPHA = 0.35;
const SNAP_RECT_SIZE = 36;

/** Distance from player at which barricade health bars are visible. */
const BARRICADE_VIEW_RANGE_SQ = 96 * 96;

/** Barricade damage tint colours by HP fraction tier. */
const BARRICADE_TINT_GOOD = 0x94a3b8;    // slate (default barricade colour)
const BARRICADE_TINT_WARNING = 0xf59e0b; // amber
const BARRICADE_TINT_DANGER = 0xef4444;  // red

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

  /** Barricade health bar graphics (created lazily). */
  let barricadeGfx: Phaser.GameObjects.Graphics | null = null;

  /** Snap indicator rectangle (created lazily, toggled by events). */
  let snapGfx: Phaser.GameObjects.Rectangle | null = null;

  /** Current snap state from barricade-snap events. */
  let snapState: BarricadeSnapEvent | null = null;

  // Listen for snap events from the barricade system
  ctx.eventBus.on("barricade-snap", (e: BarricadeSnapEvent) => {
    snapState = e.snapping ? e : null;
  });

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

    // --- Barricade visual feedback ---

    // Health bars above barricades within view range of the player
    if (player) {
      if (!barricadeGfx) {
        barricadeGfx = scene.add.graphics();
        barricadeGfx.setDepth(Number.MAX_SAFE_INTEGER - 2);
      }

      barricadeGfx.clear();

      const psx = player.position.x;
      const psy = player.position.y;

      for (const entity of barricadeEntities) {
        const ex = entity.position.x;
        const ey = entity.position.y;

        // Apply damage tint to the sprite
        const sprite = sprites.get(entity);
        if (sprite) {
          const hpFraction =
            entity.health.max > 0
              ? entity.health.current / entity.health.max
              : 0;

          let tint = BARRICADE_TINT_GOOD;
          if (hpFraction <= 0.33) tint = BARRICADE_TINT_DANGER;
          else if (hpFraction <= 0.66) tint = BARRICADE_TINT_WARNING;

          sprite.setFillStyle(tint);
        }

        // Only show health bars if player is close enough
        const dx = psx - ex;
        const dy = psy - ey;
        if (dx * dx + dy * dy > BARRICADE_VIEW_RANGE_SQ) continue;

        const hpFraction =
          entity.health.max > 0
            ? entity.health.current / entity.health.max
            : 0;

        // Background bar
        const barX = ex - HEALTH_BAR_WIDTH / 2;
        const barY = ey + HEALTH_BAR_OFFSET_Y;
        barricadeGfx.fillStyle(HEALTH_BG_COLOR, 0.8);
        barricadeGfx.fillRect(barX, barY, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);

        // Fill bar
        let fillColor = HEALTH_COLOR_GOOD;
        if (hpFraction <= 0.33) fillColor = HEALTH_COLOR_DANGER;
        else if (hpFraction <= 0.66) fillColor = HEALTH_COLOR_WARNING;

        barricadeGfx.fillStyle(fillColor, 1.0);
        barricadeGfx.fillRect(
          barX,
          barY,
          HEALTH_BAR_WIDTH * Math.max(0, hpFraction),
          HEALTH_BAR_HEIGHT,
        );
      }
    }

    // --- Snap zone indicator ---
    if (snapState) {
      if (!snapGfx) {
        snapGfx = scene.add.rectangle(
          0,
          0,
          SNAP_RECT_SIZE,
          SNAP_RECT_SIZE,
          SNAP_COLOR,
          SNAP_ALPHA,
        );
        snapGfx.setStrokeStyle(2, SNAP_COLOR, 0.8);
        snapGfx.setDepth(Number.MAX_SAFE_INTEGER - 3);
      }
      snapGfx.setPosition(snapState.snapCenter.x, snapState.snapCenter.y);
      snapGfx.setVisible(true);
    } else if (snapGfx) {
      snapGfx.setVisible(false);
    }
  };
}
