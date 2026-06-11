import { describe, expect, it } from 'vitest';
import { moveNavFocus } from './p2pEntryNav';

const tournament = true;
const sessionNavIdx = 1 as const;

describe('moveNavFocus none state', () => {
  const tournament = false;
  const sessionNavIdx = 0 as const;

  it('starts unselected and enters on horizontal press', () => {
    expect(moveNavFocus({ kind: 'none' }, 'left', tournament, sessionNavIdx)).toEqual({
      kind: 'payment',
      idx: 0,
    });
    expect(moveNavFocus({ kind: 'none' }, 'right', tournament, sessionNavIdx)).toEqual({
      kind: 'payment',
      idx: 1,
    });
  });

  it('ignores vertical press while unselected', () => {
    expect(moveNavFocus({ kind: 'none' }, 'up', tournament, sessionNavIdx)).toEqual({
      kind: 'none',
    });
    expect(moveNavFocus({ kind: 'none' }, 'down', tournament, sessionNavIdx)).toEqual({
      kind: 'none',
    });
  });

  it('clears selection when moving up from the top row', () => {
    expect(moveNavFocus({ kind: 'payment', idx: 0 }, 'up', tournament, sessionNavIdx)).toEqual({
      kind: 'none',
    });
  });
});

describe('moveNavFocus duel mode', () => {
  const tournament = false;
  const sessionNavIdx = 0 as const;

  it('moves down from duel session through format to open game menu', () => {
    expect(moveNavFocus({ kind: 'session', idx: 0 }, 'down', tournament, sessionNavIdx)).toEqual({
      kind: 'duelFormat',
    });
    expect(moveNavFocus({ kind: 'duelFormat' }, 'down', tournament, sessionNavIdx)).toEqual({
      kind: 'start',
    });
  });

  it('moves up from footer start to duel format', () => {
    expect(moveNavFocus({ kind: 'start' }, 'up', tournament, sessionNavIdx)).toEqual({
      kind: 'duelFormat',
    });
    expect(moveNavFocus({ kind: 'duelFormat' }, 'up', tournament, sessionNavIdx)).toEqual({
      kind: 'session',
      idx: 0,
    });
  });
});

describe('moveNavFocus tournament bracket grid', () => {
  it('moves horizontally within the players 2×2 grid', () => {
    expect(moveNavFocus({ kind: 'players', idx: 0 }, 'right', tournament, sessionNavIdx)).toEqual({
      kind: 'players',
      idx: 1,
    });
    expect(moveNavFocus({ kind: 'players', idx: 1 }, 'left', tournament, sessionNavIdx)).toEqual({
      kind: 'players',
      idx: 0,
    });
  });

  it('moves vertically within the players grid', () => {
    expect(moveNavFocus({ kind: 'players', idx: 0 }, 'down', tournament, sessionNavIdx)).toEqual({
      kind: 'players',
      idx: 2,
    });
    expect(moveNavFocus({ kind: 'players', idx: 2 }, 'up', tournament, sessionNavIdx)).toEqual({
      kind: 'players',
      idx: 0,
    });
  });

  it('enters buy-in from the right edge of the players row', () => {
    expect(moveNavFocus({ kind: 'players', idx: 1 }, 'right', tournament, sessionNavIdx)).toEqual({
      kind: 'buyinPill',
      idx: 0,
    });
    expect(moveNavFocus({ kind: 'players', idx: 2 }, 'right', tournament, sessionNavIdx)).toEqual({
      kind: 'buyinPill',
      idx: 5,
    });
  });

  it('returns to players from buy-in column zero', () => {
    expect(moveNavFocus({ kind: 'buyinPill', idx: 0 }, 'left', tournament, sessionNavIdx)).toEqual({
      kind: 'players',
      idx: 0,
    });
    expect(moveNavFocus({ kind: 'buyinPill', idx: 5 }, 'left', tournament, sessionNavIdx)).toEqual({
      kind: 'players',
      idx: 2,
    });
  });

  it('maps buy-in row 0 up to tournament mode', () => {
    expect(moveNavFocus({ kind: 'buyinPill', idx: 1 }, 'up', tournament, sessionNavIdx)).toEqual({
      kind: 'session',
      idx: 1,
    });
    expect(moveNavFocus({ kind: 'buyinPill', idx: 0 }, 'up', tournament, sessionNavIdx)).toEqual({
      kind: 'session',
      idx: 1,
    });
  });

  it('still moves within buy-in grid on up from row 2', () => {
    expect(moveNavFocus({ kind: 'buyinPill', idx: 6 }, 'up', tournament, sessionNavIdx)).toEqual({
      kind: 'buyinPill',
      idx: 1,
    });
  });

  it('drops from 8P through disabled 32P into buy-in row two', () => {
    expect(moveNavFocus({ kind: 'players', idx: 1 }, 'down', tournament, sessionNavIdx)).toEqual({
      kind: 'buyinPill',
      idx: 6,
    });
  });

  it('lands tournament mode on buy-in when moving down from session', () => {
    expect(moveNavFocus({ kind: 'session', idx: 1 }, 'down', tournament, sessionNavIdx)).toEqual({
      kind: 'buyinPill',
      idx: 0,
    });
  });
});
