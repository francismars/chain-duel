import type { GameState } from '@/game/engine/types';
import { setControllerTestBySeat } from '@/game/controllerTest';
import { clearPreMatchKeyHighlight } from '@/game/render/preMatchKeyHighlight';

export type SoloSeatColor = 'white' | 'black';

export type SoloSeatSwapResult = {
  humanSeat: SoloSeatColor;
  p1Name: string;
  p2Name: string;
};

/** True when exactly one of P1/P2 is human and solo seat switch is enabled. */
export function canSwapSoloHumanSeat(state: GameState): boolean {
  if (!state.meta.soloInputSlot) return false;
  if (state.gameStarted || state.countdownStart || state.gameEnded)
    return false;
  if (state.meta.teamMode !== 'solo') return false;
  return state.meta.p1Human !== state.meta.p2Human;
}

export function soloHumanSeatColor(state: GameState): SoloSeatColor | null {
  if (state.meta.p1Human === state.meta.p2Human) return null;
  return state.meta.p1Human ? 'white' : 'black';
}

export function soloSeatSwitchHint(state: GameState): string | undefined {
  if (!canSwapSoloHumanSeat(state)) return undefined;
  return state.meta.p1Human
    ? 'PRESS X TO SWITCH TO BLACK'
    : 'PRESS X TO SWITCH TO WHITE';
}

/**
 * Flip the solo human between white (P1) and black (P2).
 * Keyboard bindings follow via meta.soloInputSlot (unchanged).
 */
export function swapSoloHumanSeat(state: GameState): SoloSeatSwapResult | null {
  if (!canSwapSoloHumanSeat(state)) return null;

  const wasP1 = state.meta.p1Human;
  state.meta.p1Human = !wasP1;
  state.meta.p2Human = wasP1;

  const tmpName = state.p1Name;
  state.p1Name = state.p2Name;
  state.p2Name = tmpName;

  setControllerTestBySeat(state, 0, false);
  setControllerTestBySeat(state, 1, false);
  clearPreMatchKeyHighlight();

  return {
    humanSeat: state.meta.p1Human ? 'white' : 'black',
    p1Name: state.p1Name,
    p2Name: state.p2Name,
  };
}
