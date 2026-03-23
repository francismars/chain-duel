/** Keyboard / gamepad focus model for Testnet paid entry (matches useGamepad: pad1 = WASD+Space, pad2 = arrows+Enter). */

export const BUYIN_STEP_COUNT = 10;

export type TestnetNavFocus =
  | { kind: 'payment'; idx: 0 | 1 }
  | { kind: 'session'; idx: 0 | 1 }
  | { kind: 'players'; idx: 0 | 1 | 2 }
  | { kind: 'buyinPrev' }
  | { kind: 'buyinPill'; idx: number }
  | { kind: 'buyinNext' }
  | { kind: 'start' }
  | { kind: 'back' };

export function isBracketNavFocus(f: TestnetNavFocus): boolean {
  return (
    f.kind === 'players' ||
    f.kind === 'buyinPrev' ||
    f.kind === 'buyinPill' ||
    f.kind === 'buyinNext'
  );
}

export function navFocusEqual(a: TestnetNavFocus, b: TestnetNavFocus): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'payment' && b.kind === 'payment') return a.idx === b.idx;
  if (a.kind === 'session' && b.kind === 'session') return a.idx === b.idx;
  if (a.kind === 'players' && b.kind === 'players') return a.idx === b.idx;
  if (a.kind === 'buyinPill' && b.kind === 'buyinPill') return a.idx === b.idx;
  return true;
}

export function normalizeNavFocusForSession(
  f: TestnetNavFocus,
  tournament: boolean
): TestnetNavFocus {
  if (tournament || !isBracketNavFocus(f)) return f;
  return { kind: 'session', idx: 1 };
}

export function buildFlatNavOrder(tournament: boolean): TestnetNavFocus[] {
  const list: TestnetNavFocus[] = [
    { kind: 'payment', idx: 0 },
    { kind: 'payment', idx: 1 },
    { kind: 'session', idx: 0 },
    { kind: 'session', idx: 1 },
  ];
  if (tournament) {
    list.push(
      { kind: 'players', idx: 0 },
      { kind: 'players', idx: 1 },
      { kind: 'players', idx: 2 },
      { kind: 'buyinPrev' }
    );
    for (let i = 0; i < BUYIN_STEP_COUNT; i++) {
      list.push({ kind: 'buyinPill', idx: i });
    }
    list.push({ kind: 'buyinNext' });
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
  f: TestnetNavFocus,
  direction: 'up' | 'down' | 'left' | 'right',
  tournament: boolean,
  /** Column for the active session choice (duel = 0, tournament = 1) — used when moving up from Start in duel mode. */
  sessionNavIdx: 0 | 1
): TestnetNavFocus {
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
        case 'buyinPrev':
        case 'buyinPill':
          return { kind: 'players', idx: 2 };
        case 'buyinNext':
          return { kind: 'buyinPill', idx: lastPill };
        case 'start':
          if (!tournament) {
            return { kind: 'session', idx: sessionNavIdx };
          }
          return { kind: 'buyinNext' };
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
          return { kind: 'buyinPrev' };
        case 'buyinPrev':
          return { kind: 'buyinPill', idx: 0 };
        case 'buyinPill':
        case 'buyinNext':
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
          return { kind: 'players', idx: ((f.idx + 2) % 3) as 0 | 1 | 2 };
        case 'buyinPrev':
          return { kind: 'players', idx: 2 };
        case 'buyinPill':
          if (f.idx > 0) {
            return { kind: 'buyinPill', idx: f.idx - 1 };
          }
          return { kind: 'buyinPrev' };
        case 'buyinNext':
          return { kind: 'buyinPill', idx: lastPill };
        case 'start':
          if (!tournament) {
            return { kind: 'session', idx: 1 };
          }
          return { kind: 'buyinNext' };
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
          return { kind: 'players', idx: ((f.idx + 1) % 3) as 0 | 1 | 2 };
        case 'buyinPrev':
          return { kind: 'buyinPill', idx: 0 };
        case 'buyinPill':
          if (f.idx < lastPill) {
            return { kind: 'buyinPill', idx: f.idx + 1 };
          }
          return { kind: 'buyinNext' };
        case 'buyinNext':
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
  f: TestnetNavFocus,
  delta: 1 | -1,
  tournament: boolean
): TestnetNavFocus {
  const flat = buildFlatNavOrder(tournament);
  const i = flat.findIndex((x) => navFocusEqual(x, f));
  if (i < 0) return flat[0] ?? f;
  const next = (i + delta + flat.length) % flat.length;
  return flat[next] ?? f;
}
