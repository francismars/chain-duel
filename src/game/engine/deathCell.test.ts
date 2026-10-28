import { describe, expect, it } from 'vitest';
import { createGameState, stepGame } from '@/game/engine';
import { visibleDeathCell } from './deathCell';

describe('visibleDeathCell', () => {
  it('keeps an impact that is still on the board', () => {
    expect(visibleDeathCell([3, 10], 'Right', 51, 25)).toEqual([3, 10]);
  });

  it('steps back onto the board when the head leaves the outer edge', () => {
    expect(visibleDeathCell([-1, 12], 'Left', 51, 25)).toEqual([0, 12]);
    expect(visibleDeathCell([51, 4], 'Right', 51, 25)).toEqual([50, 4]);
    expect(visibleDeathCell([10, -1], 'Up', 51, 25)).toEqual([10, 0]);
    expect(visibleDeathCell([10, 25], 'Down', 51, 25)).toEqual([10, 24]);
  });
});

describe('stepGame death cell', () => {
  function started() {
    const state = createGameState({
      p1Name: 'White',
      p2Name: 'Black',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'PRACTICE',
      practiceMode: true,
      p1Human: true,
      p2Human: true,
    });
    state.gameStarted = true;
    return state;
  }

  it('records the cell both chains stepped onto', () => {
    const state = started();
    state.p1.head = [20, 12];
    state.p1.body = [[19, 12]];
    state.p1.dir = 'Right';
    state.p1.dirWanted = 'Right';
    state.p2.head = [22, 12];
    state.p2.body = [[23, 12]];
    state.p2.dir = 'Left';
    state.p2.dirWanted = 'Left';

    stepGame(state);

    expect(state.deathAt?.[0]).toEqual([21, 12]);
    expect(state.deathAt?.[1]).toEqual([21, 12]);
  });

  it('keeps an outer-edge death on the last cell inside the board', () => {
    const state = started();
    state.p1.head = [0, 12];
    state.p1.body = [[1, 12]];
    state.p1.dir = 'Left';
    state.p1.dirWanted = 'Left';
    state.p2.head = [30, 20];
    state.p2.body = [[30, 19]];
    state.p2.dir = 'Down';
    state.p2.dirWanted = 'Down';

    stepGame(state);

    expect(state.resetCueP1).toBe(true);
    expect(state.deathAt?.[0]).toEqual([0, 12]);
  });
});
