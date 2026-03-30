/**
 * Maps ECS PhysicsBody.bodyId values to live Matter.js body references.
 *
 * ECS components store only the numeric `bodyId` (preserving the
 * game-boundary separation). Systems that need the actual Matter.Body
 * resolve it through this registry.
 */
export class BodyRegistry {
  private bodies = new Map<number, MatterJS.BodyType>();

  /** Register a Matter.js body using its `.id` as the key. */
  register(body: MatterJS.BodyType): void {
    this.bodies.set(body.id, body);
  }

  /** Look up a body by its numeric id. */
  get(bodyId: number): MatterJS.BodyType | undefined {
    return this.bodies.get(bodyId);
  }

  /** Remove a body from the registry. Does NOT remove it from the world. */
  unregister(bodyId: number): void {
    this.bodies.delete(bodyId);
  }

  /** Return all registered bodies (for radial force application). */
  getAll(): MatterJS.BodyType[] {
    return Array.from(this.bodies.values());
  }

  /** Drop all entries (used on run restart). */
  clear(): void {
    this.bodies.clear();
  }

  /** Number of registered bodies. */
  get size(): number {
    return this.bodies.size;
  }
}
