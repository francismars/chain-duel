import { describe, expect, it } from 'vitest';
import { postGameWinnerAllowsKey } from './postGameWinnerControl';

describe('postGameWinnerAllowsKey', () => {
  it('lets only Player 1 confirm and move on menus 1–2', () => {
    expect(
      postGameWinnerAllowsKey('Player 1', ' ', { practiceMode: false, menu: 1 })
    ).toBe(true);
    expect(
      postGameWinnerAllowsKey('Player 1', 's', { practiceMode: false, menu: 1 })
    ).toBe(true);
    expect(
      postGameWinnerAllowsKey('Player 1', 'Enter', {
        practiceMode: false,
        menu: 1,
      })
    ).toBe(false);
    expect(
      postGameWinnerAllowsKey('Player 1', 'ArrowDown', {
        practiceMode: false,
        menu: 2,
      })
    ).toBe(false);
  });

  it('lets only Player 2 confirm and move on menus 1–2', () => {
    expect(
      postGameWinnerAllowsKey('Player 2', 'Enter', {
        practiceMode: false,
        menu: 1,
      })
    ).toBe(true);
    expect(
      postGameWinnerAllowsKey('Player 2', 'ArrowUp', {
        practiceMode: false,
        menu: 1,
      })
    ).toBe(true);
    expect(
      postGameWinnerAllowsKey('Player 2', ' ', { practiceMode: false, menu: 1 })
    ).toBe(false);
    expect(
      postGameWinnerAllowsKey('Player 2', 'w', { practiceMode: false, menu: 2 })
    ).toBe(false);
  });

  it('unlocks both pads in practice and on the ledger', () => {
    expect(
      postGameWinnerAllowsKey('Player 1', 'Enter', {
        practiceMode: true,
        menu: 1,
      })
    ).toBe(true);
    expect(
      postGameWinnerAllowsKey('Player 2', ' ', { practiceMode: false, menu: 3 })
    ).toBe(true);
  });
});
