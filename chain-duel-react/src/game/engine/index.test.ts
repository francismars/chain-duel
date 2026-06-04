import { describe, expect, it } from 'vitest';
import {
  advanceShrinkBorder,
  applyTerminalGameOutcome,
  canContinueAfterGame,
  createGameState,
  getHudState,
  setControllerTestHeld,
  setExtraControllerTestHeld,
  setWantedDirection,
  startCountdown,
  stepGame,
} from '@/game/engine';
import { applyPowerUpForPlayer, checkPowerUpPickup } from '@/game/engine/powerups';

describe('game engine parity behavior', () => {
  it('paid duel preserves zero sats and locks to winner on refresh', () => {
    const state = createGameState({
      p1Name: 'Winner',
      p2Name: 'Loser',
      p1Points: 20_000,
      p2Points: 0,
      modeLabel: 'P2P',
      practiceMode: false,
    });
    expect(state.score).toEqual([20_000, 0]);
    expect(applyTerminalGameOutcome(state)).toBe(true);
    expect(state.gameEnded).toBe(true);
    expect(state.winnerPlayer).toBe('P1');
    expect(state.winnerName).toBe('Winner');
    startCountdown(state);
    expect(state.countdownStart).toBe(false);
  });

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

  it('FFA splits pot four ways and exposes four-player HUD', () => {
    const state = createGameState({
      p1Name: 'Alpha',
      p2Name: 'Beta',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'FFA',
      practiceMode: true,
      teamMode: 'ffa',
    });
    expect(state.extraSnakes).toHaveLength(2);
    expect(state.totalPoints).toBe(4000);
    const hud = getHudState(state);
    expect(hud.ffa?.players).toHaveLength(4);
    expect(hud.ffa?.players.every((p) => p.score === 1000)).toBe(true);
    expect(hud.ffa?.players.every((p) => p.currentShare === 25)).toBe(true);
  });

  it('FFA lets extra snakes pick up power-ups', () => {
    const state = createGameState({
      p1Name: 'Alpha',
      p2Name: 'Beta',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'FFA · PWR',
      practiceMode: true,
      teamMode: 'ffa',
      powerupMode: true,
    });
    state.gameStarted = true;
    const ghostHead = state.extraSnakes[0]!.snake.head;
    state.powerUpItems = [{ pos: [ghostHead[0], ghostHead[1]], type: 'SURGE' }];

    checkPowerUpPickup(state);

    expect(state.powerUpItems).toHaveLength(0);
    expect(state.activePowerUps.some((ap) => ap.type === 'SURGE' && ap.playerIndex === 2)).toBe(true);
  });

  it('FFA freeze slows all other players', () => {
    const state = createGameState({
      p1Name: 'Alpha',
      p2Name: 'Beta',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'FFA · PWR',
      practiceMode: true,
      teamMode: 'ffa',
      powerupMode: true,
    });
    state.gameStarted = true;

    applyPowerUpForPlayer(state, 0, 'FREEZE');

    expect(state.activePowerUps.filter((ap) => ap.type === 'FREEZE')).toHaveLength(3);
    expect(state.activePowerUps.some((ap) => ap.type === 'FREEZE' && ap.playerIndex === 0)).toBe(false);
    expect(state.activePowerUps.some((ap) => ap.type === 'FREEZE' && ap.playerIndex === 3)).toBe(true);
  });

  it('FFA extra snakes keep spawn facing on first tick', () => {
    const state = createGameState({
      p1Name: 'Alpha',
      p2Name: 'Beta',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'FFA',
      practiceMode: true,
      teamMode: 'ffa',
    });
    state.gameStarted = true;
    state.tickCount = 1;
    stepGame(state);
    expect(state.extraSnakes[1]!.snake.dirWanted).toBe('Right');
  });

  it('FFA assigns four unique bot names when all slots are AI', () => {
    const state = createGameState({
      p1Name: 'unused',
      p2Name: 'unused',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'FFA',
      practiceMode: true,
      teamMode: 'ffa',
      p1Human: false,
      p2Human: false,
      p3Human: false,
      p4Human: false,
    });
    const names = [
      state.p1Name,
      state.p2Name,
      state.extraSnakes[0]!.name,
      state.extraSnakes[1]!.name,
    ];
    expect(names).toEqual([
      'BigToshi 🌊',
      'Nakamotor ⚡',
      'XORNOTHING ⛓',
      '256octans 🐙',
    ]);
    expect(new Set(names).size).toBe(4);
  });

  it('FFA assigns unique bot names per AI slot (no duplicate BigToshi)', () => {
    const state = createGameState({
      p1Name: 'Player 1',
      p2Name: 'Player 2',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'FFA',
      practiceMode: true,
      teamMode: 'ffa',
      p1Human: true,
      p2Human: true,
      p3Human: false,
      p4Human: true,
    });
    expect(state.p1Name).toBe('Player 1');
    expect(state.p2Name).toBe('Player 2');
    expect(state.extraSnakes[0]!.name).toBe('BigToshi 🌊');
    expect(state.extraSnakes[1]!.name).toBe('Player 4');
  });

  it('FFA corner spawns place tail at the wall with head inward', () => {
    const state = createGameState({
      p1Name: 'Alpha',
      p2Name: 'Beta',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'FFA',
      practiceMode: true,
      teamMode: 'ffa',
    });
    expect(state.p1.head).toEqual([4, 4]);
    expect(state.p1.body[0]).toEqual([3, 4]);
    expect(state.p2.head).toEqual([46, 4]);
    expect(state.p2.body[0]).toEqual([47, 4]);

    const ghost = state.extraSnakes[0]!;
    const specter = state.extraSnakes[1]!;
    expect(ghost.snake.head).toEqual([46, 20]);
    expect(ghost.snake.body[0]).toEqual([47, 20]);
    expect(specter.snake.head).toEqual([4, 20]);
    expect(specter.snake.body[0]).toEqual([3, 20]);
  });

  it('FFA extra snakes respawn with tail after death', () => {
    const state = createGameState({
      p1Name: 'Alpha',
      p2Name: 'Beta',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'FFA',
      practiceMode: true,
      teamMode: 'ffa',
      p3Human: true,
    });
    state.gameStarted = true;
    const ghost = state.extraSnakes[0]!;
    ghost.snake.head = [0, 20];
    ghost.snake.body = [[19, 12], [18, 12]];
    ghost.snake.dir = 'Left';
    ghost.snake.dirWanted = 'Left';

    stepGame(state);

    expect(ghost.snake.head).toEqual([46, 20]);
    expect(ghost.snake.body).toEqual([[47, 20]]);
  });

  it('FFA BigToshi vs Nakamotor pass-through head-on resets both', () => {
    const state = createGameState({
      p1Name: 'Alpha',
      p2Name: 'Beta',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'FFA',
      practiceMode: true,
      teamMode: 'ffa',
      p3Human: true,
      p4Human: true,
    });
    state.gameStarted = true;
    const ghost = state.extraSnakes[0]!;
    const specter = state.extraSnakes[1]!;
    ghost.snake.head = [10, 12];
    ghost.snake.body = [[9, 12]];
    ghost.snake.dir = 'Right';
    ghost.snake.dirWanted = 'Right';
    specter.snake.head = [11, 12];
    specter.snake.body = [[12, 12]];
    specter.snake.dir = 'Left';
    specter.snake.dirWanted = 'Left';

    stepGame(state);

    expect(ghost.snake.head).toEqual([46, 20]);
    expect(specter.snake.head).toEqual([4, 20]);
  });

  it('FFA BigToshi vs Nakamotor same-cell head-on resets both', () => {
    const state = createGameState({
      p1Name: 'Alpha',
      p2Name: 'Beta',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'FFA',
      practiceMode: true,
      teamMode: 'ffa',
      p3Human: true,
      p4Human: true,
    });
    state.gameStarted = true;
    const ghost = state.extraSnakes[0]!;
    const specter = state.extraSnakes[1]!;
    ghost.snake.head = [10, 12];
    ghost.snake.body = [[9, 12]];
    ghost.snake.dir = 'Right';
    ghost.snake.dirWanted = 'Right';
    specter.snake.head = [12, 12];
    specter.snake.body = [[13, 12]];
    specter.snake.dir = 'Left';
    specter.snake.dirWanted = 'Left';

    stepGame(state);

    expect(ghost.snake.head).toEqual([46, 20]);
    expect(specter.snake.head).toEqual([4, 20]);
  });

  it('FFA extra snakes respawn at fixed corners', () => {
    const state = createGameState({
      p1Name: 'Alpha',
      p2Name: 'Beta',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'FFA · CVG',
      practiceMode: true,
      teamMode: 'ffa',
      convergenceMode: true,
    });
    const ghost = state.extraSnakes[0]!;
    const specter = state.extraSnakes[1]!;
    expect(ghost.snake.head).toEqual([46, 20]);
    expect(specter.snake.head).toEqual([4, 20]);

    ghost.snake.head = [100, 100];
    specter.snake.head = [100, 100];
    advanceShrinkBorder(state);

    expect(ghost.snake.head[0]).toBeGreaterThanOrEqual(40);
    expect(ghost.snake.head[1]).toBeGreaterThanOrEqual(15);
    expect(specter.snake.head[0]).toBeLessThanOrEqual(8);
    expect(specter.snake.head[1]).toBeGreaterThanOrEqual(15);
  });

  it('allows continue when FFA extra snake wins', () => {
    const state = createGameState({
      p1Name: 'Alpha',
      p2Name: 'Beta',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'FFA',
      practiceMode: true,
      teamMode: 'ffa',
      powerupMode: true,
    });
    state.gameEnded = true;
    state.winnerName = 'BigToshi 🌊';
    state.winnerPlayer = null;

    expect(canContinueAfterGame(state, ' ')).toBe(true);
    expect(canContinueAfterGame(state, 'Enter')).toBe(true);
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

  it('tracks pre-start controller test until the match begins', () => {
    const state = createGameState({
      p1Name: 'A',
      p2Name: 'B',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'P2P',
      practiceMode: false,
    });
    setControllerTestHeld(state, 'P1', true);
    setControllerTestHeld(state, 'P2', true);
    expect(state.controllerTestP1).toBe(true);
    expect(state.controllerTestP2).toBe(true);

    startCountdown(state);
    while (!state.gameStarted) {
      stepGame(state);
    }
    expect(state.controllerTestP1).toBe(false);
    expect(state.controllerTestP2).toBe(false);
  });

  it('tracks FFA P3/P4 pre-start controller test', () => {
    const state = createGameState({
      p1Name: 'A',
      p2Name: 'B',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'FFA',
      practiceMode: true,
      teamMode: 'ffa',
      p3Human: true,
      p4Human: true,
    });
    setExtraControllerTestHeld(state, 0, true);
    setExtraControllerTestHeld(state, 1, true);
    expect(state.controllerTestExtra).toEqual([true, true]);
  });
});
