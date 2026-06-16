import { describe, expect, it } from 'vitest';
import { moveNavFocus } from './p2pEntryNav';

const tournament = true;

describe('moveNavFocus none state', () => {
  const tournament = false;

  it('starts unselected and enters on horizontal press', () => {
    expect(moveNavFocus({ kind: 'none' }, 'left', tournament)).toEqual({
      kind: 'payment',
      idx: 0,
    });
    expect(moveNavFocus({ kind: 'none' }, 'right', tournament)).toEqual({
      kind: 'payment',
      idx: 1,
    });
  });

  it('enters on down from unselected (gamepad joystick)', () => {
    expect(moveNavFocus({ kind: 'none' }, 'down', tournament)).toEqual({
      kind: 'payment',
      idx: 0,
    });
  });

  it('ignores up while unselected', () => {
    expect(moveNavFocus({ kind: 'none' }, 'up', tournament)).toEqual({
      kind: 'none',
    });
  });

  it('stays on payment when moving up from the top row', () => {
    expect(moveNavFocus({ kind: 'payment', idx: 0 }, 'up', tournament)).toEqual(
      {
        kind: 'payment',
        idx: 0,
      }
    );
  });
});

describe('moveNavFocus duel mode', () => {
  const tournament = false;

  it('moves down from duel session through format to open game menu', () => {
    expect(
      moveNavFocus({ kind: 'session', idx: 0 }, 'down', tournament)
    ).toEqual({
      kind: 'duelFormat',
    });
    expect(moveNavFocus({ kind: 'duelFormat' }, 'down', tournament)).toEqual({
      kind: 'start',
    });
  });

  it('moves up from footer start to duel format', () => {
    expect(moveNavFocus({ kind: 'start' }, 'up', tournament)).toEqual({
      kind: 'duelFormat',
    });
    expect(moveNavFocus({ kind: 'duelFormat' }, 'up', tournament)).toEqual({
      kind: 'session',
      idx: 0,
    });
  });
});

describe('moveNavFocus tournament bracket grid', () => {
  it('moves horizontally within the players 2×2 grid', () => {
    expect(
      moveNavFocus({ kind: 'players', idx: 0 }, 'right', tournament)
    ).toEqual({
      kind: 'players',
      idx: 1,
    });
    expect(
      moveNavFocus({ kind: 'players', idx: 1 }, 'left', tournament)
    ).toEqual({
      kind: 'players',
      idx: 0,
    });
  });

  it('moves vertically within the players grid', () => {
    expect(
      moveNavFocus({ kind: 'players', idx: 0 }, 'down', tournament)
    ).toEqual({
      kind: 'players',
      idx: 2,
    });
    expect(moveNavFocus({ kind: 'players', idx: 2 }, 'up', tournament)).toEqual(
      {
        kind: 'players',
        idx: 0,
      }
    );
  });

  it('enters buy-in from the right edge of the players row', () => {
    expect(
      moveNavFocus({ kind: 'players', idx: 1 }, 'right', tournament)
    ).toEqual({
      kind: 'buyinPill',
      idx: 0,
    });
    expect(
      moveNavFocus({ kind: 'players', idx: 2 }, 'right', tournament)
    ).toEqual({
      kind: 'buyinPill',
      idx: 5,
    });
  });

  it('returns to players from buy-in column zero', () => {
    expect(
      moveNavFocus({ kind: 'buyinPill', idx: 0 }, 'left', tournament)
    ).toEqual({
      kind: 'players',
      idx: 0,
    });
    expect(
      moveNavFocus({ kind: 'buyinPill', idx: 5 }, 'left', tournament)
    ).toEqual({
      kind: 'players',
      idx: 2,
    });
  });

  it('maps buy-in row 0 up to tournament mode', () => {
    expect(
      moveNavFocus({ kind: 'buyinPill', idx: 1 }, 'up', tournament)
    ).toEqual({
      kind: 'session',
      idx: 1,
    });
    expect(
      moveNavFocus({ kind: 'buyinPill', idx: 0 }, 'up', tournament)
    ).toEqual({
      kind: 'session',
      idx: 1,
    });
  });

  it('still moves within buy-in grid on up from row 2', () => {
    expect(
      moveNavFocus({ kind: 'buyinPill', idx: 6 }, 'up', tournament)
    ).toEqual({
      kind: 'buyinPill',
      idx: 1,
    });
  });

  it('drops from 8P through disabled 32P into buy-in row two', () => {
    expect(
      moveNavFocus({ kind: 'players', idx: 1 }, 'down', tournament)
    ).toEqual({
      kind: 'buyinPill',
      idx: 6,
    });
  });

  it('lands tournament mode on buy-in when moving down from session', () => {
    expect(
      moveNavFocus({ kind: 'session', idx: 1 }, 'down', tournament)
    ).toEqual({
      kind: 'buyinPill',
      idx: 0,
    });
  });
});
