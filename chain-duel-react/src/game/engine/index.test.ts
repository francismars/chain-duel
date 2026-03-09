import { describe, expect, it } from 'vitest';
import {
  createGameState,
  getHudState,
  setWantedDirection,
  startCountdown,
  stepGame,
} from '@/game/engine';

describe('game engine parity behavior', () => {
  it('starts countdown and transitions to started state', () => {
    const state = createGameState({
      p1Name: 'Player 1',
      p2Name: 'Player 2',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'P2P',
      practiceMode: false,
      isTournament: false,
    });
    startCountdown(state);
    for (let i = 0; i <= 41; i += 1) {
      stepGame(state);
    }
    expect(state.gameStarted).toBe(true);
  });

  it('captures coinbase and transfers score', () => {
    const state = createGameState({
      p1Name: 'P1',
      p2Name: 'P2',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'P2P',
      practiceMode: false,
      isTournament: false,
    });
    state.gameStarted = true;
    state.p1.head = [25, 12];
    state.p1.body = [[24, 12]];
    state.p1.dirWanted = 'Right';
    state.coinbases = [{ pos: [26, 12] }];
    const before = [...state.score] as [number, number];
    stepGame(state);
    expect(state.score[0]).toBeGreaterThan(before[0]);
    expect(state.score[1]).toBeLessThan(before[1]);
  });

  it('marks winner when one side reaches zero', () => {
    const state = createGameState({
      p1Name: 'A',
      p2Name: 'B',
      p1Points: 1,
      p2Points: 1000,
      modeLabel: 'P2P',
      practiceMode: false,
      isTournament: false,
    });
    state.gameStarted = true;
    state.score = [0, 1001];
    stepGame(state);
    expect(state.gameEnded).toBe(true);
    expect(state.winnerPlayer).toBe('P2');
  });

  it('exposes HUD percentages', () => {
    const state = createGameState({
      p1Name: 'A',
      p2Name: 'B',
      p1Points: 2500,
      p2Points: 7500,
      modeLabel: 'P2P',
      practiceMode: false,
      isTournament: false,
    });
    const hud = getHudState(state);
    expect(hud.initialWidthP1).toBe(25);
    expect(hud.initialWidthP2).toBe(75);
  });

  it('prevents direct reverse direction', () => {
    const state = createGameState({
      p1Name: 'A',
      p2Name: 'B',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'P2P',
      practiceMode: false,
      isTournament: false,
    });
    state.gameStarted = true;
    state.p1.dir = 'Right';
    setWantedDirection(state, 'P1', 'Left');
    expect(state.p1.dirWanted).toBe('Right');
  });
});
