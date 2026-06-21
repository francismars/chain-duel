import {
  CAPTURE_LEVELS,
  FFA_HUD_COLORS,
  FFA_START_SATS_PER_PLAYER,
} from '@/game/engine/constants';
import type { GameState, PlayerId } from '@/game/engine/types';
import type { FfaHudPlayer } from '@/game/engine/types';

export type FfaPlayerIndex = 0 | 1 | 2 | 3;

const FFA_COLORS = FFA_HUD_COLORS;

export function isFfaMode(state: GameState): boolean {
  return state.meta.teamMode === 'ffa' && state.extraSnakes.length >= 2;
}

export function is2v1Mode(state: GameState): boolean {
  return state.meta.teamMode === '2v1';
}

/** FFA (4P) or 2v1 — last-player-standing with elimination at 0 sats. */
export function isEliminationMode(state: GameState): boolean {
  return isFfaMode(state) || is2v1Mode(state);
}

export function multiplayerPlayerCount(state: GameState): number {
  if (is2v1Mode(state)) return 3;
  if (isFfaMode(state)) return 4;
  return 2;
}

function ensureEliminatedFlags(
  state: GameState
): [boolean, boolean, boolean, boolean] {
  if (!state.ffaEliminated) {
    state.ffaEliminated = [false, false, false, false];
  }
  return state.ffaEliminated;
}

export function isFfaPlayerAlive(
  state: GameState,
  index: FfaPlayerIndex
): boolean {
  if (!isEliminationMode(state)) return true;
  const flags = state.ffaEliminated;
  if (flags?.[index]) return false;
  const scores = getFfaScores(state);
  return scores[index] > 0;
}

export function getFfaScores(
  state: GameState
): [number, number, number, number] {
  return [
    state.score[0],
    state.score[1],
    state.extraSnakes[0]?.score ?? 0,
    state.extraSnakes[1]?.score ?? 0,
  ];
}

export function setFfaScores(
  state: GameState,
  scores: [number, number, number, number]
): void {
  state.score[0] = scores[0];
  state.score[1] = scores[1];
  if (state.extraSnakes[0]) state.extraSnakes[0].score = scores[2];
  if (state.extraSnakes[1]) state.extraSnakes[1].score = scores[3];
}

export function initFfaEconomy(
  state: GameState,
  p1Stake?: number,
  p2Stake?: number
): void {
  const count = multiplayerPlayerCount(state);
  const perPlayer =
    p1Stake != null && p1Stake > 0 && p1Stake === p2Stake
      ? p1Stake
      : FFA_START_SATS_PER_PLAYER;
  state.totalPoints = perPlayer * count;
  const initial: [number, number, number, number] = [
    perPlayer,
    perPlayer,
    count >= 3 ? perPlayer : 0,
    count >= 4 ? perPlayer : 0,
  ];
  state.initialScore = [initial[0], initial[1]];
  setFfaScores(state, initial);
  state.ffaInitialScores = [...initial];
  state.ffaEliminated = [false, false, false, false];
}

/** 2v1: one human side vs AI team — equal starting sats per side (e.g. 1000 vs 1000). */
export function init2v1Economy(state: GameState, sideStake?: number): void {
  const perSide =
    sideStake != null && sideStake > 0 ? sideStake : FFA_START_SATS_PER_PLAYER;
  const aiFirst = Math.floor(perSide / 2);
  const aiSecond = perSide - aiFirst;
  state.totalPoints = perSide * 2;
  const initial: [number, number, number, number] = [
    perSide,
    aiFirst,
    aiSecond,
    0,
  ];
  state.initialScore = [perSide, perSide];
  setFfaScores(state, initial);
  state.ffaInitialScores = [...initial];
  state.ffaEliminated = [false, false, false, false];
}

/** Clear snake from board when eliminated at 0 sats. */
export function eliminateFfaPlayer(
  state: GameState,
  index: FfaPlayerIndex
): void {
  if (!isEliminationMode(state)) return;
  const flags = ensureEliminatedFlags(state);
  if (flags[index]) return;
  flags[index] = true;

  if (index === 0) {
    state.p1.head = [-1, -1];
    state.p1.body = [];
    state.p1.dir = '';
    state.p1.dirWanted = '';
  } else if (index === 1) {
    state.p2.head = [-1, -1];
    state.p2.body = [];
    state.p2.dir = '';
    state.p2.dirWanted = '';
  } else if (index === 2 && state.extraSnakes[0]) {
    const extra = state.extraSnakes[0];
    extra.snake.head = [-1, -1];
    extra.snake.body = [];
    extra.snake.dir = '';
    extra.snake.dirWanted = '';
  } else if (index === 3 && state.extraSnakes[1]) {
    const extra = state.extraSnakes[1];
    extra.snake.head = [-1, -1];
    extra.snake.body = [];
    extra.snake.dir = '';
    extra.snake.dirWanted = '';
  }

  checkFfaEliminations(state);
}

/** After score changes — eliminate anyone at 0 sats. */
export function checkFfaEliminations(state: GameState): void {
  if (!isEliminationMode(state)) return;
  const scores = getFfaScores(state);
  const count = multiplayerPlayerCount(state);
  for (let i = 0; i < count; i += 1) {
    const idx = i as FfaPlayerIndex;
    if (scores[idx] <= 0 && isFfaPlayerAlive(state, idx)) {
      const flags = ensureEliminatedFlags(state);
      flags[idx] = true;
      if (idx === 0) {
        state.p1.head = [-1, -1];
        state.p1.body = [];
        state.p1.dir = '';
        state.p1.dirWanted = '';
      } else if (idx === 1) {
        state.p2.head = [-1, -1];
        state.p2.body = [];
        state.p2.dir = '';
        state.p2.dirWanted = '';
      } else if (idx === 2 && state.extraSnakes[0]) {
        state.extraSnakes[0].snake.head = [-1, -1];
        state.extraSnakes[0].snake.body = [];
        state.extraSnakes[0].snake.dir = '';
        state.extraSnakes[0].snake.dirWanted = '';
      } else if (idx === 3 && state.extraSnakes[1]) {
        state.extraSnakes[1].snake.head = [-1, -1];
        state.extraSnakes[1].snake.body = [];
        state.extraSnakes[1].snake.dir = '';
        state.extraSnakes[1].snake.dirWanted = '';
      }
    }
  }
  checkFfaGameEnd(state);
}

export function ffaPlayerName(state: GameState, index: FfaPlayerIndex): string {
  switch (index) {
    case 0:
      return state.p1Name;
    case 1:
      return state.p2Name;
    case 2:
      return state.extraSnakes[0]?.name ?? 'P3';
    case 3:
      return state.extraSnakes[1]?.name ?? 'P4';
  }
}

function ffaSnakeBodyLength(state: GameState, index: FfaPlayerIndex): number {
  if (!isFfaPlayerAlive(state, index)) return 0;
  switch (index) {
    case 0:
      return state.p1.body.length;
    case 1:
      return state.p2.body.length;
    case 2:
      return state.extraSnakes[0]?.snake.body.length ?? 0;
    case 3:
      return state.extraSnakes[1]?.snake.body.length ?? 0;
  }
}

function captureLabelForLength(length: number): string {
  return `${capturePercentForLength(length)}%`;
}

/** Capture % tier for a single snake body length. */
export function capturePercentForLength(length: number): number {
  for (const level of CAPTURE_LEVELS) {
    if (length >= level.minLength && length <= level.maxLength) {
      return level.percent;
    }
  }
  return 32;
}

/**
 * 2v1 AI team: each chain contributes its own capture tier ("two chains, one bite").
 * Capped at 32% — same max as a single snake.
 */
export function get2v1TeamCapturePercent(state: GameState): number {
  const p2Len = state.p2.body.length;
  const p3Len = state.extraSnakes[0]?.snake.body.length ?? 0;
  return Math.min(
    32,
    capturePercentForLength(p2Len) + capturePercentForLength(p3Len)
  );
}

function teamIdFor2v1Player(index: FfaPlayerIndex): 0 | 1 {
  return index === 0 ? 0 : 1;
}

/** Steal capture % of the pot from each alive opponent (FFA: equal shares; 2v1: proportional across opposing team only). */
export function ffaApplyCaptureAmount(
  state: GameState,
  winner: FfaPlayerIndex,
  safeChange: number
): void {
  const scores = getFfaScores(state);
  const count = multiplayerPlayerCount(state);
  const winnerTeam = is2v1Mode(state) ? teamIdFor2v1Player(winner) : null;
  const opponents: FfaPlayerIndex[] = [];
  for (let i = 0; i < count; i += 1) {
    const idx = i as FfaPlayerIndex;
    if (idx === winner) continue;
    if (!isFfaPlayerAlive(state, idx)) continue;
    if (winnerTeam !== null && teamIdFor2v1Player(idx) === winnerTeam) continue;
    opponents.push(idx);
  }
  if (opponents.length === 0) return;

  let distributed = 0;

  if (isFfaMode(state)) {
    const perOpponent = Math.floor(safeChange / opponents.length);
    let remainder = safeChange - perOpponent * opponents.length;
    for (const idx of opponents) {
      let loss = perOpponent;
      if (remainder > 0) {
        loss += 1;
        remainder -= 1;
      }
      loss = Math.min(scores[idx], loss);
      scores[idx] -= loss;
      distributed += loss;
    }
  } else {
    let othersTotal = 0;
    for (const idx of opponents) {
      othersTotal += scores[idx];
    }
    if (othersTotal <= 0) return;
    for (const idx of opponents) {
      const loss = Math.min(
        scores[idx],
        Math.floor(safeChange * (scores[idx] / othersTotal))
      );
      scores[idx] -= loss;
      distributed += loss;
    }
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

  checkFfaEliminations(state);
}

function check2v1GameEnd(state: GameState): void {
  const scores = getFfaScores(state);
  const humanAlive = isFfaPlayerAlive(state, 0) && scores[0] > 0;
  const aiAlive =
    (isFfaPlayerAlive(state, 1) && scores[1] > 0) ||
    (isFfaPlayerAlive(state, 2) && scores[2] > 0);

  if (humanAlive && aiAlive) return;

  state.gameEnded = true;
  if (humanAlive) {
    state.winnerPlayer = 'P1';
    state.winnerName = state.p1Name;
    return;
  }
  if (aiAlive) {
    state.winnerPlayer = 'P2';
    if (isFfaPlayerAlive(state, 1) && scores[1] > 0) {
      state.winnerName = state.p2Name;
    } else {
      state.winnerName = state.extraSnakes[0]?.name ?? state.p2Name;
    }
    return;
  }
  const aiScore = scores[1] + scores[2];
  if (scores[0] >= aiScore) {
    state.winnerPlayer = 'P1';
    state.winnerName = state.p1Name;
  } else {
    state.winnerPlayer = 'P2';
    state.winnerName = state.p2Name;
  }
}

export function checkFfaGameEnd(state: GameState): void {
  if (!isEliminationMode(state)) return;
  if (is2v1Mode(state)) {
    check2v1GameEnd(state);
    return;
  }
  const count = multiplayerPlayerCount(state);
  const scores = getFfaScores(state);
  const alive: FfaPlayerIndex[] = [];
  for (let i = 0; i < count; i += 1) {
    const idx = i as FfaPlayerIndex;
    if (isFfaPlayerAlive(state, idx) && scores[idx] > 0) alive.push(idx);
  }
  if (alive.length > 1) return;
  state.gameEnded = true;
  const idx = (alive[0] ?? 0) as FfaPlayerIndex;
  state.winnerName = ffaPlayerName(state, idx);
  if (idx === 0) state.winnerPlayer = 'P1';
  else if (idx === 1) state.winnerPlayer = 'P2';
  else state.winnerPlayer = null;
}

export function get2v1AiTeamScore(state: GameState): number {
  const scores = getFfaScores(state);
  return scores[1] + scores[2];
}

export function get2v1AiTeamInitialScore(state: GameState): number {
  const initial = state.ffaInitialScores ?? getFfaScores(state);
  return initial[1] + initial[2];
}

/** Team-side totals for 2v1 distribution bars (50/50 at equal starting stakes). */
export function get2v1HudTeamScores(state: GameState): {
  p1Score: number;
  aiScore: number;
  p1Initial: number;
  aiInitial: number;
} {
  const scores = getFfaScores(state);
  const initial = state.ffaInitialScores ?? scores;
  return {
    p1Score: scores[0],
    aiScore: scores[1] + scores[2],
    p1Initial: initial[0],
    aiInitial: initial[1] + initial[2],
  };
}

/** Combined AI team capture % for 2v1 HUD. */
export function get2v1AiTeamCaptureLabel(state: GameState): string {
  return `${get2v1TeamCapturePercent(state)}%`;
}

export function buildFfaHud(state: GameState): FfaHudPlayer[] {
  const count = multiplayerPlayerCount(state);
  const initial = state.ffaInitialScores ?? getFfaScores(state);
  const current = getFfaScores(state);
  const total = state.totalPoints || 1;
  const indices = (
    count === 3 ? ([0, 1, 2] as const) : ([0, 1, 2, 3] as const)
  ) as FfaPlayerIndex[];
  return indices.map((index) => ({
    index,
    name: ffaPlayerName(state, index),
    color: FFA_COLORS[index],
    score: current[index],
    capture: isFfaPlayerAlive(state, index)
      ? captureLabelForLength(ffaSnakeBodyLength(state, index))
      : 'OUT',
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
  const withInitial = players.map((p) => ({
    ...p,
    currentShare: p.initialShare,
  }));
  return ffaConicGradient(withInitial);
}
