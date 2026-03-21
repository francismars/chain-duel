import type { GameState } from '@/game/engine/types';
import type { OnlineRoomSnapshot } from '@/types/socket';

/**
 * Ensures the last replay frame matches live endgame overlay (Pixi: "X WINS!").
 * Server recorders sometimes omit the tick where `gameEnded` flips true; we patch
 * client-side and mirror this in `encodeFramesToInnerJson` for marspayTS parity.
 */
export function ensureReplayVictoryEndFrame(frames: OnlineRoomSnapshot[]): OnlineRoomSnapshot[] {
  if (frames.length === 0) {
    return frames;
  }
  const last = frames[frames.length - 1]!;
  const st = last.state as GameState;

  const replaceLast = (nextState: GameState): OnlineRoomSnapshot[] => [
    ...frames.slice(0, -1),
    { ...last, state: nextState },
  ];

  if (st.gameEnded) {
    const name = String(st.winnerName ?? '').trim();
    if (!name && st.winnerPlayer) {
      const inferred =
        st.winnerPlayer === 'P1' ? (st.p1Name || 'Player 1') : (st.p2Name || 'Player 2');
      return replaceLast({ ...st, winnerName: inferred });
    }
    if (!name && (st.score[0] <= 0 || st.score[1] <= 0) && !(st.score[0] <= 0 && st.score[1] <= 0)) {
      const winner = st.score[0] <= 0 ? ('P2' as const) : ('P1' as const);
      const inferred = winner === 'P1' ? (st.p1Name || 'Player 1') : (st.p2Name || 'Player 2');
      return replaceLast({ ...st, winnerPlayer: winner, winnerName: inferred });
    }
    return frames;
  }

  const economyWin =
    st.gameStarted &&
    (st.score[0] <= 0 || st.score[1] <= 0) &&
    !(st.score[0] <= 0 && st.score[1] <= 0);

  if (economyWin) {
    const winner = st.score[0] <= 0 ? ('P2' as const) : ('P1' as const);
    const winnerName = winner === 'P1' ? (st.p1Name || 'Player 1') : (st.p2Name || 'Player 2');
    return replaceLast({
      ...st,
      gameEnded: true,
      countdownStart: false,
      winnerPlayer: winner,
      winnerName,
    });
  }

  if (st.winnerPlayer) {
    const winnerName =
      String(st.winnerName ?? '').trim() ||
      (st.winnerPlayer === 'P1' ? (st.p1Name || 'Player 1') : (st.p2Name || 'Player 2'));
    return replaceLast({
      ...st,
      gameEnded: true,
      countdownStart: false,
      winnerPlayer: st.winnerPlayer,
      winnerName,
    });
  }

  return frames;
}
