import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_SIM_PRESETS,
  measureWinRate,
  runChallengeSim,
} from '@/game/sim/challengeSim';
import {
  createGameState,
  getHudState,
  isFfaPlayerAlive,
  checkFfaEliminations,
  setFfaScores,
  stepGame,
} from '@/game/engine';
import { ffaApplyCaptureAmount, getFfaScores, checkFfaGameEnd } from '@/game/engine/ffa';
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

  it('FFA passive human does not win on a fixed seed', () => {
    const ffa = CHALLENGE_SIM_PRESETS.find((p) => p.id === 'ffa')!.config;
    const result = runChallengeSim({
      seed: 'ffa-passive-smoke',
      config: ffa,
      strategy: 'passive_ffa',
    });
    expect(result.p1Won).toBe(false);
  }, 60_000);

  it('sovereign gauntlet resists head-on bait better than free wins', () => {
    const gauntlet = CHALLENGE_SIM_PRESETS.find((p) => p.id === 'gauntlet')!.config;
    const bait = measureWinRate({
      config: gauntlet,
      strategy: 'head_on_bait',
      runs: 3,
      seedPrefix: 'gauntlet-bait',
    });
    expect(bait.winRate).toBeLessThan(0.85);
  }, 30_000);
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
  it('starts with three players and 2000 total pot (1000 per side)', () => {
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
    expect(state.totalPoints).toBe(2000);
    expect(state.score[0]).toBe(1000);
    expect(state.score[1] + state.extraSnakes[0]!.score).toBe(1000);
  });

  it('aggregates both AI sats on the P2 HUD side with 50/50 start bars', () => {
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
    const hudStart = getHudState(state);
    expect(hudStart.p1Points).toBe(1000);
    expect(hudStart.p2Points).toBe(1000);
    expect(hudStart.initialWidthP1).toBeCloseTo(50, 5);
    expect(hudStart.initialWidthP2).toBeCloseTo(50, 5);

    state.score[0] = 800;
    state.score[1] = 600;
    state.extraSnakes[0]!.score = 600;
    const hud = getHudState(state);
    expect(hud.p1Points).toBe(800);
    expect(hud.p2Points).toBe(1200);
    expect(hud.currentWidthP1).toBeCloseTo(40, 5);
    expect(hud.currentWidthP2).toBeCloseTo(60, 5);
    expect(hud.ffa?.players[1]?.name.length).toBeGreaterThan(0);
    expect(hud.ffa?.players[2]?.name.length).toBeGreaterThan(0);
  });

  it('uses combined AI team length for capture label', () => {
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
    state.p2.body = [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ];
    state.extraSnakes[0]!.snake.body = [
      [5, 5],
      [6, 6],
      [7, 7],
      [8, 8],
    ];
    expect(getHudState(state).captureP2).toBe('16%');
  });

  it('2v1 team capture sums each bot tier (not length-tier of the sum)', () => {
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
    state.p2.body = [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ];
    state.extraSnakes[0]!.snake.body = [[5, 5]];
    expect(getHudState(state).captureP2).toBe('10%');
  });

  it('2v1 AI captures steal only from the human, not the teammate bot', () => {
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
    setFfaScores(state, [1000, 600, 400, 0]);
    ffaApplyCaptureAmount(state, 2, 160);
    let scores = getFfaScores(state);
    expect(scores[0]).toBe(840);
    expect(scores[1]).toBe(600);
    expect(scores[2]).toBe(560);
    ffaApplyCaptureAmount(state, 1, 160);
    scores = getFfaScores(state);
    expect(scores[0]).toBe(680);
    expect(scores[1]).toBe(760);
    expect(scores[2]).toBe(560);
  });

  it('ends the game when the human hits 0 sats even if both AI bots survive', () => {
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
    state.gameStarted = true;
    setFfaScores(state, [0, 600, 400, 0]);
    checkFfaEliminations(state);
    checkFfaGameEnd(state);
    expect(state.gameEnded).toBe(true);
    expect(state.winnerPlayer).toBe('P2');
  });
});
