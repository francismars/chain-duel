import {
  applyTerminalGameOutcome,
  createGameState,
  setWantedDirection,
  startCountdown,
} from '@/game/engine';
import type {
  Coinbase,
  Direction,
  GameState,
  GridPos,
} from '@/game/engine/types';

/**
 * Lab tours: real matches between two engine bots on the game tick. A short
 * script per tour steers the bots so each rule shows up on the board.
 */

export type TourId = 'match' | 'stake' | 'chain' | 'reset' | 'block';

type Seat = 0 | 1;

type Cue =
  | {
      at: number;
      kind: 'crash';
      who: Seat | 'longest' | 'shortest';
      /** Hold the crash until the chain is this long, or until `latest`. */
      minLength?: number;
      latest?: number;
    }
  | { at: number; kind: 'head-on' }
  /** One chain cuts across the other's path. The other holds its line and hits the body. */
  | { at: number; kind: 'cut'; attacker: Seat | 'longest' }
  | { at: number; kind: 'block'; fee: number }
  /** A coin just ahead of a chain. `who` picks it; otherwise the chains take turns. */
  | { at: number; kind: 'coin'; who?: Seat };

export type TourSpec = {
  id: TourId;
  label: string;
  blurb: string;
  /** Match time after the countdown. The leader takes the pot when it runs out. */
  lengthMs: number;
  countdown: boolean;
  walls: boolean;
  powerups: boolean;
  points: [number, number];
  cues: Cue[];
  /**
   * A chain this long gets steered into a wall. That is a reorg on the board,
   * and it keeps the top capture tiers from ending the match in seconds.
   */
  capLength?: number;
  /**
   * Keeps the match alive for tours about something other than the pot. When
   * one side drops low, sats ease back toward it a little each step.
   */
  keepPot?: boolean;
};

/** A plain coinbase every `stepMs` between `from` and `to`. */
function coinsEvery(
  stepMs: number,
  from: number,
  to: number,
  who?: Seat
): Cue[] {
  const cues: Cue[] = [];
  for (let at = from; at <= to; at += stepMs)
    cues.push({ at, kind: 'coin', who });
  return cues;
}

export const TOURS: TourSpec[] = [
  {
    id: 'match',
    label: 'Full match',
    blurb:
      'Countdown, eats up the capture tiers, walls closing, power-ups, crashes, reorgs, new blocks, and a real finish when a chain hits zero. Loops.',
    // Usually ends on its own near 35s. The timer is only a fallback.
    lengthMs: 45_000,
    countdown: true,
    walls: true,
    powerups: true,
    points: [5000, 5000],
    capLength: 8,
    // Few rewards, lots of contact: the chains cut each other off and collide.
    cues: [
      ...coinsEvery(1_500, 1_000, 6_000),
      ...coinsEvery(6_000, 12_000, 32_000),
      { at: 7_000, kind: 'cut', attacker: 'longest' },
      { at: 10_000, kind: 'head-on' },
      { at: 14_000, kind: 'cut', attacker: 'longest' },
      { at: 18_000, kind: 'block', fee: 60 },
      { at: 21_000, kind: 'cut', attacker: 'longest' },
      { at: 26_000, kind: 'head-on' },
      { at: 29_000, kind: 'block', fee: 600 },
      { at: 32_000, kind: 'cut', attacker: 'longest' },
    ],
  },
  {
    id: 'stake',
    label: '1 · Stake',
    blurb:
      'Stake your sats and play until one chain hits zero. Winner takes all.',
    lengthMs: 30_000,
    countdown: true,
    walls: false,
    powerups: false,
    points: [9200, 800],
    cues: [],
  },
  {
    id: 'chain',
    label: '2 · Longer chains',
    blurb:
      'White keeps eating and climbs the capture tiers: 2%, 4%, 8%, 16%. A longer chain takes a larger share of the sats.',
    lengthMs: 24_000,
    countdown: false,
    walls: false,
    powerups: false,
    points: [5000, 5000],
    // Extra coinbases so both chains climb the tiers inside the tour.
    keepPot: true,
    // White gets fed so its capture rate visibly climbs past Black's.
    cues: coinsEvery(1_000, 1_000, 20_000, 0),
  },
  {
    id: 'reset',
    label: '3 · Reset',
    blurb:
      'A chain hits the wall, then a head-on resets both, then a cut-off. Then White grows long, and a long chain going down is a reorg.',
    lengthMs: 24_000,
    countdown: false,
    walls: false,
    powerups: false,
    points: [5000, 5000],
    keepPot: true,
    // A story in order: a small chain hits the wall, then a head-on, then a
    // cut-off. Then White is fed until it is long, and its crash is a reorg,
    // so the bigger reset mark reads against the small ones before it.
    cues: [
      ...coinsEvery(600, 300, 2_400),
      { at: 800, kind: 'crash', who: 0 },
      { at: 4_000, kind: 'head-on' },
      { at: 7_000, kind: 'cut', attacker: 'longest' },
      ...coinsEvery(550, 10_000, 19_000, 0),
      // Black resets first, small, so the long White crash right after is a reorg.
      { at: 15_000, kind: 'crash', who: 1 },
      { at: 16_800, kind: 'crash', who: 0, minLength: 7, latest: 19_500 },
      { at: 21_000, kind: 'head-on' },
    ],
  },
  {
    id: 'block',
    label: '4 · New block',
    blurb:
      'A new block flashes the board and drops a reward. Bigger fees pay more.',
    lengthMs: 22_000,
    countdown: false,
    walls: false,
    powerups: false,
    points: [5000, 5000],
    cues: [
      { at: 2_000, kind: 'block', fee: 10 },
      { at: 7_000, kind: 'block', fee: 60 },
      { at: 12_000, kind: 'block', fee: 200 },
      { at: 17_000, kind: 'block', fee: 600 },
    ],
  },
];

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
    convergenceShrinkInterval: 60,
    powerupMode: tour.powerups,
    p1Human: false,
    p2Human: false,
  });
  state.p1Name = 'White';
  state.p2Name = 'Black';
  if (tour.countdown) startCountdown(state);
  else state.gameStarted = true;
  return state;
}

/** Time is up: the leader takes what is left, and the end card shows. */
export function finishTour(state: GameState): void {
  const [white, black] = state.score;
  const total = white + black;
  state.score = white >= black ? [total, 0] : [0, total];
  applyTerminalGameOutcome(state);
}

type Hooks = {
  /** `null` plays the block without dropping a reward. */
  dropBlock: (medianFee: number | null) => void;
  note: (line: string) => void;
};

type Steer =
  | { kind: 'wall'; dir: Exclude<Direction, ''> | null; left: number }
  | { kind: 'chase'; left: number }
  /** Attacker closing in until a clean crossing opens up. */
  | { kind: 'stalk'; left: number }
  /** Victim of a cut: keeps its line until it hits the body across it. */
  | { kind: 'hold'; left: number }
  /** Attacker of a cut: reaches the crossing on the victim's line, then keeps going across. */
  | {
      kind: 'cut';
      target: GridPos;
      across: Exclude<Direction, ''> | null;
      left: number;
    };

const OPPOSITE: Record<Exclude<Direction, ''>, Direction> = {
  Up: 'Down',
  Down: 'Up',
  Left: 'Right',
  Right: 'Left',
};

/** Steps a steered chain gets before it goes back to the bot. */
const STEER_STEPS = 90;
/** A cut either lands quickly or not at all. */
const CUT_STEPS = 45;
/** How long an attacker closes in before giving up on a cut. */
const STALK_STEPS = 60;

const STEP: Record<Exclude<Direction, ''>, GridPos> = {
  Up: [0, -1],
  Down: [0, 1],
  Left: [-1, 0],
  Right: [1, 0],
};

function inPlay(state: GameState, [x, y]: GridPos): boolean {
  const border = state.shrinkBorder;
  const minX = border ? border.left + 1 : 0;
  const maxX = border ? border.right - 1 : state.cols - 1;
  const minY = border ? border.top + 1 : 0;
  const maxY = border ? border.bottom - 1 : state.rows - 1;
  return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

function occupied(state: GameState, [x, y]: GridPos): boolean {
  const at = (cell: GridPos) => cell[0] === x && cell[1] === y;
  return (
    at(state.p1.head) ||
    at(state.p2.head) ||
    state.p1.body.some(at) ||
    state.p2.body.some(at) ||
    state.coinbases.some((coin) => at(coin.pos)) ||
    state.obstacleWalls.some((wall) => at(wall.pos))
  );
}

/** Plain coinbases: everything but block rewards and decoys. */
function plainCoins(state: GameState): Coinbase[] {
  return state.coinbases.filter((coin) => !coin.reward && !coin.isDecoy);
}

/**
 * Moves the board's one plain coinbase just ahead of a chain, so tours never
 * show more than one. `close` puts it on the very next cells, so the chain eats
 * it before the bot can turn away. False when nothing fits.
 */
function feedAhead(state: GameState, who: Seat, close = false): boolean {
  const snake = snakeOf(state, who);
  if (snake.dir === '') return false;
  const [sx, sy] = STEP[snake.dir];
  for (const ahead of close ? [1, 2] : [3, 2, 4]) {
    const pos: GridPos = [
      snake.head[0] + sx * ahead,
      snake.head[1] + sy * ahead,
    ];
    if (inPlay(state, pos) && !occupied(state, pos)) {
      const coin = plainCoins(state)[0];
      if (coin) coin.pos = pos;
      else state.coinbases.push({ pos });
      return true;
    }
  }
  return false;
}

/** Feeding stops at this length. Past the 16% tier there is nothing new to show. */
const FEED_CAP = 10;

/** Below this share of the pot, sats start easing back to the trailing side. */
const POT_FLOOR = 0.45;
/** Share of the pot that moves back each step while under the floor. */
const POT_EASE = 0.08;

function easePot(state: GameState): void {
  const [white, black] = state.score;
  const total = white + black;
  if (total <= 0) return;
  const trailing = white < black ? 0 : 1;
  if (state.score[trailing]! / total >= POT_FLOOR) return;
  const move = Math.min(
    Math.round(total * POT_EASE),
    state.score[trailing === 0 ? 1 : 0]!
  );
  state.score[trailing] = state.score[trailing]! + move;
  state.score[trailing === 0 ? 1 : 0] =
    state.score[trailing === 0 ? 1 : 0]! - move;
}

/**
 * Tours show one plain coinbase at a time, like a quiet board in a real match.
 * Block rewards are the only extras, and only one of those at a time.
 */
function keepOneReward(state: GameState): void {
  let plain = 0;
  let rewards = 0;
  state.coinbases = state.coinbases.filter((coin) => {
    if (coin.isDecoy) return true;
    if (coin.reward) return (rewards += 1) <= 1;
    return (plain += 1) <= 1;
  });
}

/**
 * Where the attacker should cross the victim's line. The attacker must get
 * there first, and its body must still lie there when the victim arrives.
 */
function crossingPoint(
  state: GameState,
  attacker: Seat,
  victim: Seat
): GridPos | null {
  const prey = snakeOf(state, victim);
  if (prey.dir === '') return null;
  const [sx, sy] = STEP[prey.dir];
  const hunter = snakeOf(state, attacker);
  const linger = Math.max(1, hunter.body.length);
  for (let ahead = 3; ahead <= 20; ahead += 1) {
    const point: GridPos = [
      prey.head[0] + sx * ahead,
      prey.head[1] + sy * ahead,
    ];
    if (!inPlay(state, point)) return null;
    const reach =
      Math.abs(point[0] - hunter.head[0]) + Math.abs(point[1] - hunter.head[1]);
    if (reach < ahead && ahead - reach <= linger + 1) return point;
  }
  return null;
}

/**
 * Toward the crossing: line up along the victim's axis first, so the last leg
 * cuts across its line at a right angle. Never asks for a reversal.
 */
function cutDir(
  state: GameState,
  who: Seat,
  target: GridPos,
  victimDir: Direction
): Exclude<Direction, ''> {
  const snake = snakeOf(state, who);
  const dx = target[0] - snake.head[0];
  const dy = target[1] - snake.head[1];
  const horizontal: Exclude<Direction, ''> = dx < 0 ? 'Left' : 'Right';
  const vertical: Exclude<Direction, ''> = dy < 0 ? 'Up' : 'Down';
  const victimHorizontal = victimDir === 'Left' || victimDir === 'Right';
  const first = victimHorizontal
    ? dx !== 0
      ? horizontal
      : vertical
    : dy !== 0
      ? vertical
      : horizontal;
  const second = first === horizontal ? vertical : horizontal;
  return OPPOSITE[first] === snake.dir ? second : first;
}

function snakeOf(state: GameState, who: Seat) {
  return who === 0 ? state.p1 : state.p2;
}

function setHuman(state: GameState, who: Seat, human: boolean): void {
  if (who === 0) state.meta.p1Human = human;
  else state.meta.p2Human = human;
}

function steerTo(
  state: GameState,
  who: Seat,
  dir: Exclude<Direction, ''>
): void {
  setWantedDirection(state, who === 0 ? 'P1' : 'P2', dir);
}

/** The closest wall the chain can turn toward without reversing. */
function nearestWall(state: GameState, who: Seat): Exclude<Direction, ''> {
  const snake = snakeOf(state, who);
  const border = state.shrinkBorder;
  const minX = border ? border.left + 1 : 0;
  const maxX = border ? border.right - 1 : state.cols - 1;
  const minY = border ? border.top + 1 : 0;
  const maxY = border ? border.bottom - 1 : state.rows - 1;
  const [x, y] = snake.head;
  const options: Array<[Exclude<Direction, ''>, number]> = [
    ['Left', x - minX],
    ['Right', maxX - x],
    ['Up', y - minY],
    ['Down', maxY - y],
  ];
  const allowed = options.filter(([dir]) => OPPOSITE[dir] !== snake.dir);
  allowed.sort((a, b) => a[1] - b[1]);
  return allowed[0]![0];
}

/** Toward the other head: White lines up on Black's row, Black runs the row. */
function chaseDir(state: GameState, who: Seat): Exclude<Direction, ''> {
  const me = snakeOf(state, who).head;
  const them = snakeOf(state, who === 0 ? 1 : 0).head;
  const dx = them[0] - me[0];
  const dy = them[1] - me[1];
  const horizontal: Exclude<Direction, ''> = dx < 0 ? 'Left' : 'Right';
  const vertical: Exclude<Direction, ''> = dy < 0 ? 'Up' : 'Down';
  const [first, second] =
    who === 0
      ? dy !== 0
        ? [vertical, horizontal]
        : [horizontal, vertical]
      : dx !== 0
        ? [horizontal, vertical]
        : [vertical, horizontal];
  // A reversal is ignored by the engine, so turn on the other axis instead.
  return OPPOSITE[first] === snakeOf(state, who).dir ? second : first;
}

/** A few cells ahead of the victim, kept inside the walls. */
function aheadOf(state: GameState, victim: Seat, cells: number): GridPos {
  const prey = snakeOf(state, victim);
  if (prey.dir === '') return prey.head;
  const [sx, sy] = STEP[prey.dir];
  for (let ahead = cells; ahead > 0; ahead -= 1) {
    const point: GridPos = [
      prey.head[0] + sx * ahead,
      prey.head[1] + sy * ahead,
    ];
    if (inPlay(state, point)) return point;
  }
  return prey.head;
}

export function makeDirector(tour: TourSpec, hooks: Hooks) {
  const pending = [...tour.cues].sort((a, b) => a.at - b.at);
  let feedNext: Seat = 1;
  const steering = new Map<Seat, Steer>();

  const take = (state: GameState, who: Seat, steer: Steer) => {
    setHuman(state, who, true);
    steering.set(who, steer);
  };

  const release = (state: GameState, who: Seat) => {
    setHuman(state, who, false);
    steering.delete(who);
  };

  /** Starts the cut if a crossing works from here. */
  const startCut = (state: GameState, attacker: Seat): boolean => {
    const victim: Seat = attacker === 0 ? 1 : 0;
    const target = crossingPoint(state, attacker, victim);
    if (!target) return false;
    take(state, victim, { kind: 'hold', left: CUT_STEPS });
    take(state, attacker, {
      kind: 'cut',
      target,
      across: null,
      left: CUT_STEPS,
    });
    hooks.note(
      `Tour · ${attacker === 0 ? 'White' : 'Black'} cuts ${victim === 0 ? 'White' : 'Black'} off`
    );
    return true;
  };

  const run = (state: GameState, cue: Cue) => {
    if (cue.kind === 'block') {
      // A new block is the one time an extra reward shows. The flash and
      // sound always play; the reward waits if one is already out.
      const rewardOut = state.coinbases.some((coin) => coin.reward);
      hooks.dropBlock(rewardOut ? null : cue.fee);
      return;
    }
    if (cue.kind === 'coin') {
      // Not a new coin: the board's one coin moves in front of a chain.
      const who = cue.who ?? (feedNext = feedNext === 0 ? 1 : 0);
      // Long enough to make the point. More only drains the other side.
      if (snakeOf(state, who).body.length >= FEED_CAP) return;
      feedAhead(state, who, cue.who !== undefined);
      return;
    }
    const longest: Seat = state.p1.body.length >= state.p2.body.length ? 0 : 1;
    if (cue.kind === 'cut') {
      const attacker = cue.attacker === 'longest' ? longest : cue.attacker;
      const victim: Seat = attacker === 0 ? 1 : 0;
      if (!startCut(state, attacker)) {
        take(state, attacker, { kind: 'stalk', left: STALK_STEPS });
        hooks.note(
          `Tour · ${attacker === 0 ? 'White' : 'Black'} hunts ${victim === 0 ? 'White' : 'Black'}`
        );
      }
      return;
    }
    if (cue.kind === 'head-on') {
      take(state, 0, { kind: 'chase', left: STEER_STEPS });
      take(state, 1, { kind: 'chase', left: STEER_STEPS });
      hooks.note('Tour · chains turn on each other');
      return;
    }
    const who: Seat =
      cue.who === 'longest'
        ? longest
        : cue.who === 'shortest'
          ? longest === 0
            ? 1
            : 0
          : cue.who;
    // That chain is already on a scripted run.
    if (steering.has(who)) return;
    take(state, who, { kind: 'wall', dir: null, left: STEER_STEPS });
    hooks.note(`Tour · ${who === 0 ? 'White' : 'Black'} heads for the wall`);
  };

  return {
    /** Fires due cues and points steered chains before the engine steps. */
    beforeStep(state: GameState, elapsedMs: number): void {
      // Blocks and coins fire on time. Steering cues wait for the last one to finish.
      while (pending.length > 0 && pending[0]!.at <= elapsedMs) {
        const cue = pending[0]!;
        // Pairs (cut, head-on) need both chains free. A wall crash only needs
        // its own chain free, so the two chains can crash back to back.
        const pair = cue.kind === 'head-on' || cue.kind === 'cut';
        if (pair && steering.size > 0) break;
        if (
          cue.kind === 'crash' &&
          [...steering.values()].some((s) => s.kind !== 'wall')
        )
          break;
        // A reorg needs a long chain. Wait for it, up to the cue's deadline.
        if (
          cue.kind === 'crash' &&
          cue.minLength !== undefined &&
          typeof cue.who === 'number' &&
          snakeOf(state, cue.who).body.length < cue.minLength &&
          elapsedMs < (cue.latest ?? cue.at)
        )
          break;
        run(state, pending.shift()!);
      }
      if (
        tour.capLength &&
        steering.size === 0 &&
        Math.max(state.p1.body.length, state.p2.body.length) >= tour.capLength
      ) {
        run(state, { at: elapsedMs, kind: 'crash', who: 'longest' });
      }
      for (const [who, steer] of steering) {
        if (steer.kind === 'wall') {
          steer.dir ??= nearestWall(state, who);
          steerTo(state, who, steer.dir);
        } else if (steer.kind === 'chase') {
          steerTo(state, who, chaseDir(state, who));
        } else if (steer.kind === 'stalk') {
          if (startCut(state, who)) continue;
          const victim: Seat = who === 0 ? 1 : 0;
          const prey = snakeOf(state, victim);
          steerTo(
            state,
            who,
            cutDir(state, who, aheadOf(state, victim, 6), prey.dir)
          );
        } else if (steer.kind === 'cut') {
          const head = snakeOf(state, who).head;
          if (head[0] === steer.target[0] && head[1] === steer.target[1]) {
            // On the line: keep crossing so the body lies across it.
            const dir = snakeOf(state, who).dir;
            if (dir !== '') steer.across = dir;
          }
          if (steer.across) steerTo(state, who, steer.across);
          else {
            const prey = snakeOf(state, who === 0 ? 1 : 0);
            steerTo(state, who, cutDir(state, who, steer.target, prey.dir));
          }
        }
        // 'hold' sends nothing: a human chain with no input keeps its line.
      }
    },
    /** Hands chains back to the bot once they reset, or after a while. */
    afterStep(state: GameState): void {
      keepOneReward(state);
      if (tour.keepPot && !state.gameEnded) easePot(state);
      const reset: Record<Seat, boolean> = {
        0: state.resetCueP1 === true,
        1: state.resetCueP2 === true,
      };
      const anyReset = reset[0] || reset[1];
      for (const [who, steer] of [...steering]) {
        steer.left -= 1;
        // Pairs (head-on, cut) end together as soon as either chain resets.
        const paired = steer.kind !== 'wall' && steer.kind !== 'stalk';
        const done = paired ? anyReset : reset[who];
        if (done || steer.left <= 0) release(state, who);
      }
    },
  };
}
