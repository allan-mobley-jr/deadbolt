/**
 * Material system — spatial query and adjacency detection for material interactions.
 *
 * This is a **query/detection layer only**. It answers questions like:
 *   - "What flammable objects are within radius R of point P?"
 *   - "What conductive objects are touching this object?"
 *   - "Which entities are currently burning?"
 *
 * It does NOT cause damage, ignite fires, or trigger explosions. Those
 * responsibilities belong to the fire, electricity, and explosion systems
 * (issues #29-31) which consume the MaterialRegistry API.
 *
 * Runs after PhysicsSyncSystem so Matter.js collision pairs are current.
 *
 * NO React imports — this is pure TypeScript.
 */

import type { With } from "miniplex";
import type { SceneContext } from "./scene-context";
import type { SystemFn } from "./system-runner";
import type { Entity } from "@/game/ecs/entity";
import type { MaterialState } from "@/game/ecs/components";
import { materialEntities, materialPhysicsEntities } from "@/game/ecs/queries";
import { MATERIAL } from "./material-constants";

// ---------------------------------------------------------------------------
// Narrowed entity types used throughout this module
// ---------------------------------------------------------------------------

/** Material entity with a position (spatial queries). */
type MaterialEntity = With<Entity, "position" | "material">;

/** Material entity with a position and physics body (adjacency queries). */
type PhysicsMaterialEntity = With<Entity, "position" | "material" | "physicsBody">;

// ---------------------------------------------------------------------------
// Query result types
// ---------------------------------------------------------------------------

/** A material entity paired with its distance from a query point. */
export interface MaterialQueryResult {
  entity: MaterialEntity;
  /** Euclidean distance in pixels from the query point. */
  distance: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Squared Euclidean distance between two 2D points. */
function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

// ---------------------------------------------------------------------------
// MaterialRegistry — query API exposed via SceneContext
// ---------------------------------------------------------------------------

/**
 * Registry that maintains material entity lookup tables and provides
 * spatial and adjacency query methods.
 *
 * Created once per game session, stored on SceneContext, and updated
 * each fixed tick by the MaterialSystem.
 */
export class MaterialRegistry {
  /**
   * Adjacency map: bodyId → set of bodyIds currently in contact.
   * Rebuilt each tick from Matter.js collision pairs.
   */
  private adjacency = new Map<number, Set<number>>();

  /**
   * Reverse lookup: bodyId → entity for material entities with physics bodies.
   * Rebuilt each tick from the materialPhysicsEntities query.
   */
  private bodyToEntity = new Map<number, PhysicsMaterialEntity>();

  // -----------------------------------------------------------------------
  // Internal — called by the system each tick
  // -----------------------------------------------------------------------

  /**
   * Rebuild the body-to-entity lookup from the current ECS query.
   * O(n) where n = number of material entities with physics bodies.
   */
  rebuildBodyLookup(): void {
    this.bodyToEntity.clear();
    for (const entity of materialPhysicsEntities) {
      this.bodyToEntity.set(entity.physicsBody.bodyId, entity);
    }
  }

  /**
   * Rebuild the adjacency map from Matter.js active collision pairs.
   * O(p) where p = number of active collision pairs.
   *
   * Only tracks pairs where BOTH bodies belong to material entities.
   */
  updateAdjacency(pairs: ReadonlyArray<{ bodyA: { id: number }; bodyB: { id: number } }>): void {
    this.adjacency.clear();

    for (const pair of pairs) {
      const idA = pair.bodyA.id;
      const idB = pair.bodyB.id;

      // Only track pairs where both bodies are material entities
      if (!this.bodyToEntity.has(idA) || !this.bodyToEntity.has(idB)) {
        continue;
      }

      this.addAdjacencyEdge(idA, idB);
      this.addAdjacencyEdge(idB, idA);
    }
  }

  /** Add a directed adjacency edge from one body to another. */
  private addAdjacencyEdge(from: number, to: number): void {
    let neighbors = this.adjacency.get(from);
    if (!neighbors) {
      neighbors = new Set();
      this.adjacency.set(from, neighbors);
    }
    neighbors.add(to);
  }

  // -----------------------------------------------------------------------
  // Adjacency queries
  // -----------------------------------------------------------------------

  /**
   * Get all material entities physically touching the entity with the
   * given body ID (via Matter.js collision pairs).
   */
  getAdjacentEntities(bodyId: number): PhysicsMaterialEntity[] {
    const neighbors = this.adjacency.get(bodyId);
    if (!neighbors) return [];

    const result: PhysicsMaterialEntity[] = [];
    for (const neighborId of neighbors) {
      const entity = this.bodyToEntity.get(neighborId);
      if (entity) result.push(entity);
    }
    return result;
  }

  /**
   * Get adjacent entities filtered by conductivity threshold.
   * Returns only neighbors whose conductivity meets the conductive threshold.
   */
  getConductiveNeighbors(bodyId: number): PhysicsMaterialEntity[] {
    return this.getAdjacentEntities(bodyId).filter(
      (e) => e.material.conductivity >= MATERIAL.CONDUCTIVITY_THRESHOLD,
    );
  }

  // -----------------------------------------------------------------------
  // Spatial radius queries
  // -----------------------------------------------------------------------

  /**
   * Find all material entities within a radius of a point, optionally
   * filtered by a predicate.
   *
   * Results are sorted by distance (nearest first).
   * O(n) where n = total material entities.
   */
  queryRadius(
    x: number,
    y: number,
    radius: number,
    filter?: (entity: MaterialEntity) => boolean,
  ): MaterialQueryResult[] {
    const radiusSq = radius * radius;
    const results: MaterialQueryResult[] = [];

    for (const entity of materialEntities) {
      const d2 = distSq(x, y, entity.position.x, entity.position.y);
      if (d2 > radiusSq) continue;
      if (filter && !filter(entity)) continue;
      results.push({ entity, distance: Math.sqrt(d2) });
    }

    results.sort((a, b) => a.distance - b.distance);
    return results;
  }

  /**
   * Find flammable entities within a radius of a point.
   * Uses the flammability threshold from MATERIAL constants.
   */
  getFlammableInRadius(
    x: number,
    y: number,
    radius: number = MATERIAL.FIRE_SPREAD_RADIUS,
  ): MaterialQueryResult[] {
    return this.queryRadius(x, y, radius, (e) =>
      e.material.flammability >= MATERIAL.FLAMMABILITY_THRESHOLD,
    );
  }

  /**
   * Find explosive entities within a radius of a point.
   * Uses the explosive threshold from MATERIAL constants.
   */
  getExplosiveInRadius(
    x: number,
    y: number,
    radius: number = MATERIAL.EXPLOSION_RADIUS,
  ): MaterialQueryResult[] {
    return this.queryRadius(x, y, radius, (e) =>
      e.material.explosivePotential >= MATERIAL.EXPLOSIVE_THRESHOLD,
    );
  }

  /**
   * Find conductive entities within a radius of a point.
   * Uses the conductivity threshold from MATERIAL constants.
   */
  getConductiveInRadius(
    x: number,
    y: number,
    radius: number,
  ): MaterialQueryResult[] {
    return this.queryRadius(x, y, radius, (e) =>
      e.material.conductivity >= MATERIAL.CONDUCTIVITY_THRESHOLD,
    );
  }

  // -----------------------------------------------------------------------
  // State queries
  // -----------------------------------------------------------------------

  /** Get all material entities currently in the given state. */
  private getEntitiesByState(state: MaterialState): MaterialEntity[] {
    const results: MaterialEntity[] = [];
    for (const entity of materialEntities) {
      if (entity.material.state === state) results.push(entity);
    }
    return results;
  }

  /** Get all material entities currently in the 'burning' state. */
  getBurningEntities(): MaterialEntity[] {
    return this.getEntitiesByState("burning");
  }

  /** Get all material entities currently in the 'electrified' state. */
  getElectrifiedEntities(): MaterialEntity[] {
    return this.getEntitiesByState("electrified");
  }

  /**
   * Resolve a body ID to its material entity (if one exists).
   * Useful for collision callbacks that only have body references.
   */
  getEntityByBodyId(bodyId: number): PhysicsMaterialEntity | undefined {
    return this.bodyToEntity.get(bodyId);
  }
}

// ---------------------------------------------------------------------------
// System factory
// ---------------------------------------------------------------------------

/**
 * Create the material system.
 *
 * Per-tick responsibilities:
 *   1. Rebuild body → entity lookup from current ECS query
 *   2. Read collision pairs from Matter.js and update adjacency map
 *
 * The system itself is lightweight — heavy work is deferred to on-demand
 * query methods on the MaterialRegistry.
 */
export function createMaterialSystem(ctx: SceneContext): SystemFn {
  const registry = ctx.materialRegistry;
  if (!registry) {
    throw new Error("[MaterialSystem] ctx.materialRegistry is required");
  }

  /** One-time flag to avoid spamming the console if engine is missing. */
  let warnedMissingEngine = false;

  return (_dt: number): void => {
    // 1. Rebuild body → entity lookup
    registry.rebuildBodyLookup();

    // 2. Update adjacency from Matter.js collision pairs
    // Phaser wraps Matter.js — access the engine's pair cache.
    // pairs.list is the full cache (may include stale separated pairs),
    // so we filter to isActive pairs only for current-tick adjacency.
    // Use optional chaining because the engine structure may not be fully
    // available in test mocks or before the first physics step.
    const matterWorld = ctx.scene.matter.world as unknown as Record<string, unknown>;
    const engine = matterWorld.engine as MatterEngine | undefined;

    if (!engine && !warnedMissingEngine) {
      console.error(
        "[MaterialSystem] Matter.js engine not found on ctx.scene.matter.world. Adjacency detection disabled.",
      );
      warnedMissingEngine = true;
    }

    const allPairs = engine?.pairs?.list ?? [];
    const activePairs = allPairs.filter((p) => p.isActive);
    registry.updateAdjacency(activePairs);
  };
}

/**
 * Minimal Matter.js engine type for accessing collision pairs.
 * Phaser's type definitions don't expose this path, so we use a
 * narrow interface to safely access what we need.
 */
interface MatterEngine {
  pairs?: {
    list: ReadonlyArray<{
      bodyA: { id: number };
      bodyB: { id: number };
      isActive?: boolean;
    }>;
  };
}
