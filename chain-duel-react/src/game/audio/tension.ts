import type { GameState } from '@/game/engine/types';

/** Shares use the current pool, so stake size and block bonuses don't change thresholds. */
export type TensionLevel = 0 | 1 | 2 | 3 | 4;

export function getTensionLevel(state: GameState): TensionLevel {
  if (!state.gameStarted || state.gameEnded) return 0;
  const players = [
    { length: state.p1.body.length, score: state.score[0] },
    { length: state.p2.body.length, score: state.score[1] },
    ...state.extraSnakes.map(({ snake, score }) => ({
      length: snake.body.length,
      score,
    })),
  ].filter(
    (player, index) => player.score > 0 && !state.ffaEliminated?.[index]
  );
  const longest = Math.max(0, ...players.map((player) => player.length));
  const scores =
    state.meta.teamMode === '2v1'
      ? [state.score[0], state.score[1] + (state.extraSnakes[0]?.score ?? 0)]
      : players.map((player) => player.score);
  const pool = scores.reduce((sum, score) => sum + score, 0);
  const leaderShare = pool > 0 ? Math.max(...scores) / pool : 0;
  const border = state.shrinkBorder;
  // Measure playable interior, excluding the perimeter walls.
  const originalArea =
    Math.max(0, state.cols - 2) * Math.max(0, state.rows - 2);
  const currentArea = border
    ? Math.max(0, border.right - border.left - 1) *
      Math.max(0, border.bottom - border.top - 1)
    : originalArea;
  const lostArea = Math.max(0, originalArea - currentArea);
  const lostPercent = originalArea > 0 ? (lostArea * 100) / originalArea : 0;
  if (longest >= 16 || leaderShare >= 0.95 || lostPercent >= 65) return 4;
  if (longest >= 11 || leaderShare >= 0.85 || lostPercent >= 45) return 3;
  if (longest >= 7 || leaderShare >= 0.75 || lostPercent >= 25) return 2;
  if (longest >= 4 || leaderShare >= 0.6 || lostPercent > 0) return 1;
  return 0;
}
