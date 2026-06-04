import type { GameState } from '@/game/engine/types';

/** P1=0, P2=1, FFA P3=2, FFA P4=3 */
export type GameSeatIndex = 0 | 1 | 2 | 3;

export function ensureControllerTestExtra(state: GameState): void {
  const n = state.extraSnakes.length;
  while (state.controllerTestExtra.length < n) {
    state.controllerTestExtra.push(false);
  }
  if (state.controllerTestExtra.length > n) {
    state.controllerTestExtra.length = n;
  }
}

export function isControllerTestActive(state: GameState, seat: GameSeatIndex): boolean {
  if (state.gameStarted) return false;
  if (seat === 0) return state.controllerTestP1;
  if (seat === 1) return state.controllerTestP2;
  return state.controllerTestExtra[seat - 2] ?? false;
}

export function setControllerTestBySeat(state: GameState, seat: GameSeatIndex, held: boolean): void {
  if (state.gameStarted) return;
  if (seat === 0) {
    state.controllerTestP1 = held;
    return;
  }
  if (seat === 1) {
    state.controllerTestP2 = held;
    return;
  }
  ensureControllerTestExtra(state);
  state.controllerTestExtra[seat - 2] = held;
}

export function clearControllerTests(state: GameState): void {
  state.controllerTestP1 = false;
  state.controllerTestP2 = false;
  for (let i = 0; i < state.controllerTestExtra.length; i += 1) {
    state.controllerTestExtra[i] = false;
  }
}

/** Legacy pre-start bob height in pixels (scaled slightly with row size). */
export function preStartControllerBobPx(state: GameState, seat: GameSeatIndex, rowSize: number): number {
  if (!isControllerTestActive(state, seat)) return 0;
  return Math.max(2, Math.round(rowSize * 0.12));
}

/** Online: server snapshots omit controller test; apply local held keys for your seat only. */
export function withLocalOnlineControllerTest(
  state: GameState,
  role: { isP1: boolean; isP2: boolean },
  keys: { up: boolean; down: boolean; left: boolean; right: boolean },
): GameState {
  if (state.gameStarted || state.gameEnded) return state;
  const held = keys.up || keys.down || keys.left || keys.right;
  const controllerTestP1 = role.isP1 && held;
  const controllerTestP2 = role.isP2 && held;
  if (controllerTestP1 === state.controllerTestP1 && controllerTestP2 === state.controllerTestP2) {
    return state;
  }
  return { ...state, controllerTestP1, controllerTestP2 };
}
