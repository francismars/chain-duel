import type { GameState } from '@/game/engine/types';

const lastCaptureRate = new WeakMap<GameState, number[]>();

/** `8%` when this catch changes the tier, otherwise nothing. Spawn rate is 2%. */
export function captureRateLabel(
  state: GameState,
  playerIndex: number,
  percent: number
): string | undefined {
  let rates = lastCaptureRate.get(state);
  if (!rates) {
    rates = [2, 2, 2, 2];
    lastCaptureRate.set(state, rates);
  }
  const previous = rates[playerIndex] ?? 2;
  rates[playerIndex] = percent;
  if (previous === percent) return undefined;
  return `${percent}%`;
}
