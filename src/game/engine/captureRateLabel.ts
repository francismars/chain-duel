import type { GameState } from '@/game/engine/types';

const SPAWN_CAPTURE_PERCENT = 2;
const lastCaptureRate = new WeakMap<GameState, number[]>();

function ratesFor(state: GameState): number[] {
  let rates = lastCaptureRate.get(state);
  if (!rates) {
    rates = [
      SPAWN_CAPTURE_PERCENT,
      SPAWN_CAPTURE_PERCENT,
      SPAWN_CAPTURE_PERCENT,
      SPAWN_CAPTURE_PERCENT,
    ];
    lastCaptureRate.set(state, rates);
  }
  return rates;
}

/** A respawn puts the chain back on the 2% tier, so the next step up can announce. */
export function resetCaptureRate(state: GameState, playerIndex: number): void {
  ratesFor(state)[playerIndex] = SPAWN_CAPTURE_PERCENT;
}

/** `8%` when this catch changes the tier, otherwise nothing. Spawn rate is 2%. */
export function captureRateLabel(
  state: GameState,
  playerIndex: number,
  percent: number
): string | undefined {
  const rates = ratesFor(state);
  const previous = rates[playerIndex] ?? SPAWN_CAPTURE_PERCENT;
  rates[playerIndex] = percent;
  if (previous === percent) return undefined;
  return `${percent}%`;
}
