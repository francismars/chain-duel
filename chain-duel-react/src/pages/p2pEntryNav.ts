/** Keyboard / gamepad focus model for P2P paid entry (matches useGamepad: pad1 = WASD+Space, pad2 = arrows+Enter). */

export const BUYIN_STEP_COUNT = 10;
/** Buy-in grid: 5 columns × 2 rows */
const BUYIN_COLS = 5;

function buyinRow(idx: number) {
  return Math.floor(idx / BUYIN_COLS);
}
function buyinCol(idx: number) {
  return idx % BUYIN_COLS;
}

function clampCol(idx: number, cols: number): number {
  return Math.min(Math.max(idx, 0), cols - 1);
}

export type P2pNavFocus =
  | { kind: 'payment'; idx: 0 | 1 }
  | { kind: 'session'; idx: 0 | 1 }
  | { kind: 'players'; idx: 0 | 1 | 2 }
  | { kind: 'buyinPill'; idx: number }
  | { kind: 'start' }
  | { kind: 'back' };

export function isBracketNavFocus(f: P2pNavFocus): boolean {
  return f.kind === 'players' || f.kind === 'buyinPill';
}

export function navFocusEqual(a: P2pNavFocus, b: P2pNavFocus): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'payment' && b.kind === 'payment') return a.idx === b.idx;
  if (a.kind === 'session' && b.kind === 'session') return a.idx === b.idx;
  if (a.kind === 'players' && b.kind === 'players') return a.idx === b.idx;
  if (a.kind === 'buyinPill' && b.kind === 'buyinPill') return a.idx === b.idx;
  return true;
}

export function normalizeNavFocusForSession(
  f: P2pNavFocus,
  tournament: boolean
): P2pNavFocus {
  if (tournament || !isBracketNavFocus(f)) return f;
  if (f.kind === 'start' || f.kind === 'back') {
    return { kind: 'session', idx: 0 };
  }
  return { kind: 'session', idx: 0 };
}

export function buildFlatNavOrder(tournament: boolean): P2pNavFocus[] {
  const list: P2pNavFocus[] = [
    { kind: 'payment', idx: 0 },
    { kind: 'payment', idx: 1 },
    { kind: 'session', idx: 0 },
    { kind: 'session', idx: 1 },
  ];
  if (tournament) {
    list.push(
      { kind: 'players', idx: 0 },
      { kind: 'players', idx: 1 },
      { kind: 'players', idx: 2 }
    );
    for (let i = 0; i < BUYIN_STEP_COUNT; i++) {
      list.push({ kind: 'buyinPill', idx: i });
    }
  }
  list.push({ kind: 'start' }, { kind: 'back' });
  return list;
}

function playerIdxDownFromSession(sessionIdx: 0 | 1): 0 | 1 | 2 {
  return sessionIdx === 0 ? 0 : 2;
}

function sessionIdxUpFromPlayers(playerIdx: 0 | 1 | 2): 0 | 1 {
  return playerIdx === 0 ? 0 : 1;
}

/** Footer: left = main menu, right = start; up leaves footer; down = no-op. */
function moveFooterFocus(
  direction: 'up' | 'down' | 'left' | 'right',
  tournament: boolean,
  sessionNavIdx: 0 | 1
): P2pNavFocus | null {
  const lastPill = BUYIN_STEP_COUNT - 1;

  if (direction === 'down') return null;
  if (direction === 'left') return { kind: 'back' };
  if (direction === 'right') return { kind: 'start' };

  if (!tournament) {
    return { kind: 'session', idx: sessionNavIdx };
  }
  return { kind: 'buyinPill', idx: lastPill };
}

export function moveNavFocus(
  f: P2pNavFocus,
  direction: 'up' | 'down' | 'left' | 'right',
  tournament: boolean,
  sessionNavIdx: 0 | 1
): P2pNavFocus {
  const next = moveNavFocusInner(f, direction, tournament, sessionNavIdx);
  return next ?? f;
}

function moveNavFocusInner(
  f: P2pNavFocus,
  direction: 'up' | 'down' | 'left' | 'right',
  tournament: boolean,
  sessionNavIdx: 0 | 1
): P2pNavFocus | null {
  switch (f.kind) {
    case 'payment': {
      if (direction === 'up') return null;
      if (direction === 'down') {
        return { kind: 'session', idx: clampCol(f.idx, 2) as 0 | 1 };
      }
      if (direction === 'left') return { kind: 'payment', idx: 0 };
      return { kind: 'payment', idx: 1 };
    }
    case 'session': {
      if (direction === 'up') {
        return { kind: 'payment', idx: f.idx };
      }
      if (direction === 'down') {
        if (!tournament) {
          return f.idx === 0 ? { kind: 'back' } : { kind: 'start' };
        }
        return {
          kind: 'players',
          idx: playerIdxDownFromSession(f.idx),
        };
      }
      if (direction === 'left') return { kind: 'session', idx: 0 };
      return { kind: 'session', idx: 1 };
    }
    case 'players': {
      if (direction === 'left') return null;
      if (direction === 'right') {
        return { kind: 'buyinPill', idx: f.idx < 2 ? 0 : BUYIN_COLS };
      }
      if (direction === 'up') {
        if (f.idx > 0) {
          return { kind: 'players', idx: (f.idx - 1) as 0 | 1 | 2 };
        }
        return { kind: 'session', idx: sessionIdxUpFromPlayers(f.idx) };
      }
      if (f.idx < 2) {
        return { kind: 'players', idx: (f.idx + 1) as 1 | 2 };
      }
      return { kind: 'buyinPill', idx: 0 };
    }
    case 'buyinPill': {
      if (direction === 'left') {
        if (buyinCol(f.idx) === 0) {
          return { kind: 'players', idx: buyinRow(f.idx) === 0 ? 0 : 2 };
        }
        return { kind: 'buyinPill', idx: f.idx - 1 };
      }
      if (direction === 'right') {
        if (buyinCol(f.idx) >= BUYIN_COLS - 1) {
          return { kind: 'start' };
        }
        return { kind: 'buyinPill', idx: f.idx + 1 };
      }
      if (direction === 'up') {
        if (buyinRow(f.idx) === 1) {
          return { kind: 'buyinPill', idx: f.idx - BUYIN_COLS };
        }
        return { kind: 'players', idx: 2 };
      }
      if (buyinRow(f.idx) === 0) {
        return { kind: 'buyinPill', idx: f.idx + BUYIN_COLS };
      }
      return { kind: 'start' };
    }
    case 'start':
    case 'back':
      return moveFooterFocus(direction, tournament, sessionNavIdx);
    default:
      return null;
  }
}

export function advanceFlatNav(
  f: P2pNavFocus,
  delta: 1 | -1,
  tournament: boolean
): P2pNavFocus {
  const flat = buildFlatNavOrder(tournament);
  const i = flat.findIndex((x) => navFocusEqual(x, f));
  if (i < 0) return flat[0] ?? f;
  const next = (i + delta + flat.length) % flat.length;
  return flat[next] ?? f;
}
