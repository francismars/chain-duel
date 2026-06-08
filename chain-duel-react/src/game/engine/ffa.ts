import { CAPTURE_LEVELS, FFA_HUD_COLORS, FFA_START_SATS_PER_PLAYER } from '@/game/engine/constants';
import type { GameState, PlayerId } from '@/game/engine/types';
import type { FfaHudPlayer } from '@/game/engine/types';

export type FfaPlayerIndex = 0 | 1 | 2 | 3;

const FFA_COLORS = FFA_HUD_COLORS;

export function isFfaMode(state: GameState): boolean {
  return state.meta.teamMode === 'ffa' && state.extraSnakes.length >= 2;
}

export function getFfaScores(state: GameState): [number, number, number, number] {
  return [
    state.score[0],
    state.score[1],
    state.extraSnakes[0]?.score ?? 0,
    state.extraSnakes[1]?.score ?? 0,
  ];
}

export function setFfaScores(state: GameState, scores: [number, number, number, number]): void {
  state.score[0] = scores[0];
  state.score[1] = scores[1];
  if (state.extraSnakes[0]) state.extraSnakes[0].score = scores[2];
  if (state.extraSnakes[1]) state.extraSnakes[1].score = scores[3];
}

export function initFfaEconomy(state: GameState, p1Stake?: number, p2Stake?: number): void {
  const perPlayer =
    p1Stake != null && p1Stake > 0 && p1Stake === p2Stake
      ? p1Stake
      : FFA_START_SATS_PER_PLAYER;
  state.totalPoints = perPlayer * 4;
  const initial: [number, number, number, number] = [perPlayer, perPlayer, perPlayer, perPlayer];
  state.initialScore = [initial[0], initial[1]];
  setFfaScores(state, initial);
  state.ffaInitialScores = [...initial];
}

export function ffaPlayerName(state: GameState, index: FfaPlayerIndex): string {
  switch (index) {
    case 0: return state.p1Name;
    case 1: return state.p2Name;
    case 2: return state.extraSnakes[0]?.name ?? 'P3';
    case 3: return state.extraSnakes[1]?.name ?? 'P4';
  }
}

function ffaSnakeBodyLength(state: GameState, index: FfaPlayerIndex): number {
  switch (index) {
    case 0: return state.p1.body.length;
    case 1: return state.p2.body.length;
    case 2: return state.extraSnakes[0]?.snake.body.length ?? 0;
    case 3: return state.extraSnakes[1]?.snake.body.length ?? 0;
  }
}

function captureLabelForLength(length: number): string {
  for (const level of CAPTURE_LEVELS) {
    if (length >= level.minLength && length <= level.maxLength) {
      return `${level.percent}%`;
    }
  }
  return '32%';
}

/** Steal sats from all other players proportional to their holdings. */
export function ffaApplyCaptureAmount(
  state: GameState,
  winner: FfaPlayerIndex,
  safeChange: number,
): void {
  const scores = getFfaScores(state);
  const othersTotal = scores.reduce((sum, s, i) => (i === winner ? sum : sum + s), 0);
  if (othersTotal <= 0) return;

  let distributed = 0;
  for (let i = 0; i < 4; i += 1) {
    if (i === winner) continue;
    const loss = Math.min(scores[i], Math.floor(safeChange * (scores[i] / othersTotal)));
    scores[i] -= loss;
    distributed += loss;
  }
  scores[winner] = Math.min(state.totalPoints, scores[winner] + distributed);
  setFfaScores(state, scores);

  const hudPlayer: PlayerId = winner === 0 ? 'P1' : winner === 1 ? 'P2' : 'P1';
  state.pointChanges.push({
    player: hudPlayer,
    value: distributed,
    p1Pos: [state.p1.head[0], state.p1.head[1]],
    p2Pos: [state.p2.head[0], state.p2.head[1]],
    p1YOffsetPx: 0,
    p2YOffsetPx: 0,
    alpha: 1,
  });
}

export function checkFfaGameEnd(state: GameState): void {
  const scores = getFfaScores(state);
  const alive = scores.map((s, i) => (s > 0 ? i : -1)).filter((i) => i >= 0);
  if (alive.length > 1) return;
  state.gameEnded = true;
  const idx = (alive[0] ?? 0) as FfaPlayerIndex;
  state.winnerName = ffaPlayerName(state, idx);
  if (idx === 0) state.winnerPlayer = 'P1';
  else if (idx === 1) state.winnerPlayer = 'P2';
  else state.winnerPlayer = null;
}

export function buildFfaHud(state: GameState): FfaHudPlayer[] {
  const initial = state.ffaInitialScores ?? getFfaScores(state);
  const current = getFfaScores(state);
  const total = state.totalPoints || 1;
  return ([0, 1, 2, 3] as FfaPlayerIndex[]).map((index) => ({
    index,
    name: ffaPlayerName(state, index),
    color: FFA_COLORS[index],
    score: current[index],
    capture: captureLabelForLength(ffaSnakeBodyLength(state, index)),
    initialShare: (initial[index] * 100) / total,
    currentShare: (current[index] * 100) / total,
  }));
}

export function ffaConicGradient(players: FfaHudPlayer[]): string {
  const total = players.reduce((s, p) => s + p.currentShare, 0) || 100;
  let acc = 0;
  const stops: string[] = [];
  for (const p of players) {
    const pct = (p.currentShare / total) * 100;
    const end = acc + pct;
    stops.push(`${p.color} ${acc}% ${end}%`);
    acc = end;
  }
  return `conic-gradient(from 225deg at 50% 50%, ${stops.join(', ')})`;
}

export function ffaInitialConicGradient(players: FfaHudPlayer[]): string {
  const withInitial = players.map((p) => ({ ...p, currentShare: p.initialShare }));
  return ffaConicGradient(withInitial);
}
