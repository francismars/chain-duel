import { describe, expect, it } from 'vitest';
import { createGameState } from '@/game/engine';
import { captureRateLabel } from './captureRateLabel';

describe('captureRateLabel', () => {
  it('stays quiet inside a tier and labels the step up', () => {
    const state = createGameState({
      p1Name: 'P1',
      p2Name: 'P2',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'P2P',
      practiceMode: false,
    });
    expect(captureRateLabel(state, 0, 2)).toBeUndefined();
    expect(captureRateLabel(state, 0, 2)).toBeUndefined();
    expect(captureRateLabel(state, 0, 4)).toBe('4%');
    expect(captureRateLabel(state, 0, 4)).toBeUndefined();
    expect(captureRateLabel(state, 0, 8)).toBe('8%');
  });
});
