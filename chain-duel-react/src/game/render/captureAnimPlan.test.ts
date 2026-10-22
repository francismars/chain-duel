import { describe, expect, it } from 'vitest';
import { planCaptureAnims, retainFreshCoins } from './captureAnimPlan';

const food = { pos: [25, 12] as [number, number], reward: 2 };

describe('planCaptureAnims', () => {
  it('waves again when the chain grows onto food that was not on the board last tick', () => {
    const first = planCaptureAnims(
      [food],
      [food],
      [{ key: 'p1', head: [7, 12], prevLength: 1, length: 2 }]
    );
    const second = planCaptureAnims(
      [food],
      [food],
      [{ key: 'p1', head: [8, 12], prevLength: 2, length: 3 }]
    );
    expect(first).toEqual([
      { key: 'p1', head: [7, 12], reward: 2, grew: true },
    ]);
    expect(second).toEqual([
      { key: 'p1', head: [8, 12], reward: 2, grew: true },
    ]);
  });

  it('still marks a capture that eats a coin without growing', () => {
    const plans = planCaptureAnims(
      [food],
      [],
      [{ key: 'p2', head: [25, 12], prevLength: 36, length: 36 }]
    );
    expect(plans).toEqual([
      { key: 'p2', head: [25, 12], reward: 2, grew: false },
    ]);
  });

  it('ignores a coin that left somewhere other than a head', () => {
    expect(
      planCaptureAnims(
        [food],
        [],
        [{ key: 'p1', head: [7, 12], prevLength: 4, length: 4 }]
      )
    ).toEqual([]);
  });

  it('remembers food placed between ticks', () => {
    const seen = retainFreshCoins([food], [food, { pos: [7, 12], reward: 2 }]);
    expect(seen.map((coin) => coin.pos)).toEqual([
      [25, 12],
      [7, 12],
    ]);
    const plans = planCaptureAnims(
      seen,
      [food],
      [{ key: 'p1', head: [7, 12], prevLength: 4, length: 4 }]
    );
    expect(plans).toHaveLength(1);
    expect(plans[0]?.head).toEqual([7, 12]);
  });
});
