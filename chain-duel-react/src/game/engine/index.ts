import {
  CAPTURE_LEVELS,
  COUNTDOWN_END_TICK,
  GAME_COLS,
  GAME_ROWS,
} from '@/game/engine/constants';
import type {
  Coinbase,
  Direction,
  GameMeta,
  GameState,
  GridPos,
  HudState,
  PlayerId,
  TickResult,
} from '@/game/engine/types';

interface CreateStateArgs {
  p1Name: string;
  p2Name: string;
  p1Points: number;
  p2Points: number;
  modeLabel: string;
  practiceMode: boolean;
  isTournament: boolean;
}

export function createGameState(args: CreateStateArgs): GameState {
  const p1 = Math.max(1, Math.floor(args.p1Points));
  const p2 = Math.max(1, Math.floor(args.p2Points));
  return {
    cols: GAME_COLS,
    rows: GAME_ROWS,
    p1: {
      head: [6, 12],
      body: [[5, 12]],
      dir: '',
      dirWanted: 'Right',
    },
    p2: {
      head: [44, 12],
      body: [[45, 12]],
      dir: '',
      dirWanted: 'Left',
    },
    coinbases: [{ pos: [25, 12] }],
    gameStarted: false,
    gameEnded: false,
    countdownStart: false,
    countdownTicks: 0,
    winnerPlayer: null,
    winnerName: '',
    sentWinner: false,
    initialScore: [p1, p2],
    score: [p1, p2],
    totalPoints: p1 + p2,
    currentCaptureP1: '2%',
    currentCaptureP2: '2%',
    pointChanges: [],
    p1Name: args.p1Name,
    p2Name: args.p2Name,
    meta: {
      modeLabel: args.modeLabel,
      practiceMode: args.practiceMode,
      isTournament: args.isTournament,
    },
  };
}

export function getHudState(state: GameState): HudState {
  const initialWidthP1 = (state.initialScore[0] * 100) / state.totalPoints;
  const initialWidthP2 = (state.initialScore[1] * 100) / state.totalPoints;
  const currentWidthP1 = (state.score[0] * 100) / state.totalPoints;
  const currentWidthP2 = (state.score[1] * 100) / state.totalPoints;
  return {
    p1Points: state.score[0],
    p2Points: state.score[1],
    captureP1: getCaptureLabel(state.p1.body.length),
    captureP2: getCaptureLabel(state.p2.body.length),
    initialWidthP1,
    initialWidthP2,
    currentWidthP1,
    currentWidthP2,
  };
}

export function startCountdown(state: GameState): void {
  if (!state.gameStarted) {
    state.countdownStart = true;
  }
}

export function setWantedDirection(
  state: GameState,
  player: PlayerId,
  dir: Exclude<Direction, ''>
): void {
  const snake = player === 'P1' ? state.p1 : state.p2;
  if (!state.gameStarted) {
    if (player === 'P1') {
      if (dir === 'Right') {
        snake.dirWanted = dir;
      }
    } else if (player === 'P2') {
      if (dir === 'Left') {
        snake.dirWanted = dir;
      }
    }
    return;
  }
  if (player === 'P1') {
    if (dir === 'Left' && (snake.dir === 'Up' || snake.dir === 'Down')) snake.dirWanted = 'Left';
    if (dir === 'Right' && (snake.dir === 'Up' || snake.dir === 'Down' || snake.dir === '')) snake.dirWanted = 'Right';
    if (dir === 'Up' && (snake.dir === 'Left' || snake.dir === 'Right')) snake.dirWanted = 'Up';
    if (dir === 'Down' && (snake.dir === 'Left' || snake.dir === 'Right')) snake.dirWanted = 'Down';
    return;
  }
  if (dir === 'Left' && (snake.dir === 'Up' || snake.dir === 'Down' || snake.dir === '')) snake.dirWanted = 'Left';
  if (dir === 'Right' && (snake.dir === 'Up' || snake.dir === 'Down')) snake.dirWanted = 'Right';
  if (dir === 'Up' && (snake.dir === 'Left' || snake.dir === 'Right')) snake.dirWanted = 'Up';
  if (dir === 'Down' && (snake.dir === 'Left' || snake.dir === 'Right')) snake.dirWanted = 'Down';
}

export function stepGame(state: GameState): TickResult {
  const prevWinner = state.winnerPlayer;
  if (state.gameStarted && !state.gameEnded) {
    if (state.meta.practiceMode) {
      decideP2Direction(state);
    }
    movePlayers(state);
    checkCollisions(state);
    captureCoinbase(state);
    if (state.score[0] <= 0 || state.score[1] <= 0) {
      state.gameEnded = true;
      if (state.score[0] <= 0) {
        state.winnerPlayer = 'P2';
        state.winnerName = state.p2Name;
      } else {
        state.winnerPlayer = 'P1';
        state.winnerName = state.p1Name;
      }
    }
  } else if (state.countdownStart) {
    state.countdownTicks += 1;
    if (state.countdownTicks > COUNTDOWN_END_TICK) {
      state.gameStarted = true;
      state.countdownStart = false;
    }
  }

  return {
    winnerChanged: prevWinner !== state.winnerPlayer && state.winnerPlayer !== null,
    winnerPlayer: state.winnerPlayer,
  };
}

export function createNewCoinbase(state: GameState, feeValue: number = -1): void {
  if (!state.gameStarted || state.gameEnded) {
    return;
  }
  let reward: Coinbase['reward'];
  if (feeValue >= 0) {
    if (feeValue < 15) reward = 2;
    else if (feeValue < 45) reward = 4;
    else if (feeValue < 135) reward = 8;
    else if (feeValue < 405) reward = 16;
    else reward = 32;
  }

  let accepted = false;
  let attempts = 0;
  while (!accepted && attempts < 1000) {
    const x = Math.floor(Math.random() * state.cols);
    const y = Math.floor(Math.random() * state.rows);
    if (!hasCollisionAt(state, [x, y])) {
      state.coinbases.push(reward ? { pos: [x, y], reward } : { pos: [x, y] });
      accepted = true;
    }
    attempts += 1;
  }
}

function movePlayers(state: GameState): void {
  moveSnake(state.p1);
  moveSnake(state.p2);
}

function moveSnake(snake: GameState['p1']): void {
  snake.body.unshift([snake.head[0], snake.head[1]]);
  snake.body.pop();
  snake.dir = snake.dirWanted;
  switch (snake.dir) {
    case 'Up':
      snake.head[1] -= 1;
      break;
    case 'Down':
      snake.head[1] += 1;
      break;
    case 'Left':
      snake.head[0] -= 1;
      break;
    case 'Right':
      snake.head[0] += 1;
      break;
  }
}

function checkCollisions(state: GameState): void {
  if (samePos(state.p1.head, state.p2.head)) {
    resetSnake(state, 'P1');
    resetSnake(state, 'P2');
  }
  if (
    state.p1.head[0] === state.p2.head[0] + 1 &&
    state.p2.head[1] === state.p1.head[1] &&
    state.p1.dir === 'Right' &&
    state.p2.dir === 'Left' &&
    state.p1.dirWanted === 'Right' &&
    state.p2.dirWanted === 'Left'
  ) {
    resetSnake(state, 'P1');
    resetSnake(state, 'P2');
  }
  if (
    state.p1.head[0] === state.p2.head[0] - 1 &&
    state.p2.head[1] === state.p1.head[1] &&
    state.p1.dir === 'Left' &&
    state.p2.dir === 'Right' &&
    state.p1.dirWanted === 'Left' &&
    state.p2.dirWanted === 'Right'
  ) {
    resetSnake(state, 'P1');
    resetSnake(state, 'P2');
  }
  if (
    state.p1.head[0] === state.p2.head[0] &&
    state.p1.head[1] === state.p2.head[1] - 1 &&
    state.p1.dir === 'Up' &&
    state.p2.dir === 'Down' &&
    state.p1.dirWanted === 'Up' &&
    state.p2.dirWanted === 'Down'
  ) {
    resetSnake(state, 'P1');
    resetSnake(state, 'P2');
  }
  if (
    state.p1.head[0] === state.p2.head[0] &&
    state.p1.head[1] === state.p2.head[1] + 1 &&
    state.p1.dir === 'Down' &&
    state.p2.dir === 'Up' &&
    state.p1.dirWanted === 'Down' &&
    state.p2.dirWanted === 'Up'
  ) {
    resetSnake(state, 'P1');
    resetSnake(state, 'P2');
  }

  if (outOfBounds(state, state.p1.head)) {
    resetSnake(state, 'P1');
  }
  if (outOfBounds(state, state.p2.head)) {
    resetSnake(state, 'P2');
  }

  for (const pos of state.p1.body) {
    if (samePos(state.p1.head, pos)) {
      resetSnake(state, 'P1');
    }
    if (samePos(state.p2.head, pos)) {
      resetSnake(state, 'P2');
    }
  }
  for (const pos of state.p2.body) {
    if (samePos(state.p1.head, pos)) {
      resetSnake(state, 'P1');
    }
    if (samePos(state.p2.head, pos)) {
      resetSnake(state, 'P2');
    }
  }
}

function outOfBounds(state: GameState, pos: GridPos): boolean {
  return pos[0] > state.cols - 1 || pos[1] < 0 || pos[1] > state.rows - 1 || pos[0] < 0;
}

function captureCoinbase(state: GameState): void {
  for (let i = 0; i < state.coinbases.length; i += 1) {
    const cb = state.coinbases[i];
    if (samePos(state.p1.head, cb.pos)) {
      changeScore(state, 'P1', cb);
      increaseBody(state.p1);
      if (!cb.reward) {
        createNewCoinbase(state);
      }
      state.coinbases.splice(i, 1);
      state.currentCaptureP1 = getCaptureLabel(state.p1.body.length);
      return;
    }
    if (samePos(state.p2.head, cb.pos)) {
      changeScore(state, 'P2', cb);
      increaseBody(state.p2);
      if (!cb.reward) {
        createNewCoinbase(state);
      }
      state.coinbases.splice(i, 1);
      state.currentCaptureP2 = getCaptureLabel(state.p2.body.length);
      return;
    }
  }
}

function increaseBody(snake: GameState['p1']): void {
  const last = snake.body[snake.body.length - 1];
  const beforeLast = snake.body.length > 1 ? snake.body[snake.body.length - 2] : snake.head;
  if (last[0] < beforeLast[0]) {
    snake.body.push([last[0] - 1, last[1]]);
  } else if (last[0] > beforeLast[0]) {
    snake.body.push([last[0] + 1, last[1]]);
  } else if (last[1] < beforeLast[1]) {
    snake.body.push([last[0], last[1] - 1]);
  } else {
    snake.body.push([last[0], last[1] + 1]);
  }
}

function changeScore(state: GameState, player: PlayerId, cb: Coinbase): void {
  const change =
    cb.reward != null
      ? Math.floor((state.totalPoints * cb.reward) / 100)
      : Math.floor((state.totalPoints * capturePercentByLength(getLength(state, player))) / 100);
  const safeChange = Math.max(1, change);

  state.pointChanges.push({
    player,
    value: safeChange,
    p1Pos: [state.p1.head[0], state.p1.head[1]],
    p2Pos: [state.p2.head[0], state.p2.head[1]],
    p1YOffsetPx: 0,
    p2YOffsetPx: 0,
    alpha: 1,
  });

  if (player === 'P1') {
    state.score[0] = Math.min(state.totalPoints, state.score[0] + safeChange);
    state.score[1] = Math.max(0, state.score[1] - safeChange);
  } else {
    state.score[1] = Math.min(state.totalPoints, state.score[1] + safeChange);
    state.score[0] = Math.max(0, state.score[0] - safeChange);
  }
}

function getLength(state: GameState, player: PlayerId): number {
  return player === 'P1' ? state.p1.body.length : state.p2.body.length;
}

function capturePercentByLength(length: number): number {
  for (const level of CAPTURE_LEVELS) {
    if (length >= level.minLength && length <= level.maxLength) {
      return level.percent;
    }
  }
  return 2;
}

export function getCaptureLabel(length: number): string {
  return `${capturePercentByLength(length)}%`;
}

function resetSnake(state: GameState, player: PlayerId): void {
  if (player === 'P1') {
    state.p1.head = [6, 12];
    state.p1.body = [[5, 12]];
    state.p1.dir = '';
    state.p1.dirWanted = 'Right';
    state.currentCaptureP1 = '2%';
  } else {
    state.p2.head = [44, 12];
    state.p2.body = [[45, 12]];
    state.p2.dir = '';
    state.p2.dirWanted = 'Left';
    state.currentCaptureP2 = '2%';
  }
}

function hasCollisionAt(state: GameState, pos: GridPos): boolean {
  if (samePos(state.p1.head, pos) || samePos(state.p2.head, pos)) return true;
  if (state.p1.body.some((part) => samePos(part, pos))) return true;
  if (state.p2.body.some((part) => samePos(part, pos))) return true;
  if (state.coinbases.some((cb) => samePos(cb.pos, pos))) return true;
  return false;
}

function samePos(a: GridPos, b: GridPos): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function canContinueAfterGame(state: GameState, key: string): boolean {
  if (!state.gameEnded || !state.winnerPlayer) return false;
  const normalized = key.toUpperCase();
  if (state.meta.practiceMode) {
    return normalized === ' ' || normalized === 'ENTER';
  }
  if (state.winnerPlayer === 'P1') {
    return normalized === ' ';
  }
  return normalized === 'ENTER';
}

function decideP2Direction(state: GameState): void {
  const path = findPathP2(state);
  if (path.length < 2) return;
  const next = path[1];
  const [x, y] = state.p2.head;
  if (next[0] === x && next[1] > y) {
    if (state.p2.dir === 'Left' || state.p2.dir === 'Right') {
      state.p2.dirWanted = 'Down';
    }
  } else if (next[0] === x && next[1] < y) {
    if (state.p2.dir === 'Left' || state.p2.dir === 'Right') {
      state.p2.dirWanted = 'Up';
    }
  } else if (next[1] === y && next[0] > x) {
    if (state.p2.dir === 'Up' || state.p2.dir === 'Down') {
      state.p2.dirWanted = 'Right';
    }
  } else if (next[1] === y && next[0] < x) {
    if (state.p2.dir === 'Up' || state.p2.dir === 'Down' || state.p2.dir === '') {
      state.p2.dirWanted = 'Left';
    }
  }
}

function findPathP2(state: GameState): GridPos[] {
  const start: GridPos = [state.p2.head[0], state.p2.head[1]];
  const target = state.coinbases[0]?.pos;
  if (!target) return [start];

  const openSet: GridPos[] = [start];
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[key(start), 0]]);
  const fScore = new Map<string, number>([[key(start), heuristic(start, target)]]);

  while (openSet.length > 0) {
    let current = openSet[0];
    let currentF = fScore.get(key(current)) ?? Number.POSITIVE_INFINITY;
    for (const node of openSet) {
      const score = fScore.get(key(node)) ?? Number.POSITIVE_INFINITY;
      if (score < currentF) {
        current = node;
        currentF = score;
      }
    }

    if (samePos(current, target)) {
      return reconstructPath(cameFrom, current);
    }
    openSet.splice(openSet.findIndex((node) => key(node) === key(current)), 1);

    const neighbors: GridPos[] = [
      [current[0] + 1, current[1]],
      [current[0] - 1, current[1]],
      [current[0], current[1] + 1],
      [current[0], current[1] - 1],
    ];

    for (const neighbor of neighbors) {
      if (outOfBounds(state, neighbor)) continue;
      if (collisionWithBodies(state, neighbor)) continue;

      const tentative = (gScore.get(key(current)) ?? Number.POSITIVE_INFINITY) + 1;
      if (tentative < (gScore.get(key(neighbor)) ?? Number.POSITIVE_INFINITY)) {
        cameFrom.set(key(neighbor), key(current));
        gScore.set(key(neighbor), tentative);
        fScore.set(key(neighbor), tentative + heuristic(neighbor, target));
        if (!openSet.some((node) => key(node) === key(neighbor))) {
          openSet.push(neighbor);
        }
      }
    }
  }
  return [start];
}

function collisionWithBodies(state: GameState, pos: GridPos): boolean {
  if (samePos(state.p1.head, pos)) return true;
  if (state.p1.body.some((bodyPos) => samePos(bodyPos, pos))) return true;
  if (state.p2.body.some((bodyPos) => samePos(bodyPos, pos))) return true;
  return false;
}

function heuristic(a: GridPos, b: GridPos): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function key(pos: GridPos): string {
  return `${pos[0]}:${pos[1]}`;
}

function reconstructPath(cameFrom: Map<string, string>, current: GridPos): GridPos[] {
  const path: GridPos[] = [[current[0], current[1]]];
  let cursor = key(current);
  while (cameFrom.has(cursor)) {
    const prev = cameFrom.get(cursor)!;
    const [x, y] = prev.split(':').map((n) => Number.parseInt(n, 10));
    path.unshift([x, y]);
    cursor = prev;
  }
  return path;
}

export function getMetaFromDuel(mode: string): Pick<GameMeta, 'modeLabel' | 'practiceMode' | 'isTournament'> {
  const normalized = mode?.toUpperCase() ?? 'P2P';
  if (normalized === 'TOURNAMENT') {
    return { modeLabel: mode, practiceMode: false, isTournament: true };
  }
  if (normalized === 'PRACTICE') {
    return { modeLabel: 'Practice', practiceMode: true, isTournament: false };
  }
  return { modeLabel: mode || 'P2P', practiceMode: false, isTournament: false };
}
