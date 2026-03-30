// System runner
export type { SystemFn } from "./system-runner";
export { runSystems } from "./system-runner";

// Game loop
export { GameLoop, FIXED_DT, MAX_STEPS_PER_FRAME } from "./game-loop";
export type { GameLoopStats } from "./game-loop";

// Scene context
export type { SceneContext, InputState, ClockState } from "./scene-context";
export { createInputState, createClockState } from "./scene-context";

// Body registry
export { BodyRegistry } from "./body-registry";

// Day/night constants
export type { DayPhase, DayNightTiming } from "./day-night-constants";
export { DAY_NIGHT, LIGHTING, getPhaseDuration, getNextPhase } from "./day-night-constants";

// Systems
export { createInputSystem } from "./input-system";
export { createMovementSystem } from "./movement-system";
export { createPhysicsSyncSystem } from "./physics-sync-system";
export { createRenderSyncSystem } from "./render-sync-system";
export { createDayNightSystem } from "./day-night-system";
export { createLightingSystem } from "./lighting-system";
export { createCommandSystem } from "./command-system";
export { createInteractionSystem } from "./interaction-system";
export { createZombieAISystem, resetZombieKills, getKillsByType } from "./zombie-ai-system";
export { ZOMBIE_AI, SHAMBLER_STATS, SHAMBLER_HEALTH } from "./zombie-ai-constants";
export { createCombatSystem } from "./combat-system";
export { COMBAT } from "./combat-constants";
export { createWaveSystem } from "./wave-system";
export { getWaveConfig } from "./wave-system-constants";
export type { NightWaveConfig } from "./wave-system-constants";
export { createMaterialSystem, MaterialRegistry } from "./material-system";
export type { MaterialQueryResult } from "./material-system";
export { MATERIAL, MATERIAL_ASSIGNMENTS } from "./material-constants";
export type { MaterialAssignment } from "./material-constants";

// Fire system
export { createFireSystem, igniteEntity } from "./fire-system";
export { FIRE } from "./fire-constants";

// Explosion system
export { createExplosionSystem } from "./explosion-system";
export { EXPLOSION } from "./explosion-constants";

// Electricity system
export { createElectricitySystem } from "./electricity-system";
export { ELECTRICITY } from "./electricity-constants";
