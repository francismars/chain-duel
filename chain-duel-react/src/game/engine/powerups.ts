import {
  CAPTURE_LEVELS,
  POWERUP_AMPLIFIER_CHARGES,
  POWERUP_FREEZE_DURATION_TICKS,
  POWERUP_PHANTOM_DURATION_TICKS,
  POWERUP_RESPAWN_COOLDOWN_TICKS,
  POWERUP_SURGE_DURATION_TICKS,
} from '@/game/engine/constants';
import { isFfaMode } from '@/game/engine/ffa';
import type {
  ActivePowerUp,
  Coinbase,
  GameState,
  GridPos,
  PowerUpType,
  SnakeState,
} from '@/game/engine/types';

export type PowerUpPlayerIndex = 0 | 1 | 2 | 3;

export interface SnakePowerUpEffects {
  frozen: boolean;
  phantom: boolean;
  surging: boolean;
  amped: boolean;
}

export function activePlayerCount(state: GameState): number {
  return isFfaMode(state) ? 4 : 2;
}

export function getSnakeByIndex(state: GameState, index: PowerUpPlayerIndex): SnakeState {
  if (index === 0) return state.p1;
  if (index === 1) return state.p2;
  if (index === 2) return state.extraSnakes[0]!.snake;
  return state.extraSnakes[1]!.snake;
}

export function getPlayerHead(state: GameState, index: PowerUpPlayerIndex): GridPos {
  return getSnakeByIndex(state, index).head;
}

export function hasPowerUp(
  state: GameState,
  index: PowerUpPlayerIndex,
  type: PowerUpType,
): boolean {
  return state.activePowerUps.some((ap) => ap.playerIndex === index && ap.type === type);
}

export function getSnakeEffects(state: GameState, index: PowerUpPlayerIndex): SnakePowerUpEffects {
  return {
    frozen: hasPowerUp(state, index, 'FREEZE'),
    phantom: hasPowerUp(state, index, 'PHANTOM'),
    surging: hasPowerUp(state, index, 'SURGE'),
    amped: state.activePowerUps.some(
      (ap) => ap.type === 'AMPLIFIER' && ap.playerIndex === index && (ap.chargesLeft ?? 0) > 0,
    ),
  };
}

export function shouldPlayerMove(state: GameState, index: PowerUpPlayerIndex): boolean {
  const frozen = hasPowerUp(state, index, 'FREEZE');
  return !frozen || (frozen && state.tickCount % 2 === 0);
}

export function hasSurgeDoubleStep(state: GameState, index: PowerUpPlayerIndex): boolean {
  return (
    hasPowerUp(state, index, 'SURGE') &&
    shouldPlayerMove(state, index) &&
    state.tickCount % 2 === 0
  );
}

function removePowerUp(state: GameState, index: PowerUpPlayerIndex, type: PowerUpType): void {
  state.activePowerUps = state.activePowerUps.filter(
    (ap) => !(ap.playerIndex === index && ap.type === type),
  );
}

export function clearPowerUpsForPlayer(state: GameState, index: PowerUpPlayerIndex): void {
  state.activePowerUps = state.activePowerUps.filter((ap) => ap.playerIndex !== index);
}

function pushPowerUp(state: GameState, active: Omit<ActivePowerUp, 'expiresAtTick'> & { expiresAtTick?: number }): void {
  state.activePowerUps.push(active as ActivePowerUp);
}

export function applyPowerUpForPlayer(
  state: GameState,
  pickerIndex: PowerUpPlayerIndex,
  type: PowerUpType,
): void {
  switch (type) {
    case 'SURGE':
      removePowerUp(state, pickerIndex, 'SURGE');
      pushPowerUp(state, {
        type: 'SURGE',
        playerIndex: pickerIndex,
        expiresAtTick: state.tickCount + POWERUP_SURGE_DURATION_TICKS,
      });
      break;

    case 'FREEZE': {
      const targets = isFfaMode(state)
        ? ([0, 1, 2, 3] as PowerUpPlayerIndex[]).filter((i) => i !== pickerIndex)
        : [(pickerIndex === 0 ? 1 : 0) as PowerUpPlayerIndex];
      for (const target of targets) {
        removePowerUp(state, target, 'FREEZE');
        pushPowerUp(state, {
          type: 'FREEZE',
          playerIndex: target,
          expiresAtTick: state.tickCount + POWERUP_FREEZE_DURATION_TICKS,
        });
      }
      break;
    }

    case 'PHANTOM':
      removePowerUp(state, pickerIndex, 'PHANTOM');
      pushPowerUp(state, {
        type: 'PHANTOM',
        playerIndex: pickerIndex,
        expiresAtTick: state.tickCount + POWERUP_PHANTOM_DURATION_TICKS,
      });
      break;

    case 'AMPLIFIER':
      removePowerUp(state, pickerIndex, 'AMPLIFIER');
      pushPowerUp(state, {
        type: 'AMPLIFIER',
        playerIndex: pickerIndex,
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
        if (!hasCollisionAtForDecoy(state, pos)) {
          state.coinbases.push({ pos, isDecoy: true });
          break;
        }
        decoyAttempts += 1;
      }
      break;
    }
  }
}

function hasCollisionAtForDecoy(state: GameState, pos: GridPos): boolean {
  const samePos = (a: GridPos, b: GridPos) => a[0] === b[0] && a[1] === b[1];
  for (let i = 0; i < activePlayerCount(state); i += 1) {
    const snake = getSnakeByIndex(state, i as PowerUpPlayerIndex);
    if (samePos(snake.head, pos)) return true;
    if (snake.body.some((part) => samePos(part, pos))) return true;
  }
  if (state.coinbases.some((cb) => samePos(cb.pos, pos))) return true;
  if (state.powerUpItems.some((p) => samePos(p.pos, pos))) return true;
  if (state.obstacleWalls.some((w) => samePos(w.pos, pos))) return true;
  return false;
}

export function checkPowerUpPickup(state: GameState): void {
  const count = activePlayerCount(state);
  for (let i = state.powerUpItems.length - 1; i >= 0; i -= 1) {
    const item = state.powerUpItems[i];
    for (let pi = 0; pi < count; pi += 1) {
      const index = pi as PowerUpPlayerIndex;
      const head = getPlayerHead(state, index);
      if (head[0] !== item.pos[0] || head[1] !== item.pos[1]) continue;
      applyPowerUpForPlayer(state, index, item.type);
      state.powerUpItems.splice(i, 1);
      state.powerUpRespawnCooldownTick = state.tickCount + POWERUP_RESPAWN_COOLDOWN_TICKS;
      return;
    }
  }
}

export function computeCaptureChangeForIndex(
  state: GameState,
  playerIndex: PowerUpPlayerIndex,
  cb: Coinbase,
  totalPoints: number,
): number {
  const snake = getSnakeByIndex(state, playerIndex);
  const basePercent = cb.reward ?? capturePercentByLength(snake.body.length);
  const effects = getSnakeEffects(state, playerIndex);
  const finalPercent = effects.amped ? Math.min(32, basePercent * 2) : basePercent;

  if (effects.amped) {
    const amp = state.activePowerUps.find(
      (ap) => ap.type === 'AMPLIFIER' && ap.playerIndex === playerIndex,
    );
    if (amp?.chargesLeft !== undefined) {
      amp.chargesLeft -= 1;
      if (amp.chargesLeft <= 0) {
        state.activePowerUps = state.activePowerUps.filter((ap) => ap !== amp);
      }
    }
  }

  return Math.max(1, Math.floor((totalPoints * finalPercent) / 100));
}

function capturePercentByLength(length: number): number {
  for (const level of CAPTURE_LEVELS) {
    if (length >= level.minLength && length <= level.maxLength) return level.percent;
  }
  return 32;
}

export function wrapSnakeHeadRef(state: GameState, snake: SnakeState): void {
  const [x, y] = snake.head;
  const sb = state.shrinkBorder;
  if (sb) {
    const w = sb.right - sb.left + 1;
    const h = sb.bottom - sb.top + 1;
    snake.head = [
      sb.left + (((x - sb.left) % w + w) % w),
      sb.top + (((y - sb.top) % h + h) % h),
    ];
  } else {
    snake.head = [
      ((x % state.cols) + state.cols) % state.cols,
      ((y % state.rows) + state.rows) % state.rows,
    ];
  }
}
