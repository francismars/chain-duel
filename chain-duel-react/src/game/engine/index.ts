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
  POWERUP_RESPAWN_COOLDOWN_TICKS,
  POWERUP_SURGE_DURATION_TICKS,
  POWERUP_FREEZE_DURATION_TICKS,
  POWERUP_PHANTOM_DURATION_TICKS,
  POWERUP_ANCHOR_DURATION_TICKS,
  POWERUP_AMPLIFIER_CHARGES,
  POWERUP_SPAWN_WEIGHTS,
  STEP_SPEED_MS,
} from '@/game/engine/constants';
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

// ============================================================================
// Extra-snake helpers

/** Tail cell opposite the initial facing direction (head + 1 segment). */
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

// ============================================================================
// createGameState
// ============================================================================

export function createGameState(args: CreateStateArgs): GameState {
  const p1 = Math.max(1, Math.floor(args.p1Points));
  const p2 = Math.max(1, Math.floor(args.p2Points));

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
      aiTier: args.aiTier ?? 'hunter',
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
    const fTier = args.ffaAiTier ?? (args.aiTier ?? 'hunter');
    const h1: GridPos = [4, 4];
    const h2: GridPos = [46, 4];
    state.p1.head = h1;
    state.p1.body = [bodySegmentBehindHead(h1, 'Right')];
    state.p2.head = h2;
    state.p2.body = [bodySegmentBehindHead(h2, 'Left')];
    state.p2.dirWanted = 'Left';
    state.extraSnakes = [
      makeExtraSnake([46, 20], 'Left', 1, 0x777777, 'Ghost', fTier, p3Human),
      makeExtraSnake([4, 20], 'Right', 1, 0xAAAAAA, 'Specter', fTier, p4Human),
    ];
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
  return {
    p1Points: state.score[0],
    p2Points: state.score[1],
    captureP1: getCaptureLabel(state.p1.body.length, state),
    captureP2: getCaptureLabel(state.p2.body.length, state),
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

    // Expire timed obstacle walls (ANCHOR)
    state.obstacleWalls = state.obstacleWalls.filter(
      (w) => w.expiresAtTick === undefined || w.expiresAtTick > state.tickCount
    );

    // Expire active power-ups
    const expiredPowerUps = state.activePowerUps.filter(
      (ap) => ap.expiresAtTick <= state.tickCount && ap.chargesLeft === undefined
    );
    state.activePowerUps = state.activePowerUps.filter(
      (ap) => ap.expiresAtTick > state.tickCount || ap.chargesLeft !== undefined
    );

    // Remove ANCHOR walls from expired ANCHOR power-ups
    for (const expired of expiredPowerUps) {
      if (expired.type === 'ANCHOR') {
        // Walls already expire by their own tick — no action needed
      }
    }

    // AI decision — pathfinding helpers treat P2 as the bot; swap when P1 is the bot.
    if (!state.meta.p1Human) {
      swapP1P2Snakes(state);
      decideAiDirection(state);
      swapP1P2Snakes(state);
    }
    if (!state.meta.p2Human) {
      decideAiDirection(state);
    }

    // Check FREEZE: slow P1/P2 (player field = the affected snake)
    const p1Frozen = state.activePowerUps.some(
      (ap) => ap.type === 'FREEZE' && ap.player === 'P1'
    );
    const p2Frozen = state.activePowerUps.some(
      (ap) => ap.type === 'FREEZE' && ap.player === 'P2'
    );

    // SURGE: extra tick for surging player
    const p1Surging = state.activePowerUps.some(
      (ap) => ap.type === 'SURGE' && ap.player === 'P1'
    );
    const p2Surging = state.activePowerUps.some(
      (ap) => ap.type === 'SURGE' && ap.player === 'P2'
    );

    const p1ShouldMove = !p1Frozen || (p1Frozen && state.tickCount % 2 === 0);
    const p2ShouldMove = !p2Frozen || (p2Frozen && state.tickCount % 2 === 0);

    // Surge doubles movement speed every other tick.
    // We must run the full collision/capture pipeline after EACH step so
    // coinbases on the intermediate cell aren't silently skipped.
    const p1DoubleStep = p1Surging && p1ShouldMove && state.tickCount % 2 === 0;
    const p2DoubleStep = p2Surging && p2ShouldMove && state.tickCount % 2 === 0;

    if (p1ShouldMove) moveSnake(state.p1);
    if (p2ShouldMove) moveSnake(state.p2);

    // Intermediate game-logic pass (only when at least one snake double-steps)
    if (p1DoubleStep || p2DoubleStep) {
      checkCollisions(state);
      captureCoinbase(state);
      checkPowerUpPickup(state);
      // Second step for surging snakes
      if (p1DoubleStep) moveSnake(state.p1);
      if (p2DoubleStep) moveSnake(state.p2);
    }

    checkCollisions(state);
    captureCoinbase(state);
    checkPowerUpPickup(state);

    // ── Extra snakes (teams / ffa) ──────────────────────────────────────────
    if (state.extraSnakes.length > 0) {
      for (const extra of state.extraSnakes) {
        if (!extra.humanControlled) decideExtraSnakeDir(state, extra);
      }
      for (const extra of state.extraSnakes) moveSnake(extra.snake);
      captureExtraSnakeCoinbases(state);
      checkExtraSnakeCollisions(state);
    }

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
    const x = minX + Math.floor(Math.random() * (maxX - minX + 1));
    const y = minY + Math.floor(Math.random() * (maxY - minY + 1));
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
    const x = minX + Math.floor(Math.random() * (maxX - minX + 1));
    const y = minY + Math.floor(Math.random() * (maxY - minY + 1));
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
  let rand = Math.random() * totalWeight;
  for (const type of types) {
    rand -= POWERUP_SPAWN_WEIGHTS[type];
    if (rand <= 0) return type;
  }
  return 'SURGE';
}

function checkPowerUpPickup(state: GameState): void {
  for (let i = state.powerUpItems.length - 1; i >= 0; i--) {
    const item = state.powerUpItems[i];
    let pickedBy: PlayerId | null = null;

    if (samePos(state.p1.head, item.pos)) pickedBy = 'P1';
    else if (samePos(state.p2.head, item.pos)) pickedBy = 'P2';

    if (pickedBy) {
      applyPowerUp(state, pickedBy, item.type);
      state.powerUpItems.splice(i, 1);
      state.powerUpRespawnCooldownTick = state.tickCount + POWERUP_RESPAWN_COOLDOWN_TICKS;
    }
  }
}

function applyPowerUp(state: GameState, player: PlayerId, type: PowerUpType): void {
  const opponent: PlayerId = player === 'P1' ? 'P2' : 'P1';

  switch (type) {
    case 'SURGE':
      removeExisting(state, player, 'SURGE');
      state.activePowerUps.push({
        type: 'SURGE', player,
        expiresAtTick: state.tickCount + POWERUP_SURGE_DURATION_TICKS,
      });
      break;

    case 'FREEZE':
      removeExisting(state, opponent, 'FREEZE');
      state.activePowerUps.push({
        type: 'FREEZE', player: opponent,
        expiresAtTick: state.tickCount + POWERUP_FREEZE_DURATION_TICKS,
      });
      break;

    case 'PHANTOM':
      removeExisting(state, player, 'PHANTOM');
      state.activePowerUps.push({
        type: 'PHANTOM', player,
        expiresAtTick: state.tickCount + POWERUP_PHANTOM_DURATION_TICKS,
      });
      break;

    case 'ANCHOR': {
      const snake = player === 'P1' ? state.p1 : state.p2;
      const tailPos = snake.body[snake.body.length - 1];
      state.obstacleWalls.push({
        pos: [tailPos[0], tailPos[1]],
        expiresAtTick: state.tickCount + POWERUP_ANCHOR_DURATION_TICKS,
      });
      break;
    }

    case 'AMPLIFIER':
      removeExisting(state, player, 'AMPLIFIER');
      state.activePowerUps.push({
        type: 'AMPLIFIER', player,
        expiresAtTick: state.tickCount + 9999,
        chargesLeft: POWERUP_AMPLIFIER_CHARGES,
      });
      break;

    case 'DECOY': {
      let decoyAttempts = 0;
      while (decoyAttempts < 200) {
        const x = Math.floor(Math.random() * state.cols);
        const y = Math.floor(Math.random() * state.rows);
        const pos: GridPos = [x, y];
        if (!hasCollisionAt(state, pos)) {
          state.coinbases.push({ pos, isDecoy: true });
          break;
        }
        decoyAttempts++;
      }
      break;
    }
  }
}

function removeExisting(state: GameState, player: PlayerId, type: PowerUpType): void {
  state.activePowerUps = state.activePowerUps.filter(
    (ap) => !(ap.player === player && ap.type === type)
  );
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
    const x = minX + Math.floor(Math.random() * (maxX - minX + 1));
    const y = minY + Math.floor(Math.random() * (maxY - minY + 1));
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
  const p1HasPhantom = state.activePowerUps.some(
    (ap) => ap.type === 'PHANTOM' && ap.player === 'P1'
  );
  const p2HasPhantom = state.activePowerUps.some(
    (ap) => ap.type === 'PHANTOM' && ap.player === 'P2'
  );

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
  // Ghost loops through both the outer grid walls and the convergence border.
  if (outOfBounds(state, state.p1.head)) {
    if (p1HasPhantom) wrapSnakeHead(state, 'P1');
    else resetSnake(state, 'P1');
  }
  if (outOfBounds(state, state.p2.head)) {
    if (p2HasPhantom) wrapSnakeHead(state, 'P2');
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

function outOfBounds(state: GameState, pos: GridPos): boolean {
  const sb = state.shrinkBorder;
  if (sb) {
    return pos[0] < sb.left || pos[0] > sb.right || pos[1] < sb.top || pos[1] > sb.bottom;
  }
  return pos[0] > state.cols - 1 || pos[1] < 0 || pos[1] > state.rows - 1 || pos[0] < 0;
}

/** Wrap a snake's head to the opposite wall (Pac-Man style) — PHANTOM power-up.
 *  When a convergence border is active, wraps within that border rather than the full grid. */
function wrapSnakeHead(state: GameState, player: 'P1' | 'P2'): void {
  const snake = player === 'P1' ? state.p1 : state.p2;
  const [x, y] = snake.head;
  const sb = state.shrinkBorder;
  if (sb) {
    const w = sb.right - sb.left + 1;
    const h = sb.bottom - sb.top + 1;
    snake.head = [
      sb.left + (((x - sb.left) % w + w) % w),
      sb.top  + (((y - sb.top)  % h + h) % h),
    ];
  } else {
    snake.head = [
      ((x % state.cols) + state.cols) % state.cols,
      ((y % state.rows) + state.rows) % state.rows,
    ];
  }
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

function changeScore(state: GameState, player: PlayerId, cb: Coinbase): void {
  const basePercent = cb.reward != null
    ? cb.reward
    : capturePercentByLength(getLength(state, player), state);

  const hasAmplifier = state.activePowerUps.some(
    (ap) => ap.type === 'AMPLIFIER' && ap.player === player && (ap.chargesLeft ?? 0) > 0
  );
  const finalPercent = hasAmplifier ? Math.min(32, basePercent * 2) : basePercent;

  // Consume amplifier charge
  if (hasAmplifier) {
    const amp = state.activePowerUps.find(
      (ap) => ap.type === 'AMPLIFIER' && ap.player === player
    );
    if (amp && amp.chargesLeft !== undefined) {
      amp.chargesLeft -= 1;
      if (amp.chargesLeft <= 0) {
        state.activePowerUps = state.activePowerUps.filter((ap) => ap !== amp);
      }
    }
  }

  const change = Math.floor((state.totalPoints * finalPercent) / 100);
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

function capturePercentByLength(length: number, state: GameState): number {
  const effectiveLength = state.meta.powerupMode ? length + 1 : length;
  for (const level of CAPTURE_LEVELS) {
    if (effectiveLength >= level.minLength && effectiveLength <= level.maxLength) {
      return level.percent;
    }
  }
  return 32;
}

export function getCaptureLabel(length: number, state?: GameState): string {
  const effectiveLength = state?.meta.powerupMode ? length + 1 : length;
  for (const level of CAPTURE_LEVELS) {
    if (effectiveLength >= level.minLength && effectiveLength <= level.maxLength) {
      return `${level.percent}%`;
    }
  }
  return '32%';
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
    state.activePowerUps = state.activePowerUps.filter((ap) => ap.player !== 'P1');
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
    state.activePowerUps = state.activePowerUps.filter((ap) => ap.player !== 'P2');
  }
}

// ============================================================================
// Utility
// ============================================================================

function hasCollisionAt(state: GameState, pos: GridPos): boolean {
  if (samePos(state.p1.head, pos) || samePos(state.p2.head, pos)) return true;
  if (state.p1.body.some((part) => samePos(part, pos))) return true;
  if (state.p2.body.some((part) => samePos(part, pos))) return true;
  for (const e of state.extraSnakes) {
    if (samePos(e.snake.head, pos)) return true;
    if (e.snake.body.some((part) => samePos(part, pos))) return true;
  }
  if (state.coinbases.some((cb) => samePos(cb.pos, pos))) return true;
  if (state.powerUpItems.some((p) => samePos(p.pos, pos))) return true;
  if (state.obstacleWalls.some((w) => samePos(w.pos, pos))) return true;
  return false;
}

function samePos(a: GridPos, b: GridPos): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function canContinueAfterGame(state: GameState, key: string): boolean {
  if (!state.gameEnded || !state.winnerPlayer) return false;
  const normalized = key.toUpperCase();
  if (state.meta.practiceMode || state.meta.convergenceMode || state.meta.powerupMode) {
    return normalized === ' ' || normalized === 'ENTER';
  }
  if (state.winnerPlayer === 'P1') return normalized === ' ';
  return normalized === 'ENTER';
}

// ============================================================================
// Extra-snake helpers (teams / ffa)
// ============================================================================

function resetExtraSnake(extra: ExtraSnake, state: GameState): void {
  let head: GridPos = [extra.spawnHead[0], extra.spawnHead[1]];
  if (state.shrinkBorder) {
    const sb = state.shrinkBorder;
    if (!isPosInsideActiveBorder(sb, head) || hasCollisionAt(state, head)) {
      const safe = findSafePosInBorder(state, sb);
      if (safe) head = safe;
    }
  }
  extra.snake.head = head;
  extra.snake.body = [];
  const dir: Exclude<Direction, ''> = extra.spawnDir === '' ? 'Right' : extra.spawnDir;
  let tail = bodySegmentBehindHead(head, dir);
  if (!hasCollisionAt(state, tail)) {
    extra.snake.body = [tail];
  } else {
    const alts: Exclude<Direction, ''>[] = ['Up', 'Down', 'Left', 'Right'];
    for (const d2 of alts) {
      if (d2 === dir) continue;
      tail = bodySegmentBehindHead(head, d2);
      if (!hasCollisionAt(state, tail)) {
        extra.snake.body = [tail];
        break;
      }
    }
  }
  extra.snake.dir = '';
  extra.snake.dirWanted = extra.spawnDir;
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

function buildBlockedSet(state: GameState, exclude?: ExtraSnake): Set<string> {
  const blocked = new Set<string>();
  const add = (p: GridPos) => blocked.add(posKey(p));
  state.p1.body.forEach(add);
  state.p2.body.forEach(add);
  add(state.p1.head);
  add(state.p2.head);
  for (const e of state.extraSnakes) {
    if (e === exclude) continue;
    add(e.snake.head);
    e.snake.body.forEach(add);
  }
  return blocked;
}

function extraSnakeTarget(state: GameState, extra: ExtraSnake): GridPos | null {
  let best: GridPos | null = null;
  let bestScore = -Infinity;
  for (const cb of state.coinbases) {
    if (cb.isDecoy) continue;
    const distExtra = Math.hypot(cb.pos[0] - extra.snake.head[0], cb.pos[1] - extra.snake.head[1]);
    const score = -distExtra + (cb.reward ? cb.reward * 1.5 : 0);
    if (score > bestScore) { bestScore = score; best = cb.pos; }
  }
  return best;
}

function decideExtraSnakeDir(state: GameState, extra: ExtraSnake): void {
  const target = extraSnakeTarget(state, extra);
  if (!target) return;
  const blocked = buildBlockedSet(state, extra);
  const facing = extra.snake.dir || extra.snake.dirWanted;
  const path = findPathGeneric(state, extra.snake.head, target, blocked, facing || undefined);
  if (path.length < 2) return;
  const next = path[1];
  const [x, y] = extra.snake.head;
  let dir: Exclude<Direction, ''> | null = null;
  if (next[0] === x && next[1] > y) dir = 'Down';
  else if (next[0] === x && next[1] < y) dir = 'Up';
  else if (next[1] === y && next[0] > x) dir = 'Right';
  else if (next[1] === y && next[0] < x) dir = 'Left';
  if (!dir) return;
  const cur = extra.snake.dir;
  if (dir === 'Down'  && (cur === 'Left' || cur === 'Right' || cur === '')) extra.snake.dirWanted = 'Down';
  else if (dir === 'Up'    && (cur === 'Left' || cur === 'Right' || cur === '')) extra.snake.dirWanted = 'Up';
  else if (dir === 'Right' && (cur === 'Up'   || cur === 'Down'  || cur === '')) extra.snake.dirWanted = 'Right';
  else if (dir === 'Left'  && (cur === 'Up'   || cur === 'Down'  || cur === '')) extra.snake.dirWanted = 'Left';
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
        extra.score += reward;
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
  for (const extra of state.extraSnakes) {
    if (outOfBounds(state, extra.snake.head) || hitsObstacle(state, extra.snake.head)) {
      resetExtraSnake(extra, state); continue;
    }
    // Self-collision
    if (extra.snake.body.some((p) => samePos(p, extra.snake.head))) {
      resetExtraSnake(extra, state); continue;
    }
    // Hit P1 body
    if (state.p1.body.some((p) => samePos(p, extra.snake.head))) {
      resetExtraSnake(extra, state); continue;
    }
    // Hit P2 body
    if (state.p2.body.some((p) => samePos(p, extra.snake.head))) {
      resetExtraSnake(extra, state); continue;
    }
    // Hit another extra snake
    let hitOther = false;
    for (const other of state.extraSnakes) {
      if (other === extra) continue;
      if (samePos(extra.snake.head, other.snake.head) ||
          other.snake.body.some((p) => samePos(p, extra.snake.head))) {
        hitOther = true; break;
      }
    }
    if (hitOther) { resetExtraSnake(extra, state); continue; }
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

function decideAiDirection(state: GameState): void {
  const tier = state.meta.aiTier;
  switch (tier) {
    case 'wanderer': decideWanderer(state); break;
    case 'hunter':   decideHunter(state); break;
    case 'tactician': decideTactician(state); break;
    case 'sovereign': decideSovereign(state); break;
    default:          decideHunter(state);
  }
}

/** Wanderer: mostly random with light wall avoidance */
function decideWanderer(state: GameState): void {
  const dirs: Exclude<Direction, ''>[] = ['Up', 'Down', 'Left', 'Right'];
  const safe = dirs.filter((d) => !wouldHitWall(state, state.p2, d));
  if (safe.length === 0) return;

  // 60% chance to just pick a random safe direction
  if (Math.random() < 0.6) {
    const random = safe[Math.floor(Math.random() * safe.length)];
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
  applyAiDir(state, safe[Math.floor(Math.random() * safe.length)]);
}

/** Hunter: A* toward nearest coinbase (original BigToshi behavior) */
function decideHunter(state: GameState): void {
  const path = findPathP2(state);
  applyPathToAi(state, path);
}

/** Tactician: A* + threat modeling, occasionally cuts off player */
function decideTactician(state: GameState): void {
  // Every 3 ticks, try to intercept player instead of chasing coinbase
  if (state.tickCount % 3 === 0) {
    const intercept = findInterceptPath(state);
    if (intercept && intercept.length > 1) {
      applyPathToAi(state, intercept);
      return;
    }
  }
  const path = findPathP2(state, true);
  applyPathToAi(state, path);
}

/** Sovereign: full lookahead with territory control and power-up usage */
function decideSovereign(state: GameState): void {
  // Grab power-up if close
  const nearbyPowerUp = state.powerUpItems.find(
    (p) => Math.hypot(p.pos[0] - state.p2.head[0], p.pos[1] - state.p2.head[1]) < 6
  );
  if (nearbyPowerUp) {
    const path = findPath(state, state.p2.head, nearbyPowerUp.pos, true);
    if (path.length > 1) {
      applyPathToAi(state, path);
      return;
    }
  }

  // Territory-aware coinbase selection
  const bestCoinbase = chooseBestCoinbaseForAi(state);
  if (bestCoinbase) {
    const path = findPath(state, state.p2.head, bestCoinbase, true);
    if (path.length > 1) {
      applyPathToAi(state, path);
      return;
    }
  }

  // Fallback: avoid death
  const dirs: Exclude<Direction, ''>[] = ['Up', 'Down', 'Left', 'Right'];
  const safe = dirs.filter((d) => !wouldHitWall(state, state.p2, d));
  if (safe.length > 0) applyAiDir(state, safe[0]);
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
  const [x, y] = state.p2.head;

  let dir: Exclude<Direction, ''> | null = null;
  if (next[0] === x && next[1] > y) dir = 'Down';
  else if (next[0] === x && next[1] < y) dir = 'Up';
  else if (next[1] === y && next[0] > x) dir = 'Right';
  else if (next[1] === y && next[0] < x) dir = 'Left';

  if (dir) applyAiDir(state, dir);
}

function applyAiDir(state: GameState, dir: Exclude<Direction, ''>): void {
  const cur = state.p2.dir;
  if (dir === 'Down' && (cur === 'Left' || cur === 'Right' || cur === '')) state.p2.dirWanted = 'Down';
  else if (dir === 'Up' && (cur === 'Left' || cur === 'Right' || cur === '')) state.p2.dirWanted = 'Up';
  else if (dir === 'Right' && (cur === 'Up' || cur === 'Down' || cur === '')) state.p2.dirWanted = 'Right';
  else if (dir === 'Left' && (cur === 'Up' || cur === 'Down' || cur === '')) state.p2.dirWanted = 'Left';
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

function findInterceptPath(state: GameState): GridPos[] | null {
  const predicted: GridPos = [
    state.p1.head[0] + (state.p1.dir === 'Right' ? 4 : state.p1.dir === 'Left' ? -4 : 0),
    state.p1.head[1] + (state.p1.dir === 'Down' ? 4 : state.p1.dir === 'Up' ? -4 : 0),
  ];
  const path = findPath(state, state.p2.head, predicted, true);
  return path.length > 1 ? path : null;
}

// ============================================================================
// Pathfinding
// ============================================================================

function findPathP2(state: GameState, avoidPlayer = false): GridPos[] {
  const start: GridPos = [state.p2.head[0], state.p2.head[1]];
  const target = state.coinbases.find((cb) => !cb.isDecoy)?.pos;
  if (!target) return [start];
  return findPath(state, start, target, avoidPlayer);
}

function findPath(
  state: GameState,
  start: GridPos,
  target: GridPos,
  avoidPlayerBody: boolean
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
      if (avoidPlayerBody && state.p1.body.some((p) => samePos(p, neighbor))) continue;
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

