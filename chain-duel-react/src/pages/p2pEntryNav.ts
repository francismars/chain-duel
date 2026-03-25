/** Keyboard / gamepad focus model for P2P paid entry (matches useGamepad: pad1 = WASD+Space, pad2 = arrows+Enter). */

export const BUYIN_STEP_COUNT = 10;
/** Buy-in grid: 5 columns × 2 rows */
const BUYIN_COLS = 5;

function buyinRow(idx: number) {
  return Math.floor(idx / BUYIN_COLS); // 0 or 1
}
function buyinCol(idx: number) {
  return idx % BUYIN_COLS; // 0-4
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
  return { kind: 'session', idx: 1 };
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

function sessionIdxUpFromPlayers(playerIdx: 0 | 1 | 2): 0 | 1 {
  if (playerIdx === 0) return 0;
  return 1;
}

function playerIdxDownFromSession(sessionIdx: 0 | 1): 0 | 1 | 2 {
  if (sessionIdx === 0) return 0;
  return 2;
}

export function moveNavFocus(
  f: P2pNavFocus,
  direction: 'up' | 'down' | 'left' | 'right',
  tournament: boolean,
  /** Column for the active session choice (duel = 0, tournament = 1) — used when moving up from Start in duel mode. */
  sessionNavIdx: 0 | 1
): P2pNavFocus {
  const lastPill = BUYIN_STEP_COUNT - 1;

  switch (direction) {
    case 'up': {
      switch (f.kind) {
        case 'payment':
          return { kind: 'back' };
        case 'session':
          return { kind: 'payment', idx: f.idx };
        case 'players':
          return { kind: 'session', idx: sessionIdxUpFromPlayers(f.idx) };
        case 'buyinPill':
          // Row 1 → row 0 (same column)
          if (buyinRow(f.idx) === 1) {
            return { kind: 'buyinPill', idx: f.idx - BUYIN_COLS };
          }
          // Row 0 → players (exit hub upward)
          return { kind: 'players', idx: 2 };
        case 'start':
          if (!tournament) {
            return { kind: 'session', idx: sessionNavIdx };
          }
          return { kind: 'buyinPill', idx: lastPill };
        case 'back':
          return { kind: 'start' };
        default:
          return f;
      }
    }
    case 'down': {
      switch (f.kind) {
        case 'back':
          return { kind: 'payment', idx: 0 };
        case 'payment':
          return { kind: 'session', idx: f.idx };
        case 'session':
          if (!tournament) {
            return { kind: 'start' };
          }
          return { kind: 'players', idx: playerIdxDownFromSession(f.idx) };
        case 'players':
          // Move down within players column, or drop into buy-in on last card
          if (f.idx < 2) {
            return { kind: 'players', idx: (f.idx + 1) as 1 | 2 };
          }
          return { kind: 'buyinPill', idx: 0 };
        case 'buyinPill':
          // Row 0 → row 1 (same column)
          if (buyinRow(f.idx) === 0) {
            return { kind: 'buyinPill', idx: f.idx + BUYIN_COLS };
          }
          // Row 1 → start (exit hub downward)
          return { kind: 'start' };
        case 'start':
          return { kind: 'back' };
        default:
          return f;
      }
    }
    case 'left': {
      switch (f.kind) {
        case 'payment':
          return { kind: 'payment', idx: f.idx === 0 ? 1 : 0 };
        case 'session':
          return { kind: 'session', idx: f.idx === 0 ? 1 : 0 };
        case 'players':
          // Wrap within players column
          return { kind: 'players', idx: ((f.idx + 2) % 3) as 0 | 1 | 2 };
        case 'buyinPill':
          // Cross to players column when at left edge of buy-in grid
          if (buyinCol(f.idx) === 0) {
            return { kind: 'players', idx: buyinRow(f.idx) === 0 ? 0 : 2 };
          }
          return { kind: 'buyinPill', idx: f.idx - 1 };
        case 'start':
          if (!tournament) {
            return { kind: 'session', idx: 1 };
          }
          return { kind: 'buyinPill', idx: lastPill };
        case 'back':
          return { kind: 'start' };
        default:
          return f;
      }
    }
    case 'right': {
      switch (f.kind) {
        case 'payment':
          return { kind: 'payment', idx: f.idx === 0 ? 1 : 0 };
        case 'session':
          return { kind: 'session', idx: f.idx === 0 ? 1 : 0 };
        case 'players':
          // Cross to buy-in column
          if (!tournament) return { kind: 'players', idx: ((f.idx + 1) % 3) as 0 | 1 | 2 };
          return { kind: 'buyinPill', idx: f.idx < 2 ? 0 : BUYIN_COLS };
        case 'buyinPill':
          if (f.idx < lastPill) {
            return { kind: 'buyinPill', idx: f.idx + 1 };
          }
          return { kind: 'start' };
        case 'start':
          return { kind: 'back' };
        case 'back':
          return { kind: 'payment', idx: 0 };
        default:
          return f;
      }
    }
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
