/** Top-level play style on Practice hub (Free play vs Challenges). */

export type PracticePlayStyle = 'free' | 'challenges';

export type PracticeHubPlayStyleFocus = { kind: 'playStyle'; idx: 0 | 1 };

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

export function movePlayStyleNav(
  idx: 0 | 1,
  direction: 'left' | 'right' | 'up' | 'down'
): 0 | 1 {
  if (direction === 'left' || direction === 'up') return idx === 0 ? 1 : 0;
  if (direction === 'right' || direction === 'down') return idx === 0 ? 1 : 0;
  return idx;
}
