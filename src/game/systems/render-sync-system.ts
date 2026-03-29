import type Phaser from "phaser";
import type { SystemFn } from "./system-runner";
import type { SceneContext } from "./scene-context";
import { playerEntities, renderableEntities, inventoryEntities, barricadeEntities, combatPlayerEntities } from "@/game/ecs/queries";
import type { Entity } from "@/game/ecs/entity";
import { getObjectDef } from "@/game/procgen/object-defs";
import type { BarricadeSnapEvent, DamageDealtEvent, MeleeSwingEvent } from "@/game/events/event-bus";
import { COMBAT } from "./combat-constants";

// ---------------------------------------------------------------------------
// Visual config
// ---------------------------------------------------------------------------

/** Colour map for sprite keys (temporary until real sprites exist). */
const SPRITE_COLOURS: Record<string, number> = {
  player: 0x4ade80,       // green
  zombie: 0xef4444,       // red (shambler)
  zombie_runner: 0xf97316, // orange
  zombie_brute: 0x7c3aed, // purple
  zombie_horde: 0xa3e635, // lime green
  barricade: 0x94a3b8,    // slate
  bullet: 0xfacc15,       // yellow
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

/** Barricade health bar fill colours by HP fraction tier. */
const HEALTH_COLOR_GOOD = 0x4ade80;    // green
const HEALTH_COLOR_WARNING = 0xf59e0b; // amber
const HEALTH_COLOR_DANGER = 0xef4444;  // red
const HEALTH_BG_COLOR = 0x1a1a2e;      // dark background

/** Barricade damage tint colours by HP fraction tier. */
const BARRICADE_TINT_GOOD = 0x94a3b8;    // slate (default barricade colour)
const BARRICADE_TINT_WARNING = 0xf59e0b; // amber
const BARRICADE_TINT_DANGER = 0xef4444;  // red

/** Snap indicator colour and opacity. */
const SNAP_COLOR = 0x60a5fa;           // blue-400
const SNAP_ALPHA = 0.35;
const SNAP_RECT_SIZE = 36;

/** Distance from player at which barricade health bars are visible. */
const BARRICADE_VIEW_RANGE_SQ = 96 * 96;

// --- Combat visual config ---

/** Colour for the melee swing arc indicator. */
const SWING_ARC_COLOUR = 0xffffff;
const SWING_ARC_ALPHA = 0.8;
const SWING_ARC_LINE_WIDTH = 3;

/** Damage number text style. */
const DAMAGE_TEXT_COLOUR = "#ef4444"; // red
const DAMAGE_TEXT_FONT_SIZE = "14px";

/** How long damage numbers float before being destroyed (seconds). */
const DAMAGE_TEXT_LIFETIME = 0.8;

/** Upward drift speed for damage numbers (pixels/second). */
const DAMAGE_TEXT_DRIFT = 30;

/** How long the zombie death flash lasts (seconds). */
const DEATH_FLASH_DURATION = 0.12;

/** I-frame flicker rate (oscillations per second). */
const IFRAME_FLICKER_RATE = 20;

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

/**
 * Visual sizes per zombie variant sprite key.
 *
 * These are intentionally slightly smaller than the physics body sizes
 * (defined in VARIANT_STATS.bodySize) so that zombies don't visually
 * overlap when packed together. The physics body handles collision; the
 * visual rectangle is purely cosmetic.
 *   shambler: physics 20, visual 20  (baseline)
 *   runner:   physics 20, visual 18  (appears nimble)
 *   brute:    physics 28, visual 28  (looms large)
 *   horde:    physics 14, visual 12  (swarm of tiny dots)
 */
const ZOMBIE_VISUAL_SIZES: Record<string, number> = {
  zombie: 20,
  zombie_runner: 18,
  zombie_brute: 28,
  zombie_horde: 12,
};

function getVisualSize(key: string): number {
  if (key === "bullet") return 6;
  if (ZOMBIE_VISUAL_SIZES[key] !== undefined) return ZOMBIE_VISUAL_SIZES[key];
  const def = getObjectDef(key);
  if (def) return def.immovable ? IMMOVABLE_OBJECT_SIZE : OBJECT_SIZE;
  return PLAYER_SIZE;
}

/** Pick a colour from a three-tier palette based on HP fraction. */
function colorByHpTier(
  hpFraction: number,
  good: number,
  warning: number,
  danger: number,
): number {
  if (hpFraction <= 0.33) return danger;
  if (hpFraction <= 0.66) return warning;
  return good;
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

  // --- Combat visual state ---

  /** Swing arc graphics (created lazily). */
  let swingGfx: Phaser.GameObjects.Graphics | null = null;

  /** Active swing arc for visual rendering. */
  let activeSwing: { x: number; y: number; angle: number; range: number; age: number } | null = null;

  // Listen for melee-swing events
  ctx.eventBus.on("melee-swing", (e: MeleeSwingEvent) => {
    activeSwing = { x: e.position.x, y: e.position.y, angle: e.aimAngle, range: e.range, age: 0 };
  });

  /** Floating damage numbers. */
  const damageTexts: Array<{
    text: Phaser.GameObjects.Text;
    age: number;
  }> = [];

  // Listen for damage-dealt events
  ctx.eventBus.on("damage-dealt", (e: DamageDealtEvent) => {
    const text = ctx.scene.add
      .text(e.position.x, e.position.y - 16, String(Math.round(e.damage)), {
        fontFamily: "monospace",
        fontSize: DAMAGE_TEXT_FONT_SIZE,
        color: DAMAGE_TEXT_COLOUR,
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(Number.MAX_SAFE_INTEGER);
    damageTexts.push({ text, age: 0 });
  });

  /**
   * Zombie death flash tracking.
   * Maps entity reference → remaining flash time.
   * We tint the sprite white briefly before the entity is removed.
   */
  const deathFlashes = new Map<Entity, number>();

  // Listen for zombie-killed events to trigger death flash
  ctx.eventBus.on("zombie-killed", (e) => {
    // Find the zombie entity at the death position
    // (entity may still exist this frame before deferred removal)
    for (const entity of renderableEntities) {
      if (
        entity.aiState?.state === "dead" &&
        Math.abs(entity.position.x - e.position.x) < 1 &&
        Math.abs(entity.position.y - e.position.y) < 1
      ) {
        deathFlashes.set(entity, DEATH_FLASH_DURATION);
        break;
      }
    }
  });

  /** Total elapsed time for i-frame flicker calculation. */
  let totalElapsed = 0;

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
        const hpFraction =
          entity.health.max > 0
            ? entity.health.current / entity.health.max
            : 0;

        // Apply damage tint to the sprite
        const sprite = sprites.get(entity);
        if (sprite) {
          sprite.setFillStyle(
            colorByHpTier(hpFraction, BARRICADE_TINT_GOOD, BARRICADE_TINT_WARNING, BARRICADE_TINT_DANGER),
          );
        }

        // Only show health bars if player is close enough
        const dx = psx - ex;
        const dy = psy - ey;
        if (dx * dx + dy * dy > BARRICADE_VIEW_RANGE_SQ) continue;

        // Background bar
        const barX = ex - HEALTH_BAR_WIDTH / 2;
        const barY = ey + HEALTH_BAR_OFFSET_Y;
        barricadeGfx.fillStyle(HEALTH_BG_COLOR, 0.8);
        barricadeGfx.fillRect(barX, barY, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);

        // Fill bar
        const fillColor = colorByHpTier(hpFraction, HEALTH_COLOR_GOOD, HEALTH_COLOR_WARNING, HEALTH_COLOR_DANGER);
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

    // --- Combat visuals ---
    totalElapsed += _dt;

    // Melee swing arc
    if (activeSwing) {
      if (!swingGfx) {
        swingGfx = scene.add.graphics();
        swingGfx.setDepth(Number.MAX_SAFE_INTEGER - 4);
      }
      swingGfx.clear();

      activeSwing.age += _dt;
      const swingFraction = Math.min(activeSwing.age / COMBAT.SWING_DURATION, 1);

      if (swingFraction < 1) {
        const fadeAlpha = SWING_ARC_ALPHA * (1 - swingFraction);
        swingGfx.lineStyle(SWING_ARC_LINE_WIDTH, SWING_ARC_COLOUR, fadeAlpha);

        // Draw a short arc line from the player position in the aim direction
        const playerSpr = player ? sprites.get(player) : null;
        const originX = playerSpr?.x ?? activeSwing.x;
        const originY = playerSpr?.y ?? activeSwing.y;
        const arcSpread = 0.6; // radians (~35 degrees each side)

        swingGfx.beginPath();
        const startAngle = activeSwing.angle - arcSpread;
        const endAngle = activeSwing.angle + arcSpread;
        const steps = 8;
        for (let i = 0; i <= steps; i++) {
          const a = startAngle + (endAngle - startAngle) * (i / steps);
          const px = originX + Math.cos(a) * activeSwing.range;
          const py = originY + Math.sin(a) * activeSwing.range;
          if (i === 0) {
            swingGfx.moveTo(px, py);
          } else {
            swingGfx.lineTo(px, py);
          }
        }
        swingGfx.strokePath();
      } else {
        activeSwing = null;
      }
    } else if (swingGfx) {
      swingGfx.clear();
    }

    // Floating damage numbers
    for (let i = damageTexts.length - 1; i >= 0; i--) {
      const dt = damageTexts[i];
      dt.age += _dt;
      dt.text.y -= DAMAGE_TEXT_DRIFT * _dt;
      dt.text.setAlpha(1 - dt.age / DAMAGE_TEXT_LIFETIME);

      if (dt.age >= DAMAGE_TEXT_LIFETIME) {
        dt.text.destroy();
        damageTexts.splice(i, 1);
      }
    }

    // Player i-frame flicker
    const combatPlayer = combatPlayerEntities.entities[0];
    if (combatPlayer && combatPlayer.combatState.iFramesRemaining > 0) {
      const playerSprite = sprites.get(combatPlayer);
      if (playerSprite) {
        const flicker = Math.floor(totalElapsed * IFRAME_FLICKER_RATE) % 2;
        playerSprite.setAlpha(flicker === 0 ? 0.3 : 1.0);
      }
    } else if (combatPlayer) {
      const playerSprite = sprites.get(combatPlayer);
      if (playerSprite && playerSprite.alpha < 1) {
        playerSprite.setAlpha(1.0);
      }
    }

    // Zombie death flash (tint white briefly before removal)
    for (const [entity, timeLeft] of deathFlashes) {
      const sprite = sprites.get(entity);
      if (sprite) {
        sprite.setFillStyle(0xffffff);
      }
      const remaining = timeLeft - _dt;
      if (remaining <= 0) {
        deathFlashes.delete(entity);
      } else {
        deathFlashes.set(entity, remaining);
      }
    }
  };
}
