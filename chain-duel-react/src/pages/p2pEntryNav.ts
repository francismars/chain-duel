/** Keyboard / gamepad focus model for P2P paid entry (matches useGamepad: pad1 = WASD+Space, pad2 = arrows+Enter). */

export const BUYIN_STEP_COUNT = 10;
/** Buy-in grid: 5 columns × 2 rows */
const BUYIN_COLS = 5;
/** Players grid: 2 columns × 2 rows (32P slot is display-only). */
const PLAYER_COLS = 2;

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
  | { kind: 'none' }
  | { kind: 'payment'; idx: 0 | 1 }
  | { kind: 'session'; idx: 0 | 1 }
  | { kind: 'duelFormat' }
  | { kind: 'players'; idx: 0 | 1 | 2 }
  | { kind: 'buyinPill'; idx: number }
  | { kind: 'start' }
  | { kind: 'back' };

export function isBracketNavFocus(f: P2pNavFocus): boolean {
  return f.kind === 'players' || f.kind === 'buyinPill';
}

export function navFocusEqual(a: P2pNavFocus, b: P2pNavFocus): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'none' && b.kind === 'none') return true;
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
  if (f.kind === 'none') return f;
  if (tournament) {
    if (f.kind === 'duelFormat') return { kind: 'session', idx: 1 };
    return f;
  }
  if (!isBracketNavFocus(f)) return f;
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
  } else {
    list.push({ kind: 'duelFormat' });
  }
  list.push({ kind: 'start' }, { kind: 'back' });
  return list;
}

/** Nav index → 2×2 player grid (32P cell is not reachable). */
function playerGridPos(idx: 0 | 1 | 2): { row: 0 | 1; col: 0 | 1 } {
  if (idx === 2) return { row: 1, col: 0 };
  return { row: 0, col: idx };
}

function playerIdxAt(row: number, col: number): 0 | 1 | 2 | null {
  if (row === 0 && col === 0) return 0;
  if (row === 0 && col === 1) return 1;
  if (row === 1 && col === 0) return 2;
  return null;
}

function sessionIdxUpFromPlayers(playerIdx: 0 | 1 | 2): 0 | 1 {
  const { col } = playerGridPos(playerIdx);
  return col === 0 ? 0 : 1;
}

function playerIdxDownFromSession(sessionIdx: 0 | 1): 0 | 1 | 2 | 'buyin' {
  return sessionIdx === 0 ? 0 : 'buyin';
}

/** Footer: left = main menu, right = start; up leaves footer; down = no-op. */
function moveFooterFocus(
  direction: 'up' | 'down' | 'left' | 'right',
  tournament: boolean,
  _sessionNavIdx: 0 | 1
): P2pNavFocus | null {
  const lastPill = BUYIN_STEP_COUNT - 1;

  if (direction === 'down') return null;
  if (direction === 'left') return { kind: 'back' };
  if (direction === 'right') return { kind: 'start' };

  if (!tournament) {
    return { kind: 'duelFormat' };
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
    case 'none': {
      if (direction === 'left') return { kind: 'payment', idx: 0 };
      if (direction === 'right') return { kind: 'payment', idx: 1 };
      if (direction === 'down') return { kind: 'payment', idx: 0 };
      return null;
    }
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
          return { kind: 'duelFormat' };
        }
        const target = playerIdxDownFromSession(f.idx);
        if (target === 'buyin') {
          return { kind: 'buyinPill', idx: 0 };
        }
        return { kind: 'players', idx: target };
      }
      if (direction === 'left') return { kind: 'session', idx: 0 };
      return { kind: 'session', idx: 1 };
    }
    case 'duelFormat': {
      if (direction === 'up') {
        return { kind: 'session', idx: 0 };
      }
      if (direction === 'down') {
        return { kind: 'start' };
      }
      return null;
    }
    case 'players': {
      const { row, col } = playerGridPos(f.idx);

      if (direction === 'left') {
        if (col === 0) return null;
        const prev = playerIdxAt(row, col - 1);
        return prev === null ? null : { kind: 'players', idx: prev };
      }
      if (direction === 'right') {
        if (col < PLAYER_COLS - 1) {
          const next = playerIdxAt(row, col + 1);
          if (next !== null) {
            return { kind: 'players', idx: next };
          }
        }
        return { kind: 'buyinPill', idx: row * BUYIN_COLS };
      }
      if (direction === 'up') {
        if (row > 0) {
          const above = playerIdxAt(row - 1, col);
          if (above !== null) {
            return { kind: 'players', idx: above };
          }
        }
        return { kind: 'session', idx: sessionIdxUpFromPlayers(f.idx) };
      }
      if (row === 0) {
        const below = playerIdxAt(1, col);
        if (below !== null) {
          return { kind: 'players', idx: below };
        }
      }
      if (col > 0) {
        return { kind: 'buyinPill', idx: BUYIN_COLS + col };
      }
      return { kind: 'start' };
    }
    case 'buyinPill': {
      const row = buyinRow(f.idx);
      const col = buyinCol(f.idx);

      if (direction === 'left') {
        if (col === 0) {
          const playerIdx = playerIdxAt(row, 0);
          if (playerIdx !== null) {
            return { kind: 'players', idx: playerIdx };
          }
        }
        return { kind: 'buyinPill', idx: f.idx - 1 };
      }
      if (direction === 'right') {
        if (col >= BUYIN_COLS - 1) {
          return { kind: 'start' };
        }
        return { kind: 'buyinPill', idx: f.idx + 1 };
      }
      if (direction === 'up') {
        if (row === 1) {
          return { kind: 'buyinPill', idx: f.idx - BUYIN_COLS };
        }
        // Buy-in column sits under Tournament mode, not under Players.
        return { kind: 'session', idx: 1 };
      }
      if (row === 0) {
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
  if (f.kind === 'none') {
    return delta === 1 ? (flat[0] ?? f) : (flat[flat.length - 1] ?? f);
  }
  const i = flat.findIndex((x) => navFocusEqual(x, f));
  if (i < 0) return flat[0] ?? f;
  const next = (i + delta + flat.length) % flat.length;
  return flat[next] ?? f;
}
