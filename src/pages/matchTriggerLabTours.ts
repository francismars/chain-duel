import {
  createGameState,
  decideAiForPlayer,
  startCountdown,
} from '@/game/engine';
import { POWERUP_DISPLAY } from '@/game/engine/powerUpDisplay';
import type {
  AiTier,
  Direction,
  GameState,
  GridPos,
  PowerUpType,
} from '@/game/engine/types';

/**
 * Lab tours: real matches between two engine bots on the game tick, played
 * the way two good players would. Nothing on the board is moved or removed
 * by the tour: coins appear when one is eaten or a block drops a reward, and
 * leave only when eaten. The tour adds only real game events (new blocks,
 * power-up spawns) and a head-on guard so neither bot drives into the other
 * when it is losing the race.
 */

export type TourId =
  'match' | 'stake' | 'chain' | 'reset' | 'block' | 'powerups';

type Seat = 0 | 1;
type Move = Exclude<Direction, ''>;

type Cue =
  /** A new Bitcoin block: flash, sound, and a fee-sized reward. */
  | { at: number; kind: 'block'; fee: number }
  /** The next power-up spawn is this type. It lands between the chains. */
  | { at: number; kind: 'powerup'; type: PowerUpType };

export type TourSpec = {
  id: TourId;
  label: string;
  blurb: string;
  /** Tour length after the countdown. Unless the match ends first, it restarts quietly. */
  lengthMs: number;
  countdown: boolean;
  walls: boolean;
  /** Ticks between wall steps when walls close. */
  wallStepTicks?: number;
  powerups: boolean;
  points: [number, number];
  cues: Cue[];
  /** AI tier per seat, White then Black. Defaults to TOUR_STYLES. */
  styles?: [AiTier, AiTier];
};

/**
 * Two good players with different styles: White plays the sovereign bot
 * (intercepts and contests coins), Black the noderunner (chases coins and
 * power-ups). The tour sets the tier before each seat decides.
 */
const TOUR_STYLES: [AiTier, AiTier] = ['sovereign', 'noderunner'];

export const TOURS: TourSpec[] = [
  {
    id: 'match',
    label: 'Full match',
    blurb:
      'Two strong bots play a whole match: countdown, eats up the capture tiers, power-ups, walls closing, resets, new blocks, and the finish. Loops.',
    lengthMs: 120_000,
    countdown: true,
    walls: true,
    powerups: true,
    points: [5000, 5000],
    cues: [
      { at: 15_000, kind: 'block', fee: 60 },
      { at: 40_000, kind: 'block', fee: 600 },
    ],
  },
  {
    id: 'stake',
    label: '1 · Stake',
    blurb:
      'Stake your sats and play until one chain hits zero. Winner takes all.',
    lengthMs: 90_000,
    countdown: true,
    walls: false,
    powerups: false,
    points: [8000, 2000],
    cues: [],
  },
  {
    id: 'chain',
    label: '2 · Longer chains',
    blurb:
      'Each capture grows the chain, and the capture rate climbs with it: 2%, 4%, 8%, 16%. A longer chain takes a larger share of the sats.',
    lengthMs: 30_000,
    countdown: false,
    walls: false,
    powerups: false,
    points: [5000, 5000],
    cues: [],
  },
  {
    id: 'reset',
    label: '3 · Reset',
    blurb:
      'Walls close fast and the chains fight for room. Hit a wall or a body and you reset to genesis. A long chain going down is a reorg.',
    lengthMs: 40_000,
    countdown: false,
    walls: true,
    wallStepTicks: 25,
    styles: ['sovereign', 'sovereign'],
    powerups: false,
    points: [5000, 5000],
    cues: [],
  },
  {
    id: 'block',
    label: '4 · New block',
    blurb:
      'A new block flashes the board and drops a reward. Bigger fees pay more.',
    lengthMs: 24_000,
    countdown: false,
    walls: false,
    powerups: false,
    points: [5000, 5000],
    cues: [
      { at: 2_000, kind: 'block', fee: 10 },
      { at: 7_500, kind: 'block', fee: 60 },
      { at: 13_000, kind: 'block', fee: 200 },
      { at: 18_500, kind: 'block', fee: 600 },
    ],
  },
  {
    id: 'powerups',
    label: 'Power-ups',
    blurb:
      'Every power-up in a live match, raced for by both chains: ASIC Boost, Sybil Attack, Coinjoin, Full Block, and Fork Coin.',
    lengthMs: 45_000,
    countdown: true,
    walls: false,
    powerups: true,
    points: [5000, 5000],
    // Both play the power-up chaser, so every spawn turns into a race.
    styles: ['noderunner', 'noderunner'],
    cues: [
      // Each waits for the last to be taken, so they come one at a time. A
      // match can end in 15s, so they come quickly.
      { at: 500, kind: 'powerup', type: 'SURGE' },
      { at: 2_500, kind: 'powerup', type: 'FREEZE' },
      { at: 4_500, kind: 'powerup', type: 'PHANTOM' },
      { at: 6_500, kind: 'powerup', type: 'AMPLIFIER' },
      { at: 8_500, kind: 'powerup', type: 'DECOY' },
    ],
  },
];

const STEP: Record<Move, GridPos> = {
  Up: [0, -1],
  Down: [0, 1],
  Left: [-1, 0],
  Right: [1, 0],
};

const OPPOSITE: Record<Move, Direction> = {
  Up: 'Down',
  Down: 'Up',
  Left: 'Right',
  Right: 'Left',
};

const same = (a: GridPos, b: GridPos) => a[0] === b[0] && a[1] === b[1];
const dist = (a: GridPos, b: GridPos) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

function snakeOf(state: GameState, who: Seat) {
  return who === 0 ? state.p1 : state.p2;
}

function inPlay(state: GameState, [x, y]: GridPos): boolean {
  const border = state.shrinkBorder;
  const minX = border ? border.left + 1 : 0;
  const maxX = border ? border.right - 1 : state.cols - 1;
  const minY = border ? border.top + 1 : 0;
  const maxY = border ? border.bottom - 1 : state.rows - 1;
  return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

/** A head or body cell, a coin, a power-up, or an obstacle. */
function taken(state: GameState, pos: GridPos): boolean {
  return (
    same(state.p1.head, pos) ||
    same(state.p2.head, pos) ||
    state.p1.body.some((cell) => same(cell, pos)) ||
    state.p2.body.some((cell) => same(cell, pos)) ||
    state.coinbases.some((coin) => same(coin.pos, pos)) ||
    state.powerUpItems.some((item) => same(item.pos, pos)) ||
    state.obstacleWalls.some((wall) => same(wall.pos, pos))
  );
}

/** Where a chain's head lands next step, given the direction it wants. */
function nextHead(state: GameState, who: Seat): GridPos {
  const snake = snakeOf(state, who);
  const dir = (snake.dirWanted || snake.dir) as Direction;
  if (dir === '') return snake.head;
  const [sx, sy] = STEP[dir];
  return [snake.head[0] + sx, snake.head[1] + sy];
}

/** The nearest real coinbase, which both bots are usually racing for. */
function targetFor(state: GameState, who: Seat): GridPos | null {
  const head = snakeOf(state, who).head;
  let best: GridPos | null = null;
  for (const coin of state.coinbases) {
    if (coin.isDecoy) continue;
    if (!best || dist(head, coin.pos) < dist(head, best)) best = coin.pos;
  }
  return best;
}

/**
 * The best safe move toward the target that avoids `avoid`. A safe move stays
 * inside the walls and off every body. Null when the chain is boxed in.
 */
function safeMove(
  state: GameState,
  who: Seat,
  avoid: GridPos,
  target: GridPos | null
): Move | null {
  const snake = snakeOf(state, who);
  let best: { move: Move; score: number } | null = null;
  for (const move of Object.keys(STEP) as Move[]) {
    if (OPPOSITE[move] === snake.dir) continue;
    const [sx, sy] = STEP[move];
    const pos: GridPos = [snake.head[0] + sx, snake.head[1] + sy];
    if (!inPlay(state, pos) || same(pos, avoid)) continue;
    const blocked =
      same(state.p1.head, pos) ||
      same(state.p2.head, pos) ||
      state.p1.body.some((cell) => same(cell, pos)) ||
      state.p2.body.some((cell) => same(cell, pos)) ||
      state.obstacleWalls.some((wall) => same(wall.pos, pos));
    if (blocked) continue;
    const score = target ? dist(pos, target) : 0;
    if (!best || score < best.score) best = { move, score };
  }
  return best?.move ?? null;
}

/**
 * Head-on guard. Both bots have chosen their moves. If those moves collide,
 * the bot losing the race to the coin backs off with its best safe move, the
 * way a good player gives up a coin it cannot win rather than trade heads.
 */
export function guardHeadOn(state: GameState): void {
  const a = nextHead(state, 0);
  const b = nextHead(state, 1);
  const meet = same(a, b);
  const swap = same(a, state.p2.head) && same(b, state.p1.head);
  if (!meet && !swap) return;
  const targetA = targetFor(state, 0);
  const targetB = targetFor(state, 1);
  const gapA = targetA ? dist(state.p1.head, targetA) : Infinity;
  const gapB = targetB ? dist(state.p2.head, targetB) : Infinity;
  // The farther chain yields. On a tie, the shorter chain has less to lose
  // by waiting, so it yields.
  const yielder: Seat =
    gapA !== gapB
      ? gapA > gapB
        ? 0
        : 1
      : state.p1.body.length <= state.p2.body.length
        ? 0
        : 1;
  const move = safeMove(
    state,
    yielder,
    yielder === 0 ? b : a,
    yielder === 0 ? targetA : targetB
  );
  if (move) snakeOf(state, yielder).dirWanted = move;
}

/** The AI only chases a power-up closer than this (engine POWER_UP_CHASE_RANGE). */
const CHASE_RANGE = 6;

/**
 * Where a power-up spawns: a free cell the bots will actually chase, so it
 * turns into a race. Inside chase range of at least one chain, not right under
 * a head, and as even between the two chains as the board allows.
 */
function contestedCell(state: GameState): GridPos | null {
  const reach = (a: GridPos, b: GridPos) =>
    Math.hypot(a[0] - b[0], a[1] - b[1]);
  let best: { pos: GridPos; score: number } | null = null;
  for (let x = 0; x < state.cols; x += 1) {
    for (let y = 0; y < state.rows; y += 1) {
      const pos: GridPos = [x, y];
      if (!inPlay(state, pos) || taken(state, pos)) continue;
      const a = reach(pos, state.p1.head);
      const b = reach(pos, state.p2.head);
      if (Math.min(a, b) < 3 || Math.min(a, b) >= CHASE_RANGE - 0.5) continue;
      // Even first, then close: a race both chains can see.
      const score = Math.abs(a - b) * 2 + Math.min(a, b);
      if (!best || score < best.score) best = { pos, score };
    }
  }
  return best?.pos ?? null;
}

export function makeTourState(tour: TourSpec): GameState {
  const state = createGameState({
    p1Name: 'White',
    p2Name: 'Black',
    p1Points: tour.points[0],
    p2Points: tour.points[1],
    modeLabel: 'FREE PLAY',
    // Not practice, so the match ends when a chain hits zero.
    practiceMode: false,
    convergenceMode: tour.walls,
    convergenceShrinkInterval: tour.wallStepTicks ?? 60,
    powerupMode: tour.powerups,
    aiTier: (tour.styles ?? TOUR_STYLES)[0],
    p1Human: false,
    p2Human: false,
  });
  state.p1Name = 'White';
  state.p2Name = 'Black';
  // The spawns mirror each other, so a centre coin is a dead heat that two
  // good bots settle with a head-on, every round. Real matches open with the
  // coin somewhere off that line; set it before the first frame is drawn.
  const opening = state.coinbases.find((coin) => !coin.reward);
  if (opening) {
    const start = opening.pos;
    // Off the board while we look, so the coin does not block its own new cell.
    opening.pos = [-1, -1];
    const midX = Math.floor(state.cols / 2);
    const midY = Math.floor(state.rows / 2);
    let placed: GridPos = start;
    for (let tries = 0; tries < 50; tries += 1) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const pos: GridPos = [
        midX - 5 + Math.floor(Math.random() * 11),
        midY + side * (3 + Math.floor(Math.random() * 5)),
      ];
      if (inPlay(state, pos) && !taken(state, pos)) {
        placed = pos;
        break;
      }
    }
    opening.pos = placed;
  }
  // Scripted power-up tours decide when a power-up spawns.
  if (tour.cues.some((cue) => cue.kind === 'powerup'))
    state.powerUpRespawnCooldownTick = Number.MAX_SAFE_INTEGER;
  if (tour.countdown) startCountdown(state);
  else state.gameStarted = true;
  return state;
}

type Hooks = {
  /** `null` plays the block without dropping a reward. */
  dropBlock: (medianFee: number | null) => void;
  note: (line: string) => void;
};

export function makeDirector(tour: TourSpec, hooks: Hooks) {
  const pending = [...tour.cues].sort((a, b) => a.at - b.at);
  const scriptedPowerUps = tour.cues.some((cue) => cue.kind === 'powerup');
  let offered: PowerUpType | null = null;

  const run = (state: GameState, cue: Cue): boolean => {
    if (cue.kind === 'block') {
      // One reward at a time: the flash and sound play, the reward waits.
      const rewardOut = state.coinbases.some((coin) => coin.reward);
      hooks.dropBlock(rewardOut ? null : cue.fee);
      return true;
    }
    // A power-up spawn waits until the last one is taken.
    if (state.powerUpItems.length > 0) return false;
    const pos = contestedCell(state);
    if (!pos) return false;
    state.powerUpItems.push({ pos, type: cue.type });
    return true;
  };

  return {
    /** Fires due events, then lets both bots decide and guards against head-ons. */
    beforeStep(state: GameState, elapsedMs: number): void {
      while (pending.length > 0 && pending[0]!.at <= elapsedMs) {
        if (!run(state, pending[0]!)) break;
        pending.shift();
      }
      offered = state.powerUpItems[0]?.type ?? null;
      if (!state.gameStarted || state.gameEnded) return;
      // The bots decide here instead of inside the step, so the guard can see
      // both moves. Each seat counts as human for this one step only, so the
      // engine moves them as decided and does not decide again.
      const styles = tour.styles ?? TOUR_STYLES;
      const tier = state.meta.aiTier;
      state.meta.aiTier = styles[0];
      decideAiForPlayer(state, 0);
      state.meta.aiTier = styles[1];
      decideAiForPlayer(state, 1);
      state.meta.aiTier = tier;
      guardHeadOn(state);
      state.meta.p1Human = true;
      state.meta.p2Human = true;
    },
    /** Hands the seats back to the AI and reports power-up pickups. */
    afterStep(state: GameState): void {
      state.meta.p1Human = false;
      state.meta.p2Human = false;
      if (scriptedPowerUps)
        state.powerUpRespawnCooldownTick = Number.MAX_SAFE_INTEGER;
      if (offered && state.powerUpItems.length === 0) {
        const { title, subtitle } = POWERUP_DISPLAY[offered];
        hooks.note(`Tour · ${title}: ${subtitle}`);
        offered = null;
      }
    },
  };
}
