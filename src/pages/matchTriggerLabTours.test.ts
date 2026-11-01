import { describe, expect, it } from 'vitest';
import { createNewCoinbase, stepGame } from '@/game/engine';
import type { GridPos } from '@/game/engine/types';
import {
  guardHeadOn,
  makeDirector,
  makeTourState,
  TOURS,
  type TourSpec,
} from './matchTriggerLabTours';

const STEP_MS = 100;
const key = (pos: GridPos) => `${pos[0]},${pos[1]}`;

/**
 * Plays a tour headlessly and checks the board stays honest each step:
 * coins leave only when a head eats them, appear only after an eat or a block,
 * and power-ups never move while they are out.
 */
function play(tour: TourSpec, ms: number) {
  const state = makeTourState(tour);
  const notes: string[] = [];
  const dropped = { block: false };
  const director = makeDirector(tour, {
    dropBlock: (fee) => {
      if (fee !== null) {
        createNewCoinbase(state, fee);
        dropped.block = true;
      }
    },
    note: (line) => notes.push(line),
  });
  const problems: string[] = [];
  let guard = 0;
  while (state.countdownStart && !state.gameStarted && guard < 100) {
    stepGame(state);
    guard += 1;
  }
  const plainCoins = () =>
    new Set(state.coinbases.filter((c) => !c.isDecoy).map((c) => key(c.pos)));
  let elapsed = 0;
  while (elapsed < ms && !state.gameEnded) {
    dropped.block = false;
    const coinsBefore = plainCoins();
    director.beforeStep(state, elapsed);
    const itemsBefore = state.powerUpItems.map((item) => key(item.pos));
    const coinsAfterDirector = plainCoins();
    const wallsBefore = JSON.stringify(state.shrinkBorder);
    const changesBefore = state.pointChanges.length;
    stepGame(state);
    director.afterStep(state);
    // The engine moves a coin or power-up out from under a closing wall. That
    // is a game rule, in real matches too, so a wall step excuses a move.
    const wallStepped = JSON.stringify(state.shrinkBorder) !== wallsBefore;

    // The director only adds a block reward. It never moves or removes a coin.
    for (const pos of coinsBefore) {
      if (!coinsAfterDirector.has(pos))
        problems.push(`${elapsed}: director removed coin ${pos}`);
    }
    if (!dropped.block && coinsAfterDirector.size > coinsBefore.size)
      problems.push(`${elapsed}: director added a coin without a block`);

    // Every capture adds a sats popup, so that count is how many coins were
    // eaten this step, wherever the head ended up (ASIC Boost moves twice,
    // a chain can eat and reset in one step, Coinjoin wraps through walls).
    const eaten = state.pointChanges.length - changesBefore;
    const coinsNow = plainCoins();
    let gone = 0;
    for (const pos of coinsAfterDirector) if (!coinsNow.has(pos)) gone += 1;
    if (gone > eaten && !wallStepped)
      problems.push(
        `${tour.id} ${elapsed}: ${gone - eaten} coin(s) vanished uneaten`
      );
    let appeared = 0;
    for (const pos of coinsNow) if (!coinsAfterDirector.has(pos)) appeared += 1;
    if (appeared > eaten && !wallStepped)
      problems.push(`${elapsed}: coin appeared without an eat`);

    // A power-up that is still out sits where it spawned.
    for (const item of state.powerUpItems) {
      const at = key(item.pos);
      if (itemsBefore.length > 0 && !itemsBefore.includes(at) && !wallStepped)
        problems.push(`${elapsed}: power-up moved to ${at}`);
    }
    elapsed += STEP_MS;
  }
  return { state, notes, problems };
}

describe('lab tours', () => {
  it('never moves, adds, or removes a reward behind the players', () => {
    for (const tour of TOURS) {
      for (let run = 0; run < 2; run += 1) {
        const { problems } = play(tour, Math.min(tour.lengthMs, 30_000));
        expect(problems, tour.id).toEqual([]);
      }
    }
  });

  it('races for every power-up in the power-ups tour', () => {
    const tour = TOURS.find((entry) => entry.id === 'powerups')!;
    let complete = 0;
    for (let run = 0; run < 6; run += 1) {
      const { notes } = play(tour, tour.lengthMs);
      const taken = notes.filter((line) => line.startsWith('Tour ·'));
      if (taken.length >= 5) complete += 1;
    }
    // Bots vary. A match can end before the last spawn; most get all five.
    expect(complete).toBeGreaterThanOrEqual(4);
  });

  it('makes the chain losing the race back off instead of trading heads', () => {
    const state = makeTourState(TOURS.find((tour) => tour.id === 'chain')!);
    // White and Black meet on one cell of a row, both heading for it.
    state.p1.head = [20, 12];
    state.p1.body = [[19, 12]];
    state.p1.dir = 'Right';
    state.p1.dirWanted = 'Right';
    state.p2.head = [22, 12];
    state.p2.body = [[23, 12]];
    state.p2.dir = 'Left';
    state.p2.dirWanted = 'Left';
    // The coin sits next to Black, so White is losing the race.
    state.coinbases = [{ pos: [22, 13] }];
    guardHeadOn(state);
    expect(state.p2.dirWanted).toBe('Left');
    expect(['Up', 'Down']).toContain(state.p1.dirWanted);
  });
});
