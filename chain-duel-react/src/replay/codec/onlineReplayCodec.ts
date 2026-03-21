/**
 * Compact replay codec (decode + encode; no Node/zlib).
 * **Keep in sync** with `marspayTS/src/state/onlineReplayCodec.ts` — server packs replays, client expands them.
 */
import type {
  Coinbase,
  Direction,
  GameState,
  HudState,
  PlayerId,
  PointChange,
} from '@/game/engine/types';
import type { OnlineRoomSnapshot } from '@/types/socket';

export const COMPACT_REPLAY_FORMAT = 'compact-v2' as const;

type OnlinePhase = OnlineRoomSnapshot['phase'];

const PHASE_LIST: OnlinePhase[] = ['lobby', 'playing', 'postgame', 'finished', 'cancelled'];

const DIR_LIST: Direction[] = ['', 'Up', 'Down', 'Left', 'Right'];

const CAPTURE_LEVELS = [
  { minLength: 1, maxLength: 1, percent: 2 },
  { minLength: 2, maxLength: 3, percent: 4 },
  { minLength: 4, maxLength: 6, percent: 8 },
  { minLength: 7, maxLength: 10, percent: 16 },
  { minLength: 11, maxLength: Number.POSITIVE_INFINITY, percent: 32 },
] as const;

function capturePercentByLength(length: number): number {
  for (const level of CAPTURE_LEVELS) {
    if (length >= level.minLength && length <= level.maxLength) {
      return level.percent;
    }
  }
  return 2;
}

function captureLabelForLength(length: number): string {
  return `${capturePercentByLength(length)}%`;
}

function hudFromState(state: GameState): HudState {
  const initialWidthP1 = (state.initialScore[0] * 100) / state.totalPoints;
  const initialWidthP2 = (state.initialScore[1] * 100) / state.totalPoints;
  const currentWidthP1 = (state.score[0] * 100) / state.totalPoints;
  const currentWidthP2 = (state.score[1] * 100) / state.totalPoints;
  return {
    p1Points: state.score[0],
    p2Points: state.score[1],
    captureP1: captureLabelForLength(state.p1.body.length),
    captureP2: captureLabelForLength(state.p2.body.length),
    initialWidthP1,
    initialWidthP2,
    currentWidthP1,
    currentWidthP2,
  };
}

function dirToNum(d: Direction): number {
  const i = DIR_LIST.indexOf(d);
  return i >= 0 ? i : 0;
}

function numToDir(n: number): Direction {
  return DIR_LIST[n] ?? '';
}

function flattenBody(body: [number, number][]): number[] {
  const out: number[] = [];
  for (const [x, y] of body) {
    out.push(x, y);
  }
  return out;
}

function unflattenBody(flat: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    out.push([flat[i]!, flat[i + 1]!]);
  }
  return out;
}

export interface CompactReplayHeader {
  cols: number;
  rows: number;
  p1Name: string;
  p2Name: string;
  initialScore: [number, number];
  meta: GameState['meta'];
}

export interface EncodedFrame {
  t: number;
  p: number;
  p1: { h: [number, number]; b: number[]; d: number; w: number };
  p2: { h: [number, number]; b: number[]; d: number; w: number };
  cb: Array<[number, number] | [number, number, number]>;
  f: number;
  ct: number;
  wp: 0 | 1 | 2;
  wn: string;
  sc: [number, number];
  tp: number;
  pc: Array<{
    p: 1 | 2;
    v: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    o1: number;
    o2: number;
    a: number;
  }>;
}

function packFlags(st: GameState): number {
  let f = 0;
  if (st.gameStarted) {
    f |= 1;
  }
  if (st.gameEnded) {
    f |= 2;
  }
  if (st.countdownStart) {
    f |= 4;
  }
  if (st.sentWinner) {
    f |= 8;
  }
  return f;
}

function applyFlags(f: number, st: GameState): void {
  st.gameStarted = (f & 1) !== 0;
  st.gameEnded = (f & 2) !== 0;
  st.countdownStart = (f & 4) !== 0;
  st.sentWinner = (f & 8) !== 0;
}

function winnerToNum(w: PlayerId | null): 0 | 1 | 2 {
  if (w === null) {
    return 0;
  }
  return w === 'P1' ? 1 : 2;
}

function numToWinner(n: 0 | 1 | 2): PlayerId | null {
  if (n === 0) {
    return null;
  }
  return n === 1 ? 'P1' : 'P2';
}

function encodeCoinbases(cbs: Coinbase[]): EncodedFrame['cb'] {
  return cbs.map((cb) => {
    if (cb.reward != null) {
      return [cb.pos[0], cb.pos[1], cb.reward] as [number, number, number];
    }
    return [cb.pos[0], cb.pos[1]] as [number, number];
  });
}

function decodeCoinbases(cb: EncodedFrame['cb']): Coinbase[] {
  return cb.map((row) => {
    if (row.length === 3) {
      return { pos: [row[0], row[1]], reward: row[2] as Coinbase['reward'] };
    }
    return { pos: [row[0], row[1]] };
  });
}

function encodePointChanges(pc: PointChange[]): EncodedFrame['pc'] {
  return pc.map((c) => ({
    p: c.player === 'P1' ? (1 as const) : (2 as const),
    v: c.value,
    x1: c.p1Pos[0],
    y1: c.p1Pos[1],
    x2: c.p2Pos[0],
    y2: c.p2Pos[1],
    o1: c.p1YOffsetPx,
    o2: c.p2YOffsetPx,
    a: c.alpha,
  }));
}

function decodePointChanges(pc: EncodedFrame['pc']): PointChange[] {
  return pc.map((c) => ({
    player: c.p === 1 ? 'P1' : 'P2',
    value: c.v,
    p1Pos: [c.x1, c.y1],
    p2Pos: [c.x2, c.y2],
    p1YOffsetPx: c.o1,
    p2YOffsetPx: c.o2,
    alpha: c.a,
  }));
}

function encodeFrame(snap: OnlineRoomSnapshot): EncodedFrame {
  const st = snap.state as GameState;
  const ph = PHASE_LIST.indexOf(snap.phase);
  return {
    t: snap.tick,
    p: ph >= 0 ? ph : 0,
    p1: {
      h: [st.p1.head[0], st.p1.head[1]],
      b: flattenBody(st.p1.body),
      d: dirToNum(st.p1.dir),
      w: dirToNum(st.p1.dirWanted),
    },
    p2: {
      h: [st.p2.head[0], st.p2.head[1]],
      b: flattenBody(st.p2.body),
      d: dirToNum(st.p2.dir),
      w: dirToNum(st.p2.dirWanted),
    },
    cb: encodeCoinbases(st.coinbases),
    f: packFlags(st),
    ct: st.countdownTicks,
    wp: winnerToNum(st.winnerPlayer),
    wn: st.winnerName,
    sc: [st.score[0], st.score[1]],
    tp: st.totalPoints,
    pc: encodePointChanges(st.pointChanges),
  };
}

function buildState(ef: EncodedFrame, header: CompactReplayHeader): GameState {
  const p1Body = unflattenBody(ef.p1.b);
  const p2Body = unflattenBody(ef.p2.b);
  const st: GameState = {
    cols: header.cols,
    rows: header.rows,
    p1: {
      head: [ef.p1.h[0], ef.p1.h[1]],
      body: p1Body,
      dir: numToDir(ef.p1.d),
      dirWanted: numToDir(ef.p1.w),
    },
    p2: {
      head: [ef.p2.h[0], ef.p2.h[1]],
      body: p2Body,
      dir: numToDir(ef.p2.d),
      dirWanted: numToDir(ef.p2.w),
    },
    coinbases: decodeCoinbases(ef.cb),
    gameStarted: false,
    gameEnded: false,
    countdownStart: false,
    sentWinner: false,
    countdownTicks: ef.ct,
    winnerPlayer: numToWinner(ef.wp),
    winnerName: ef.wn,
    score: [ef.sc[0], ef.sc[1]],
    totalPoints: ef.tp,
    pointChanges: decodePointChanges(ef.pc),
    p1Name: header.p1Name,
    p2Name: header.p2Name,
    meta: header.meta,
    initialScore: [header.initialScore[0], header.initialScore[1]],
    currentCaptureP1: captureLabelForLength(p1Body.length),
    currentCaptureP2: captureLabelForLength(p2Body.length),
  };
  applyFlags(ef.f, st);
  return st;
}

function decodeFrame(ef: EncodedFrame, header: CompactReplayHeader): OnlineRoomSnapshot {
  const state = buildState(ef, header);
  const hud = hudFromState(state);
  return {
    tick: ef.t,
    phase: PHASE_LIST[ef.p] ?? 'lobby',
    state,
    hud,
  };
}

function headerFromFirstFrame(first: OnlineRoomSnapshot): CompactReplayHeader {
  const st = first.state as GameState;
  return {
    cols: st.cols,
    rows: st.rows,
    p1Name: st.p1Name,
    p2Name: st.p2Name,
    initialScore: [st.initialScore[0], st.initialScore[1]],
    meta: { ...st.meta },
  };
}

/** Build inner JSON before gzip (server) or after gunzip (client). */
export function encodeFramesToInnerJson(
  frames: OnlineRoomSnapshot[]
): { h: CompactReplayHeader; f: EncodedFrame[] } {
  if (frames.length === 0) {
    throw new Error('encodeFramesToInnerJson: empty frames');
  }
  const header = headerFromFirstFrame(frames[0]!);
  const f = frames.map(encodeFrame);
  return { h: header, f };
}

/** Expand inner JSON to full snapshots (same shape as live play). */
export function decodeInnerJsonToFrames(data: {
  h: CompactReplayHeader;
  f: EncodedFrame[];
}): OnlineRoomSnapshot[] {
  if (!data?.h || !Array.isArray(data.f)) {
    throw new Error('decodeInnerJsonToFrames: invalid payload');
  }
  return data.f.map((ef) => decodeFrame(ef, data.h));
}
