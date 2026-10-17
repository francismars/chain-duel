import type { GameState, GridPos } from '@/game/engine/types';

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

export function chainTension(longest: number): TensionLevel {
  if (longest >= 16) return 4;
  if (longest >= 11) return 3;
  if (longest >= 7) return 2;
  if (longest >= 4) return 1;
  return 0;
}

export function wallsTension(lostPercent: number): TensionLevel {
  if (lostPercent >= 65) return 4;
  if (lostPercent >= 45) return 3;
  if (lostPercent >= 25) return 2;
  if (lostPercent > 0) return 1;
  return 0;
}

export function scoreTension(leaderShare: number): TensionLevel {
  if (leaderShare >= 0.95) return 4;
  if (leaderShare >= 0.85) return 3;
  if (leaderShare >= 0.75) return 2;
  if (leaderShare >= 0.6) return 1;
  return 0;
}

/** Consecutive catches: 2 / 3 / 5 / 8. */
export function streakTension(count: number): TensionLevel {
  if (count >= 8) return 4;
  if (count >= 5) return 3;
  if (count >= 3) return 2;
  if (count >= 2) return 1;
  return 0;
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
  streakCount = 0
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
  const longest = Math.max(0, ...players.map((player) => player.length));
  const scores =
    state.meta.teamMode === '2v1'
      ? [state.score[0], state.score[1] + (state.extraSnakes[0]?.score ?? 0)]
      : players.map((player) => player.score);
  const pool = scores.reduce((sum, score) => sum + score, 0);
  const leaderShare = pool > 0 ? Math.max(...scores) / pool : 0;
  const chain = chainTension(longest);
  const walls = wallsTension(lostPlayablePercent(state));
  const score = scoreTension(leaderShare);
  const streak = streakTension(streakCount);
  const level = Math.max(chain, walls, score, streak) as TensionLevel;
  return { chain, walls, score, streak, level, streakCount };
}

export function getTensionLevel(
  state: GameState,
  streakCount = 0
): TensionLevel {
  return getTensionBreakdown(state, streakCount).level;
}
