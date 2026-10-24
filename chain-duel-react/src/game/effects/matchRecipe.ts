import type { TensionLevel } from '@/game/audio/tension';
import { CAPTURE_LEVELS } from '@/game/engine/constants';

/** The knobs that decide pressure music, capture clips, and capture animation. */
export type MatchRecipe = {
  /** Body length that reaches pressure marks 1–4. */
  chainMarks: [number, number, number, number];
  /** Playable area lost, in percent. Mark 1 fires above the first number. */
  wallMarks: [number, number, number, number];
  /** Leader's share of the sats, in percent. */
  scoreMarks: [number, number, number, number];
  /** Catches in a row. */
  streakMarks: [number, number, number, number];
  /** Build, pressure, tension, critical. Each is 0–1. */
  stemVolumes: [number, number, number, number];
  /** How far the game bed ducks under the loudest stem. 0–1. */
  duck: number;
  /** How long a pressure stem stays at full volume after its mark drops. */
  holdMs: number;
  /** How long a full-volume stem takes to fade to silence after the hold. 0 cuts it off. */
  fadeMs: number;
  /** Mark 1–4. A mark that is off does not play, and the next lower mark that is on plays instead. */
  stemEnabled: [boolean, boolean, boolean, boolean];
  /** Body length where each capture percent begins. Five steps, shortest first. */
  captureFrom: [number, number, number, number, number];
  /** Percent taken from that length until the next step. */
  capturePercent: [number, number, number, number, number];
  /** Capture percent any chain has reached. The lower tick is warning, the higher tick is critical. */
  gapLeader: [number, number];
  /** Trailer share of the sats, in percent. The lower tick is critical, the higher tick is warning. */
  drainMarks: [number, number];
  animGrow: boolean;
  animTint: boolean;
  animScale: boolean;
  /** File in public/sound for the game bed. */
  bedFile: string;
  /** Build, pressure, tension, critical. Files in public/sound. */
  stemFiles: [string, string, string, string];
};

/** Every file in public/sound. The lab picks music from this list. */
export const SOUND_FILES = [
  'Beep1.m4a',
  'Beep2.m4a',
  'MAINNET_BLOCK.aac',
  'P-FC_16.aac',
  'P-FC_2.aac',
  'P-FC_32.aac',
  'P-FC_4.aac',
  'P-FC_8.aac',
  'P1-FC-a.aac',
  'P1-FC.mp3',
  'P1-HWAC.aac',
  'P1-HWAC.mp3',
  'P2-FC-a.aac',
  'P2-FC.mp3',
  'P2-HWAC.aac',
  'P2-HWAC.mp3',
  'button-focus.mp3',
  'button-select.mp3',
  'chain_duel_1.mp3',
  'chain_duel_1.ogg',
  'chain_duel_2.mp3',
  'chain_duel_2.ogg',
  'chain_duel_build.m4a',
  'chain_duel_critical.m4a',
  'chain_duel_end.m4a',
  'chain_duel_pressure.m4a',
  'chain_duel_produced_game.m4a',
  'chain_duel_produced_menu.m4a',
  'chain_duel_shrink.m4a',
  'chain_duel_tension.m4a',
  'powerup.mp3',
] as const;

export const SHIPPED_RECIPE: MatchRecipe = {
  chainMarks: [4, 7, 11, 16],
  wallMarks: [0, 25, 45, 65],
  scoreMarks: [60, 75, 85, 95],
  streakMarks: [2, 3, 5, 8],
  stemVolumes: [0.22, 0.34, 0.46, 0.65],
  duck: 0.35,
  holdMs: 1000,
  fadeMs: 2500,
  captureFrom: CAPTURE_LEVELS.map((level) => level.minLength) as [
    number,
    number,
    number,
    number,
    number,
  ],
  capturePercent: CAPTURE_LEVELS.map((level) => level.percent) as [
    number,
    number,
    number,
    number,
    number,
  ],
  gapLeader: [16, 32],
  drainMarks: [10, 25],
  animGrow: true,
  animTint: false,
  animScale: false,
  bedFile: 'chain_duel_produced_game.m4a',
  stemFiles: [
    'chain_duel_build.m4a',
    'chain_duel_pressure.m4a',
    'chain_duel_tension.m4a',
    'chain_duel_critical.m4a',
  ],
  stemEnabled: [true, true, true, true],
};

const STORAGE_KEY = 'chainduel.matchRecipe';

export function cloneRecipe(recipe: MatchRecipe): MatchRecipe {
  return {
    chainMarks: [...recipe.chainMarks],
    wallMarks: [...recipe.wallMarks],
    scoreMarks: [...recipe.scoreMarks],
    streakMarks: [...recipe.streakMarks],
    stemVolumes: [...recipe.stemVolumes],
    duck: recipe.duck,
    holdMs: recipe.holdMs,
    fadeMs: recipe.fadeMs,
    stemEnabled: [...recipe.stemEnabled],
    captureFrom: [...recipe.captureFrom],
    capturePercent: [...recipe.capturePercent],
    gapLeader: [...recipe.gapLeader],
    drainMarks: [...recipe.drainMarks],
    animGrow: recipe.animGrow,
    animTint: recipe.animTint,
    animScale: recipe.animScale,
    bedFile: recipe.bedFile,
    stemFiles: [...recipe.stemFiles],
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function marks(
  value: unknown,
  min: number,
  max: number,
  fallback: [number, number, number, number]
): [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4) return [...fallback];
  return value.map((mark, index) => {
    const n = Number(mark);
    return Number.isFinite(n) ? clamp(n, min, max) : fallback[index];
  }) as [number, number, number, number];
}

type Five = [number, number, number, number, number];

function five(
  value: unknown,
  min: number,
  max: number,
  fallback: Five,
  spread: boolean
): Five {
  if (!Array.isArray(value) || value.length !== 5) return [...fallback];
  const next = value.map((mark, index) => {
    const n = Number(mark);
    return Number.isFinite(n) ? clamp(Math.round(n), min, max) : fallback[index]!;
  }) as Five;
  if (!spread) return next;
  next.sort((a, b) => a - b);
  for (let index = 1; index < next.length; index += 1) {
    if (next[index]! <= next[index - 1]!) {
      next[index] = Math.min(max, next[index - 1]! + 1);
    }
  }
  next[0] = 1;
  return next;
}

/** Percent an eat takes at this body length. */
export function capturePercentForLength(
  length: number,
  from: readonly number[] = SHIPPED_RECIPE.captureFrom,
  percent: readonly number[] = SHIPPED_RECIPE.capturePercent
): number {
  let value = percent[0] ?? 2;
  for (let index = 0; index < from.length; index += 1) {
    if (length >= (from[index] ?? 1)) value = percent[index] ?? value;
  }
  return value;
}

const CAPTURE_CLIPS = [2, 4, 8, 16, 32] as const;

/** The eat clip for this percent. The files are 2, 4, 8, 16, and 32. */
export function captureClipForPercent(percent: number): number {
  let clip: number = CAPTURE_CLIPS[0];
  for (const step of CAPTURE_CLIPS) {
    if (percent >= step) clip = step;
  }
  return clip;
}

/** The eat clip for this body length, using the same bands as the capture percent. */
export function captureClipForLength(
  length: number,
  from: readonly number[] = SHIPPED_RECIPE.captureFrom,
  percent: readonly number[] = SHIPPED_RECIPE.capturePercent
): number {
  return captureClipForPercent(capturePercentForLength(length, from, percent));
}

function steps(
  value: unknown,
  count: number,
  min: number,
  max: number,
  fallback: readonly number[]
): number[] {
  if (!Array.isArray(value) || value.length !== count) return [...fallback];
  const next = value.map((mark, index) => {
    const n = Number(mark);
    return Number.isFinite(n) ? clamp(Math.round(n), min, max) : fallback[index]!;
  });
  next.sort((a, b) => a - b);
  return next;
}

function flags(
  value: unknown,
  fallback: [boolean, boolean, boolean, boolean]
): [boolean, boolean, boolean, boolean] {
  if (!Array.isArray(value) || value.length !== 4) return [...fallback];
  return value.map((item, index) =>
    typeof item === 'boolean' ? item : fallback[index]!
  ) as [boolean, boolean, boolean, boolean];
}

function soundFile(value: unknown, fallback: string): string {
  return typeof value === 'string' &&
    (SOUND_FILES as readonly string[]).includes(value)
    ? value
    : fallback;
}

function soundFiles(
  value: unknown,
  fallback: [string, string, string, string]
): [string, string, string, string] {
  if (!Array.isArray(value) || value.length !== 4) return [...fallback];
  return value.map((item, index) => soundFile(item, fallback[index]!)) as [
    string,
    string,
    string,
    string,
  ];
}

export function sanitizeRecipe(value: unknown): MatchRecipe {
  const raw = value && typeof value === 'object' ? (value as Partial<MatchRecipe>) : {};
  const shipped = SHIPPED_RECIPE;
  return {
    chainMarks: marks(raw.chainMarks, 1, 40, shipped.chainMarks),
    wallMarks: marks(raw.wallMarks, 0, 100, shipped.wallMarks),
    scoreMarks: marks(raw.scoreMarks, 1, 100, shipped.scoreMarks),
    streakMarks: marks(raw.streakMarks, 1, 30, shipped.streakMarks),
    stemVolumes: marks(raw.stemVolumes, 0, 1, shipped.stemVolumes),
    duck: Number.isFinite(Number(raw.duck))
      ? clamp(Number(raw.duck), 0, 1)
      : shipped.duck,
    holdMs: Number.isFinite(Number(raw.holdMs))
      ? clamp(Number(raw.holdMs), 0, 12000)
      : shipped.holdMs,
    fadeMs: Number.isFinite(Number(raw.fadeMs))
      ? clamp(Number(raw.fadeMs), 0, 20000)
      : shipped.fadeMs,
    stemEnabled: flags(raw.stemEnabled, shipped.stemEnabled),
    captureFrom: five(raw.captureFrom, 1, 36, shipped.captureFrom, true),
    capturePercent: five(raw.capturePercent, 1, 100, shipped.capturePercent, false),
    gapLeader: steps(raw.gapLeader, 2, 1, 100, shipped.gapLeader) as [number, number],
    drainMarks: steps(raw.drainMarks, 2, 1, 100, shipped.drainMarks) as [number, number],
    animGrow: typeof raw.animGrow === 'boolean' ? raw.animGrow : shipped.animGrow,
    animTint: typeof raw.animTint === 'boolean' ? raw.animTint : shipped.animTint,
    animScale: typeof raw.animScale === 'boolean' ? raw.animScale : shipped.animScale,
    bedFile: soundFile(raw.bedFile, shipped.bedFile),
    stemFiles: soundFiles(raw.stemFiles, shipped.stemFiles),
  };
}

/** What a real match uses: a saved recipe, or the shipped one. */
export function gameRecipe(): MatchRecipe {
  try {
    if (typeof localStorage === 'undefined') return cloneRecipe(SHIPPED_RECIPE);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneRecipe(SHIPPED_RECIPE);
    return sanitizeRecipe(JSON.parse(raw) as unknown);
  } catch {
    return cloneRecipe(SHIPPED_RECIPE);
  }
}

export function applyRecipe(recipe: MatchRecipe): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeRecipe(recipe)));
}

export function restoreShippedRecipe(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function recipesEqual(a: MatchRecipe, b: MatchRecipe): boolean {
  return JSON.stringify(sanitizeRecipe(a)) === JSON.stringify(sanitizeRecipe(b));
}

export function countRecipeDiffs(draft: MatchRecipe, live: MatchRecipe): number {
  const left = sanitizeRecipe(draft);
  const right = sanitizeRecipe(live);
  const keys = Object.keys(left) as (keyof MatchRecipe)[];
  return keys.filter(
    (key) => JSON.stringify(left[key]) !== JSON.stringify(right[key])
  ).length;
}

/** Map a measurement onto marks 1–4. The first wall mark fires when the value is above it. */
export function levelFromMarks(
  value: number,
  marks: readonly [number, number, number, number],
  first: 'gte' | 'gt' = 'gte'
): TensionLevel {
  if (value >= marks[3]) return 4;
  if (value >= marks[2]) return 3;
  if (value >= marks[1]) return 2;
  const reached = first === 'gt' ? value > marks[0] : value >= marks[0];
  return reached ? 1 : 0;
}
