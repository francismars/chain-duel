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

export function movePracticeHubFooter(
  which: 'back' | 'start',
  direction: 'left' | 'right' | 'up' | 'down'
): 'back' | 'start' | 'panel' {
  if (direction === 'up') return 'panel';
  if (direction === 'left') return 'back';
  if (direction === 'right') return 'start';
  if (which === 'back' && (direction === 'down' || direction === 'right')) return 'start';
  if (which === 'start' && (direction === 'down' || direction === 'left')) return 'back';
  return which;
}
