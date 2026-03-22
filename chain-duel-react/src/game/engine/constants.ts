export const GAME_COLS = 51;
export const GAME_ROWS = 25;
export const STEP_SPEED_MS = 100;
export const COUNTDOWN_END_TICK = 40;

export const CAPTURE_LEVELS = [
  { minLength: 1, maxLength: 1, percent: 2 },
  { minLength: 2, maxLength: 3, percent: 4 },
  { minLength: 4, maxLength: 6, percent: 8 },
  { minLength: 7, maxLength: 10, percent: 16 },
  { minLength: 11, maxLength: Number.POSITIVE_INFINITY, percent: 32 },
] as const;

// ============================================================================
// Overclock mode
// ============================================================================

export const OVERCLOCK_STEP_INTERVAL_TICKS = 200; // ~20s at 100ms ticks
export const OVERCLOCK_SPEED_REDUCTION_MS = 10;
export const OVERCLOCK_MIN_STEP_MS = 30;

// ============================================================================
// Convergence mode
// ============================================================================

export const CONVERGENCE_SHRINK_INTERVAL_TICKS = 150; // ~15s at 100ms ticks
export const CONVERGENCE_WARNING_TICKS = 10;           // 1s warning before shrink
export const CONVERGENCE_MIN_COLS = 11;
export const CONVERGENCE_MIN_ROWS = 11;

// ============================================================================
// Power-up mode
// ============================================================================

export const POWERUP_RESPAWN_COOLDOWN_TICKS = 95; // ~9.5s at 100ms
export const POWERUP_FIRST_SPAWN_TICKS = 25;

export const POWERUP_SURGE_DURATION_TICKS = 40;     // 4s
export const POWERUP_FREEZE_DURATION_TICKS = 40;    // 4s
export const POWERUP_PHANTOM_DURATION_TICKS = 50;   // 5s
export const POWERUP_ANCHOR_DURATION_TICKS = 100;   // 10s
export const POWERUP_AMPLIFIER_CHARGES = 3;

/** Desaturated accent colors (30% saturation) for power-up rendering */
export const POWERUP_COLORS: Record<string, number> = {
  SURGE: 0xC8881A,       // amber
  FREEZE: 0x2878A8,      // blue
  PHANTOM: 0x9898B8,     // ghost silver
  ANCHOR: 0xD0D0D0,      // near-white
  AMPLIFIER: 0x7AAA70,   // faint green
  DECOY: 0xFFFFFF,       // white (like a real coinbase)
};

/** Spawn weights: index maps to spawn probability relative to others */
export const POWERUP_SPAWN_WEIGHTS: Record<string, number> = {
  SURGE: 3,
  FREEZE: 3,
  PHANTOM: 2,
  ANCHOR: 2,
  AMPLIFIER: 2,
  DECOY: 1,
};

// ============================================================================
// Sovereign AI tiers
// ============================================================================

/** Random-move probability for Wanderer AI (0–100; higher = more random) */
export const AI_WANDERER_RANDOM_CHANCE = 60;
/** How often Tactician re-evaluates threat vs coinbase (every N ticks) */
export const AI_TACTICIAN_THREAT_INTERVAL = 3;

// ============================================================================
// Void cells (level 9 gauntlet)
// ============================================================================

export const VOID_CELLS_TOGGLE_INTERVAL_TICKS = 50; // 5s
export const VOID_CELLS_COUNT = 30;

// ============================================================================
// Bounty
// ============================================================================

export const BOUNTY_COINBASE_RINGS = 6;
export const BOUNTY_COINBASE_COLOR = 0xC89020; // gold

// ============================================================================
// Chain abilities (used in POWERUP and BOUNTY modes)
// ============================================================================

export const CHAIN_ABILITY_RADIANCE_DURATION_TICKS = 15; // ~1.5s white flash
export const CHAIN_ABILITY_SHADOW_STEP_SAFE_RADIUS = 5;  // cells from opponent

// ============================================================================
// Labyrinth mode (recursive-backtracking maze)
// ============================================================================

/** Maze regenerates every N ticks (~45s at 100ms). 0 = static maze (no regen). */
export const LABYRINTH_REGEN_INTERVAL_TICKS = 450;
/** Brief warning period before maze regeneration (ticks). */
export const LABYRINTH_REGEN_WARNING_TICKS = 15;
