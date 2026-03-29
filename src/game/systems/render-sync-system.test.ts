import { describe, it, expect, vi, afterEach } from "vitest";
import { createRenderSyncSystem } from "./render-sync-system";
import { createInputState, createClockState } from "./scene-context";
import type { SceneContext } from "./scene-context";
import { BodyRegistry } from "./body-registry";
import { createGameEventBus } from "@/game/events/event-bus";
import { world, resetWorld } from "@/game/ecs/world";
import type { InventorySlotData } from "@/game/ecs/components";

const DT = 1 / 60;

function createMockRect(x = 0, y = 0) {
  return {
    x,
    y,
    destroy: vi.fn(),
    setDepth: vi.fn().mockReturnThis(),
    setFillStyle: vi.fn().mockReturnThis(),
    setPosition: vi.fn(function (this: { x: number; y: number }, nx: number, ny: number) {
      this.x = nx;
      this.y = ny;
      return this;
    }),
    setVisible: vi.fn().mockReturnThis(),
    setStrokeStyle: vi.fn().mockReturnThis(),
  };
}

function createMockContext(alphaValue = 0.5): {
  ctx: SceneContext;
  addRectangle: ReturnType<typeof vi.fn>;
} {
  const addRectangle = vi.fn().mockImplementation(() => createMockRect());

  const scene = {
    add: {
      rectangle: addRectangle,
      graphics: vi.fn().mockReturnValue({
        clear: vi.fn(),
        lineStyle: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        strokePath: vi.fn(),
        setDepth: vi.fn().mockReturnThis(),
        fillStyle: vi.fn(),
        fillRect: vi.fn(),
      }),
    },
    cameras: {
      main: {
        startFollow: vi.fn(),
      },
    },
  } as unknown as Phaser.Scene;

  return {
    ctx: {
      scene,
      bodyRegistry: new BodyRegistry(),
      inputState: createInputState(),
      getAlpha: () => alphaValue,
      clockState: createClockState(),
      eventBus: createGameEventBus(),
    },
    addRectangle,
  };
}

describe("RenderSyncSystem", () => {
  afterEach(() => {
    resetWorld();
  });

  it("creates a Phaser rectangle for a renderable entity", () => {
    const { ctx, addRectangle } = createMockContext();
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 100, y: 200 },
      renderable: { spriteKey: "player" },
    });

    system(DT);

    expect(addRectangle).toHaveBeenCalledTimes(1);
  });

  it("does not recreate visuals on subsequent ticks", () => {
    const { ctx, addRectangle } = createMockContext();
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 100, y: 200 },
      renderable: { spriteKey: "player" },
    });

    system(DT);
    system(DT);
    system(DT);

    expect(addRectangle).toHaveBeenCalledTimes(1);
  });

  it("interpolates position using alpha", () => {
    const alpha = 0.5;
    const { ctx, addRectangle } = createMockContext(alpha);
    const mockRect = createMockRect();
    addRectangle.mockReturnValue(mockRect);
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 200, y: 300 },
      previousPosition: { x: 100, y: 200 },
      renderable: { spriteKey: "zombie" },
    });

    system(DT);

    // Interpolated: prev + (curr - prev) * alpha
    // x: 100 + (200 - 100) * 0.5 = 150
    // y: 200 + (300 - 200) * 0.5 = 250
    expect(mockRect.x).toBeCloseTo(150, 5);
    expect(mockRect.y).toBeCloseTo(250, 5);
  });

  it("falls back to current position when previousPosition is absent", () => {
    const { ctx, addRectangle } = createMockContext(0.5);
    const mockRect = createMockRect();
    addRectangle.mockReturnValue(mockRect);
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 100, y: 100 },
      renderable: { spriteKey: "player" },
    });

    system(DT);

    // No previous → lerp(100, 100, 0.5) = 100
    expect(mockRect.x).toBe(100);
    expect(mockRect.y).toBe(100);
  });

  it("destroys sprites for removed entities", () => {
    const { ctx, addRectangle } = createMockContext();
    const mockRect = createMockRect();
    addRectangle.mockReturnValue(mockRect);
    const system = createRenderSyncSystem(ctx);

    const entity = world.add({
      position: { x: 50, y: 50 },
      renderable: { spriteKey: "bullet" },
    });

    system(DT);
    expect(mockRect.destroy).not.toHaveBeenCalled();

    // Remove the entity
    world.remove(entity);
    system(DT);

    expect(mockRect.destroy).toHaveBeenCalledTimes(1);
  });

  it("wires camera follow on first player sprite", () => {
    const { ctx } = createMockContext();
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 100, y: 100 },
      renderable: { spriteKey: "player" },
      playerControlled: { active: true },
    });

    system(DT);

    const cam = ctx.scene.cameras.main as unknown as {
      startFollow: ReturnType<typeof vi.fn>;
    };
    expect(cam.startFollow).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Interpolation boundary values
  // -------------------------------------------------------------------------

  it("positions sprite at previous position when alpha is 0", () => {
    const { ctx, addRectangle } = createMockContext(0);
    const mockRect = createMockRect();
    addRectangle.mockReturnValue(mockRect);
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 200, y: 300 },
      previousPosition: { x: 100, y: 200 },
      renderable: { spriteKey: "zombie" },
    });

    system(DT);

    expect(mockRect.x).toBe(100);
    expect(mockRect.y).toBe(200);
  });

  it("positions sprite at current position when alpha is 1", () => {
    const { ctx, addRectangle } = createMockContext(1);
    const mockRect = createMockRect();
    addRectangle.mockReturnValue(mockRect);
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 200, y: 300 },
      previousPosition: { x: 100, y: 200 },
      renderable: { spriteKey: "zombie" },
    });

    system(DT);

    expect(mockRect.x).toBe(200);
    expect(mockRect.y).toBe(300);
  });

  // -------------------------------------------------------------------------
  // Aim indicator
  // -------------------------------------------------------------------------

  it("lazily creates a Graphics object for the aim indicator", () => {
    const { ctx, addRectangle } = createMockContext(0);
    const mockRect = createMockRect(100, 100);
    addRectangle.mockReturnValue(mockRect);
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 100, y: 100 },
      velocity: { vx: 0, vy: 0 },
      renderable: { spriteKey: "player" },
      playerControlled: { active: true },
    });

    ctx.inputState.aimX = 200;
    ctx.inputState.aimY = 100;

    system(DT);

    const addGraphics = (ctx.scene.add as unknown as { graphics: ReturnType<typeof vi.fn> }).graphics;
    // Called twice: once for aim indicator, once for barricade health bars
    expect(addGraphics).toHaveBeenCalledTimes(2);
  });

  it("draws the aim line toward the mouse position", () => {
    const { ctx, addRectangle } = createMockContext(0);
    // Sprite will be at (100, 100) due to alpha=0 and prev=current
    const mockRect = createMockRect(100, 100);
    addRectangle.mockReturnValue(mockRect);
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 100, y: 100 },
      previousPosition: { x: 100, y: 100 },
      velocity: { vx: 0, vy: 0 },
      renderable: { spriteKey: "player" },
      playerControlled: { active: true },
    });

    // Aim directly to the right
    ctx.inputState.aimX = 300;
    ctx.inputState.aimY = 100;

    system(DT);

    const addGraphics = (ctx.scene.add as unknown as { graphics: ReturnType<typeof vi.fn> }).graphics;
    const gfxMock = addGraphics.mock.results[0]!.value;

    expect(gfxMock.clear).toHaveBeenCalled();
    expect(gfxMock.lineStyle).toHaveBeenCalledWith(2, 0xffffff, 0.7);
    expect(gfxMock.beginPath).toHaveBeenCalled();
    expect(gfxMock.moveTo).toHaveBeenCalledWith(100, 100);
    // AIM_LINE_LENGTH = 32, direction (1, 0) → lineTo(132, 100)
    expect(gfxMock.lineTo).toHaveBeenCalledWith(132, 100);
    expect(gfxMock.strokePath).toHaveBeenCalled();
  });

  it("does not draw the aim line when aim position equals player position", () => {
    const { ctx, addRectangle } = createMockContext(0);
    const mockRect = createMockRect(100, 100);
    addRectangle.mockReturnValue(mockRect);
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 100, y: 100 },
      previousPosition: { x: 100, y: 100 },
      velocity: { vx: 0, vy: 0 },
      renderable: { spriteKey: "player" },
      playerControlled: { active: true },
    });

    // Aim at the same position as player
    ctx.inputState.aimX = 100;
    ctx.inputState.aimY = 100;

    system(DT);

    const addGraphics = (ctx.scene.add as unknown as { graphics: ReturnType<typeof vi.fn> }).graphics;
    const gfxMock = addGraphics.mock.results[0]!.value;

    // clear() is always called, but beginPath should NOT be called (dist === 0)
    expect(gfxMock.clear).toHaveBeenCalled();
    expect(gfxMock.beginPath).not.toHaveBeenCalled();
  });

  it("reuses the same Graphics object across ticks", () => {
    const { ctx, addRectangle } = createMockContext(0);
    const mockRect = createMockRect(100, 100);
    addRectangle.mockReturnValue(mockRect);
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 100, y: 100 },
      velocity: { vx: 0, vy: 0 },
      renderable: { spriteKey: "player" },
      playerControlled: { active: true },
    });

    ctx.inputState.aimX = 200;
    ctx.inputState.aimY = 100;

    system(DT);
    system(DT);

    const addGraphics = (ctx.scene.add as unknown as { graphics: ReturnType<typeof vi.fn> }).graphics;
    // Called twice total: aim indicator (1st tick) + barricade health bars (1st tick), then reused
    expect(addGraphics).toHaveBeenCalledTimes(2);
  });

  it("only wires camera follow once", () => {
    const { ctx } = createMockContext();
    const system = createRenderSyncSystem(ctx);

    world.add({
      position: { x: 100, y: 100 },
      renderable: { spriteKey: "player" },
      playerControlled: { active: true },
    });

    system(DT);
    system(DT);
    system(DT);

    const cam = ctx.scene.cameras.main as unknown as {
      startFollow: ReturnType<typeof vi.fn>;
    };
    expect(cam.startFollow).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Equipped item indicator (issue #21)
  // -------------------------------------------------------------------------

  describe("equipped item indicator", () => {
    /**
     * Helper: create a full player entity with inventory that satisfies
     * both playerEntities and inventoryEntities queries.
     */
    function addPlayerWithInventory(
      slots: Array<InventorySlotData | null>,
      activeSlot = -1,
    ) {
      return world.add({
        position: { x: 100, y: 100 },
        previousPosition: { x: 100, y: 100 },
        velocity: { vx: 0, vy: 0 },
        renderable: { spriteKey: "player" },
        playerControlled: { active: true },
        inventory: {
          slots,
          activeSlot,
          carryWeight: 0,
          maxCarryWeight: 50,
        },
      });
    }

    it("does not create indicator when activeSlot is -1", () => {
      const { ctx, addRectangle } = createMockContext(0);
      const playerRect = createMockRect(100, 100);
      addRectangle.mockReturnValue(playerRect);
      const system = createRenderSyncSystem(ctx);

      addPlayerWithInventory(
        [{ objectType: "wooden_plank", sizeCategory: "small", primary: true }, null, null, null, null, null, null, null],
        -1,
      );

      system(DT);

      // Only 1 rectangle call: the player sprite. No indicator.
      expect(addRectangle).toHaveBeenCalledTimes(1);
    });

    it("does not create indicator when active slot is empty", () => {
      const { ctx, addRectangle } = createMockContext(0);
      const playerRect = createMockRect(100, 100);
      addRectangle.mockReturnValue(playerRect);
      const system = createRenderSyncSystem(ctx);

      addPlayerWithInventory(
        [null, null, null, null, null, null, null, null],
        0,
      );

      system(DT);

      // Only the player sprite rectangle
      expect(addRectangle).toHaveBeenCalledTimes(1);
    });

    it("creates indicator when active slot has a primary item", () => {
      const { ctx, addRectangle } = createMockContext(0);
      let callCount = 0;
      const playerRect = createMockRect(100, 100);
      const equipRect = createMockRect(0, 0);
      addRectangle.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? playerRect : equipRect;
      });
      const system = createRenderSyncSystem(ctx);

      addPlayerWithInventory(
        [{ objectType: "wooden_plank", sizeCategory: "small", primary: true }, null, null, null, null, null, null, null],
        0,
      );

      system(DT);

      // 2 rectangles: player sprite + equip indicator
      expect(addRectangle).toHaveBeenCalledTimes(2);
    });

    it("positions indicator at player sprite + offset", () => {
      const { ctx, addRectangle } = createMockContext(0);
      let callCount = 0;
      const playerRect = createMockRect(100, 100);
      const equipRect = createMockRect(0, 0);
      addRectangle.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? playerRect : equipRect;
      });
      const system = createRenderSyncSystem(ctx);

      addPlayerWithInventory(
        [{ objectType: "wooden_plank", sizeCategory: "small", primary: true }, null, null, null, null, null, null, null],
        0,
      );

      system(DT);

      // EQUIP_OFFSET_X = 10, EQUIP_OFFSET_Y = 10
      expect(equipRect.setPosition).toHaveBeenCalledWith(110, 110);
    });

    it("sets high depth on the indicator", () => {
      const { ctx, addRectangle } = createMockContext(0);
      let callCount = 0;
      const playerRect = createMockRect(100, 100);
      const equipRect = createMockRect(0, 0);
      addRectangle.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? playerRect : equipRect;
      });
      const system = createRenderSyncSystem(ctx);

      addPlayerWithInventory(
        [{ objectType: "wooden_plank", sizeCategory: "small", primary: true }, null, null, null, null, null, null, null],
        0,
      );

      system(DT);

      expect(equipRect.setDepth).toHaveBeenCalledWith(Number.MAX_SAFE_INTEGER - 1);
    });

    it("hides indicator when active slot becomes empty", () => {
      const { ctx, addRectangle } = createMockContext(0);
      let callCount = 0;
      const playerRect = createMockRect(100, 100);
      const equipRect = createMockRect(0, 0);
      addRectangle.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? playerRect : equipRect;
      });
      const system = createRenderSyncSystem(ctx);

      const entity = addPlayerWithInventory(
        [{ objectType: "wooden_plank", sizeCategory: "small", primary: true }, null, null, null, null, null, null, null],
        0,
      );

      // First tick: indicator created and visible
      system(DT);
      expect(equipRect.setVisible).toHaveBeenCalledWith(true);

      // Remove item from slot
      entity.inventory!.slots[0] = null;

      // Second tick: indicator hidden
      system(DT);
      expect(equipRect.setVisible).toHaveBeenCalledWith(false);
    });

    it("hides indicator when active slot points to a continuation slot", () => {
      const { ctx, addRectangle } = createMockContext(0);
      let callCount = 0;
      const playerRect = createMockRect(100, 100);
      const equipRect = createMockRect(0, 0);
      addRectangle.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? playerRect : equipRect;
      });
      const system = createRenderSyncSystem(ctx);

      // Slot 0 = primary, slot 1 = continuation. Active slot points to the continuation slot.
      addPlayerWithInventory(
        [
          { objectType: "car_battery", sizeCategory: "medium", primary: true },
          { objectType: "car_battery", sizeCategory: "medium", primary: false },
          null, null, null, null, null, null,
        ],
        1, // pointing at continuation slot
      );

      // Need to establish equipGfx first via a valid tick
      // Reset to primary slot temporarily
      system(DT);
      // equipGfx was not created because slot 1 is not primary
      // The code checks `activeSlot && activeSlot.primary` — slot 1 exists but primary=false
      expect(addRectangle).toHaveBeenCalledTimes(1); // only player sprite
    });

    it("reuses the indicator rectangle across ticks", () => {
      const { ctx, addRectangle } = createMockContext(0);
      let callCount = 0;
      const playerRect = createMockRect(100, 100);
      const equipRect = createMockRect(0, 0);
      addRectangle.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? playerRect : equipRect;
      });
      const system = createRenderSyncSystem(ctx);

      addPlayerWithInventory(
        [{ objectType: "wooden_plank", sizeCategory: "small", primary: true }, null, null, null, null, null, null, null],
        0,
      );

      system(DT);
      system(DT);
      system(DT);

      // Only 2 total rectangle calls: 1 for player sprite, 1 for equip indicator
      expect(addRectangle).toHaveBeenCalledTimes(2);
    });

    it("updates fill color when equipped item changes", () => {
      const { ctx, addRectangle } = createMockContext(0);
      let callCount = 0;
      const playerRect = createMockRect(100, 100);
      const equipRect = createMockRect(0, 0);
      addRectangle.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? playerRect : equipRect;
      });
      const system = createRenderSyncSystem(ctx);

      const entity = addPlayerWithInventory(
        [
          { objectType: "wooden_plank", sizeCategory: "small", primary: true },
          { objectType: "gas_can", sizeCategory: "small", primary: true },
          null, null, null, null, null, null,
        ],
        0,
      );

      system(DT);

      // Switch to slot 1 (gas_can)
      entity.inventory!.activeSlot = 1;
      system(DT);

      // setFillStyle should have been called at least twice with different colors
      const calls = equipRect.setFillStyle.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // Zombie death flash
  // -------------------------------------------------------------------------

  describe("zombie death flash", () => {
    it("applies white tint to sprite during death flash duration", () => {
      const { ctx, addRectangle } = createMockContext();
      const mockRect = createMockRect();
      addRectangle.mockReturnValue(mockRect);
      const system = createRenderSyncSystem(ctx);

      // Create a zombie entity with aiState in 'dead' state
      const zombie = world.add({
        position: { x: 50, y: 50 },
        renderable: { spriteKey: "zombie_shambler" },
        aiState: {
          state: "dead" as const,
          targetPosition: null,
          path: [],
          pathIndex: 0,
          ticksSinceLastPathCalc: 0,
          attackCooldownRemaining: 0,
          staggerTimeRemaining: 0,
          attackTargetBodyId: null,
          previousHealth: 0,
        },
      });

      // First tick to create the sprite
      system(DT);
      expect(addRectangle).toHaveBeenCalled();

      // Emit zombie-killed event at the zombie's position
      ctx.eventBus.emit("zombie-killed", {
        position: { x: 50, y: 50 },
        variant: "shambler",
        totalKills: 1,
      });

      // Remove the entity (simulating ZombieAISystem deferred removal)
      world.remove(zombie);

      // Next tick: death flash should keep sprite alive and tint it white
      system(DT);

      expect(mockRect.setFillStyle).toHaveBeenCalledWith(0xffffff);
      expect(mockRect.destroy).not.toHaveBeenCalled();
    });

    it("destroys sprite after death flash duration expires", () => {
      const { ctx, addRectangle } = createMockContext();
      const mockRect = createMockRect();
      addRectangle.mockReturnValue(mockRect);
      const system = createRenderSyncSystem(ctx);

      // Create a zombie entity with aiState in 'dead' state
      const zombie = world.add({
        position: { x: 50, y: 50 },
        renderable: { spriteKey: "zombie_shambler" },
        aiState: {
          state: "dead" as const,
          targetPosition: null,
          path: [],
          pathIndex: 0,
          ticksSinceLastPathCalc: 0,
          attackCooldownRemaining: 0,
          staggerTimeRemaining: 0,
          attackTargetBodyId: null,
          previousHealth: 0,
        },
      });

      // First tick to create the sprite
      system(DT);

      // Emit zombie-killed and remove entity
      ctx.eventBus.emit("zombie-killed", {
        position: { x: 50, y: 50 },
        variant: "shambler",
        totalKills: 1,
      });
      world.remove(zombie);

      // Tick through the full death flash duration (0.12s ≈ 8 ticks at 60Hz)
      const flashTicks = Math.ceil(0.12 / DT) + 1;
      for (let i = 0; i < flashTicks; i++) {
        system(DT);
      }

      // Sprite should be destroyed after flash expires
      expect(mockRect.destroy).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Barricade visual feedback
  // -------------------------------------------------------------------------

  describe("barricade visual feedback", () => {
    function addPlayerAndBarricade(
      playerPos: { x: number; y: number },
      barricadePos: { x: number; y: number },
      healthCurrent: number,
      healthMax: number,
    ) {
      world.add({
        position: playerPos,
        velocity: { vx: 0, vy: 0 },
        renderable: { spriteKey: "player" },
        playerControlled: { active: true },
      });
      world.add({
        position: barricadePos,
        renderable: { spriteKey: "wooden_plank" },
        physicsBody: { bodyId: 999 },
        health: { current: healthCurrent, max: healthMax },
        barricade: {
          constraintIds: [1, 2],
          entryPointIndex: 0,
          sourceObjectType: "wooden_plank",
          maxDurability: healthMax,
          currentDurability: healthCurrent,
        },
      });
    }

    it("creates barricade health bar graphics on first tick with barricade", () => {
      const { ctx } = createMockContext();
      const system = createRenderSyncSystem(ctx);

      addPlayerAndBarricade({ x: 100, y: 100 }, { x: 120, y: 120 }, 60, 60);
      system(DT);

      const addGraphics = (ctx.scene.add as unknown as { graphics: ReturnType<typeof vi.fn> }).graphics;
      // aim indicator + barricade health bar = 2 graphics objects
      expect(addGraphics).toHaveBeenCalledTimes(2);
    });

    it("draws green health bar fill when HP is above 66%", () => {
      const { ctx } = createMockContext();
      const system = createRenderSyncSystem(ctx);

      // Full health: 60/60 = 100%
      addPlayerAndBarricade({ x: 100, y: 100 }, { x: 120, y: 120 }, 60, 60);
      system(DT);

      const addGraphics = (ctx.scene.add as unknown as { graphics: ReturnType<typeof vi.fn> }).graphics;
      const barricadeGfx = addGraphics.mock.results[1]!.value;

      const fillStyleCalls = barricadeGfx.fillStyle.mock.calls;
      // Background bar
      expect(fillStyleCalls).toContainEqual([0x1a1a2e, 0.8]);
      // Green fill (HP > 66%)
      expect(fillStyleCalls).toContainEqual([0x4ade80, 1.0]);
    });

    it("draws amber health bar fill when HP is between 33% and 66%", () => {
      const { ctx } = createMockContext();
      const system = createRenderSyncSystem(ctx);

      // 50% health: 30/60
      addPlayerAndBarricade({ x: 100, y: 100 }, { x: 120, y: 120 }, 30, 60);
      system(DT);

      const addGraphics = (ctx.scene.add as unknown as { graphics: ReturnType<typeof vi.fn> }).graphics;
      const barricadeGfx = addGraphics.mock.results[1]!.value;

      const fillStyleCalls = barricadeGfx.fillStyle.mock.calls;
      // Amber fill (33% < HP <= 66%)
      expect(fillStyleCalls).toContainEqual([0xf59e0b, 1.0]);
    });

    it("draws red health bar fill when HP is at or below 33%", () => {
      const { ctx } = createMockContext();
      const system = createRenderSyncSystem(ctx);

      // 20% health: 12/60
      addPlayerAndBarricade({ x: 100, y: 100 }, { x: 120, y: 120 }, 12, 60);
      system(DT);

      const addGraphics = (ctx.scene.add as unknown as { graphics: ReturnType<typeof vi.fn> }).graphics;
      const barricadeGfx = addGraphics.mock.results[1]!.value;

      const fillStyleCalls = barricadeGfx.fillStyle.mock.calls;
      // Red fill (HP <= 33%)
      expect(fillStyleCalls).toContainEqual([0xef4444, 1.0]);
    });

    it("does not draw health bar when barricade is beyond view range", () => {
      const { ctx } = createMockContext();
      const system = createRenderSyncSystem(ctx);

      // Player at origin, barricade very far away
      addPlayerAndBarricade({ x: 0, y: 0 }, { x: 9999, y: 9999 }, 60, 60);
      system(DT);

      const addGraphics = (ctx.scene.add as unknown as { graphics: ReturnType<typeof vi.fn> }).graphics;
      const barricadeGfx = addGraphics.mock.results[1]!.value;

      // clear() is always called, but fillRect should NOT be called
      // (barricade is outside BARRICADE_VIEW_RANGE_SQ)
      expect(barricadeGfx.clear).toHaveBeenCalled();
      expect(barricadeGfx.fillRect).not.toHaveBeenCalled();
    });

    it("shows snap indicator when barricade-snap event fires with snapping:true", () => {
      const { ctx, addRectangle } = createMockContext();
      const snapRect = createMockRect();
      addRectangle.mockReturnValue(snapRect);

      const system = createRenderSyncSystem(ctx);

      // Emit snap event
      ctx.eventBus.emit("barricade-snap", {
        entryPointIndex: 0,
        snapCenter: { x: 200, y: 300 },
        orientation: "horizontal" as const,
        snapping: true,
      });

      system(DT);

      // Snap rectangle created with correct parameters
      expect(addRectangle).toHaveBeenCalledWith(0, 0, 36, 36, 0x60a5fa, 0.35);
      expect(snapRect.setPosition).toHaveBeenCalledWith(200, 300);
      expect(snapRect.setVisible).toHaveBeenCalledWith(true);
    });

    it("hides snap indicator when barricade-snap fires with snapping:false", () => {
      const { ctx, addRectangle } = createMockContext();
      const snapRect = createMockRect();
      addRectangle.mockReturnValue(snapRect);

      const system = createRenderSyncSystem(ctx);

      // Show snap indicator first
      ctx.eventBus.emit("barricade-snap", {
        entryPointIndex: 0,
        snapCenter: { x: 200, y: 300 },
        orientation: "horizontal" as const,
        snapping: true,
      });
      system(DT);

      // Hide snap indicator
      ctx.eventBus.emit("barricade-snap", {
        entryPointIndex: 0,
        snapCenter: { x: 200, y: 300 },
        orientation: "horizontal" as const,
        snapping: false,
      });
      system(DT);

      expect(snapRect.setVisible).toHaveBeenCalledWith(false);
    });
  });

  describe("burning tint", () => {
    it("applies fire tint to non-barricade burning entities", () => {
      const { ctx, addRectangle } = createMockContext();
      const mockSprite = createMockRect(100, 100);
      addRectangle.mockReturnValue(mockSprite);
      const system = createRenderSyncSystem(ctx);

      world.add({
        position: { x: 100, y: 100 },
        previousPosition: { x: 100, y: 100 },
        velocity: { vx: 0, vy: 0 },
        renderable: { spriteKey: "sofa" },
        material: {
          category: "fabric" as const,
          flammability: 0.95,
          conductivity: 0.0,
          explosivePotential: 0,
          state: "burning" as const,
        },
      });

      system(DT); // Creates visual
      system(DT); // Updates with tint

      // setFillStyle should have been called with a fire-blended colour
      expect(mockSprite.setFillStyle).toHaveBeenCalled();
      const lastCall = mockSprite.setFillStyle.mock.calls.at(-1);
      expect(lastCall![0]).toBeTypeOf("number");
    });

    it("does not apply fire tint to inert entities", () => {
      const { ctx, addRectangle } = createMockContext();
      const mockSprite = createMockRect(100, 100);
      addRectangle.mockReturnValue(mockSprite);
      const system = createRenderSyncSystem(ctx);

      world.add({
        position: { x: 100, y: 100 },
        previousPosition: { x: 100, y: 100 },
        velocity: { vx: 0, vy: 0 },
        renderable: { spriteKey: "sofa" },
        material: {
          category: "fabric" as const,
          flammability: 0.95,
          conductivity: 0.0,
          explosivePotential: 0,
          state: "inert" as const,
        },
      });

      system(DT); // Creates visual (may call setFillStyle for initial colour)
      mockSprite.setFillStyle.mockClear();
      system(DT); // Update tick

      // setFillStyle should NOT be called again for a non-burning, non-barricade entity
      expect(mockSprite.setFillStyle).not.toHaveBeenCalled();
    });
  });
});
