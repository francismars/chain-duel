import {
  CONVERGENCE_MIN_COLS,
  CONVERGENCE_MIN_ROWS,
  GAME_COLS,
  GAME_ROWS,
} from '@/game/engine/constants';
import type { GameState, GridPos } from '@/game/engine/types';
import {
  SHIPPED_RECIPE,
  capturePercentForLength,
  levelFromMarks,
  type MatchRecipe,
} from '@/game/effects/matchRecipe';

/** Shares use the current pool, so stake size and block bonuses don't change thresholds. */
export type TensionLevel = 0 | 1 | 2 | 3 | 4;

export type TensionTrack = 'off' | 'build' | 'pressure' | 'tension' | 'critical';

export const TENSION_TRACKS: readonly TensionTrack[] = [
  'off',
  'build',
  'pressure',
  'tension',
  'critical',
];

export interface TensionBreakdown {
  chain: TensionLevel;
  walls: TensionLevel;
  score: TensionLevel;
  streak: TensionLevel;
  level: TensionLevel;
  streakCount: number;
}

export interface TensionPlayer {
  index: number;
  length: number;
  score: number;
  eliminated: boolean;
  head: GridPos;
}

export function tensionPlayers(state: GameState): TensionPlayer[] {
  return [
    {
      index: 0,
      length: state.p1.body.length,
      score: state.score[0],
      eliminated: Boolean(state.ffaEliminated?.[0]),
      head: state.p1.head,
    },
    {
      index: 1,
      length: state.p2.body.length,
      score: state.score[1],
      eliminated: Boolean(state.ffaEliminated?.[1]),
      head: state.p2.head,
    },
    ...state.extraSnakes.map(({ snake, score }, offset) => ({
      index: offset + 2,
      length: snake.body.length,
      score,
      eliminated: Boolean(state.ffaEliminated?.[offset + 2]),
      head: snake.head,
    })),
  ];
}

export function chainTension(
  longest: number,
  marks: MatchRecipe['chainMarks'] = SHIPPED_RECIPE.chainMarks
): TensionLevel {
  return levelFromMarks(longest, marks);
}

export function wallsTension(
  lostPercent: number,
  marks: MatchRecipe['wallMarks'] = SHIPPED_RECIPE.wallMarks
): TensionLevel {
  return levelFromMarks(lostPercent, marks, 'gt');
}

export function scoreTension(
  leaderShare: number,
  marks: MatchRecipe['scoreMarks'] = SHIPPED_RECIPE.scoreMarks
): TensionLevel {
  const shares = marks.map((mark) => mark / 100) as MatchRecipe['scoreMarks'];
  return levelFromMarks(leaderShare, shares);
}

/** Consecutive catches. */
export function streakTension(
  count: number,
  marks: MatchRecipe['streakMarks'] = SHIPPED_RECIPE.streakMarks
): TensionLevel {
  return levelFromMarks(count, marks);
}

/**
 * Warning when any chain reaches the lower tick.
 * Critical when any chain reaches the higher tick.
 * Returns 2 or 4 so the mixer plays the pressure stem, then the critical stem.
 */
export function captureGapTension(
  reached: number,
  recipe: MatchRecipe = SHIPPED_RECIPE
): TensionLevel {
  const [warnHigh, critHigh] = recipe.gapLeader;
  if (reached >= critHigh) return 4;
  if (reached >= warnHigh) return 2;
  return 0;
}

/** The lower mark is critical. The higher mark is warning. Both are a share of the pool. */
export function drainTension(
  trailerShare: number,
  marks: readonly [number, number] = SHIPPED_RECIPE.drainMarks
): TensionLevel {
  const crit = Math.min(marks[0], marks[1]) / 100;
  const warn = Math.max(marks[0], marks[1]) / 100;
  if (trailerShare <= crit) return 4;
  if (trailerShare <= warn) return 2;
  return 0;
}

/** How far the walls have closed when the match ends, as playable area lost. */
export function wallsClosedLostPercent(
  cols = GAME_COLS,
  rows = GAME_ROWS,
  minCols = CONVERGENCE_MIN_COLS,
  minRows = CONVERGENCE_MIN_ROWS
): number {
  const span = (start: number, min: number) =>
    start <= min ? start : start - Math.floor((start - min) / 2) * 2;
  const original = Math.max(0, cols - 2) * Math.max(0, rows - 2);
  const current =
    Math.max(0, span(cols, minCols) - 2) * Math.max(0, span(rows, minRows) - 2);
  return original > 0 ? ((original - current) * 100) / original : 0;
}

export function lostPlayablePercent(state: GameState): number {
  const border = state.shrinkBorder;
  const originalArea =
    Math.max(0, state.cols - 2) * Math.max(0, state.rows - 2);
  const currentArea = border
    ? Math.max(0, border.right - border.left - 1) *
      Math.max(0, border.bottom - border.top - 1)
    : originalArea;
  const lostArea = Math.max(0, originalArea - currentArea);
  return originalArea > 0 ? (lostArea * 100) / originalArea : 0;
}

export function getTensionBreakdown(
  state: GameState,
  streakCount = 0,
  recipe: MatchRecipe = SHIPPED_RECIPE
): TensionBreakdown {
  const idle: TensionBreakdown = {
    chain: 0,
    walls: 0,
    score: 0,
    streak: 0,
    level: 0,
    streakCount: 0,
  };
  if (!state.gameStarted || state.gameEnded) return idle;

  const players = tensionPlayers(state).filter(
    (player) => player.score > 0 && !player.eliminated
  );
  const rates = players.map((player) =>
    capturePercentForLength(
      player.length,
      recipe.captureFrom,
      recipe.capturePercent
    )
  );
  const capture =
    rates.length > 0
      ? captureGapTension(Math.max(...rates), recipe)
      : 0;
  const scores =
    state.meta.teamMode === '2v1'
      ? [state.score[0], state.score[1] + (state.extraSnakes[0]?.score ?? 0)]
      : players.map((player) => player.score);
  const pool = scores.reduce((sum, score) => sum + score, 0);
  const trailerShare = pool > 0 ? Math.min(...scores) / pool : 1;
  const score = drainTension(trailerShare, recipe.drainMarks);
  const level = Math.max(capture, score) as TensionLevel;
  return {
    chain: capture,
    walls: 0,
    score,
    streak: 0,
    level,
    streakCount,
  };
}

export function getTensionLevel(
  state: GameState,
  streakCount = 0
): TensionLevel {
  return getTensionBreakdown(state, streakCount).level;
}
