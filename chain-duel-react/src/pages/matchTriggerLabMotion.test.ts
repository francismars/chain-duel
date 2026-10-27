import { describe, expect, it } from 'vitest';
import { createGameState } from '@/game/engine';
import { classifyStep, routeAround } from './matchTriggerLabMotion';

function board() {
  const state = createGameState({
    p1Name: 'White',
    p2Name: 'Black',
    p1Points: 5000,
    p2Points: 5000,
    modeLabel: 'FREE PLAY',
    practiceMode: true,
    convergenceMode: false,
    powerupMode: false,
    isTournament: false,
    p1Human: true,
    p2Human: true,
  });
  state.gameStarted = true;
  state.p1.dir = 'Right';
  state.p1.dirWanted = 'Right';
  state.p2.dir = 'Left';
  state.p2.dirWanted = 'Left';
  return state;
}

describe('routeAround', () => {
  it('walks straight when the row is open', () => {
    const state = board();
    const path = routeAround(state, 'p1', state.p1, [10, 12], false, 36);
    expect(path).toEqual([
      [7, 12],
      [8, 12],
      [9, 12],
      [10, 12],
    ]);
  });

  it('goes around its own body instead of through it', () => {
    const state = board();
    state.p1.head = [5, 5];
    state.p1.body = [
      [6, 5],
      [6, 6],
      [5, 6],
      [4, 6],
      [4, 5],
    ];
    state.p1.dir = 'Right';
    const blocked = new Set(state.p1.body.map((cell) => cell.join(',')));
    const path = routeAround(state, 'p1', state.p1, [7, 5], false, 36);
    expect(path[path.length - 1]).toEqual([7, 5]);
    expect(path.some((cell) => blocked.has(cell.join(',')))).toBe(false);
    expect(path).not.toEqual([
      [6, 5],
      [7, 5],
    ]);
  });

  it('does not reverse into its neck', () => {
    const state = board();
    const path = routeAround(state, 'p1', state.p1, [4, 12], false, 36);
    expect(path[0]).not.toEqual([5, 12]);
    expect(path[path.length - 1]).toEqual([4, 12]);
  });

  it('finishes on the opponent when that cell is the click', () => {
    const state = board();
    state.p2.head = [8, 12];
    state.p2.body = [[9, 12]];
    const path = routeAround(state, 'p1', state.p1, [8, 12], false, 36);
    expect(path).toEqual([
      [7, 12],
      [8, 12],
    ]);
    expect(classifyStep(state, 'p1', state.p1, [7, 12])).toBe('ok');
  });

  it('treats another free-for-all head as a head-on', () => {
    const state = createGameState({
      p1Name: 'White',
      p2Name: 'Black',
      p1Points: 2500,
      p2Points: 2500,
      modeLabel: 'FFA',
      practiceMode: true,
      teamMode: 'ffa',
      p1Human: true,
      p2Human: true,
      p3Human: true,
      p4Human: true,
    });
    state.p1.head = [6, 12];
    state.p1.body = [[5, 12]];
    state.p1.dir = 'Right';
    state.p1.dirWanted = 'Right';
    const ghost = state.extraSnakes[0]!.snake;
    ghost.head = [7, 12];
    ghost.body = [[8, 12]];
    expect(classifyStep(state, 'p1', state.p1, [7, 12])).toBe('headon');
  });

  it('treats the cell under the opponent body as a hit', () => {
    const state = board();
    state.p2.head = [8, 12];
    state.p2.body = [[7, 12]];
    expect(classifyStep(state, 'p1', state.p1, [7, 12])).toBe('opponent');
  });
});
