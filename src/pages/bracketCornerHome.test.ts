import { describe, expect, it } from 'vitest';
import {
  bracketBlocksCornerHome,
  bracketHomeConfirm,
} from './bracketCornerHome';

describe('bracketBlocksCornerHome', () => {
  it('guards buy-in, the next match, and an unclaimed finish', () => {
    expect(
      bracketBlocksCornerHome({
        preview: false,
        phase: 'payment',
        prizeClaimed: false,
      })
    ).toBe(true);
    expect(
      bracketBlocksCornerHome({
        preview: false,
        phase: 'next-game',
        prizeClaimed: false,
      })
    ).toBe(true);
    expect(
      bracketBlocksCornerHome({
        preview: false,
        phase: 'finished',
        prizeClaimed: false,
      })
    ).toBe(true);
  });

  it('lets a finished bracket leave once the prize is claimed', () => {
    expect(
      bracketBlocksCornerHome({
        preview: false,
        phase: 'finished',
        prizeClaimed: true,
      })
    ).toBe(false);
  });

  it('does not guard a preview lab', () => {
    expect(
      bracketBlocksCornerHome({
        preview: true,
        phase: 'next-game',
        prizeClaimed: false,
      })
    ).toBe(false);
  });
});

describe('bracketHomeConfirm', () => {
  it('keeps the refund dialog while buy-ins are still open', () => {
    expect(bracketHomeConfirm({ phase: 'payment', preStartReady: false })).toBe(
      'buy-in'
    );
  });

  it('asks again once every buy-in is in', () => {
    expect(bracketHomeConfirm({ phase: 'payment', preStartReady: true })).toBe(
      'in-progress'
    );
    expect(
      bracketHomeConfirm({ phase: 'next-game', preStartReady: false })
    ).toBe('in-progress');
  });

  it('asks before leaving an unclaimed finish', () => {
    expect(
      bracketHomeConfirm({ phase: 'finished', preStartReady: false })
    ).toBe('unclaimed-prize');
  });
});
