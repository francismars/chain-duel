export type ChallengeId =
  | 'normie'
  | 'stacker'
  | 'noderunner'
  | 'gauntlet'
  | 'ffa'
  | 'sovereign-stack';

export type ChallengeRank = 1 | 2 | 3 | 4 | 5 | 6;

export type ChallengeTheme = {
  rank: ChallengeRank;
  accent: [number, number, number];
  accentStrong: [number, number, number];
  rowFill: number;
};

const CHALLENGE_RANK: Record<ChallengeId, ChallengeRank> = {
  normie: 1,
  stacker: 2,
  noderunner: 3,
  ffa: 4,
  gauntlet: 5,
  'sovereign-stack': 6,
};

/** Matches solo challenge row accent progression in practice-hub-page.css */
const CHALLENGE_THEMES: Record<ChallengeRank, Omit<ChallengeTheme, 'rank'>> = {
  1: {
    accent: [155, 89, 182],
    accentStrong: [193, 126, 230],
    rowFill: 0.022,
  },
  2: {
    accent: [175, 122, 197],
    accentStrong: [200, 145, 215],
    rowFill: 0.042,
  },
  3: {
    accent: [195, 155, 212],
    accentStrong: [215, 175, 225],
    rowFill: 0.062,
  },
  4: {
    accent: [215, 188, 227],
    accentStrong: [228, 205, 235],
    rowFill: 0.082,
  },
  5: {
    accent: [235, 221, 242],
    accentStrong: [245, 238, 248],
    rowFill: 0.102,
  },
  6: {
    accent: [255, 255, 255],
    accentStrong: [255, 255, 255],
    rowFill: 0.125,
  },
};

const DEFAULT_THEME: ChallengeTheme = {
  rank: 6,
  ...CHALLENGE_THEMES[6],
};

export function getChallengeTheme(challengeId?: string): ChallengeTheme {
  if (!challengeId || !(challengeId in CHALLENGE_RANK)) {
    return DEFAULT_THEME;
  }
  const rank = CHALLENGE_RANK[challengeId as ChallengeId];
  return { rank, ...CHALLENGE_THEMES[rank] };
}

export function challengeThemeStyle(
  theme: ChallengeTheme
): Record<string, string> {
  return {
    '--solo-accent': theme.accent.join(', '),
    '--solo-accent-strong': theme.accentStrong.join(', '),
    '--solo-row-fill': String(theme.rowFill),
  };
}
