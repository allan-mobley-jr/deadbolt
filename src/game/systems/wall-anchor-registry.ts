/**
 * Wall anchor registry — maps entry points to static Matter.js anchor bodies.
 *
 * Each door/window entry point gets a pair of small static sensor bodies
 * positioned at the frame edges. These serve as anchor points for barricade
 * constraints. The bodies have no collision (sensors only) and are registered
 * in the BodyRegistry so the physics sync system can track them.
 *
 * NO React imports — this is pure TypeScript.
 */

import type { EntryPoint } from "@/types/procgen";
import type { BodyRegistry } from "./body-registry";
import { TILE_SIZE } from "@/game/procgen/constants";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Size of each anchor body in pixels (small, invisible). */
const ANCHOR_SIZE = 4;

/**
 * Snap detection radius around the entry point center, in pixels.
 * Objects within this distance of the center can be placed as barricades.
 */
export const SNAP_RADIUS = 48;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A pair of wall anchor bodies for a single entry point. */
export interface WallAnchorPair {
  /** Index into the entryPointsToDefend array. */
  entryPointIndex: number;
  /** Body ID of the first anchor (left or top side of opening). */
  anchorBodyIdA: number;
  /** Body ID of the second anchor (right or bottom side of opening). */
  anchorBodyIdB: number;
  /** Center of the opening in world pixels. */
  centerX: number;
  centerY: number;
  /** Whether this opening runs horizontally or vertically. */
  orientation: "horizontal" | "vertical";
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class WallAnchorRegistry {
  private anchors: WallAnchorPair[] = [];

  /**
   * Create static anchor bodies for all entry points.
   *
   * Called once during GameScene.create() after the tilemap and physics
   * world are set up. Each entry point gets two small static sensor bodies
   * at the frame edges.
   *
   * @param entryPoints - The safehouse entry points to defend.
   * @param matterAdd - Phaser's Matter.js factory (scene.matter.add).
   * @param bodyRegistry - The body registry to track anchor bodies.
   */
  createAnchors(
    entryPoints: EntryPoint[],
    matterAdd: {
      rectangle: (
        x: number,
        y: number,
        w: number,
        h: number,
        opts: Record<string, unknown>,
      ) => MatterJS.BodyType;
    },
    bodyRegistry: BodyRegistry,
  ): void {
    for (let i = 0; i < entryPoints.length; i++) {
      const ep = entryPoints[i];

      // Tile center in world pixels
      const cx = ep.position.x * TILE_SIZE + TILE_SIZE / 2;
      const cy = ep.position.y * TILE_SIZE + TILE_SIZE / 2;

      // Anchor positions depend on facing direction:
      // - north/south: opening runs east-west, anchors on left/right
      // - east/west: opening runs north-south, anchors on top/bottom
      const halfTile = TILE_SIZE / 2;
      const isHorizontal =
        ep.facingDirection === "north" || ep.facingDirection === "south";
      const orientation = isHorizontal ? "horizontal" : "vertical";

      // Spread anchors along the opening axis
      const offsetX = isHorizontal ? halfTile : 0;
      const offsetY = isHorizontal ? 0 : halfTile;
      const ax1 = cx - offsetX;
      const ay1 = cy - offsetY;
      const ax2 = cx + offsetX;
      const ay2 = cy + offsetY;

      // Create static sensor bodies (no collision, just anchor points)
      const bodyOpts = {
        isStatic: true,
        isSensor: true,
        label: `wall-anchor-${i}`,
      };

      const bodyA = matterAdd.rectangle(ax1, ay1, ANCHOR_SIZE, ANCHOR_SIZE, bodyOpts);
      const bodyB = matterAdd.rectangle(ax2, ay2, ANCHOR_SIZE, ANCHOR_SIZE, bodyOpts);

      bodyRegistry.register(bodyA);
      bodyRegistry.register(bodyB);

      this.anchors.push({
        entryPointIndex: i,
        anchorBodyIdA: bodyA.id,
        anchorBodyIdB: bodyB.id,
        centerX: cx,
        centerY: cy,
        orientation,
      });
    }
  }

  /**
   * Find the nearest entry point whose center is within SNAP_RADIUS of the
   * given world position.
   *
   * @returns The matching anchor pair, or null if no entry point is close enough.
   */
  findSnapTarget(worldX: number, worldY: number): WallAnchorPair | null {
    let bestPair: WallAnchorPair | null = null;
    let bestDistSq = SNAP_RADIUS * SNAP_RADIUS;

    for (const pair of this.anchors) {
      const dx = worldX - pair.centerX;
      const dy = worldY - pair.centerY;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestPair = pair;
      }
    }

    return bestPair;
  }

  /** Get all anchor pairs. */
  getAll(): readonly WallAnchorPair[] {
    return this.anchors;
  }

  /** Get the anchor pair for a specific entry point index. */
  getByEntryPointIndex(index: number): WallAnchorPair | undefined {
    return this.anchors.find((a) => a.entryPointIndex === index);
  }

  /** Drop all entries (used on run restart). */
  clear(): void {
    this.anchors = [];
  }

  /** Number of registered anchor pairs. */
  get size(): number {
    return this.anchors.length;
  }
}
