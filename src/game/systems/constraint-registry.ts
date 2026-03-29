/**
 * Maps barricade constraint IDs to live Matter.js constraint references.
 *
 * Follows the same pattern as BodyRegistry: ECS components store numeric
 * constraint IDs, systems resolve them through this registry. This keeps
 * Matter.js references out of ECS data, preserving the game boundary.
 */
export class ConstraintRegistry {
  private constraints = new Map<number, MatterJS.ConstraintType>();

  /** Register a Matter.js constraint using its `.id` as the key. */
  register(constraint: MatterJS.ConstraintType): void {
    this.constraints.set(constraint.id, constraint);
  }

  /** Look up a constraint by its numeric id. */
  get(constraintId: number): MatterJS.ConstraintType | undefined {
    return this.constraints.get(constraintId);
  }

  /** Remove a constraint from the registry. Does NOT remove it from the world. */
  unregister(constraintId: number): void {
    this.constraints.delete(constraintId);
  }

  /** Drop all entries (used on run restart). */
  clear(): void {
    this.constraints.clear();
  }

  /** Number of registered constraints. */
  get size(): number {
    return this.constraints.size;
  }
}
