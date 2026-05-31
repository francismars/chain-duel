export const GAME_COLS = 51;
export const GAME_ROWS = 25;
export const STEP_SPEED_MS = 100;
export const COUNTDOWN_END_TICK = 40;

/** 1v1 player 2 snake fill (black). */
export const P2_SNAKE_COLOR = 0x111111;

/** FFA extras: darker / lighter greys than P2 black. */
export const FFA_GHOST_COLOR = 0x2a2a2a;
export const FFA_SPECTER_COLOR = 0x666666;

/** FFA bot roster — one unique name per AI slot (P1→P4), from legacy tournament cast. */
export const BOT_NAME_BIGTOSHI = 'BigToshi 🌊';
export const BOT_NAME_NAKAMOTOR = 'Nakamotor ⚡';
export const BOT_NAME_XORNOTHING = 'XORNOTHING ⛓';
export const BOT_NAME_256OCTANS = '256octans 🐙';
export const FFA_BOT_NAMES = [
  BOT_NAME_BIGTOSHI,
  BOT_NAME_NAKAMOTOR,
  BOT_NAME_XORNOTHING,
  BOT_NAME_256OCTANS,
] as const;

/** HUD + distribution bars — match on-board snake fills. */
export const FFA_HUD_COLORS = [
  '#ffffff',
  '#111111',
  '#2a2a2a',
  '#666666',
] as const;

/** FFA: each of the four players starts with this many sats (4000 total pot). */
export const FFA_START_SATS_PER_PLAYER = 1000;

export const CAPTURE_LEVELS = [
  { minLength: 1, maxLength: 1, percent: 2 },
  { minLength: 2, maxLength: 3, percent: 4 },
  { minLength: 4, maxLength: 6, percent: 8 },
  { minLength: 7, maxLength: 10, percent: 16 },
  { minLength: 11, maxLength: Number.POSITIVE_INFINITY, percent: 32 },
] as const;

export const CONVERGENCE_SHRINK_INTERVAL_TICKS = 150;
export const CONVERGENCE_WARNING_TICKS = 10;
export const CONVERGENCE_MIN_COLS = 11;
export const CONVERGENCE_MIN_ROWS = 11;

/**
 * Practice hub: ticks between border shrinks (~1.3 min to 11×11 at 100ms steps).
 */
export const PRACTICE_HUB_CONVERGENCE_SHRINK_INTERVAL_TICKS = 40;

export const POWERUP_RESPAWN_COOLDOWN_TICKS = 95;
export const POWERUP_FIRST_SPAWN_TICKS = 25;

export const POWERUP_SURGE_DURATION_TICKS = 40;
export const POWERUP_FREEZE_DURATION_TICKS = 40;
export const POWERUP_PHANTOM_DURATION_TICKS = 50;
export const POWERUP_AMPLIFIER_CHARGES = 3;

export const POWERUP_COLORS: Record<string, number> = {
  SURGE: 0xC8881A,
  FREEZE: 0x2878A8,
  PHANTOM: 0x9898B8,
  AMPLIFIER: 0x7AAA70,
  DECOY: 0xFFFFFF,
};

export const POWERUP_SPAWN_WEIGHTS: Record<string, number> = {
  SURGE: 3,
  FREEZE: 3,
  PHANTOM: 2,
  AMPLIFIER: 2,
  DECOY: 1,
};

export const AI_WANDERER_RANDOM_CHANCE = 60;
export const AI_TACTICIAN_THREAT_INTERVAL = 3;
