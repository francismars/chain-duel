/** Top-level play style on Practice hub (Free play vs Challenges). */

export type PracticePlayStyle = 'free' | 'challenges';

/** Keyboard focus zones on /practice (play style cards → panel → footer). */
export type PracticeHubFocus =
  | { zone: 'playStyle'; idx: 0 | 1 }
  | { zone: 'panel' }
  | { zone: 'footer'; which: 'back' | 'start' };

export function parsePlaySearchParam(raw: string | null): PracticePlayStyle {
  return raw === 'challenges' ? 'challenges' : 'free';
}

export function playStyleToSearchValue(style: PracticePlayStyle): string {
  return style === 'challenges' ? 'challenges' : 'free';
}

export function playStyleFromIdx(idx: 0 | 1): PracticePlayStyle {
  return idx === 1 ? 'challenges' : 'free';
}

export function playStyleToIdx(style: PracticePlayStyle): 0 | 1 {
  return style === 'challenges' ? 1 : 0;
}

/** Left = Free play (0), right = Challenges (1); no wrap. */
export function movePlayStyleNav(direction: 'left' | 'right'): 0 | 1 {
  return direction === 'left' ? 0 : 1;
}

/** Footer row: left = main menu, right = start; up = panel; down = no-op; no wrap. */
export function movePracticeHubFooter(
  direction: 'left' | 'right' | 'up' | 'down'
): 'back' | 'start' | 'panel' | null {
  if (direction === 'up') return 'panel';
  if (direction === 'down') return null;
  if (direction === 'left') return 'back';
  return 'start';
}
