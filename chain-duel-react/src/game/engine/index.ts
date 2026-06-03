import {
  CAPTURE_LEVELS,
  COUNTDOWN_END_TICK,
  GAME_COLS,
  GAME_ROWS,
  CONVERGENCE_SHRINK_INTERVAL_TICKS,
  CONVERGENCE_WARNING_TICKS,
  CONVERGENCE_MIN_COLS,
  CONVERGENCE_MIN_ROWS,
  POWERUP_FIRST_SPAWN_TICKS,
  POWERUP_SPAWN_WEIGHTS,
  STEP_SPEED_MS,
  FFA_GHOST_COLOR,
  FFA_SPECTER_COLOR,
  FFA_BOT_NAMES,
} from '@/game/engine/constants';
import { gameRandom } from '@/game/engine/runRng';
import type {
  AiTier,
  Coinbase,
  Direction,
  ExtraSnake,
  GameMeta,
  GameState,
  GridPos,
  HudState,
  PlayerId,
  PowerUpType,
  TeamMode,
  TickResult,
} from '@/game/engine/types';
import {
  buildFfaHud,
  checkFfaGameEnd,
  ffaApplyCaptureAmount,
  initFfaEconomy,
  isFfaMode,
  type FfaPlayerIndex,
} from '@/game/engine/ffa';
import {
  activePlayerCount,
  checkPowerUpPickup,
  clearPowerUpsForPlayer,
  computeCaptureChangeForIndex,
  getPlayerHead,
  getSnakeByIndex,
  hasPowerUp,
  hasSurgeDoubleStep,
  shouldPlayerMove,
  wrapSnakeHeadRef,
  type PowerUpPlayerIndex,
} from '@/game/engine/powerups';

export { getSnakeEffects } from '@/game/engine/powerups';
export type { PowerUpPlayerIndex, SnakePowerUpEffects } from '@/game/engine/powerups';

export type { FfaHudPlayer } from '@/game/engine/types';
export type { FfaPlayerIndex } from '@/game/engine/ffa';
export { buildFfaHud, ffaConicGradient, ffaInitialConicGradient, isFfaMode } from '@/game/engine/ffa';

// ============================================================================
// Extra-snake helpers

/** Body cell opposite movement — tail at the wall, head facing inward. */
function bodySegmentBehindHead(
  head: GridPos,
  dirWanted: Exclude<Direction, ''>,
): GridPos {
  const [x, y] = head;
  switch (dirWanted) {
    case 'Right': return [x - 1, y];
    case 'Left': return [x + 1, y];
    case 'Down': return [x, y - 1];
    case 'Up': return [x, y + 1];
    default: return [x - 1, y];
  }
}

function makeExtraSnake(
  spawnHead: GridPos,
  spawnDir: Direction,
  teamId: 0 | 1,
  color: number,
  name: string,
  aiTier: AiTier,
  humanControlled: boolean,
  outline?: number,
): ExtraSnake {
  const d: Exclude<Direction, ''> = spawnDir === '' ? 'Right' : spawnDir;
  const tail = bodySegmentBehindHead([spawnHead[0], spawnHead[1]], d);
  return {
    snake: {
      head: [spawnHead[0], spawnHead[1]],
      body: [tail],
      dir: '',
      dirWanted: spawnDir,
    },
    teamId, color, outline, name, score: 0, aiTier, humanControlled, spawnHead, spawnDir,
  };
}

// ============================================================================
// Public API types
// ============================================================================

interface CreateStateArgs {
  p1Name: string;
  p2Name: string;
  p1Points: number;
  p2Points: number;
  modeLabel: string;
  practiceMode?: boolean;
  isTournament?: boolean;
  aiTier?: AiTier;
  convergenceMode?: boolean;
  convergenceShrinkInterval?: number;
  convergenceMinCols?: number;
  convergenceMinRows?: number;
  convergenceStepMs?: number;
  powerupMode?: boolean;
  teamMode?: TeamMode;
  ffaAiTier?: AiTier;
  p1Human?: boolean;
  p2Human?: boolean;
  p3Human?: boolean;
  p4Human?: boolean;
}

/** One unique bot name per AI slot (P1 → P2 → P3 → P4). */
function assignFfaDisplayNames(
  p1Human: boolean,
  p2Human: boolean,
  p3Human: boolean,
  p4Human: boolean,
  p1Name: string,
  p2Name: string,
): { p1Name: string; p2Name: string; extra0Name: string; extra1Name: string } {
  let botIdx = 0;
  const nextBotName = (): string =>
    FFA_BOT_NAMES[botIdx++] ?? `Bot ${botIdx}`;

  return {
    p1Name: p1Human ? p1Name : nextBotName(),
    p2Name: p2Human ? p2Name : nextBotName(),
    extra0Name: p3Human ? 'Player 3' : nextBotName(),
    extra1Name: p4Human ? 'Player 4' : nextBotName(),
  };
}

// ============================================================================
// createGameState
// ============================================================================

export function createGameState(args: CreateStateArgs): GameState {
  // Practice always needs a playable pot; paid duels preserve 0 sats (legacy parity).
  const minScore = args.practiceMode ? 1 : 0;
  const p1 = Math.max(minScore, Math.floor(args.p1Points));
  const p2 = Math.max(minScore, Math.floor(args.p2Points));

  const defaultP2Human = !Boolean(args.practiceMode);
  const p1HumanMeta = args.p1Human !== undefined ? Boolean(args.p1Human) : true;
  const p2HumanMeta = args.p2Human !== undefined ? Boolean(args.p2Human) : defaultP2Human;

  const state: GameState = {
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
      practiceMode: args.practiceMode ?? false,
      p1Human: p1HumanMeta,
      p2Human: p2HumanMeta,
      isTournament: args.isTournament ?? false,
      aiTier: args.aiTier ?? 'stacker',
      convergenceMode: args.convergenceMode ?? false,
      convergenceShrinkInterval: args.convergenceShrinkInterval ?? CONVERGENCE_SHRINK_INTERVAL_TICKS,
      convergenceMinCols: args.convergenceMinCols ?? CONVERGENCE_MIN_COLS,
      convergenceMinRows: args.convergenceMinRows ?? CONVERGENCE_MIN_ROWS,
      powerupMode: args.powerupMode ?? false,
      teamMode: (args.teamMode ?? 'solo') as TeamMode,
      currentStepMs: args.convergenceStepMs ?? STEP_SPEED_MS,
    },
    tickCount: 0,
    powerUpItems: [],
    activePowerUps: [],
    obstacleWalls: [],
    shrinkBorder: args.convergenceMode
      ? { top: 0, bottom: GAME_ROWS - 1, left: 0, right: GAME_COLS - 1, warningActive: false }
      : null,
    powerUpRespawnCooldownTick: POWERUP_FIRST_SPAWN_TICKS,
    convergenceWallClosed: false,
    extraSnakes: [],
  };

  const teamMode = args.teamMode ?? 'solo';
  const p3Human = args.p3Human === true;
  const p4Human = args.p4Human === true;
  if (teamMode === 'ffa') {
    const fTier = args.ffaAiTier ?? (args.aiTier ?? 'stacker');
    const names = assignFfaDisplayNames(
      p1HumanMeta,
      p2HumanMeta,
      p3Human,
      p4Human,
      args.p1Name,
      args.p2Name,
    );
    state.p1Name = names.p1Name;
    state.p2Name = names.p2Name;
    const h1: GridPos = [4, 4];
    const h2: GridPos = [46, 4];
    state.p1.head = h1;
    state.p1.body = [bodySegmentBehindHead(h1, 'Right')];
    state.p2.head = h2;
    state.p2.body = [bodySegmentBehindHead(h2, 'Left')];
    state.p2.dirWanted = 'Left';
    state.extraSnakes = [
      makeExtraSnake([46, 20], 'Left', 1, FFA_GHOST_COLOR, names.extra0Name, fTier, p3Human),
      makeExtraSnake([4, 20], 'Right', 1, FFA_SPECTER_COLOR, names.extra1Name, fTier, p4Human),
    ];
    initFfaEconomy(state, p1, p2);
  }

  return state;
}

// ============================================================================
// getHudState
// ============================================================================

export function getHudState(state: GameState): HudState {
  const initialWidthP1 = (state.initialScore[0] * 100) / state.totalPoints;
  const initialWidthP2 = (state.initialScore[1] * 100) / state.totalPoints;
  const currentWidthP1 = (state.score[0] * 100) / state.totalPoints;
  const currentWidthP2 = (state.score[1] * 100) / state.totalPoints;
  const hud: HudState = {
    p1Points: state.score[0],
    p2Points: state.score[1],
    captureP1: getCaptureLabel(state.p1.body.length, state),
    captureP2: getCaptureLabel(state.p2.body.length, state),
    initialWidthP1,
    initialWidthP2,
    currentWidthP1,
    currentWidthP2,
  };
  if (isFfaMode(state)) {
    hud.ffa = { players: buildFfaHud(state) };
    const scores = hud.ffa.players.map((p) => p.score);
    hud.p1Points = scores[0] ?? hud.p1Points;
    hud.p2Points = scores[1] ?? hud.p2Points;
  }
  return hud;
}

export function startCountdown(state: GameState): void {
  if (!state.gameStarted && !state.gameEnded) {
    state.countdownStart = true;
  }
}

/** When duel balances already decide the outcome (refresh after game over), lock to winner screen. */
export function applyTerminalGameOutcome(state: GameState): boolean {
  if (state.meta.practiceMode || state.meta.isTournament) return false;
  const [s0, s1] = state.score;
  if (s0 <= 0 && s1 <= 0) return false;
  if (s0 > 0 && s1 > 0) return false;
  state.gameEnded = true;
  state.gameStarted = false;
  state.countdownStart = false;
  state.countdownTicks = 0;
  if (s0 <= 0) {
    state.winnerPlayer = 'P2';
    state.winnerName = state.p2Name;
  } else {
    state.winnerPlayer = 'P1';
    state.winnerName = state.p1Name;
  }
  return true;
}

export function setWantedDirection(
  state: GameState,
  player: PlayerId,
  dir: Exclude<Direction, ''>
): void {
  const snake = player === 'P1' ? state.p1 : state.p2;
  if (!state.gameStarted) {
    if (player === 'P1') {
      if (dir === 'Right') snake.dirWanted = dir;
    } else if (player === 'P2') {
      if (dir === 'Left') snake.dirWanted = dir;
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

/** Steer P3/P4 (extraSnakes[0] / extraSnakes[1]) when `humanControlled` is set. */
export function setExtraSnakeWantedDirection(
  state: GameState,
  index: number,
  dir: Exclude<Direction, ''>
): void {
  const extra = state.extraSnakes[index];
  if (!extra?.humanControlled) return;
  const snake = extra.snake;
  const spawn = extra.spawnDir;
  if (!state.gameStarted) {
    if (dir === spawn) snake.dirWanted = dir;
    return;
  }
  if (dir === 'Left' && (snake.dir === 'Up' || snake.dir === 'Down' || snake.dir === '')) snake.dirWanted = 'Left';
  if (dir === 'Right' && (snake.dir === 'Up' || snake.dir === 'Down')) snake.dirWanted = 'Right';
  if (dir === 'Up' && (snake.dir === 'Left' || snake.dir === 'Right')) snake.dirWanted = 'Up';
  if (dir === 'Down' && (snake.dir === 'Left' || snake.dir === 'Right')) snake.dirWanted = 'Down';
}

// ============================================================================
// stepGame — main tick
// ============================================================================

export function stepGame(state: GameState): TickResult {
  const prevWinner = state.winnerPlayer;

  if (state.gameStarted && !state.gameEnded) {
    state.tickCount += 1;

    // Convergence: shrink border
    if (state.meta.convergenceMode && state.shrinkBorder) {
      tickConvergence(state);
    }

    // Power-up spawn
    if (state.meta.powerupMode && state.powerUpItems.length === 0 &&
        state.tickCount >= state.powerUpRespawnCooldownTick) {
      spawnPowerUp(state);
    }

    state.obstacleWalls = state.obstacleWalls.filter(
      (w) => w.expiresAtTick === undefined || w.expiresAtTick > state.tickCount
    );

    state.activePowerUps = state.activePowerUps.filter(
      (ap) => ap.expiresAtTick > state.tickCount || ap.chargesLeft !== undefined
    );

    // AI decision — each non-human slot uses the same tier logic (1–4 players).
    const playerCount = activePlayerCount(state);
    const doubleStepIndices: PowerUpPlayerIndex[] = [];

    for (let i = 0; i < playerCount; i += 1) {
      const index = i as PowerUpPlayerIndex;
      if (!isPlayerHuman(state, index)) decideAiForPlayer(state, index);
    }

    for (let i = 0; i < playerCount; i += 1) {
      const index = i as PowerUpPlayerIndex;
      if (shouldPlayerMove(state, index)) moveSnake(getSnakeByIndex(state, index));
      if (hasSurgeDoubleStep(state, index)) doubleStepIndices.push(index);
    }

    if (doubleStepIndices.length > 0) {
      runCaptureAndCollisionPass(state);
      for (const index of doubleStepIndices) {
        if (shouldPlayerMove(state, index)) moveSnake(getSnakeByIndex(state, index));
      }
    }

    runCaptureAndCollisionPass(state);

    if (isFfaMode(state)) {
      checkFfaGameEnd(state);
    } else if (state.score[0] <= 0 || state.score[1] <= 0) {
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


// ============================================================================
// Convergence
// ============================================================================

function tickConvergence(state: GameState): void {
  if (!state.shrinkBorder) return;

  const shrinkInterval = state.meta.convergenceShrinkInterval ?? CONVERGENCE_SHRINK_INTERVAL_TICKS;
  const warningInterval = Math.max(0, shrinkInterval - CONVERGENCE_WARNING_TICKS);

  const phase = state.tickCount % shrinkInterval;
  const shrinkThisTick =
    state.tickCount > 0 && state.tickCount % shrinkInterval === 0;
  // Include the shrink frame: when phase wraps to 0, phase >= warningInterval is false,
  // so without shrinkThisTick the warning would blink off exactly when the border steps.
  state.shrinkBorder.warningActive =
    phase >= warningInterval || shrinkThisTick;

  if (shrinkThisTick) {
    advanceShrinkBorder(state);

    // Detect when the wall has fully closed (reached minimum size)
    if (!state.convergenceWallClosed && !state.gameEnded) {
      const sb = state.shrinkBorder;
      const minWidth = state.meta.convergenceMinCols ?? CONVERGENCE_MIN_COLS;
      const minHeight = state.meta.convergenceMinRows ?? CONVERGENCE_MIN_ROWS;
      const atMinX = sb.right - sb.left + 1 <= minWidth;
      const atMinY = sb.bottom - sb.top + 1 <= minHeight;
      if (atMinX && atMinY) {
        state.convergenceWallClosed = true;
        state.gameEnded = true;
        // Winner is whoever has more points; tie goes to P1
        if (state.score[1] > state.score[0]) {
          state.winnerPlayer = 'P2';
          state.winnerName = state.p2Name;
        } else {
          state.winnerPlayer = 'P1';
          state.winnerName = state.p1Name;
        }
      }
    }
  }
}

export function advanceShrinkBorder(state: GameState): void {
  if (!state.shrinkBorder) return;
  const sb = state.shrinkBorder;
  const newLeft = sb.left + 1;
  const newRight = sb.right - 1;
  const newTop = sb.top + 1;
  const newBottom = sb.bottom - 1;
  const minWidth = state.meta.convergenceMinCols ?? CONVERGENCE_MIN_COLS;
  const minHeight = state.meta.convergenceMinRows ?? CONVERGENCE_MIN_ROWS;

  if (newRight - newLeft + 1 >= minWidth) {
    sb.left = newLeft;
    sb.right = newRight;
  }
  if (newBottom - newTop + 1 >= minHeight) {
    sb.top = newTop;
    sb.bottom = newBottom;
  }

  // Relocate any coinbases now sitting on or behind the new wall
  state.coinbases = state.coinbases.map((cb) => {
    if (isPosInsideActiveBorder(sb, cb.pos)) return cb;
    const newPos = findSafePosInBorder(state, sb);
    return newPos ? { ...cb, pos: newPos } : cb;
  });

  // Power-ups must stay in the playable interior (same as food)
  state.powerUpItems = state.powerUpItems.map((item) => {
    if (isPosInsideActiveBorder(sb, item.pos)) return item;
    const newPos = findSafePosInBorder(state, sb);
    return newPos ? { ...item, pos: newPos } : item;
  });

  // Extra snakes (teams / FFA): fixed spawn points can end up outside the new border
  for (const extra of state.extraSnakes) {
    if (outOfBounds(state, extra.snake.head) || hitsObstacle(state, extra.snake.head)) {
      resetExtraSnake(extra, state);
    }
  }

}

/** Returns true when pos is safely inside the active (non-wall) area */
function isPosInsideActiveBorder(sb: import('./types').ShrinkBorder, pos: GridPos): boolean {
  return pos[0] > sb.left && pos[0] < sb.right && pos[1] > sb.top && pos[1] < sb.bottom;
}

/** Find a random free cell strictly inside the active border */
function findSafePosInBorder(state: GameState, sb: import('./types').ShrinkBorder): GridPos | null {
  const minX = sb.left + 1;
  const maxX = sb.right - 1;
  const minY = sb.top + 1;
  const maxY = sb.bottom - 1;
  if (maxX < minX || maxY < minY) return null;
  for (let attempt = 0; attempt < 200; attempt++) {
    const x = minX + Math.floor(gameRandom() * (maxX - minX + 1));
    const y = minY + Math.floor(gameRandom() * (maxY - minY + 1));
    if (!hasCollisionAt(state, [x, y])) return [x, y];
  }
  return scanGridForSafePosInBorder(state, sb);
}

/** Deterministic fallback when random placement fails (crowded small arenas). */
function scanGridForSafePosInBorder(state: GameState, sb: import('./types').ShrinkBorder): GridPos | null {
  const minX = sb.left + 1;
  const maxX = sb.right - 1;
  const minY = sb.top + 1;
  const maxY = sb.bottom - 1;
  if (maxX < minX || maxY < minY) return null;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const pos: GridPos = [x, y];
      if (!hasCollisionAt(state, pos)) return pos;
    }
  }
  return null;
}

// ============================================================================
// Power-up system
// ============================================================================

export function spawnPowerUp(state: GameState): void {
  const type = weightedRandomPowerUp();
  const border = state.shrinkBorder;
  const minX = border ? border.left + 1 : 0;
  const maxX = border ? border.right - 1 : state.cols - 1;
  const minY = border ? border.top + 1 : 0;
  const maxY = border ? border.bottom - 1 : state.rows - 1;
  let attempts = 0;
  while (attempts < 200) {
    const x = minX + Math.floor(gameRandom() * (maxX - minX + 1));
    const y = minY + Math.floor(gameRandom() * (maxY - minY + 1));
    const pos: GridPos = [x, y];
    if (!hasCollisionAt(state, pos)) {
      state.powerUpItems.push({ pos, type });
      return;
    }
    attempts++;
  }
  if (border) {
    const p = findSafePosInBorder(state, border);
    if (p) state.powerUpItems.push({ pos: p, type });
  }
}

function weightedRandomPowerUp(): PowerUpType {
  const types = Object.keys(POWERUP_SPAWN_WEIGHTS) as PowerUpType[];
  const totalWeight = types.reduce((sum, t) => sum + POWERUP_SPAWN_WEIGHTS[t], 0);
  let rand = gameRandom() * totalWeight;
  for (const type of types) {
    rand -= POWERUP_SPAWN_WEIGHTS[type];
    if (rand <= 0) return type;
  }
  return 'SURGE';
}

function runCaptureAndCollisionPass(state: GameState): void {
  checkCollisions(state);
  captureCoinbase(state);
  captureExtraSnakeCoinbases(state);
  checkPowerUpPickup(state);
  checkExtraSnakeCollisions(state);
}

// ============================================================================
// createNewCoinbase
// ============================================================================

export function createNewCoinbase(state: GameState, feeValue: number = -1): void {
  if (!state.gameStarted || state.gameEnded) return;

  let reward: Coinbase['reward'];
  if (feeValue >= 0) {
    if (feeValue < 15) reward = 2;
    else if (feeValue < 45) reward = 4;
    else if (feeValue < 135) reward = 8;
    else if (feeValue < 405) reward = 16;
    else reward = 32;
  }

  const border = state.shrinkBorder;
  const minX = border ? border.left + 1 : 0;
  const maxX = border ? border.right - 1 : state.cols - 1;
  const minY = border ? border.top + 1 : 0;
  const maxY = border ? border.bottom - 1 : state.rows - 1;

  let accepted = false;
  let attempts = 0;
  while (!accepted && attempts < 1000) {
    const x = minX + Math.floor(gameRandom() * (maxX - minX + 1));
    const y = minY + Math.floor(gameRandom() * (maxY - minY + 1));
    if (!hasCollisionAt(state, [x, y])) {
      const cb: Coinbase = { pos: [x, y] };
      if (reward !== undefined) cb.reward = reward;
      state.coinbases.push(cb);
      accepted = true;
    }
    attempts += 1;
  }
}

// ============================================================================
// Movement
// ============================================================================

function moveSnake(snake: GameState['p1']): void {
  snake.body.unshift([snake.head[0], snake.head[1]]);
  snake.body.pop();
  snake.dir = snake.dirWanted;
  switch (snake.dir) {
    case 'Up':    snake.head[1] -= 1; break;
    case 'Down':  snake.head[1] += 1; break;
    case 'Left':  snake.head[0] -= 1; break;
    case 'Right': snake.head[0] += 1; break;
  }
}

// ============================================================================
// Collision detection
// ============================================================================

function checkCollisions(state: GameState): void {
  const p1HasPhantom = hasPowerUp(state, 0, 'PHANTOM');
  const p2HasPhantom = hasPowerUp(state, 1, 'PHANTOM');

  // Head-on collisions
  if (samePos(state.p1.head, state.p2.head)) {
    resetSnake(state, 'P1');
    resetSnake(state, 'P2');
  }
  checkPassThroughCollision(state, 'Right', 'Left', 1, 0);
  checkPassThroughCollision(state, 'Left', 'Right', -1, 0);
  checkPassThroughCollision(state, 'Up', 'Down', 0, -1);
  checkPassThroughCollision(state, 'Down', 'Up', 0, 1);

  // Wall / shrink border — PHANTOM wraps (Pac-Man style) instead of resetting.
  // PHANTOM wraps through outer grid walls and the convergence border.
  if (outOfBounds(state, state.p1.head)) {
    if (p1HasPhantom) wrapSnakeHeadRef(state, state.p1);
    else resetSnake(state, 'P1');
  }
  if (outOfBounds(state, state.p2.head)) {
    if (p2HasPhantom) wrapSnakeHeadRef(state, state.p2);
    else resetSnake(state, 'P2');
  }

  if (hitsObstacle(state, state.p1.head)) resetSnake(state, 'P1');
  if (hitsObstacle(state, state.p2.head)) resetSnake(state, 'P2');

  for (const pos of state.p1.body) {
    if (!p1HasPhantom && samePos(state.p1.head, pos)) resetSnake(state, 'P1');
    if (samePos(state.p2.head, pos)) resetSnake(state, 'P2');
  }
  for (const pos of state.p2.body) {
    if (samePos(state.p1.head, pos)) resetSnake(state, 'P1');
    if (!p2HasPhantom && samePos(state.p2.head, pos)) resetSnake(state, 'P2');
  }
}

function checkPassThroughCollision(
  state: GameState,
  p1Dir: Direction,
  p2Dir: Direction,
  dx: number,
  dy: number
): void {
  if (
    state.p1.head[0] === state.p2.head[0] + dx &&
    state.p2.head[1] + dy === state.p1.head[1] &&
    state.p1.dir === p1Dir &&
    state.p2.dir === p2Dir &&
    state.p1.dirWanted === p1Dir &&
    state.p2.dirWanted === p2Dir
  ) {
    resetSnake(state, 'P1');
    resetSnake(state, 'P2');
  }
}

function checkExtraPassThroughCollision(
  state: GameState,
  a: ExtraSnake,
  b: ExtraSnake,
  aDir: Direction,
  bDir: Direction,
  dx: number,
  dy: number,
): void {
  if (
    a.snake.head[0] === b.snake.head[0] + dx &&
    b.snake.head[1] + dy === a.snake.head[1] &&
    a.snake.dir === aDir &&
    b.snake.dir === bDir &&
    a.snake.dirWanted === aDir &&
    b.snake.dirWanted === bDir
  ) {
    resetExtraSnake(a, state);
    resetExtraSnake(b, state);
  }
}

/** Head-on / pass-through between extras — mirror P1 vs P2 (both reset). */
function checkExtraSnakePairCollisions(state: GameState): void {
  const extras = state.extraSnakes;
  for (let i = 0; i < extras.length; i += 1) {
    for (let j = i + 1; j < extras.length; j += 1) {
      const a = extras[i]!;
      const b = extras[j]!;
      if (samePos(a.snake.head, b.snake.head)) {
        resetExtraSnake(a, state);
        resetExtraSnake(b, state);
        continue;
      }
      checkExtraPassThroughCollision(state, a, b, 'Right', 'Left', 1, 0);
      checkExtraPassThroughCollision(state, a, b, 'Left', 'Right', -1, 0);
      checkExtraPassThroughCollision(state, a, b, 'Up', 'Down', 0, -1);
      checkExtraPassThroughCollision(state, a, b, 'Down', 'Up', 0, 1);
    }
  }
}

function outOfBounds(state: GameState, pos: GridPos): boolean {
  const sb = state.shrinkBorder;
  if (sb) {
    return pos[0] < sb.left || pos[0] > sb.right || pos[1] < sb.top || pos[1] > sb.bottom;
  }
  return pos[0] > state.cols - 1 || pos[1] < 0 || pos[1] > state.rows - 1 || pos[0] < 0;
}


function hitsObstacle(state: GameState, pos: GridPos): boolean {
  return state.obstacleWalls.some((w) => samePos(w.pos, pos));
}

// ============================================================================
// Coinbase capture
// ============================================================================

function captureCoinbase(state: GameState): void {
  for (let i = 0; i < state.coinbases.length; i += 1) {
    const cb = state.coinbases[i];
    if (samePos(state.p1.head, cb.pos)) {
      if (cb.isDecoy) {
        // Decoy: teleport P1 back to spawn
        resetSnake(state, 'P1');
        state.coinbases.splice(i, 1);
        return;
      }
      changeScore(state, 'P1', cb);
      increaseBody(state.p1);
      if (!cb.reward) createNewCoinbase(state);
      state.coinbases.splice(i, 1);
      state.currentCaptureP1 = getCaptureLabel(state.p1.body.length, state);
      return;
    }
    if (samePos(state.p2.head, cb.pos)) {
      if (cb.isDecoy) {
        resetSnake(state, 'P2');
        state.coinbases.splice(i, 1);
        return;
      }
      changeScore(state, 'P2', cb);
      increaseBody(state.p2);
      if (!cb.reward) createNewCoinbase(state);
      state.coinbases.splice(i, 1);
      state.currentCaptureP2 = getCaptureLabel(state.p2.body.length, state);
      return;
    }
  }
}

function increaseBody(snake: GameState['p1']): void {
  // Handle length-1 snake (empty body, e.g. labyrinth start)
  if (snake.body.length === 0) {
    const [hx, hy] = snake.head;
    const d = snake.dir || snake.dirWanted;
    if (d === 'Right') snake.body.push([hx - 1, hy]);
    else if (d === 'Left') snake.body.push([hx + 1, hy]);
    else if (d === 'Down') snake.body.push([hx, hy - 1]);
    else snake.body.push([hx, hy + 1]);  // 'Up' or ''
    return;
  }
  const last = snake.body[snake.body.length - 1];
  const beforeLast = snake.body.length > 1 ? snake.body[snake.body.length - 2] : snake.head;
  if (last[0] < beforeLast[0]) snake.body.push([last[0] - 1, last[1]]);
  else if (last[0] > beforeLast[0]) snake.body.push([last[0] + 1, last[1]]);
  else if (last[1] < beforeLast[1]) snake.body.push([last[0], last[1] - 1]);
  else snake.body.push([last[0], last[1] + 1]);
}

function computeCaptureChange(state: GameState, player: PlayerId, cb: Coinbase): number {
  const index = (player === 'P1' ? 0 : 1) as PowerUpPlayerIndex;
  return computeCaptureChangeForIndex(state, index, cb, state.totalPoints);
}

function changeScore(state: GameState, player: PlayerId, cb: Coinbase): void {
  const safeChange = computeCaptureChange(state, player, cb);

  if (isFfaMode(state)) {
    const winner = (player === 'P1' ? 0 : 1) as FfaPlayerIndex;
    ffaApplyCaptureAmount(state, winner, safeChange);
    return;
  }

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


function capturePercentByLength(length: number): number {
  for (const level of CAPTURE_LEVELS) {
    if (length >= level.minLength && length <= level.maxLength) {
      return level.percent;
    }
  }
  return 32;
}

export function getCaptureLabel(length: number, _state?: GameState): string {
  return `${capturePercentByLength(length)}%`;
}

// ============================================================================
// Reset
// ============================================================================

function resetSnake(state: GameState, player: PlayerId): void {
  const retainSpeed = player === 'P2' && state.meta.powerupMode;
  const teamMode = state.meta.teamMode ?? 'solo';
  const conv = Boolean(state.meta.convergenceMode && state.shrinkBorder);
  const sb = state.shrinkBorder;

  if (player === 'P1') {
    if (teamMode === 'ffa') {
      let head: GridPos = [4, 4];
      let body: GridPos[] = [bodySegmentBehindHead(head, 'Right')];
      if (conv && sb) {
        const spawnX = Math.max(4, sb.left + 2);
        const spawnY = Math.max(4, sb.top + 2);
        head = [spawnX, spawnY];
        body = [[Math.max(sb.left + 1, spawnX - 1), spawnY]];
      }
      state.p1.head = head;
      state.p1.body = body;
    } else {
      let head: GridPos = [6, 12];
      let body: GridPos[] = [[5, 12]];
      if (conv && sb) {
        const spawnX = Math.max(head[0], sb.left + 2);
        head = [spawnX, 12];
        body = [[Math.max(sb.left + 1, spawnX - 1), 12]];
      }
      state.p1.head = head;
      state.p1.body = body;
    }
    state.p1.dir = '';
    state.p1.dirWanted = 'Right';
    state.currentCaptureP1 = '2%';
    clearPowerUpsForPlayer(state, 0);
    return;
  }

  if (teamMode === 'ffa') {
    let head: GridPos = [46, 4];
    let body: GridPos[] = [bodySegmentBehindHead(head, 'Left')];
    if (conv && sb) {
      const spawnX = Math.min(46, sb.right - 2);
      const spawnY = Math.max(4, sb.top + 2);
      head = [spawnX, spawnY];
      body = [[Math.min(sb.right - 1, spawnX + 1), spawnY]];
    }
    state.p2.head = head;
    state.p2.body = body;
  } else {
    let head: GridPos = [44, 12];
    let body: GridPos[] = [[45, 12]];
    if (conv && sb) {
      const spawnX = Math.min(head[0], sb.right - 2);
      head = [spawnX, 12];
      body = [[Math.min(sb.right - 1, spawnX + 1), 12]];
    }
    state.p2.head = head;
    state.p2.body = body;
  }
  state.p2.dir = '';
  state.p2.dirWanted = 'Left';
  state.currentCaptureP2 = '2%';
  if (!retainSpeed) {
    clearPowerUpsForPlayer(state, 1);
  }
}

// ============================================================================
// Utility
// ============================================================================

function hasCollisionAt(state: GameState, pos: GridPos): boolean {
  return hasCollisionAtExceptExtra(state, pos);
}

function hasCollisionAtExceptExtra(state: GameState, pos: GridPos, excludeExtra?: ExtraSnake): boolean {
  if (samePos(state.p1.head, pos) || samePos(state.p2.head, pos)) return true;
  if (state.p1.body.some((part) => samePos(part, pos))) return true;
  if (state.p2.body.some((part) => samePos(part, pos))) return true;
  for (const e of state.extraSnakes) {
    if (e === excludeExtra) continue;
    if (samePos(e.snake.head, pos)) return true;
    if (e.snake.body.some((part) => samePos(part, pos))) return true;
  }
  if (state.coinbases.some((cb) => samePos(cb.pos, pos))) return true;
  if (state.powerUpItems.some((p) => samePos(p.pos, pos))) return true;
  if (state.obstacleWalls.some((w) => samePos(w.pos, pos))) return true;
  return false;
}

function pickSpawnTail(
  state: GameState,
  head: GridPos,
  primary: Exclude<Direction, ''>,
  excludeExtra: ExtraSnake,
): GridPos[] {
  const defaultTail = bodySegmentBehindHead(head, primary);
  if (!hasCollisionAtExceptExtra(state, defaultTail, excludeExtra)) {
    return [defaultTail];
  }
  const alts: Exclude<Direction, ''>[] = ['Up', 'Down', 'Left', 'Right'];
  for (const d2 of alts) {
    if (d2 === primary) continue;
    const tail = bodySegmentBehindHead(head, d2);
    if (!hasCollisionAtExceptExtra(state, tail, excludeExtra)) {
      return [tail];
    }
  }
  return [];
}

function samePos(a: GridPos, b: GridPos): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function canContinueAfterGame(state: GameState, key: string): boolean {
  if (!state.gameEnded) return false;
  const hasWinner =
    state.winnerPlayer !== null ||
    (isFfaMode(state) && state.winnerName.length > 0);
  if (!hasWinner) return false;
  const normalized = key.toUpperCase();
  if (state.meta.practiceMode || state.meta.convergenceMode || state.meta.powerupMode) {
    return normalized === ' ' || normalized === 'ENTER';
  }
  if (state.winnerPlayer === 'P1') return normalized === ' ';
  if (state.winnerPlayer === 'P2') return normalized === 'ENTER';
  // FFA winner may be an extra snake (no P1/P2 slot) — allow either continue key.
  return normalized === ' ' || normalized === 'ENTER';
}

// ============================================================================
// Extra-snake helpers (teams / ffa)
// ============================================================================

function ffaExtraSpawnLayout(
  extra: ExtraSnake,
  state: GameState,
): { head: GridPos; body: GridPos[]; dirWanted: Direction } {
  const sb = state.shrinkBorder;
  const conv = Boolean(state.meta.convergenceMode && sb);
  const isBottomRightSpawn = extra.spawnHead[0] === 46 && extra.spawnHead[1] === 20;

  if (isBottomRightSpawn) {
    let head: GridPos = [46, 20];
    const dirWanted: Direction = 'Left';
    if (conv && sb) {
      head = [
        Math.max(sb.left + 2, Math.min(46, sb.right - 2)),
        Math.max(sb.top + 2, Math.min(20, sb.bottom - 2)),
      ];
    }
    return {
      head,
      body: [bodySegmentBehindHead(head, dirWanted)],
      dirWanted,
    };
  }

  let head: GridPos = [4, 20];
  const dirWanted: Direction = 'Right';
  if (conv && sb) {
    head = [
      Math.max(4, Math.min(sb.right - 2, sb.left + 2)),
      Math.max(sb.top + 2, Math.min(20, sb.bottom - 2)),
    ];
  }
  return {
    head,
    body: [bodySegmentBehindHead(head, dirWanted)],
    dirWanted,
  };
}

function resetExtraSnake(extra: ExtraSnake, state: GameState): void {
  const teamMode = state.meta.teamMode ?? 'solo';
  let head: GridPos;
  let dirWanted: Direction;

  if (teamMode === 'ffa') {
    ({ head, dirWanted } = ffaExtraSpawnLayout(extra, state));
  } else {
    head = [extra.spawnHead[0], extra.spawnHead[1]];
    dirWanted = extra.spawnDir;
  }

  const primary: Exclude<Direction, ''> = dirWanted === '' ? 'Right' : dirWanted;
  const body = pickSpawnTail(state, head, primary, extra);

  extra.snake.head = head;
  extra.snake.body = body;
  extra.snake.dir = '';
  extra.snake.dirWanted = dirWanted;
  const extraIndex = (state.extraSnakes.indexOf(extra) + 2) as PowerUpPlayerIndex;
  if (extraIndex >= 2) clearPowerUpsForPlayer(state, extraIndex);
}

/** A* path-finding that avoids an explicit set of extra blocked positions. */
function findPathGeneric(
  state: GameState,
  start: GridPos,
  target: GridPos,
  extraBlocked: Set<string>,
  /** First-step facing for this snake (omit when unknown / no reverse constraint). */
  facing?: Direction,
): GridPos[] {
  const openSet: GridPos[] = [start];
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[posKey(start), 0]]);
  const fScore = new Map<string, number>([[posKey(start), heuristic(start, target)]]);

  while (openSet.length > 0) {
    let current = openSet[0];
    let currentF = fScore.get(posKey(current)) ?? Number.POSITIVE_INFINITY;
    for (const node of openSet) {
      const f = fScore.get(posKey(node)) ?? Number.POSITIVE_INFINITY;
      if (f < currentF) { current = node; currentF = f; }
    }
    if (samePos(current, target)) return reconstructPath(cameFrom, current);
    openSet.splice(openSet.findIndex((n) => posKey(n) === posKey(current)), 1);

    const neighbors: GridPos[] = [
      [current[0] + 1, current[1]],
      [current[0] - 1, current[1]],
      [current[0], current[1] + 1],
      [current[0], current[1] - 1],
    ];
    for (const nb of neighbors) {
      if (outOfBounds(state, nb)) continue;
      if (hitsObstacle(state, nb)) continue;
      if (extraBlocked.has(posKey(nb))) continue;
      if (samePos(current, start) && facing) {
        const step = stepDirFromTo(current, nb);
        if (step && dirsAreOpposite(facing, step)) continue;
      }
      const tentative = (gScore.get(posKey(current)) ?? Number.POSITIVE_INFINITY) + 1;
      if (tentative < (gScore.get(posKey(nb)) ?? Number.POSITIVE_INFINITY)) {
        cameFrom.set(posKey(nb), posKey(current));
        gScore.set(posKey(nb), tentative);
        fScore.set(posKey(nb), tentative + heuristic(nb, target));
        if (!openSet.some((n) => posKey(n) === posKey(nb))) openSet.push(nb);
      }
    }
  }
  return [start];
}

function captureExtraSnakeCoinbases(state: GameState): void {
  for (const extra of state.extraSnakes) {
    for (let i = 0; i < state.coinbases.length; i++) {
      const cb = state.coinbases[i];
      if (!samePos(extra.snake.head, cb.pos)) continue;
      if (cb.isDecoy) {
        resetExtraSnake(extra, state);
        state.coinbases.splice(i, 1);
        break;
      }
      const reward = cb.reward ?? 2;
      if (state.meta.teamMode === 'ffa') {
        const extraIndex = (state.extraSnakes.indexOf(extra) + 2) as FfaPlayerIndex;
        const safeChange = computeCaptureChangeForIndex(
          state,
          extraIndex,
          cb,
          state.totalPoints,
        );
        ffaApplyCaptureAmount(state, extraIndex, safeChange);
      } else {
        // Teams: coinbase goes to the extra snake's team score
        if (extra.teamId === 0) state.score[0] = Math.min(state.totalPoints, state.score[0] + reward);
        else                    state.score[1] = Math.min(state.totalPoints, state.score[1] + reward);
      }
      increaseBody(extra.snake);
      if (!cb.reward) createNewCoinbase(state);
      state.coinbases.splice(i, 1);
      break;
    }
  }
}

function checkExtraSnakeCollisions(state: GameState): void {
  checkExtraSnakePairCollisions(state);

  for (const extra of state.extraSnakes) {
    const extraIndex = (state.extraSnakes.indexOf(extra) + 2) as PowerUpPlayerIndex;
    const hasPhantom = hasPowerUp(state, extraIndex, 'PHANTOM');

    if (outOfBounds(state, extra.snake.head)) {
      if (hasPhantom) wrapSnakeHeadRef(state, extra.snake);
      else resetExtraSnake(extra, state);
      continue;
    }
    if (hitsObstacle(state, extra.snake.head)) {
      resetExtraSnake(extra, state);
      continue;
    }
    // Self-collision
    if (!hasPhantom && extra.snake.body.some((p) => samePos(p, extra.snake.head))) {
      resetExtraSnake(extra, state);
      continue;
    }
    // Hit P1 body
    if (state.p1.body.some((p) => samePos(p, extra.snake.head))) {
      resetExtraSnake(extra, state); continue;
    }
    // Hit P2 body
    if (state.p2.body.some((p) => samePos(p, extra.snake.head))) {
      resetExtraSnake(extra, state); continue;
    }
    // Hit another extra snake body (head-on handled in checkExtraSnakePairCollisions)
    let hitOtherBody = false;
    for (const other of state.extraSnakes) {
      if (other === extra) continue;
      if (other.snake.body.some((p) => samePos(p, extra.snake.head))) {
        hitOtherBody = true; break;
      }
    }
    if (hitOtherBody) { resetExtraSnake(extra, state); continue; }
  }
  // P1/P2 heads hitting extra snake bodies
  for (const extra of state.extraSnakes) {
    if (state.p1.body.length > 0 && extra.snake.body.some((p) => samePos(p, state.p1.head))) {
      resetSnake(state, 'P1');
    }
    if (state.p2.body.length > 0 && extra.snake.body.some((p) => samePos(p, state.p2.head))) {
      resetSnake(state, 'P2');
    }
    // Head-on collisions
    if (samePos(state.p1.head, extra.snake.head)) { resetSnake(state, 'P1'); resetExtraSnake(extra, state); }
    if (samePos(state.p2.head, extra.snake.head)) { resetSnake(state, 'P2'); resetExtraSnake(extra, state); }
  }
}

function swapP1P2Snakes(state: GameState): void {
  const t = state.p1;
  state.p1 = state.p2;
  state.p2 = t;
}

const POWER_UP_CHASE_RANGE = 6;

function isPlayerHuman(state: GameState, index: PowerUpPlayerIndex): boolean {
  if (index === 0) return state.meta.p1Human;
  if (index === 1) return state.meta.p2Human;
  if (index === 2) return state.extraSnakes[0]!.humanControlled;
  return state.extraSnakes[1]!.humanControlled;
}

function getAiTierForPlayer(state: GameState, index: PowerUpPlayerIndex): AiTier {
  if (index === 2) return state.extraSnakes[0]!.aiTier;
  if (index === 3) return state.extraSnakes[1]!.aiTier;
  return state.meta.aiTier;
}

function applyInitialAiFacing(state: GameState, playerIndex: PowerUpPlayerIndex): void {
  const snake = getSnakeByIndex(state, playerIndex);
  if (playerIndex === 2 || playerIndex === 3) {
    const extra = state.extraSnakes[playerIndex - 2]!;
    snake.dirWanted = extra.spawnDir === '' ? 'Right' : extra.spawnDir;
  }
}

function applyAiDirToSnake(snake: GameState['p1'], dir: Exclude<Direction, ''>): void {
  const cur = snake.dir;
  if (dir === 'Down' && (cur === 'Left' || cur === 'Right' || cur === '')) snake.dirWanted = 'Down';
  else if (dir === 'Up' && (cur === 'Left' || cur === 'Right' || cur === '')) snake.dirWanted = 'Up';
  else if (dir === 'Right' && (cur === 'Up' || cur === 'Down' || cur === '')) snake.dirWanted = 'Right';
  else if (dir === 'Left' && (cur === 'Up' || cur === 'Down' || cur === '')) snake.dirWanted = 'Left';
}

function blockedSetForPlayer(state: GameState, playerIndex: PowerUpPlayerIndex): Set<string> {
  const blocked = new Set<string>();
  const add = (p: GridPos) => blocked.add(posKey(p));
  const self = getSnakeByIndex(state, playerIndex);
  self.body.forEach(add);
  const count = activePlayerCount(state);
  for (let i = 0; i < count; i += 1) {
    if (i === playerIndex) continue;
    const s = getSnakeByIndex(state, i as PowerUpPlayerIndex);
    add(s.head);
    s.body.forEach(add);
  }
  return blocked;
}

function findPathForPlayer(
  state: GameState,
  playerIndex: PowerUpPlayerIndex,
  start: GridPos,
  target: GridPos,
): GridPos[] {
  const snake = getSnakeByIndex(state, playerIndex);
  const facing = snake.dir || snake.dirWanted;
  return findPathGeneric(
    state,
    start,
    target,
    blockedSetForPlayer(state, playerIndex),
    facing || undefined,
  );
}

function applyPathToPlayer(
  state: GameState,
  playerIndex: PowerUpPlayerIndex,
  path: GridPos[],
): void {
  if (path.length < 2) return;
  const next = path[1];
  const count = activePlayerCount(state);
  for (let i = 0; i < count; i += 1) {
    if (i === playerIndex) continue;
    const s = getSnakeByIndex(state, i as PowerUpPlayerIndex);
    if (s.body.some((p) => samePos(p, next))) return;
    if (samePos(s.head, next)) return;
  }
  const snake = getSnakeByIndex(state, playerIndex);
  const [x, y] = snake.head;
  let dir: Exclude<Direction, ''> | null = null;
  if (next[0] === x && next[1] > y) dir = 'Down';
  else if (next[0] === x && next[1] < y) dir = 'Up';
  else if (next[1] === y && next[0] > x) dir = 'Right';
  else if (next[1] === y && next[0] < x) dir = 'Left';
  if (dir) applyAiDirToSnake(snake, dir);
}

function chooseBestCoinbaseForPlayer(
  state: GameState,
  playerIndex: PowerUpPlayerIndex,
): GridPos | null {
  if (state.coinbases.length === 0) return null;
  const head = getPlayerHead(state, playerIndex);
  const count = activePlayerCount(state);
  let best: GridPos | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const cb of state.coinbases) {
    if (cb.isDecoy) continue;
    const distAi = Math.hypot(cb.pos[0] - head[0], cb.pos[1] - head[1]);
    let nearestRival = Number.POSITIVE_INFINITY;
    for (let i = 0; i < count; i += 1) {
      if (i === playerIndex) continue;
      const rivalHead = getPlayerHead(state, i as PowerUpPlayerIndex);
      const d = Math.hypot(cb.pos[0] - rivalHead[0], cb.pos[1] - rivalHead[1]);
      if (d < nearestRival) nearestRival = d;
    }
    const score = nearestRival - distAi + (cb.reward ? cb.reward * 2 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = cb.pos;
    }
  }
  return best;
}

function decideNormieForPlayer(state: GameState, playerIndex: PowerUpPlayerIndex): void {
  const snake = getSnakeByIndex(state, playerIndex);
  const dirs: Exclude<Direction, ''>[] = ['Up', 'Down', 'Left', 'Right'];
  const safe = dirs.filter((d) => !wouldHitWall(state, snake, d));
  if (safe.length === 0) return;

  if (gameRandom() < 0.6) {
    applyAiDirToSnake(snake, safe[Math.floor(gameRandom() * safe.length)]);
    return;
  }

  const target = state.coinbases.find((cb) => !cb.isDecoy)?.pos;
  if (target) {
    const preferred = preferredDirToward(snake.head, target);
    if (safe.includes(preferred)) {
      applyAiDirToSnake(snake, preferred);
      return;
    }
  }
  applyAiDirToSnake(snake, safe[Math.floor(gameRandom() * safe.length)]);
}

function decideStackerForPlayer(state: GameState, playerIndex: PowerUpPlayerIndex): void {
  const head = getPlayerHead(state, playerIndex);
  const target = state.coinbases.find((cb) => !cb.isDecoy)?.pos;
  if (!target) return;
  applyPathToPlayer(state, playerIndex, findPathForPlayer(state, playerIndex, head, target));
}

function decideEconomyChaseForPlayer(
  state: GameState,
  playerIndex: PowerUpPlayerIndex,
  chasePowerUps: boolean,
): void {
  const head = getPlayerHead(state, playerIndex);
  const snake = getSnakeByIndex(state, playerIndex);

  if (chasePowerUps && state.meta.powerupMode) {
    const nearbyPowerUp = state.powerUpItems.find(
      (p) => Math.hypot(p.pos[0] - head[0], p.pos[1] - head[1]) < POWER_UP_CHASE_RANGE,
    );
    if (nearbyPowerUp) {
      const path = findPathForPlayer(state, playerIndex, head, nearbyPowerUp.pos);
      if (path.length > 1) {
        applyPathToPlayer(state, playerIndex, path);
        return;
      }
    }
  }

  const bestCoinbase = chooseBestCoinbaseForPlayer(state, playerIndex);
  if (bestCoinbase) {
    const path = findPathForPlayer(state, playerIndex, head, bestCoinbase);
    if (path.length > 1) {
      applyPathToPlayer(state, playerIndex, path);
      return;
    }
  }

  const dirs: Exclude<Direction, ''>[] = ['Up', 'Down', 'Left', 'Right'];
  const safe = dirs.filter((d) => !wouldHitWall(state, snake, d));
  if (safe.length > 0) applyAiDirToSnake(snake, safe[0]);
}

/** Classic 1v1 sovereign intercept (P2 bot); P1 bot uses temporary P1/P2 swap. */
function decideSovereignDuelLegacy(state: GameState, botIndex: PowerUpPlayerIndex): boolean {
  if (isFfaMode(state) || activePlayerCount(state) !== 2) return false;
  if (botIndex === 1) {
    decideSovereign(state);
    return true;
  }
  if (botIndex === 0) {
    swapP1P2Snakes(state);
    decideSovereign(state);
    swapP1P2Snakes(state);
    return true;
  }
  return false;
}

export function decideAiForPlayer(state: GameState, playerIndex: PowerUpPlayerIndex): void {
  const snake = getSnakeByIndex(state, playerIndex);
  if (snake.dir === '') {
    applyInitialAiFacing(state, playerIndex);
    return;
  }
  const tier = getAiTierForPlayer(state, playerIndex);
  switch (tier) {
    case 'normie':
      decideNormieForPlayer(state, playerIndex);
      break;
    case 'stacker':
      decideStackerForPlayer(state, playerIndex);
      break;
    case 'noderunner':
      decideEconomyChaseForPlayer(state, playerIndex, true);
      break;
    case 'sovereign':
      if (!decideSovereignDuelLegacy(state, playerIndex)) {
        decideEconomyChaseForPlayer(state, playerIndex, true);
      }
      break;
    default:
      decideStackerForPlayer(state, playerIndex);
  }
}

/** Normie: mostly random with light wall avoidance */
function decideNormie(state: GameState): void {
  const dirs: Exclude<Direction, ''>[] = ['Up', 'Down', 'Left', 'Right'];
  const safe = dirs.filter((d) => !wouldHitWall(state, state.p2, d));
  if (safe.length === 0) return;

  // 60% chance to just pick a random safe direction
  if (gameRandom() < 0.6) {
    const random = safe[Math.floor(gameRandom() * safe.length)];
    applyAiDir(state, random);
    return;
  }

  // Otherwise head vaguely toward nearest coinbase
  const target = state.coinbases[0]?.pos;
  if (target) {
    const preferred = preferredDirToward(state.p2.head, target);
    if (safe.includes(preferred)) {
      applyAiDir(state, preferred);
      return;
    }
  }
  applyAiDir(state, safe[Math.floor(gameRandom() * safe.length)]);
}

/** Stacker: A* toward nearest coinbase */
function decideStacker(state: GameState): void {
  const path = findPathP2(state);
  applyPathToAi(state, path);
}

const SOVEREIGN_INTERCEPT_RANGE = 10;
const SOVEREIGN_INTERCEPT_COMMIT_RANGE = 20;
const SOVEREIGN_INTERCEPT_PATH_SLACK = 2;
const SOVEREIGN_COIN_CONTEST_SLACK = 6;
const SOVEREIGN_PREDICT_STEPS = 4;
const SOVEREIGN_TAIL_SIM_MAX_STEPS = 12;

interface SovereignIntercept {
  headTarget: GridPos;
  blockCell: GridPos;
  strategy: 'head-race' | 'tail-block';
}

interface SovereignInterceptPlan {
  mode: 'intercept';
  headTarget: GridPos;
  blockCell: GridPos;
  strategy: 'head-race' | 'tail-block';
}

const sovereignInterceptPlans = new WeakMap<GameState, SovereignInterceptPlan>();

interface SimSnake {
  head: GridPos;
  body: GridPos[];
}

function cloneSimSnake(snake: GameState['p2']): SimSnake {
  return {
    head: [snake.head[0], snake.head[1]],
    body: snake.body.map((p) => [p[0], p[1]] as GridPos),
  };
}

/** One grid step — mirrors moveSnake body/head update. */
function simSnakeStep(snake: SimSnake, nextHead: GridPos): void {
  snake.body.unshift([snake.head[0], snake.head[1]]);
  snake.body.pop();
  snake.head = [nextHead[0], nextHead[1]];
}

function snakeBodyOccupies(snake: SimSnake, cell: GridPos): boolean {
  return snake.body.some((p) => samePos(p, cell));
}

function botHeadMoveSafe(state: GameState, head: GridPos, p1Head: GridPos): boolean {
  if (samePos(head, p1Head)) return false;
  if (state.p1.body.some((p) => samePos(head, p))) return false;
  return true;
}

function bodyOccupiesCell(snake: GameState['p2'], cell: GridPos): boolean {
  return snake.body.some((p) => samePos(p, cell));
}

/** Body segment count — same metric used for capture %. */
function snakeBodyLength(snake: GameState['p1']): number {
  return snake.body.length;
}

/** Smaller bot plays aggressive head-race; longer/equal bot lays tail blocks. */
function sovereignPrefersTailBlock(state: GameState): boolean {
  return snakeBodyLength(state.p2) >= snakeBodyLength(state.p1);
}

/** Bot always avoids P1 body; head-race alone may target P1's head cell. */
type PlayerPathAvoidance = 'none' | 'head-and-body' | 'body-only';

function sovereignPathAvoidance(strategy: SovereignIntercept['strategy']): PlayerPathAvoidance {
  return strategy === 'head-race' ? 'body-only' : 'head-and-body';
}

function gridDist(a: GridPos, b: GridPos): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function nearestCoinbaseTarget(state: GameState): GridPos | null {
  return state.coinbases.find((cb) => !cb.isDecoy)?.pos ?? null;
}

/** P1 route toward the coin — models the human going for food, routing around the bot. */
function findPlayerFoodPath(state: GameState, coinTarget: GridPos): GridPos[] {
  const blocked = new Set<string>();
  const add = (p: GridPos) => blocked.add(posKey(p));
  state.p1.body.forEach(add);
  state.p2.body.forEach(add);
  add(state.p2.head);
  const facing = state.p1.dir || state.p1.dirWanted;
  return findPathGeneric(state, state.p1.head, coinTarget, blocked, facing || undefined);
}

/** Candidate head destinations: past the choke on P1's route + flank cells. */
function collectTailBlockHeadTargets(p1Path: GridPos[], blockIndex: number): GridPos[] {
  const block = p1Path[blockIndex]!;
  const targets: GridPos[] = [];
  if (blockIndex + 1 < p1Path.length) targets.push(p1Path[blockIndex + 1]!);
  if (blockIndex + 2 < p1Path.length) targets.push(p1Path[blockIndex + 2]!);

  const flanks: GridPos[] = [
    [block[0] + 1, block[1]],
    [block[0] - 1, block[1]],
    [block[0], block[1] + 1],
    [block[0], block[1] - 1],
  ];
  for (const f of flanks) {
    if (!p1Path.some((p) => samePos(p, f))) targets.push(f);
  }
  return targets;
}

/**
 * Simulate bot movement along path; succeed if body covers blockCell before/at player arrival
 * without the bot head hitting P1 head/body.
 */
function evaluateTailBlockAlongPath(
  state: GameState,
  botPath: GridPos[],
  p1Path: GridPos[],
  blockCell: GridPos,
  playerStepsToBlock: number,
): { bodyCoverStep: number } | null {
  const sim = cloneSimSnake(state.p2);
  const maxSteps = Math.min(botPath.length - 1, SOVEREIGN_TAIL_SIM_MAX_STEPS);

  for (let k = 1; k <= maxSteps; k += 1) {
    const next = botPath[k]!;
    simSnakeStep(sim, next);

    const p1Head = p1Path[Math.min(k, p1Path.length - 1)]!;
    if (!botHeadMoveSafe(state, sim.head, p1Head)) return null;

    if (snakeBodyOccupies(sim, blockCell) && k <= playerStepsToBlock + 1) {
      return { bodyCoverStep: k };
    }
  }
  return null;
}

/**
 * Tail-block intercept: path the head past a choke so body covers it in time.
 * Used when the bot is at least as long as the player.
 */
function findTailBlockIntercept(
  state: GameState,
  p1Path: GridPos[],
  p2Start: GridPos,
): SovereignIntercept | null {
  let best: SovereignIntercept | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  const scanLimit = Math.min(p1Path.length - 1, SOVEREIGN_PREDICT_STEPS + 3);
  for (let i = 1; i <= scanLimit; i += 1) {
    const blockCell = p1Path[i]!;
    const headTargets = collectTailBlockHeadTargets(p1Path, i);

    for (const headTarget of headTargets) {
      const botPath = findPath(state, p2Start, headTarget, 'head-and-body');
      if (botPath.length <= 1) continue;
      if (!botPath.some((p) => samePos(p, blockCell))) continue;

      const tailBlock = evaluateTailBlockAlongPath(state, botPath, p1Path, blockCell, i);
      if (!tailBlock) continue;

      const score = tailBlock.bodyCoverStep * 10 + botPath.length;
      if (score < bestScore) {
        bestScore = score;
        best = { headTarget, blockCell, strategy: 'tail-block' };
      }
    }
  }
  return best;
}

/**
 * Head-race intercept: rush the choke on P1's food path (may head-on collide).
 * Used when the bot is shorter — tail blocks are weak, reset trade is acceptable.
 */
function findHeadRaceIntercept(
  state: GameState,
  p1Path: GridPos[],
  p2Start: GridPos,
): SovereignIntercept | null {
  let best: SovereignIntercept | null = null;
  let bestBotSteps = Number.POSITIVE_INFINITY;

  const scanLimit = Math.min(p1Path.length - 1, SOVEREIGN_PREDICT_STEPS + 3);
  for (let i = 1; i <= scanLimit; i += 1) {
    const candidate = p1Path[i]!;
    const botPath = findPath(state, p2Start, candidate, 'body-only');
    const botSteps = botPath.length - 1;
    if (botSteps <= i + 1 && botSteps < bestBotSteps) {
      bestBotSteps = botSteps;
      best = { headTarget: candidate, blockCell: candidate, strategy: 'head-race' };
    }
  }

  if (best) return best;

  const fallbackIdx = Math.min(SOVEREIGN_PREDICT_STEPS, p1Path.length - 1);
  const cell = p1Path[fallbackIdx];
  return cell ? { headTarget: cell, blockCell: cell, strategy: 'head-race' } : null;
}

function findSovereignInterceptTarget(
  state: GameState,
  coinTarget: GridPos,
): SovereignIntercept | null {
  const p1Path = findPlayerFoodPath(state, coinTarget);
  if (p1Path.length <= 1) return null;

  const p2Start: GridPos = [state.p2.head[0], state.p2.head[1]];

  if (sovereignPrefersTailBlock(state)) {
    return findTailBlockIntercept(state, p1Path, p2Start);
  }
  return findHeadRaceIntercept(state, p1Path, p2Start);
}

function shouldStartSovereignIntercept(
  state: GameState,
  coinTarget: GridPos,
  coinPath: GridPos[],
  interceptPath: GridPos[],
): boolean {
  if (interceptPath.length <= 1) return false;
  if (gridDist(state.p1.head, state.p2.head) > SOVEREIGN_INTERCEPT_RANGE) return false;

  const distP1Coin = gridDist(state.p1.head, coinTarget);
  const distP2Coin = gridDist(state.p2.head, coinTarget);
  if (distP2Coin + 3 < distP1Coin) return false;

  const playerWinningRace = distP1Coin <= distP2Coin + 2;
  const interceptWorthwhile =
    interceptPath.length <= coinPath.length + SOVEREIGN_INTERCEPT_PATH_SLACK;

  return interceptWorthwhile && (playerWinningRace || interceptPath.length <= coinPath.length);
}

/** P1 is still trying for the coin — not a full retreat. */
function playerStillContestingCoin(state: GameState, coinTarget: GridPos): boolean {
  const distP1Coin = gridDist(state.p1.head, coinTarget);
  const distP2Coin = gridDist(state.p2.head, coinTarget);
  if (distP1Coin > SOVEREIGN_INTERCEPT_COMMIT_RANGE) return false;
  return distP1Coin <= distP2Coin + SOVEREIGN_COIN_CONTEST_SLACK;
}

function isHoldingBlockCell(state: GameState, blockCell: GridPos): boolean {
  return gridDist(state.p2.head, blockCell) <= 1;
}

function sovereignInterceptMoveTarget(state: GameState, plan: SovereignInterceptPlan): GridPos {
  if (plan.strategy === 'tail-block' && !bodyOccupiesCell(state.p2, plan.blockCell)) {
    return plan.headTarget;
  }
  return plan.blockCell;
}

function shouldContinueSovereignIntercept(
  state: GameState,
  plan: SovereignInterceptPlan,
  interceptPath: GridPos[],
  coinTarget: GridPos,
): boolean {
  if (!playerStillContestingCoin(state, coinTarget)) return false;
  if (plan.strategy === 'tail-block' && bodyOccupiesCell(state.p2, plan.blockCell)) return false;
  if (isHoldingBlockCell(state, plan.blockCell)) return true;
  if (interceptPath.length <= 1) return false;
  if (gridDist(state.p1.head, state.p2.head) > SOVEREIGN_INTERCEPT_COMMIT_RANGE) return false;
  return true;
}

/** Hold position on the choke when already in place. */
function applyHoldAtBlockCell(state: GameState, blockCell: GridPos): void {
  const preferred = preferredDirToward(state.p2.head, blockCell);
  if (!wouldHitWall(state, state.p2, preferred)) {
    applyAiDir(state, preferred);
    return;
  }
  const dirs: Exclude<Direction, ''>[] = ['Up', 'Down', 'Left', 'Right'];
  const safe = dirs.filter((d) => !wouldHitWall(state, state.p2, d));
  if (safe.length > 0) applyAiDir(state, safe[0]);
}

/** Best coin + nearby power-ups, avoids P1 snake. Shared by Tactician and Sovereign fallback. */
function decideEconomyChase(state: GameState): void {
  const nearbyPowerUp = state.powerUpItems.find(
    (p) => Math.hypot(p.pos[0] - state.p2.head[0], p.pos[1] - state.p2.head[1]) < 6
  );
  if (nearbyPowerUp) {
    const path = findPath(state, state.p2.head, nearbyPowerUp.pos, 'head-and-body');
    if (path.length > 1) {
      applyPathToAi(state, path);
      return;
    }
  }

  const bestCoinbase = chooseBestCoinbaseForAi(state);
  if (bestCoinbase) {
    const path = findPath(state, state.p2.head, bestCoinbase, 'head-and-body');
    if (path.length > 1) {
      applyPathToAi(state, path);
      return;
    }
  }

  const dirs: Exclude<Direction, ''>[] = ['Up', 'Down', 'Left', 'Right'];
  const safe = dirs.filter((d) => !wouldHitWall(state, state.p2, d));
  if (safe.length > 0) applyAiDir(state, safe[0]);
}

/** Noderunner: economy bot — best coin, power-ups, avoids P1. No intercept. */
function decideNoderunner(state: GameState): void {
  decideEconomyChase(state);
}

/** Sovereign: economy play + intercept when racing P1 for the best coin. */
function decideSovereign(state: GameState): void {
  const coinTarget = chooseBestCoinbaseForAi(state) ?? nearestCoinbaseTarget(state);
  const start: GridPos = [state.p2.head[0], state.p2.head[1]];
  const coinPath = coinTarget ? findPath(state, start, coinTarget, 'head-and-body') : [start];

  const existingPlan = sovereignInterceptPlans.get(state);
  if (existingPlan?.mode === 'intercept' && coinTarget) {
    const refreshed = findSovereignInterceptTarget(state, coinTarget);
    const plan: SovereignInterceptPlan = refreshed
      ? { mode: 'intercept', ...refreshed }
      : existingPlan;
    const moveTarget = sovereignInterceptMoveTarget(state, plan);
    const avoidance = sovereignPathAvoidance(plan.strategy);
    const interceptPath = findPath(state, start, moveTarget, avoidance);

    if (shouldContinueSovereignIntercept(state, plan, interceptPath, coinTarget)) {
      if (interceptPath.length >= 2) {
        applyPathToAi(state, interceptPath);
      } else if (isHoldingBlockCell(state, plan.blockCell)) {
        applyHoldAtBlockCell(state, plan.blockCell);
      }
      sovereignInterceptPlans.set(state, {
        mode: 'intercept',
        headTarget: plan.headTarget,
        blockCell: plan.blockCell,
        strategy: plan.strategy,
      });
      return;
    }
    sovereignInterceptPlans.delete(state);
  }

  const intercept = coinTarget ? findSovereignInterceptTarget(state, coinTarget) : null;
  if (intercept && coinTarget) {
    const avoidance = sovereignPathAvoidance(intercept.strategy);
    const interceptPath = findPath(state, start, intercept.headTarget, avoidance);
    if (shouldStartSovereignIntercept(state, coinTarget, coinPath, interceptPath)) {
      applyPathToAi(state, interceptPath);
      sovereignInterceptPlans.set(state, {
        mode: 'intercept',
        headTarget: intercept.headTarget,
        blockCell: intercept.blockCell,
        strategy: intercept.strategy,
      });
      return;
    }
  }

  sovereignInterceptPlans.delete(state);
  decideEconomyChase(state);
}

function chooseBestCoinbaseForAi(state: GameState): GridPos | null {
  if (state.coinbases.length === 0) return null;

  let best: GridPos | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const cb of state.coinbases) {
    if (cb.isDecoy) continue;
    const distAi = Math.hypot(cb.pos[0] - state.p2.head[0], cb.pos[1] - state.p2.head[1]);
    const distPlayer = Math.hypot(cb.pos[0] - state.p1.head[0], cb.pos[1] - state.p1.head[1]);
    const score = distPlayer - distAi + (cb.reward ? cb.reward * 2 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = cb.pos;
    }
  }
  return best;
}

function applyPathToAi(state: GameState, path: GridPos[]): void {
  if (path.length < 2) return;
  const next = path[1];
  // Never drive into P1 body/tail — stale paths or head-race must not suicide here.
  if (state.p1.body.some((p) => samePos(p, next))) return;
  const [x, y] = state.p2.head;

  let dir: Exclude<Direction, ''> | null = null;
  if (next[0] === x && next[1] > y) dir = 'Down';
  else if (next[0] === x && next[1] < y) dir = 'Up';
  else if (next[1] === y && next[0] > x) dir = 'Right';
  else if (next[1] === y && next[0] < x) dir = 'Left';

  if (dir) applyAiDir(state, dir);
}

function applyAiDir(state: GameState, dir: Exclude<Direction, ''>): void {
  applyAiDirToSnake(state.p2, dir);
}

/** True if b is the opposite cardinal direction of a (snake cannot reverse in one tick). */
function dirsAreOpposite(a: Direction, b: Direction): boolean {
  if (!a || !b) return false;
  return (
    (a === 'Up' && b === 'Down') ||
    (a === 'Down' && b === 'Up') ||
    (a === 'Left' && b === 'Right') ||
    (a === 'Right' && b === 'Left')
  );
}

function stepDirFromTo(from: GridPos, to: GridPos): Exclude<Direction, ''> | null {
  if (to[0] > from[0]) return 'Right';
  if (to[0] < from[0]) return 'Left';
  if (to[1] > from[1]) return 'Down';
  if (to[1] < from[1]) return 'Up';
  return null;
}

function wouldHitWall(state: GameState, snake: GameState['p1'], dir: Direction): boolean {
  const facing = snake.dir || snake.dirWanted;
  if (facing && dir && dirsAreOpposite(facing, dir)) return true;
  const next: GridPos = [snake.head[0], snake.head[1]];
  if (dir === 'Up') next[1] -= 1;
  else if (dir === 'Down') next[1] += 1;
  else if (dir === 'Left') next[0] -= 1;
  else if (dir === 'Right') next[0] += 1;
  return outOfBounds(state, next) || hitsObstacle(state, next) ||
    snake.body.some((p) => samePos(p, next));
}

function preferredDirToward(from: GridPos, to: GridPos): Exclude<Direction, ''> {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'Right' : 'Left';
  return dy > 0 ? 'Down' : 'Up';
}

// ============================================================================
// Pathfinding
// ============================================================================

function findPathP2(state: GameState, avoidPlayer = false): GridPos[] {
  const start: GridPos = [state.p2.head[0], state.p2.head[1]];
  const target = state.coinbases.find((cb) => !cb.isDecoy)?.pos;
  if (!target) return [start];
  return findPath(state, start, target, avoidPlayer ? 'head-and-body' : 'none');
}

function findPath(
  state: GameState,
  start: GridPos,
  target: GridPos,
  playerAvoidance: PlayerPathAvoidance = 'none',
): GridPos[] {
  const openSet: GridPos[] = [start];
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[posKey(start), 0]]);
  const fScore = new Map<string, number>([[posKey(start), heuristic(start, target)]]);

  while (openSet.length > 0) {
    let current = openSet[0];
    let currentF = fScore.get(posKey(current)) ?? Number.POSITIVE_INFINITY;
    for (const node of openSet) {
      const score = fScore.get(posKey(node)) ?? Number.POSITIVE_INFINITY;
      if (score < currentF) { current = node; currentF = score; }
    }

    if (samePos(current, target)) return reconstructPath(cameFrom, current);

    openSet.splice(openSet.findIndex((n) => posKey(n) === posKey(current)), 1);

    const neighbors: GridPos[] = [
      [current[0] + 1, current[1]],
      [current[0] - 1, current[1]],
      [current[0], current[1] + 1],
      [current[0], current[1] - 1],
    ];

    for (const neighbor of neighbors) {
      if (outOfBounds(state, neighbor)) continue;
      if (hitsObstacle(state, neighbor)) continue;
      if (state.p2.body.some((p) => samePos(p, neighbor))) continue;
      if (playerAvoidance !== 'none' && state.p1.body.some((p) => samePos(p, neighbor))) continue;
      if (playerAvoidance === 'head-and-body' && samePos(state.p1.head, neighbor)) continue;
      if (samePos(current, start) && samePos(start, state.p2.head)) {
        const facing = state.p2.dir || state.p2.dirWanted;
        const step = stepDirFromTo(current, neighbor);
        if (facing && step && dirsAreOpposite(facing, step)) continue;
      }

      const tentative = (gScore.get(posKey(current)) ?? Number.POSITIVE_INFINITY) + 1;
      if (tentative < (gScore.get(posKey(neighbor)) ?? Number.POSITIVE_INFINITY)) {
        cameFrom.set(posKey(neighbor), posKey(current));
        gScore.set(posKey(neighbor), tentative);
        fScore.set(posKey(neighbor), tentative + heuristic(neighbor, target));
        if (!openSet.some((n) => posKey(n) === posKey(neighbor))) openSet.push(neighbor);
      }
    }
  }
  return [start];
}

function heuristic(a: GridPos, b: GridPos): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function posKey(pos: GridPos): string {
  return `${pos[0]}:${pos[1]}`;
}

function reconstructPath(cameFrom: Map<string, string>, current: GridPos): GridPos[] {
  const path: GridPos[] = [[current[0], current[1]]];
  let cursor = posKey(current);
  while (cameFrom.has(cursor)) {
    const prev = cameFrom.get(cursor)!;
    const [x, y] = prev.split(':').map((n) => Number.parseInt(n, 10));
    path.unshift([x, y]);
    cursor = prev;
  }
  return path;
}

// ============================================================================
// getMetaFromDuel (for legacy socket-based modes)
// ============================================================================

export function getMetaFromDuel(
  mode: string
): Pick<GameMeta, 'modeLabel' | 'practiceMode' | 'isTournament'> {
  const normalized = mode?.toUpperCase() ?? 'P2P';
  if (normalized === 'TOURNAMENT' || normalized === 'TOURNAMENTNOSTR') {
    return { modeLabel: mode, practiceMode: false, isTournament: true };
  }
  if (normalized === 'PRACTICE' || normalized === 'SOVEREIGN') {
    return {
      modeLabel: normalized === 'SOVEREIGN' ? 'Sovereign' : 'Practice',
      practiceMode: true,
      isTournament: false,
    };
  }
  return { modeLabel: mode || 'P2P', practiceMode: false, isTournament: false };
}

