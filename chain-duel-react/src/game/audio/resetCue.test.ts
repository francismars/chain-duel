import { describe, expect, it } from 'vitest';
import { createGameState, stepGame } from '@/game/engine';
import { applyPowerUpForPlayer } from '@/game/engine/powerups';
import type { GameState, SnakeState } from '@/game/engine/types';
import {
  didSnakeReset,
  resetCuesFromTransition,
} from '@/game/audio/resetCue';

function parked(head: SnakeState['head'], tail: SnakeState['head'], facing: SnakeState['dirWanted']): SnakeState {
  return { head, body: [tail], dir: '', dirWanted: facing };
}

function moving(head: SnakeState['head'], tail: SnakeState['head'], dir: SnakeState['dir']): SnakeState {
  return { head, body: [tail], dir, dirWanted: dir };
}

describe('didSnakeReset', () => {
  it('hears a respawn onto a square that is not the opening cell', () => {
    const prev = moving([20, 12], [19, 12], 'Right');
    const next = parked([10, 12], [9, 12], 'Right');
    expect(didSnakeReset(prev, next)).toBe(true);
  });

  it('stays quiet when a living chain steps onto the opening square', () => {
    const prev = moving([5, 12], [4, 12], 'Right');
    const next = moving([6, 12], [5, 12], 'Right');
    expect(didSnakeReset(prev, next)).toBe(false);
  });

  it('does not repeat a chain that is already parked', () => {
    const home = parked([6, 12], [5, 12], 'Right');
    expect(didSnakeReset(home, { ...home, head: [6, 12], body: [[5, 12]] })).toBe(false);
  });

  it('ignores an elimination', () => {
    const prev = moving([8, 4], [7, 4], 'Right');
    const next: SnakeState = { head: [-1, -1], body: [], dir: '', dirWanted: '' };
    expect(didSnakeReset(prev, next)).toBe(false);
  });
});

describe('resetCuesFromTransition', () => {
  function duel(): GameState {
    return createGameState({
      p1Name: 'White',
      p2Name: 'Black',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'PRACTICE',
      practiceMode: true,
      p1Human: true,
      p2Human: true,
    });
  }

  it('plays both cues on a head-on and skips a resent copy of that tick', () => {
    const prev = duel();
    prev.gameStarted = true;
    prev.p1 = moving([20, 12], [19, 12], 'Right');
    prev.p2 = moving([22, 12], [23, 12], 'Left');
    const next = duel();
    next.tickCount = 4;
    next.gameStarted = true;
    next.resetCueP1 = true;
    next.resetCueP2 = true;
    next.p1 = parked([10, 12], [9, 12], 'Right');
    next.p2 = parked([40, 12], [41, 12], 'Left');
    expect(resetCuesFromTransition(prev, next)).toEqual(['P1', 'P2']);
    expect(resetCuesFromTransition(next, next)).toEqual([]);
  });

  it('reads a respawn from older snapshots that have no cue flag', () => {
    const prev = duel();
    prev.gameStarted = true;
    prev.tickCount = 3;
    prev.resetCueP1 = undefined;
    prev.resetCueP2 = undefined;
    prev.p1 = moving([20, 12], [19, 12], 'Right');
    prev.p2 = moving([30, 8], [30, 7], 'Down');
    const next = duel();
    next.tickCount = 4;
    next.gameStarted = true;
    next.resetCueP1 = undefined;
    next.resetCueP2 = undefined;
    next.p1 = parked([10, 12], [9, 12], 'Right');
    next.p2 = moving([30, 9], [30, 8], 'Down');
    expect(resetCuesFromTransition(prev, next)).toEqual(['P1']);
  });
});

describe('reset cue on the live step', () => {
  function started(): GameState {
    const state = createGameState({
      p1Name: 'White',
      p2Name: 'Black',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'PRACTICE · CVG',
      practiceMode: true,
      p1Human: true,
      p2Human: true,
      convergenceMode: true,
    });
    state.gameStarted = true;
    return state;
  }

  it('marks both chains when they meet after the walls have moved home', () => {
    const state = started();
    state.shrinkBorder!.left = 8;
    state.shrinkBorder!.right = 42;
    state.p1.head = [20, 12];
    state.p1.body = [[19, 12]];
    state.p1.dir = 'Right';
    state.p1.dirWanted = 'Right';
    state.p2.head = [22, 12];
    state.p2.body = [[23, 12]];
    state.p2.dir = 'Left';
    state.p2.dirWanted = 'Left';

    stepGame(state);

    expect(state.resetCueP1).toBe(true);
    expect(state.resetCueP2).toBe(true);
    expect(state.p1.head).toEqual([10, 12]);
    expect(state.p2.head).toEqual([40, 12]);
  });

  it('stays quiet when a living head steps onto the opening square', () => {
    const state = started();
    state.p1.head = [5, 12];
    state.p1.body = [[4, 12]];
    state.p1.dir = 'Right';
    state.p1.dirWanted = 'Right';
    state.p2.head = [30, 20];
    state.p2.body = [[30, 19]];
    state.p2.dir = 'Down';
    state.p2.dirWanted = 'Down';

    stepGame(state);

    expect(state.p1.head).toEqual([6, 12]);
    expect(state.resetCueP1).toBe(false);
    expect(state.resetCueP2).toBe(false);
  });

  it('keeps the cue when a surge step moves the chain off home in the same tick', () => {
    const state = started();
    state.meta.powerupMode = true;
    state.tickCount = 99;
    applyPowerUpForPlayer(state, 0, 'SURGE');
    state.p1.head = [-1, 12];
    state.p1.body = [[0, 12]];
    state.p1.dir = 'Left';
    state.p1.dirWanted = 'Left';
    state.p2.head = [30, 20];
    state.p2.body = [[30, 19]];
    state.p2.dir = 'Down';
    state.p2.dirWanted = 'Down';

    stepGame(state);

    expect(state.resetCueP1).toBe(true);
    expect(state.p1.head).not.toEqual([6, 12]);
  });
});
