import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameState } from '@/game/engine';
import { GameAudioSystem } from './gameAudio';
import { streakPops, tensionDebugSnapshot } from './tensionDebug';
import { getTensionLevel } from './tension';

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
  it.each([
    [100, 0],
    [99, 1],
    [76, 1],
    [75, 2],
    [56, 2],
    [55, 3],
    [36, 3],
    [35, 4],
    [10, 4],
  ])('maps %s percent remaining playable area to level %s', (width, level) => {
    const state = match();
    state.cols = 102;
    state.rows = 12;
    state.shrinkBorder = {
      left: 0,
      right: width + 1,
      top: 0,
      bottom: 11,
      warningActive: true,
    };
    expect(getTensionLevel(state)).toBe(level);
    state.gameStarted = false;
    expect(getTensionLevel(state)).toBe(0);
    state.gameStarted = true;
    state.gameEnded = true;
    expect(getTensionLevel(state)).toBe(0);
  });

  it('keeps stronger chain or score pressure on a shrinking board', () => {
    const state = match();
    state.shrinkBorder = {
      left: 1,
      right: state.cols - 2,
      top: 1,
      bottom: state.rows - 2,
      warningActive: false,
    };
    expect(getTensionLevel(state)).toBe(1);
    state.p1.body = Array(11).fill([1, 1]);
    expect(getTensionLevel(state)).toBe(3);
    state.score = [1900, 100];
    expect(getTensionLevel(state)).toBe(4);
  });

  it.each([
    [3, 0],
    [4, 1],
    [6, 1],
    [7, 2],
    [10, 2],
    [11, 3],
    [15, 3],
    [16, 4],
  ])('maps a chain of %s segments to intensity %s', (length, level) => {
    const state = match();
    state.p1.body = Array(length).fill([1, 1]);
    expect(getTensionLevel(state)).toBe(level);
    state.gameStarted = false;
    expect(getTensionLevel(state)).toBe(0);
    state.gameStarted = true;
    state.gameEnded = true;
    expect(getTensionLevel(state)).toBe(0);
  });

  it.each([
    [1199, 0],
    [1200, 1],
    [1499, 1],
    [1500, 2],
    [1699, 2],
    [1700, 3],
    [1899, 3],
    [1900, 4],
  ])('builds tension at a leading score of %s / 2000', (leader, level) => {
    const state = match();
    state.score = [leader, 2000 - leader];
    expect(getTensionLevel(state)).toBe(level);
    state.score = [(2000 - leader) * 10, leader * 10];
    expect(getTensionLevel(state)).toBe(level);
  });

  it('uses the stronger of chain pressure and score pressure', () => {
    const state = match();
    state.p1.body = Array(4).fill([1, 1]);
    state.score = [100, 1900];
    expect(getTensionLevel(state)).toBe(4);
    state.p1.body = Array(16).fill([1, 1]);
    state.score = [1200, 800];
    expect(getTensionLevel(state)).toBe(4);
  });

  it('crossfades to a different synchronized theme at every pressure level', () => {
    const audio = new GameAudioSystem();
    const state = match();
    audio.startMusic();
    for (const [length, volume, name] of [
      [4, 0.22, 'build'],
      [7, 0.34, 'pressure'],
      [11, 0.46, 'tension'],
      [16, 0.65, 'critical'],
    ] as const) {
      state.p1.body = Array(length).fill([1, 1]);
      audio.updateGameState(state);
      vi.advanceTimersByTime(3500);
      expect(cue(name).volume).toBeCloseTo(volume);
      const heard = tensionDebugSnapshot().layers.map((layer) => layer.name);
      expect(heard).toContain('game');
      expect(heard).toContain(name);
      for (const other of ['build', 'pressure', 'tension', 'critical']) {
        if (other !== name) expect(cue(other).volume).toBe(0);
        expect(cue(other).loop).toBe(true);
      }
    }
    audio.stopAll();
  });

  it('holds critical pressure, then fades back to the quieter build theme', () => {
    const audio = new GameAudioSystem();
    const state = match();
    audio.startMusic();
    state.score = [1900, 100];
    audio.updateGameState(state);
    vi.advanceTimersByTime(2000);
    state.score = [1200, 800];
    audio.updateGameState(state);
    expect(cue('critical').volume).toBeCloseTo(0.65);
    expect(cue('build').volume).toBe(0);
    vi.advanceTimersByTime(2100);
    audio.updateGameState(state);
    vi.advanceTimersByTime(4000);
    expect(cue('build').volume).toBeCloseTo(0.22);
    expect(cue('critical').volume).toBe(0);
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

  it('raises the mix from a catch streak, then clears it on a death or the other player scoring', () => {
    const audio = new GameAudioSystem();
    const state = match();
    audio.updateGameState(state);
    for (let catchIndex = 1; catchIndex <= 8; catchIndex += 1) {
      state.score = [1000 + catchIndex, 1000 - catchIndex];
      audio.updateGameState(state);
    }
    expect(tensionDebugSnapshot().streakCount).toBe(8);
    expect(tensionDebugSnapshot().streak).toBe(4);
    expect(tensionDebugSnapshot().level).toBe(4);
    expect(tensionDebugSnapshot().track).toBe('critical');
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

  it('shows FORK when a spawn-length chain resets a long one head-on', () => {
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
    expect(streakPops().some((pop) => pop.text === 'FORK')).toBe(true);
    expect(streakPops().find((pop) => pop.text === 'FORK')).toMatchObject({
      col: 10,
      row: 10,
    });

    const wall = match();
    wall.p1.head = [10, 10];
    wall.p1.body = Array(7).fill([9, 10]);
    wall.p2.head = [30, 10];
    wall.p2.body = [[31, 10]];
    audio.updateGameState(wall);
    const before = streakPops().length;
    wall.p1.head = [4, 12];
    wall.p1.body = [[3, 12]];
    audio.updateGameState(wall);
    expect(streakPops().slice(before).some((pop) => pop.text === 'FORK')).toBe(
      false
    );
    audio.stopAll();
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
    expect(cue('critical').volume).toBeCloseTo(0.65);
    state.p1.body = [];
    audio.updateGameState(state);
    vi.advanceTimersByTime(1000);
    expect(cue('critical').volume).toBeCloseTo(0.65);
    vi.advanceTimersByTime(1100);
    audio.updateGameState(state);
    vi.advanceTimersByTime(4000);
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
