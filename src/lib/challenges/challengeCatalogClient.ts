import type { ChallengeIconId } from '@/features/practice/ChallengeRowIcon';

/** Client display copy — not overwritten by server catalog name fields. */
export const CHALLENGE_CLIENT_NAMES: Record<ChallengeIconId, string> = {
  normie: 'NORMIE DUEL',
  stacker: 'STACKER TRIAL',
  noderunner: 'NODE RUNNER',
  ffa: 'FFA RUMBLE',
  gauntlet: 'SOVEREIGN GAUNTLET',
  'sovereign-stack': 'TEAM SOVEREIGN',
};

export const CHALLENGE_CLIENT_TAGLINES: Record<ChallengeIconId, string> = {
  normie: 'BigToshi on easy mode',
  stacker: 'Cut the rusher off',
  noderunner: 'Best coin wins',
  ffa: 'Four bots. No free lunch.',
  gauntlet: 'Farm first. Cut second.',
  'sovereign-stack': 'Two chains. One bite.',
};

export const CHALLENGE_CLIENT_RANK: Record<ChallengeIconId, number> = {
  normie: 1,
  stacker: 2,
  noderunner: 3,
  ffa: 4,
  gauntlet: 5,
  'sovereign-stack': 6,
};

export function getChallengeClientName(id: string): string | undefined {
  if (!(id in CHALLENGE_CLIENT_NAMES)) return undefined;
  return CHALLENGE_CLIENT_NAMES[id as ChallengeIconId];
}
