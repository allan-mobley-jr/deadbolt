import type Phaser from "phaser";
import type { SystemFn } from "./system-runner";
import type { SceneContext } from "./scene-context";
import { playerEntities, renderableEntities, inventoryEntities, barricadeEntities, combatPlayerEntities } from "@/game/ecs/queries";
import type { Entity } from "@/game/ecs/entity";
import { getObjectDef } from "@/game/procgen/object-defs";
import type { BarricadeSnapEvent, DamageDealtEvent, MeleeSwingEvent, FireDamageEvent, ElectricityDamageEvent } from "@/game/events/event-bus";
import { COMBAT } from "./combat-constants";
import { FIRE } from "./fire-constants";
import { ELECTRICITY } from "./electricity-constants";
import { PALETTE, resolveColor, colorByHpTier } from "@/game/rendering/palette";
import type { SpriteRegistry } from "@/game/rendering/sprite-registry";
import { PLAYER_ANIMS, ZOMBIE_ANIMS, DIRECTION_SUFFIXES, ANIM_FPS, getZombieWalkFps } from "@/game/rendering/animation-constants";
import type { AnimDef } from "@/game/rendering/animation-constants";

// ---------------------------------------------------------------------------
// Visual config
// ---------------------------------------------------------------------------

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

/** Snap indicator opacity and size. */
const SNAP_ALPHA = 0.35;
const SNAP_RECT_SIZE = 36;

/** Distance from player at which barricade health bars are visible. */
const BARRICADE_VIEW_RANGE_SQ = 96 * 96;

// --- Combat visual config ---

/** Melee swing arc visual properties. */
const SWING_ARC_ALPHA = 0.8;
const SWING_ARC_LINE_WIDTH = 3;

/** Damage number visual properties. */
const DAMAGE_TEXT_FONT_SIZE = "14px";

/** How long damage numbers float before being destroyed (seconds). */
const DAMAGE_TEXT_LIFETIME = 0.8;

/** Upward drift speed for damage numbers (pixels/second). */
const DAMAGE_TEXT_DRIFT = 30;

/** How long the zombie death flash lasts (seconds). */
const DEATH_FLASH_DURATION = 0.12;

/** I-frame flicker rate (oscillations per second). */
const IFRAME_FLICKER_RATE = 20;

/** Arc spread for swing visual (radians, ~35 degrees each side). */
const SWING_ARC_SPREAD = 0.6;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Blend a base colour toward a target colour using a sinusoidal pulse.
 *
 * The pulse factor oscillates as `center + amplitude * sin(elapsed * rate * 2pi)`.
 *
 * @param baseColor   - Starting RGB colour (hex integer).
 * @param targetColor - Colour to blend toward (hex integer).
 * @param elapsed     - Total elapsed time in seconds.
 * @param rate        - Oscillation frequency (cycles per second).
 * @param center      - Midpoint of the blend factor oscillation.
 * @param amplitude   - Half-range of the oscillation around the center.
 */
function blendTint(
  baseColor: number,
  targetColor: number,
  elapsed: number,
  rate: number,
  center: number,
  amplitude: number,
): number {
  const pulse = center + amplitude * Math.sin(elapsed * rate * Math.PI * 2);
  const br = (baseColor >> 16) & 0xff;
  const bg = (baseColor >> 8) & 0xff;
  const bb = baseColor & 0xff;
  const tr = (targetColor >> 16) & 0xff;
  const tg = (targetColor >> 8) & 0xff;
  const tb = targetColor & 0xff;
  const r = Math.round(br + (tr - br) * pulse);
  const g = Math.round(bg + (tg - bg) * pulse);
  const b = Math.round(bb + (tb - bb) * pulse);
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

/** Blend a base colour toward the fire tint based on elapsed time. */
function blendWithFireTint(baseColor: number, elapsed: number): number {
  return blendTint(baseColor, FIRE.BURN_TINT_COLOR, elapsed, FIRE.BURN_TINT_PULSE_RATE, 0.6, 0.4);
}

/** Blend a base colour toward the electric tint based on elapsed time. */
function blendWithElectricTint(baseColor: number, elapsed: number): number {
  return blendTint(baseColor, ELECTRICITY.ELECTRIFIED_TINT_COLOR, elapsed, ELECTRICITY.ELECTRIFIED_TINT_PULSE_RATE, 0.5, 0.5);
}

/** Quantise an angle (radians) to a 4-direction frame index: S=0, E=1, N=2, W=3. */
function angleToDirectionFrame(angle: number): number {
  // In screen coords: +Y is down.
  //   East:  angle in [-π/4, π/4)
  //   South: angle in [π/4, 3π/4)
  //   North: angle in [-3π/4, -π/4)
  //   West:  everything else (|angle| >= 3π/4)
  if (angle >= -Math.PI / 4 && angle < Math.PI / 4) return 1; // East
  if (angle >= Math.PI / 4 && angle < (3 * Math.PI) / 4) return 0; // South
  if (angle >= -(3 * Math.PI) / 4 && angle < -Math.PI / 4) return 2; // North
  return 3; // West
}

function createVisual(
  scene: Phaser.Scene,
  registry: SpriteRegistry,
  key: string,
  x: number,
  y: number,
): Phaser.GameObjects.Sprite {
  const entry = registry.get(key);
  const sprite = scene.add.sprite(x, y, entry.textureKey);
  if (entry.defaultFrame !== undefined) {
    sprite.setFrame(entry.defaultFrame);
  }
  sprite.setDisplaySize(entry.width, entry.height);
  sprite.setTint(resolveColor(key));
  return sprite;
}

// ---------------------------------------------------------------------------
// System factory
// ---------------------------------------------------------------------------

/**
 * Factory that returns a RenderSyncSystem.
 *
 * Runs once per render frame (not per fixed tick). For each Renderable
 * entity it lazily creates a Phaser Sprite, then positions it using
 * linear interpolation between previousPosition and position based on
 * the GameLoop alpha.
 *
 * Also draws an aim-direction indicator line for the player entity and
 * wires Phaser camera follow on the first player sprite it creates.
 */
export function createRenderSyncSystem(ctx: SceneContext, registry: SpriteRegistry): SystemFn {
  /** Entity reference → Phaser visual. */
  const sprites = new Map<Entity, Phaser.GameObjects.Sprite>();

  /** Aim indicator graphics object (created lazily). */
  let aimGfx: Phaser.GameObjects.Graphics | null = null;

  /** Equipped item indicator rectangle (created lazily). */
  let equipGfx: Phaser.GameObjects.Rectangle | null = null;

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

  // --- Accessibility settings ---
  let colorBlindMode = false;
  let highContrastMode = false;

  /** Graphics overlays for color-blind shape indicators and high-contrast borders. */
  const shapeOverlays = new Map<Entity, Phaser.GameObjects.Graphics>();

  ctx.eventBus.on("cmd:settings-changed", (e) => {
    if (e.key === "colorBlindMode" && typeof e.value === "boolean") {
      const wasOn = colorBlindMode;
      colorBlindMode = e.value;
      // Destroy overlays on toggle-off so stale shapes don't persist.
      // If highContrastMode is still active, its per-entity block will
      // lazily recreate the needed Graphics on the next render tick.
      if (wasOn && !e.value) {
        for (const gfx of shapeOverlays.values()) gfx.destroy();
        shapeOverlays.clear();
      }
    }
    if (e.key === "highContrast" && typeof e.value === "boolean") {
      const wasOn = highContrastMode;
      highContrastMode = e.value;
      // Destroy overlays on toggle-off so stale border rects don't persist.
      // If colorBlindMode is still active, its per-entity block will
      // lazily recreate the needed Graphics on the next render tick.
      if (wasOn && !e.value) {
        for (const gfx of shapeOverlays.values()) gfx.destroy();
        shapeOverlays.clear();
      }
    }
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

  /** Spawn a floating damage number at a world position. */
  function spawnDamageText(
    x: number,
    y: number,
    damage: number,
    color: string,
  ): void {
    const text = ctx.scene.add
      .text(x, y - 16, String(Math.round(damage)), {
        fontFamily: "monospace",
        fontSize: DAMAGE_TEXT_FONT_SIZE,
        color,
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(Number.MAX_SAFE_INTEGER);
    damageTexts.push({ text, age: 0 });
  }

  // Listen for damage-dealt events
  ctx.eventBus.on("damage-dealt", (e: DamageDealtEvent) => {
    spawnDamageText(e.position.x, e.position.y, e.damage, PALETTE.damageText.melee);
  });

  // Listen for fire-damage events (orange floating numbers)
  ctx.eventBus.on("fire-damage", (e: FireDamageEvent) => {
    spawnDamageText(e.position.x, e.position.y, e.damage, PALETTE.damageText.fire);
  });

  // Listen for electricity-damage events (blue floating numbers)
  ctx.eventBus.on("electricity-damage", (e: ElectricityDamageEvent) => {
    spawnDamageText(e.position.x, e.position.y, e.damage, PALETTE.damageText.electricity);
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

  // --- Animation state tracking ---
  interface AnimState {
    anim: string;
    frame: number;
    elapsed: number;
    fps: number;
  }

  const animStates = new Map<Entity, AnimState>();

  function setAnim(entity: Entity, animName: string, fps: number): void {
    const current = animStates.get(entity);
    if (current && current.anim === animName) return;
    animStates.set(entity, { anim: animName, frame: 0, elapsed: 0, fps });
  }

  function advanceAnim(entity: Entity, dt: number, animDefs: Readonly<Record<string, AnimDef>>): number {
    const state = animStates.get(entity);
    if (!state) return 0;
    const def = animDefs[state.anim];
    if (!def || def.frames.length <= 1) return def?.frames[0] ?? 0;

    state.elapsed += dt;
    const frameDuration = 1 / state.fps;
    while (state.elapsed >= frameDuration) {
      state.elapsed -= frameDuration;
      state.frame++;
      if (state.frame >= def.frames.length) {
        state.frame = def.loop ? 0 : def.frames.length - 1;
      }
    }
    return def.frames[state.frame];
  }

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
          registry,
          entity.renderable.spriteKey,
          entity.position.x,
          entity.position.y,
        );
        sprites.set(entity, sprite);

      }

      // Interpolate between previous and current physics positions
      const prev = entity.previousPosition ?? entity.position;
      const curr = entity.position;
      sprite.x = prev.x + (curr.x - prev.x) * alpha;
      sprite.y = prev.y + (curr.y - prev.y) * alpha;

      // Material state tints on non-barricade entities.
      // Barricade tints are handled separately in the barricade health section.
      // Burning takes visual priority over electrified.
      if (entity.material?.state === "burning" && !entity.barricade) {
        sprite.setTint(
          blendWithFireTint(resolveColor(entity.renderable.spriteKey), totalElapsed),
        );
      } else if (entity.material?.state === "electrified" && !entity.barricade) {
        sprite.setTint(
          blendWithElectricTint(resolveColor(entity.renderable.spriteKey), totalElapsed),
        );
      } else if (entity.material && !entity.barricade) {
        // Reset to the base sprite colour when not burning or electrified.
        sprite.setTint(resolveColor(entity.renderable.spriteKey));
      }

      // --- Zombie animation ---
      if (entity.aiState && entity.zombieType) {
        let zombieAnim: string;
        switch (entity.aiState.state) {
          case "attacking": zombieAnim = "attack"; break;
          case "staggered": zombieAnim = "stagger"; break;
          case "pathing":   zombieAnim = "walk"; break;
          default:          zombieAnim = "idle";
        }
        const fps = getZombieWalkFps(entity.zombieType.variant);
        setAnim(entity, zombieAnim, fps);
        const zFrame = advanceAnim(entity, _dt, ZOMBIE_ANIMS);
        sprite.setFrame(zFrame);
      }

      // --- Color-blind mode: shape indicators on zombie sprites ---
      if (colorBlindMode && entity.zombieType) {
        let gfx = shapeOverlays.get(entity);
        if (!gfx) {
          gfx = scene.add.graphics();
          shapeOverlays.set(entity, gfx);
        }
        gfx.clear();
        gfx.setPosition(sprite.x, sprite.y);

        // Draw distinctive shape per variant
        const variant = entity.zombieType.variant;
        gfx.lineStyle(2, 0xffffff, 0.9);
        switch (variant) {
          case "shambler":
            // Circle
            gfx.strokeCircle(0, 0, 6);
            break;
          case "runner":
            // Triangle (chevron)
            gfx.strokeTriangle(-5, 4, 0, -5, 5, 4);
            break;
          case "brute":
            // X cross
            gfx.lineBetween(-5, -5, 5, 5);
            gfx.lineBetween(-5, 5, 5, -5);
            break;
          case "horde":
            // Dot
            gfx.fillStyle(0xffffff, 0.9);
            gfx.fillCircle(0, 0, 3);
            break;
        }
      }

      // --- High contrast: Graphics overlay for entity borders ---
      if (highContrastMode) {
        let gfx = shapeOverlays.get(entity);
        if (!gfx) {
          gfx = scene.add.graphics();
          shapeOverlays.set(entity, gfx);
        }
        // If color-blind mode is not active, we need to clear first;
        // if it IS active, the clear + shape already happened above
        // and we append the border to the same graphics.
        if (!colorBlindMode || !entity.zombieType) {
          gfx.clear();
          gfx.setPosition(sprite.x, sprite.y);
        }
        const entry = registry.get(entity.renderable.spriteKey);
        const hw = entry.width / 2;
        const hh = entry.height / 2;
        if (entity.interactable?.highlighted) {
          const pulse = 0.5 + 0.5 * Math.sin(totalElapsed * 4);
          gfx.lineStyle(2, PALETTE.ui.highContrastBorder, pulse);
        } else {
          gfx.lineStyle(1, PALETTE.ui.highContrastBorder, 0.8);
        }
        gfx.strokeRect(-hw, -hh, entry.width, entry.height);
      }
    }

    // --- Clean up sprites for removed entities ---
    // Skip entities with active death flashes so the flash can render
    const activeEntities = new Set<Entity>(renderableEntities);
    for (const [entity, sprite] of sprites) {
      if (!activeEntities.has(entity) && !deathFlashes.has(entity)) {
        sprite.destroy();
        sprites.delete(entity);
        animStates.delete(entity);
        // Also clean up color-blind shape overlays
        const overlay = shapeOverlays.get(entity);
        if (overlay) {
          overlay.destroy();
          shapeOverlays.delete(entity);
        }
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
        const aimWidth = highContrastMode ? 3 : 2;
        const aimAlpha = highContrastMode ? 1.0 : 0.7;
        aimGfx.lineStyle(aimWidth, PALETTE.ui.aim, aimAlpha);

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

          // Update player sprite direction and animation based on aim angle
          const aimAngle = Math.atan2(dy, dx);
          const dirIndex = angleToDirectionFrame(aimAngle);
          const dirSuffix = DIRECTION_SUFFIXES[dirIndex];

          // Determine player animation from ECS state
          const cp = combatPlayerEntities.entities[0];
          const isAttacking = cp && cp.combatState.swingTimeRemaining > 0;
          const vel = player.velocity;
          const speedSq = vel ? vel.vx * vel.vx + vel.vy * vel.vy : 0;

          let playerAnim: string;
          if (isAttacking) {
            playerAnim = `attack_${dirSuffix}`;
          } else if (speedSq > 1) {
            playerAnim = `walk_${dirSuffix}`;
          } else {
            playerAnim = `idle_${dirSuffix}`;
          }

          setAnim(player, playerAnim, ANIM_FPS.PLAYER_WALK);
          const globalFrame = advanceAnim(player, _dt, PLAYER_ANIMS);
          playerSprite.setFrame(globalFrame);
        }

        // --- Equipped item indicator ---
        const invPlayer = inventoryEntities.entities[0];
        if (invPlayer) {
          const inv = invPlayer.inventory;
          const activeSlot =
            inv.activeSlot >= 0 ? inv.slots[inv.activeSlot] : null;

          if (activeSlot && activeSlot.primary) {
            const itemDef = getObjectDef(activeSlot.objectType);
            const color = itemDef?.renderColor ?? PALETTE.sprite.fallback;

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

        // Apply damage tint to the sprite (burning overrides damage colour)
        const sprite = sprites.get(entity);
        if (sprite) {
          const baseTint = colorByHpTier(hpFraction, PALETTE.barricadeTint.good, PALETTE.barricadeTint.warning, PALETTE.barricadeTint.danger);
          if (entity.material?.state === "burning") {
            sprite.setTint(blendWithFireTint(baseTint, totalElapsed));
          } else if (entity.material?.state === "electrified") {
            sprite.setTint(blendWithElectricTint(baseTint, totalElapsed));
          } else {
            sprite.setTint(baseTint);
          }
        }

        // Only show health bars if player is close enough
        const dx = psx - ex;
        const dy = psy - ey;
        if (dx * dx + dy * dy > BARRICADE_VIEW_RANGE_SQ) continue;

        // Background bar
        const barX = ex - HEALTH_BAR_WIDTH / 2;
        const barY = ey + HEALTH_BAR_OFFSET_Y;
        barricadeGfx.fillStyle(PALETTE.healthBar.bg, 0.8);
        barricadeGfx.fillRect(barX, barY, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);

        // Fill bar
        const fillColor = colorByHpTier(hpFraction, PALETTE.healthBar.good, PALETTE.healthBar.warning, PALETTE.healthBar.danger);
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
          PALETTE.ui.snap,
          SNAP_ALPHA,
        );
        snapGfx.setStrokeStyle(2, PALETTE.ui.snap, 0.8);
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
        swingGfx.lineStyle(SWING_ARC_LINE_WIDTH, PALETTE.ui.swingArc, fadeAlpha);

        // Draw a short arc line from the player position in the aim direction
        const playerSpr = player ? sprites.get(player) : null;
        const originX = playerSpr?.x ?? activeSwing.x;
        const originY = playerSpr?.y ?? activeSwing.y;
        swingGfx.beginPath();
        const startAngle = activeSwing.angle - SWING_ARC_SPREAD;
        const endAngle = activeSwing.angle + SWING_ARC_SPREAD;
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
      const entry = damageTexts[i];
      entry.age += _dt;
      entry.text.y -= DAMAGE_TEXT_DRIFT * _dt;
      entry.text.setAlpha(1 - entry.age / DAMAGE_TEXT_LIFETIME);

      if (entry.age >= DAMAGE_TEXT_LIFETIME) {
        entry.text.destroy();
        damageTexts.splice(i, 1);
      }
    }

    // Player i-frame flicker
    const combatPlayer = combatPlayerEntities.entities[0];
    if (combatPlayer) {
      const playerSprite = sprites.get(combatPlayer);
      if (playerSprite) {
        if (combatPlayer.combatState.iFramesRemaining > 0) {
          const flicker = Math.floor(totalElapsed * IFRAME_FLICKER_RATE) % 2;
          playerSprite.setAlpha(flicker === 0 ? 0.3 : 1.0);
        } else if (playerSprite.alpha < 1) {
          playerSprite.setAlpha(1.0);
        }
      }
    }

    // Zombie death flash (tint white briefly before removal)
    for (const [entity, timeLeft] of deathFlashes) {
      const sprite = sprites.get(entity);
      if (sprite) {
        sprite.setTint(0xffffff);
      }
      const remaining = timeLeft - _dt;
      if (remaining <= 0) {
        deathFlashes.delete(entity);
        animStates.delete(entity);
        // Sprite was preserved past entity removal for the flash — destroy it now
        if (sprite) {
          sprite.destroy();
          sprites.delete(entity);
        }
      } else {
        deathFlashes.set(entity, remaining);
      }
    }
  };
}
