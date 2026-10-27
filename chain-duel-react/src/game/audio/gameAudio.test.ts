import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameState } from '@/game/engine';
import { GameAudioSystem, reorgCaptureGap } from './gameAudio';
import { streakPops, tensionDebugSnapshot } from './tensionDebug';
import { getTensionLevel, wallsClosedLostPercent } from './tension';

function match() {
  const state = createGameState({
    p1Name: 'P1',
    p2Name: 'P2',
    p1Points: 1000,
    p2Points: 1000,
    modeLabel: 'P2P',
    practiceMode: false,
  });
  state.gameStarted = true;
  return state;
}

class FakeAudio {
  static instances: FakeAudio[] = [];
  loop = false;
  muted = false;
  volume = 1;
  currentTime = 0;
  readyState = 4;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  constructor(public src: string) {
    FakeAudio.instances.push(this);
  }
}
const cue = (name: string) =>
  FakeAudio.instances.find((a) => a.src.includes(name))!;

beforeEach(() => {
  vi.useFakeTimers();
  FakeAudio.instances = [];
  vi.stubGlobal('Audio', FakeAudio);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('game tension', () => {
  it('does not treat closing walls as pressure', () => {
    const state = match();
    state.shrinkBorder = {
      left: 1,
      right: state.cols - 2,
      top: 1,
      bottom: state.rows - 2,
      warningActive: false,
    };
    expect(getTensionLevel(state)).toBe(0);
    state.gameStarted = false;
    expect(getTensionLevel(state)).toBe(0);
    state.gameStarted = true;
    state.gameEnded = true;
    expect(getTensionLevel(state)).toBe(0);
  });

  it('warns once a chain reaches 16% and goes critical at 32%', () => {
    const state = match();
    state.p1.body = Array(7).fill([1, 1]);
    state.p2.body = [[1, 1]];
    expect(getTensionLevel(state)).toBe(2);
    state.p2.body = Array(4).fill([1, 1]);
    expect(getTensionLevel(state)).toBe(2);
    state.p1.body = Array(11).fill([1, 1]);
    state.p2.body = Array(7).fill([1, 1]);
    expect(getTensionLevel(state)).toBe(4);
    state.p1.body = [[1, 1]];
    state.p2.body = [[1, 1]];
    expect(getTensionLevel(state)).toBe(0);
    state.gameStarted = false;
    expect(getTensionLevel(state)).toBe(0);
  });

  it('ends the match when the walls have taken 93% of the board', () => {
    expect(Math.round(wallsClosedLostPercent())).toBe(93);
  });

  it.each([
    [1499, 0],
    [1500, 2],
    [1799, 2],
    [1800, 4],
    [1900, 4],
  ])('warns when %s / 2000 leaves a quarter, and goes critical at a tenth', (leader, level) => {
    const state = match();
    state.score = [leader, 2000 - leader];
    expect(getTensionLevel(state)).toBe(level);
    state.score = [(2000 - leader) * 10, leader * 10];
    expect(getTensionLevel(state)).toBe(level);
  });

  it('lets a drained score speak while both chains are short, and a long chain speak over a mild drain', () => {
    const state = match();
    state.score = [100, 1900];
    expect(getTensionLevel(state)).toBe(4);
    state.score = [1500, 500];
    expect(getTensionLevel(state)).toBe(2);
    state.p1.body = Array(11).fill([1, 1]);
    expect(getTensionLevel(state)).toBe(4);
  });

  it('crossfades from the pressure stem to the critical stem', () => {
    const audio = new GameAudioSystem();
    const state = match();
    audio.startMusic();
    state.p1.body = Array(7).fill([1, 1]);
    audio.updateGameState(state);
    vi.advanceTimersByTime(3500);
    expect(cue('pressure').volume).toBeCloseTo(0.34);
    expect(cue('critical').volume).toBe(0);
    expect(cue('build').volume).toBe(0);
    expect(cue('tension').volume).toBe(0);
    state.p1.body = Array(11).fill([1, 1]);
    audio.updateGameState(state);
    vi.advanceTimersByTime(3500);
    expect(cue('critical').volume).toBeCloseTo(0.65);
    expect(cue('pressure').volume).toBe(0);
    const heard = tensionDebugSnapshot().layers.map((layer) => layer.name);
    expect(heard).toContain('game');
    expect(heard).toContain('critical');
    audio.stopAll();
  });

  it('holds critical pressure, then fades back to the bed', () => {
    const audio = new GameAudioSystem();
    const state = match();
    audio.startMusic();
    state.score = [1900, 100];
    audio.updateGameState(state);
    vi.advanceTimersByTime(2000);
    state.score = [1200, 800];
    audio.updateGameState(state);
    expect(cue('critical').volume).toBeCloseTo(0.65);
    expect(cue('pressure').volume).toBe(0);
    vi.advanceTimersByTime(2100);
    audio.updateGameState(state);
    vi.advanceTimersByTime(4000);
    expect(cue('critical').volume).toBe(0);
    expect(cue('pressure').volume).toBe(0);
    cue('produced_game').currentTime = 18;
    audio.applyAppMuteState(true, false);
    for (const name of ['build', 'pressure', 'tension', 'critical']) {
      expect(cue(name).muted).toBe(true);
      expect(cue(name).pause).toHaveBeenCalled();
    }
    audio.applyAppMuteState(false, false);
    for (const name of ['build', 'pressure', 'tension', 'critical']) {
      expect(cue(name).muted).toBe(false);
      expect(cue(name).currentTime).toBe(18);
    }
    audio.stopAll();
  });

  it('keeps counting a catch streak without letting it choose the music', () => {
    const audio = new GameAudioSystem();
    const state = match();
    audio.updateGameState(state);
    for (let catchIndex = 1; catchIndex <= 8; catchIndex += 1) {
      state.score = [1000 + catchIndex, 1000 - catchIndex];
      audio.updateGameState(state);
    }
    expect(tensionDebugSnapshot().streakCount).toBe(8);
    expect(tensionDebugSnapshot().level).toBe(0);
    expect(tensionDebugSnapshot().track).toBe('off');
    expect(streakPops()).toHaveLength(0);

    state.p1.body = [];
    audio.updateGameState(state);
    expect(tensionDebugSnapshot().streakCount).toBe(0);

    state.score = [1010, 990];
    audio.updateGameState(state);
    expect(tensionDebugSnapshot().streakCount).toBe(1);
    state.score = [1000, 1000];
    audio.updateGameState(state);
    expect(tensionDebugSnapshot().streakCount).toBe(1);
    state.score = [1000, 1004];
    audio.updateGameState(state);
    expect(tensionDebugSnapshot().streakCount).toBe(2);
    audio.stopAll();
    expect(tensionDebugSnapshot().active).toBe(false);
    expect(streakPops()).toHaveLength(0);
  });

  it('shows REORG when a 2% chain resets an 8%+ chain head-on', () => {
    const audio = new GameAudioSystem();
    const state = match();
    state.p1.head = [10, 10];
    state.p1.body = Array(7).fill([9, 10]);
    state.p2.head = [12, 10];
    state.p2.body = [[13, 10]];
    audio.updateGameState(state);
    state.p1.head = [4, 12];
    state.p1.body = [[3, 12]];
    state.p2.head = [44, 12];
    state.p2.body = [[45, 12]];
    audio.updateGameState(state);
    expect(streakPops().some((pop) => pop.text === 'REORG')).toBe(true);
    expect(streakPops().find((pop) => pop.text === 'REORG')).toMatchObject({
      col: 10,
      row: 10,
      toCol: 4,
      toRow: 12,
    });
    expect(
      streakPops().filter((pop) => pop.text === 'SPAWN')
    ).toHaveLength(2);

    const soloLong = match();
    soloLong.p1.head = [10, 10];
    soloLong.p1.body = Array(7).fill([9, 10]);
    soloLong.p2.head = [30, 10];
    soloLong.p2.body = [[31, 10]];
    audio.updateGameState(soloLong);
    const before = streakPops().length;
    soloLong.p1.head = [4, 12];
    soloLong.p1.body = [[3, 12]];
    audio.updateGameState(soloLong);
    // Solo death of the long chain while a short chain lives: REORG on the long head.
    expect(streakPops().slice(before).some((pop) => pop.text === 'REORG')).toBe(
      true
    );
    expect(streakPops().slice(before).find((pop) => pop.text === 'REORG')).toMatchObject({
      tone: 'gold',
      col: 10,
      row: 10,
    });

    const soloShort = match();
    soloShort.p1.head = [10, 10];
    soloShort.p1.body = Array(7).fill([9, 10]);
    soloShort.p2.head = [20, 10];
    soloShort.p2.body = [[21, 10]];
    audio.updateGameState(soloShort);
    const soloBefore = streakPops().length;
    soloShort.p2.head = [44, 12];
    soloShort.p2.body = [[45, 12]];
    audio.updateGameState(soloShort);
    // Short chain dies: ordinary WALL, even when a long chain is alive.
    expect(streakPops().slice(soloBefore).some((pop) => pop.text === 'REORG')).toBe(
      false
    );
    expect(streakPops().slice(soloBefore).some((pop) => pop.text === 'WALL')).toBe(
      true
    );
    expect(streakPops().slice(soloBefore).find((pop) => pop.text === 'WALL')).toMatchObject({
      tone: 'black',
      col: 20,
      row: 10,
    });

    const four = match();
    four.p1.head = [10, 10];
    four.p1.body = [
      [9, 10],
      [8, 10],
    ];
    four.p2.head = [12, 10];
    four.p2.body = Array(7).fill([13, 10]);
    audio.updateGameState(four);
    const fourBefore = streakPops().length;
    four.p1.head = [4, 12];
    four.p1.body = [[3, 12]];
    four.p2.head = [44, 12];
    four.p2.body = [[45, 12]];
    audio.updateGameState(four);
    expect(streakPops().slice(fourBefore).some((pop) => pop.text === 'REORG')).toBe(
      true
    );

    const close = match();
    close.p1.head = [10, 10];
    close.p1.body = [
      [9, 10],
      [8, 10],
    ];
    close.p2.head = [12, 10];
    close.p2.body = Array(5).fill([13, 10]);
    audio.updateGameState(close);
    const closeBefore = streakPops().length;
    close.p1.head = [4, 12];
    close.p1.body = [[3, 12]];
    close.p2.head = [44, 12];
    close.p2.body = [[45, 12]];
    audio.updateGameState(close);
    expect(streakPops().slice(closeBefore).some((pop) => pop.text === 'REORG')).toBe(
      false
    );
    expect(streakPops().slice(closeBefore).some((pop) => pop.text === 'CLASH')).toBe(
      true
    );
    expect(streakPops().slice(closeBefore).find((pop) => pop.text === 'CLASH')).toMatchObject({
      tone: 'gold',
    });
    expect(streakPops().find((pop) => pop.text === 'REORG')).toMatchObject({
      tone: 'gold',
    });
    audio.stopAll();
  });

  it('pairs 2% or under with 8%+, and 4% or under with 16%+', () => {
    expect(reorgCaptureGap(2, 8)).toBe(true);
    expect(reorgCaptureGap(2, 32)).toBe(true);
    expect(reorgCaptureGap(4, 16)).toBe(true);
    expect(reorgCaptureGap(2, 16)).toBe(true);
    expect(reorgCaptureGap(4, 8)).toBe(false);
    expect(reorgCaptureGap(8, 32)).toBe(false);
  });

  it('counts teammates together and ignores eliminated chains', () => {
    const state = match();
    state.meta.teamMode = '2v1';
    state.score = [100, 900];
    state.extraSnakes = [
      {
        snake: { ...state.p2, body: [] },
        score: 1000,
      } as (typeof state.extraSnakes)[number],
    ];
    expect(getTensionLevel(state)).toBe(4);
    state.meta.teamMode = 'ffa';
    state.score = [1000, 1000];
    state.extraSnakes[0].score = 0;
    state.extraSnakes[0].snake.body = Array(20).fill([1, 1]);
    state.ffaEliminated = [false, false, true, false];
    expect(getTensionLevel(state)).toBe(0);
  });

  it('fades in, holds after a reset, then releases and cleans up', () => {
    const audio = new GameAudioSystem();
    const state = match();
    audio.startMusic();
    state.p1.body = Array(16).fill([1, 1]);
    audio.updateGameState(state);
    vi.advanceTimersByTime(2000);
    audio.updateGameState(state);
    expect(cue('critical').volume).toBeCloseTo(0.65);
    state.p1.body = [];
    audio.updateGameState(state);
    vi.advanceTimersByTime(500);
    audio.updateGameState(state);
    expect(cue('critical').volume).toBeCloseTo(0.65);
    vi.advanceTimersByTime(600);
    audio.updateGameState(state);
    vi.advanceTimersByTime(1700);
    expect(cue('critical').volume).toBe(0);
    audio.stopAll();
    expect(vi.getTimerCount()).toBe(0);
    expect(
      FakeAudio.instances.every((a) => a.pause.mock.calls.length > 0)
    ).toBe(true);
  });

  it('switches to menu music at the finish and restarts game music on play again', () => {
    const audio = new GameAudioSystem();
    const state = match();
    audio.startMusic();
    cue('produced_game').currentTime = 23;
    state.p1.body = Array(16).fill([1, 1]);
    audio.updateGameState(state);
    vi.advanceTimersByTime(2000);
    state.gameEnded = true;
    audio.updateGameState(state);
    audio.updateGameState(state);
    vi.advanceTimersByTime(10000);
    expect(cue('produced_game').pause).toHaveBeenCalledTimes(1);
    expect(cue('produced_menu').play).toHaveBeenCalledTimes(1);
    expect(cue('produced_menu').loop).toBe(true);
    expect(cue('produced_game').currentTime).toBe(23);
    expect(cue('produced_game').loop).toBe(true);
    expect(cue('chain_duel_end').play).toHaveBeenCalledTimes(1);
    expect(cue('critical').volume).toBe(0);
    state.gameEnded = false;
    audio.updateGameState(state);
    expect(cue('produced_menu').pause).toHaveBeenCalled();
    expect(cue('produced_game').currentTime).toBe(0);
    expect(cue('produced_game').play).toHaveBeenCalledTimes(2);
    audio.stopAll();
    expect(cue('produced_game').pause).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('respects both mute controls and plays the ending once per match', () => {
    const audio = new GameAudioSystem();
    const state = match();
    audio.applyAppMuteState(false, true);
    audio.startMusic();
    expect(cue('critical').play).not.toHaveBeenCalled();
    state.gameEnded = true;
    audio.updateGameState(state);
    audio.updateGameState(state);
    expect(cue('chain_duel_end').play).toHaveBeenCalledTimes(1);
    audio.applyAppMuteState(false, false);
    expect(cue('produced_game').play).not.toHaveBeenCalled();
    expect(cue('produced_menu').play).toHaveBeenCalledTimes(1);
    state.gameEnded = false;
    audio.updateGameState(state);
    expect(cue('critical').play).toHaveBeenCalledTimes(1);
    audio.applyAppMuteState(true, false);
    state.gameEnded = true;
    audio.updateGameState(state);
    expect(cue('chain_duel_end').play).toHaveBeenCalledTimes(1);
    audio.stopAll();
  });
});

describe('board contraction audio', () => {
  it('plays once per contraction, ignoring warnings, resets and repeated snapshots', () => {
    const audio = new GameAudioSystem();
    const state = match();
    state.shrinkBorder = {
      left: 0,
      right: 30,
      top: 0,
      bottom: 20,
      warningActive: false,
    };
    audio.updateGameState(state);
    state.shrinkBorder.warningActive = true;
    audio.updateGameState(state);
    expect(cue('chain_duel_shrink').play).not.toHaveBeenCalled();
    state.shrinkBorder.left++;
    state.shrinkBorder.right--;
    audio.updateGameState(state);
    audio.updateGameState(structuredClone(state));
    expect(cue('chain_duel_shrink').play).toHaveBeenCalledTimes(1);
    state.shrinkBorder.top++;
    audio.updateGameState(state);
    expect(cue('chain_duel_shrink').play).toHaveBeenCalledTimes(2);
    state.shrinkBorder.left = 0;
    state.shrinkBorder.right = 30;
    audio.updateGameState(state);
    expect(cue('chain_duel_shrink').play).toHaveBeenCalledTimes(2);
    state.gameEnded = true;
    state.shrinkBorder.bottom--;
    audio.updateGameState(state);
    expect(cue('chain_duel_shrink').play).toHaveBeenCalledTimes(2);
    audio.stopAll();
  });

  it('respects full mute while keeping effects enabled with music muted', () => {
    const audio = new GameAudioSystem();
    const state = match();
    state.shrinkBorder = {
      left: 0,
      right: 30,
      top: 0,
      bottom: 20,
      warningActive: false,
    };
    audio.updateGameState(state);
    audio.applyAppMuteState(true, false);
    state.shrinkBorder.left++;
    audio.updateGameState(state);
    expect(cue('chain_duel_shrink').play).not.toHaveBeenCalled();
    audio.applyAppMuteState(false, true);
    audio.updateGameState(state);
    expect(cue('chain_duel_shrink').play).not.toHaveBeenCalled();
    state.shrinkBorder.left++;
    audio.updateGameState(state);
    expect(cue('chain_duel_shrink').play).toHaveBeenCalledTimes(1);
    audio.stopAll();
    state.shrinkBorder.left++;
    audio.updateGameState(state);
    expect(cue('chain_duel_shrink').play).toHaveBeenCalledTimes(1);
  });
});
