/** Keyboard / gamepad focus model for Practice hub (/practice). */

export type MatchFormat = 'solo' | 'ffa';
export type OpponentChoice = 'humans' | 'ai';

export type PracticeNavFocus =
  | { kind: 'format'; idx: 0 | 1 }
  | { kind: 'slot'; idx: 0 | 1 | 2 | 3 }
  | { kind: 'opponent'; idx: 0 | 1 }
  | { kind: 'tier'; idx: 0 | 1 | 2 | 3 }
  | { kind: 'rulePowerup' }
  | { kind: 'start' }
  | { kind: 'back' };

export function navFocusEqual(a: PracticeNavFocus, b: PracticeNavFocus): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'format' && b.kind === 'format') return a.idx === b.idx;
  if (a.kind === 'slot' && b.kind === 'slot') return a.idx === b.idx;
  if (a.kind === 'opponent' && b.kind === 'opponent') return a.idx === b.idx;
  if (a.kind === 'tier' && b.kind === 'tier') return a.idx === b.idx;
  return true;
}

type NavContext = {
  showTeamControl: boolean;
  show1v1Opponent: boolean;
  opponent: OpponentChoice;
  allFourHuman: boolean;
};

function clampCol(idx: number, cols: number): number {
  return Math.min(Math.max(idx, 0), cols - 1);
}

function hasTierRow(ctx: NavContext): boolean {
  return (
    (ctx.show1v1Opponent && ctx.opponent === 'ai') ||
    (ctx.showTeamControl && !ctx.allFourHuman)
  );
}

function rowAboveRulePowerup(ctx: NavContext): PracticeNavFocus {
  if (hasTierRow(ctx)) {
    return { kind: 'tier', idx: 0 };
  }
  if (ctx.show1v1Opponent) {
    return { kind: 'opponent', idx: 0 };
  }
  if (ctx.showTeamControl) {
    return { kind: 'slot', idx: 0 };
  }
  return { kind: 'format', idx: 0 };
}

function verticalStep(
  f: PracticeNavFocus,
  direction: 'up' | 'down',
  ctx: NavContext
): PracticeNavFocus | null {
  const down = direction === 'down';

  switch (f.kind) {
    case 'format': {
      if (down) {
        if (ctx.show1v1Opponent) {
          return { kind: 'opponent', idx: clampCol(f.idx, 2) as 0 | 1 };
        }
        if (ctx.showTeamControl) {
          return { kind: 'slot', idx: clampCol(f.idx, 4) as 0 | 1 | 2 | 3 };
        }
        return { kind: 'rulePowerup' };
      }
      return null;
    }
    case 'opponent': {
      if (down) {
        if (ctx.opponent === 'ai') {
          return { kind: 'tier', idx: clampCol(f.idx, 4) as 0 | 1 | 2 | 3 };
        }
        return { kind: 'rulePowerup' };
      }
      return { kind: 'format', idx: clampCol(f.idx, 2) as 0 | 1 };
    }
    case 'slot': {
      if (down) {
        if (!ctx.allFourHuman) {
          return { kind: 'tier', idx: clampCol(f.idx, 4) as 0 | 1 | 2 | 3 };
        }
        return { kind: 'rulePowerup' };
      }
      return { kind: 'format', idx: clampCol(f.idx, 2) as 0 | 1 };
    }
    case 'tier': {
      if (down) return { kind: 'rulePowerup' };
      if (ctx.show1v1Opponent) {
        return { kind: 'opponent', idx: clampCol(f.idx, 2) as 0 | 1 };
      }
      return { kind: 'slot', idx: clampCol(f.idx, 4) as 0 | 1 | 2 | 3 };
    }
    case 'rulePowerup': {
      if (down) return null;
      return rowAboveRulePowerup(ctx);
    }
    case 'start':
    case 'back':
      return null;
    default:
      return null;
  }
}

export function buildPracticeHubFlatNav(
  showTeamControl: boolean,
  show1v1Opponent: boolean,
  opponent: OpponentChoice,
  allFourHuman: boolean
): PracticeNavFocus[] {
  const list: PracticeNavFocus[] = [
    { kind: 'format', idx: 0 },
    { kind: 'format', idx: 1 },
  ];
  if (showTeamControl) {
    for (let i = 0; i < 4; i++) {
      list.push({ kind: 'slot', idx: i as 0 | 1 | 2 | 3 });
    }
  }
  if (show1v1Opponent) {
    list.push({ kind: 'opponent', idx: 0 }, { kind: 'opponent', idx: 1 });
    if (opponent === 'ai') {
      for (let i = 0; i < 4; i++) {
        list.push({ kind: 'tier', idx: i as 0 | 1 | 2 | 3 });
      }
    }
  } else if (showTeamControl && !allFourHuman) {
    for (let i = 0; i < 4; i++) {
      list.push({ kind: 'tier', idx: i as 0 | 1 | 2 | 3 });
    }
  }
  list.push({ kind: 'rulePowerup' }, { kind: 'start' }, { kind: 'back' });
  return list;
}

export function advancePracticeHubFlatNav(
  f: PracticeNavFocus,
  delta: 1 | -1,
  showTeamControl: boolean,
  show1v1Opponent: boolean,
  opponent: OpponentChoice,
  allFourHuman: boolean
): PracticeNavFocus {
  const flat = buildPracticeHubFlatNav(
    showTeamControl,
    show1v1Opponent,
    opponent,
    allFourHuman
  );
  const i = flat.findIndex((x) => navFocusEqual(x, f));
  if (i < 0) return flat[0] ?? f;
  const next = (i + delta + flat.length) % flat.length;
  return flat[next] ?? f;
}

function horizontalStep(
  f: PracticeNavFocus,
  dir: 'left' | 'right'
): PracticeNavFocus | null {
  const left = dir === 'left';
  const horiz = (n: number, mod: number) =>
    (((n + (left ? -1 : 1)) % mod) + mod) % mod;
  switch (f.kind) {
    case 'format':
      return { kind: 'format', idx: horiz(f.idx, 2) as 0 | 1 };
    case 'slot':
      return { kind: 'slot', idx: horiz(f.idx, 4) as 0 | 1 | 2 | 3 };
    case 'opponent':
      return { kind: 'opponent', idx: horiz(f.idx, 2) as 0 | 1 };
    case 'tier':
      return { kind: 'tier', idx: horiz(f.idx, 4) as 0 | 1 | 2 | 3 };
    case 'start':
    case 'back':
      return null;
    default:
      return null;
  }
}

export function movePracticeHubNav(
  f: PracticeNavFocus,
  direction: 'up' | 'down' | 'left' | 'right',
  showTeamControl: boolean,
  show1v1Opponent: boolean,
  opponent: OpponentChoice,
  allFourHuman: boolean
): PracticeNavFocus {
  const ctx: NavContext = {
    showTeamControl,
    show1v1Opponent,
    opponent,
    allFourHuman,
  };

  if (direction === 'up' || direction === 'down') {
    const next = verticalStep(f, direction, ctx);
    return next ?? f;
  }

  const h = horizontalStep(f, direction);
  if (h) return h;
  return f;
}

export function normalizePracticeNavFocus(
  f: PracticeNavFocus,
  showTeamControl: boolean,
  show1v1Opponent: boolean,
  opponent: OpponentChoice,
  allFourHuman: boolean
): PracticeNavFocus {
  const flat = buildPracticeHubFlatNav(
    showTeamControl,
    show1v1Opponent,
    opponent,
    allFourHuman
  );
  if (f.kind === 'start' || f.kind === 'back') {
    return { kind: 'rulePowerup' };
  }
  if (flat.some((x) => navFocusEqual(x, f))) return f;
  return flat[0] ?? { kind: 'format', idx: 0 };
}
