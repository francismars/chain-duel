import { describe, expect, it } from 'vitest';
import { advancePointChanges } from '@/game/engine';
import {
  POINT_CHANGE_LIFE_MS,
  POINT_CHANGE_RISE_PX,
} from '@/game/engine/constants';
import type { GameState, PointChange } from '@/game/engine/types';

function stateWith(...changes: PointChange[]): GameState {
  return { pointChanges: changes } as unknown as GameState;
}

function change(alpha = 1): PointChange {
  return {
    player: 'P1',
    value: 10,
    p1Pos: [1, 1],
    p2Pos: [5, 1],
    p1YOffsetPx: 0,
    p2YOffsetPx: 0,
    alpha,
  };
}

describe('advancePointChanges', () => {
  it('lasts the same time at 60 Hz and 120 Hz', () => {
    const at60 = stateWith(change());
    const at120 = stateWith(change());
    const half = POINT_CHANGE_LIFE_MS / 2;
    for (let t = 0; t < half; t += 1000 / 60) advancePointChanges(at60, 1000 / 60);
    for (let t = 0; t < half; t += 1000 / 120) advancePointChanges(at120, 1000 / 120);
    expect(at60.pointChanges[0]!.alpha).toBeCloseTo(at120.pointChanges[0]!.alpha, 1);
    expect(at60.pointChanges[0]!.alpha).toBeCloseTo(0.5, 1);
  });

  it('rises the full distance over its life and is then dropped', () => {
    const state = stateWith(change());
    advancePointChanges(state, POINT_CHANGE_LIFE_MS * 0.99);
    expect(state.pointChanges[0]!.p1YOffsetPx).toBeCloseTo(-POINT_CHANGE_RISE_PX * 0.99);
    advancePointChanges(state, POINT_CHANGE_LIFE_MS * 0.02);
    expect(state.pointChanges).toHaveLength(0);
  });

  it('keeps live pops in order when an older one expires', () => {
    const older = change(0.01);
    const newer = change(1);
    const state = stateWith(older, newer);
    advancePointChanges(state, 100);
    expect(state.pointChanges).toEqual([newer]);
  });
});
