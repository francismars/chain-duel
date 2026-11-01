import { describe, expect, it } from 'vitest';
import { createNewCoinbase, getCaptureLabel, stepGame } from '@/game/engine';
import { reorgCaptureGap } from '@/game/audio/gameAudio';
import {
  finishTour,
  makeDirector,
  makeTourState,
  TOURS,
  type TourSpec,
} from './matchTriggerLabTours';

const STEP_MS = 100;

/** Steps a tour headlessly and counts resets per seat. */
function play(tour: TourSpec, ms: number) {
  const state = makeTourState(tour);
  const notes: string[] = [];
  const director = makeDirector(tour, {
    dropBlock: (fee) => {
      if (fee !== null) createNewCoinbase(state, fee);
    },
    note: (l) => notes.push(l),
  });
  let elapsed = 0;
  let guard = 0;
  while (state.countdownStart && !state.gameStarted && guard < 100) {
    stepGame(state);
    guard += 1;
  }
  const resets = { white: 0, black: 0 };
  let longest = 0;
  let maxCoins = 0;
  let maxPlain = 0;
  let maxRewards = 0;
  let cutSeen = false;
  let bigCrashIsReorg = false;
  let bigCrashSeen = false;
  let resetsAfterCut = 0;
  while (elapsed < ms && !state.gameEnded) {
    const whiteLen = state.p1.body.length;
    const blackLen = state.p2.body.length;
    director.beforeStep(state, elapsed);
    cutSeen ||= notes.some((line) => line.includes('cuts'));
    stepGame(state);
    if (elapsed >= 16_800 && state.resetCueP1 && !bigCrashSeen) {
      bigCrashSeen = true;
      bigCrashIsReorg = reorgCaptureGap(
        Number.parseInt(getCaptureLabel(whiteLen), 10),
        Number.parseInt(getCaptureLabel(blackLen), 10)
      );
    }
    director.afterStep(state);
    if (cutSeen && (state.resetCueP1 || state.resetCueP2)) resetsAfterCut += 1;
    if (state.resetCueP1) resets.white += 1;
    if (state.resetCueP2) resets.black += 1;
    longest = Math.max(longest, state.p1.body.length, state.p2.body.length);
    maxCoins = Math.max(maxCoins, state.coinbases.length);
    const rewards = state.coinbases.filter((coin) => coin.reward).length;
    maxRewards = Math.max(maxRewards, rewards);
    // Decoys come from a power-up, not the tour, so they are not counted here.
    const plain = state.coinbases.filter(
      (coin) => !coin.reward && !coin.isDecoy
    ).length;
    maxPlain = Math.max(maxPlain, plain);
    elapsed += STEP_MS;
  }
  return {
    state,
    resets,
    notes,
    longest,
    resetsAfterCut,
    maxCoins,
    maxPlain,
    maxRewards,
    bigCrashIsReorg,
  };
}

describe('lab tours', () => {
  it('steers each chain into a wall on cue', () => {
    const base = TOURS.find((tour) => tour.id === 'reset')!;
    const walls: TourSpec = {
      ...base,
      cues: [
        { at: 500, kind: 'crash', who: 0 },
        { at: 600, kind: 'crash', who: 1 },
      ],
    };
    const { resets } = play(walls, 12_000);
    expect(resets.white).toBeGreaterThan(0);
    expect(resets.black).toBeGreaterThan(0);
  });

  it('lands cut-offs in the reset tour', () => {
    const reset = TOURS.find((tour) => tour.id === 'reset')!;
    let landed = 0;
    for (let run = 0; run < 12; run += 1) {
      const { notes, resetsAfterCut } = play(reset, 11_000);
      if (notes.some((line) => line.includes('cuts')) && resetsAfterCut > 0)
        landed += 1;
    }
    // Bots move at random. About three in four runs land a cut in this window.
    expect(landed).toBeGreaterThanOrEqual(5);
  });

  it('ends the reset tour on a reorg: long White down, Black short', () => {
    const reset = TOURS.find((tour) => tour.id === 'reset')!;
    let reorgs = 0;
    for (let run = 0; run < 8; run += 1) {
      if (play(reset, 21_000).bigCrashIsReorg) reorgs += 1;
    }
    // Bots move at random. Nearly every run lands it; leave room for a stray crash.
    expect(reorgs).toBeGreaterThanOrEqual(5);
  });

  it('grows a chain to the 16% tier in the chain tour', () => {
    const chain = TOURS.find((tour) => tour.id === 'chain')!;
    let reached = 0;
    for (let run = 0; run < 6; run += 1) {
      if (play(chain, chain.lengthMs).longest >= 7) reached += 1;
    }
    // A stray crash can cut a run short. Most runs still get there.
    expect(reached).toBeGreaterThanOrEqual(4);
  });

  it('shows one coinbase at a time, plus a block reward', () => {
    for (const tour of TOURS) {
      const { maxPlain, maxRewards } = play(tour, tour.lengthMs);
      expect(maxPlain, tour.id).toBeLessThanOrEqual(1);
      expect(maxRewards, tour.id).toBeLessThanOrEqual(1);
    }
  });

  it('ends the match when time runs out', () => {
    const block = TOURS.find((tour) => tour.id === 'block')!;
    const { state } = play(block, 2_000);
    finishTour(state);
    expect(state.gameEnded).toBe(true);
    expect(state.winnerName).toBeTruthy();
  });
});
