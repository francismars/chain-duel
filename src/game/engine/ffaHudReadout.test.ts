import { describe, expect, it } from 'vitest';
import { ffaHudReadoutSame } from '@/game/engine/ffa';
import type { FfaHudPlayer } from '@/game/engine/types';

function seat(
  index: FfaHudPlayer['index'],
  score: number,
  capture: string,
  name = `P${index + 1}`
): FfaHudPlayer {
  return {
    index,
    name,
    color: '#fff',
    score,
    capture,
    initialShare: 25,
    currentShare: score / 40,
  };
}

describe('ffaHudReadoutSame', () => {
  it('treats a new array with the same scores and labels as unchanged', () => {
    const prev = [seat(0, 1000, '2%'), seat(1, 1000, '4%')];
    const next = [seat(0, 1000, '2%'), seat(1, 1000, '4%')];
    expect(ffaHudReadoutSame(prev, next)).toBe(true);
  });

  it('notices a score, a capture label, or an elimination', () => {
    const prev = [seat(0, 1000, '2%'), seat(1, 1000, '4%')];
    expect(
      ffaHudReadoutSame(prev, [seat(0, 1040, '2%'), seat(1, 1000, '4%')])
    ).toBe(false);
    expect(
      ffaHudReadoutSame(prev, [seat(0, 1000, '6%'), seat(1, 1000, '4%')])
    ).toBe(false);
    expect(
      ffaHudReadoutSame(prev, [seat(0, 1000, 'OUT'), seat(1, 1000, '4%')])
    ).toBe(false);
  });

  it('notices a name that arrives after the match has started', () => {
    const prev = [seat(0, 1000, '2%', 'P1')];
    expect(ffaHudReadoutSame(prev, [seat(0, 1000, '2%', 'Ada')])).toBe(false);
  });
});
