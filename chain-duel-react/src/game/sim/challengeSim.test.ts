import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_SIM_PRESETS,
  measureWinRate,
  runChallengeSim,
} from '@/game/sim/challengeSim';
import {
  createGameState,
  getFfaScores,
  getHudState,
  isFfaPlayerAlive,
  checkFfaEliminations,
  setFfaScores,
  startCountdown,
  stepGame,
} from '@/game/engine';
import { initRunRng, clearRunRng } from '@/game/engine/runRng';

describe('challengeSim harness', () => {
  it('runs normie sim to completion', () => {
    const result = runChallengeSim({
      seed: 'deadbeef',
      config: { format: '1v1', aiTier: 'normie', powerup: false },
    });
    expect(result.simSteps).toBeGreaterThan(0);
    expect(result.winnerPlayer).not.toBeNull();
  });

  it('measures baseline win rate for normie preset', () => {
    const stats = measureWinRate({
      config: CHALLENGE_SIM_PRESETS[0]!.config,
      runs: 3,
      seedPrefix: 'normie',
    });
    expect(stats.runs).toBe(3);
    expect(stats.winRate).toBeGreaterThanOrEqual(0);
    expect(stats.winRate).toBeLessThanOrEqual(1);
  });

  it('measures baseline win rate for stacker preset', () => {
    const stats = measureWinRate({
      config: CHALLENGE_SIM_PRESETS[1]!.config,
      runs: 2,
      seedPrefix: 'stacker',
    });
    expect(stats.runs).toBe(2);
    expect(stats.avgSteps).toBeGreaterThan(0);
  });
});

describe('FFA elimination at 0 sats', () => {
  it('eliminates player at 0 sats and ends with one survivor', () => {
    initRunRng('ffa-elim-test');
    try {
      const state = createGameState({
        p1Name: 'P1',
        p2Name: 'P2',
        p1Points: 1000,
        p2Points: 1000,
        modeLabel: 'FFA',
        practiceMode: true,
        teamMode: 'ffa',
      });
      state.gameStarted = true;
      setFfaScores(state, [4000, 0, 0, 0]);
      checkFfaEliminations(state);
      expect(isFfaPlayerAlive(state, 1)).toBe(false);
      expect(isFfaPlayerAlive(state, 2)).toBe(false);
      expect(isFfaPlayerAlive(state, 3)).toBe(false);
      expect(state.gameEnded).toBe(true);
      expect(state.winnerPlayer).toBe('P1');
    } finally {
      clearRunRng();
    }
  });

  it('eliminated snake does not capture coinbases', () => {
    initRunRng('ffa-zombie-test');
    try {
      const state = createGameState({
        p1Name: 'P1',
        p2Name: 'P2',
        p1Points: 1000,
        p2Points: 1000,
        modeLabel: 'FFA',
        practiceMode: true,
        teamMode: 'ffa',
      });
      state.gameStarted = true;
      state.score[1] = 0;
      state.p2.head = [-1, -1];
      state.p2.body = [];
      state.ffaEliminated = [false, true, false, false];
      state.coinbases = [{ pos: [46, 4] }];
      state.p2.head = [46, 4];
      stepGame(state);
      expect(state.score[0]).toBe(1000);
    } finally {
      clearRunRng();
    }
  });
});

describe('2v1 format', () => {
  it('starts with three players and 3000 total pot', () => {
    const state = createGameState({
      p1Name: 'P1',
      p2Name: 'P2',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: '2v1',
      practiceMode: true,
      teamMode: '2v1',
      aiTier: 'sovereign',
      ffaAiTier: 'sovereign',
    });
    expect(state.extraSnakes).toHaveLength(1);
    expect(state.totalPoints).toBe(3000);
  });

  it('aggregates both AI sats on the P2 HUD side', () => {
    const state = createGameState({
      p1Name: 'P1',
      p2Name: 'P2',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: '2v1',
      practiceMode: true,
      teamMode: '2v1',
      aiTier: 'sovereign',
      ffaAiTier: 'sovereign',
    });
    state.score[0] = 900;
    state.score[1] = 1050;
    state.extraSnakes[0]!.score = 1050;
    const hud = getHudState(state);
    expect(hud.p1Points).toBe(900);
    expect(hud.p2Points).toBe(2100);
    expect(hud.currentWidthP1).toBeCloseTo(30, 5);
    expect(hud.currentWidthP2).toBeCloseTo(70, 5);
    expect(hud.initialWidthP1).toBeCloseTo(33.333, 2);
    expect(hud.initialWidthP2).toBeCloseTo(66.667, 2);
  });
});
