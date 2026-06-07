import { ChallengeRowIcon, isChallengeIconId, type ChallengeIconId } from '@/features/practice/ChallengeRowIcon';
import { isPracticeChallengeConfig } from '@/pages/practiceHubModes';

export interface ChallengeHudInfo {
  id: ChallengeIconId;
  name: string;
  rank: number;
}

const CHALLENGE_RANK_BY_ID: Record<ChallengeIconId, number> = {
  normie: 1,
  stacker: 2,
  noderunner: 3,
  gauntlet: 4,
  ffa: 5,
  'sovereign-stack': 6,
};

export function readChallengeHudFromConfig(cfg: Record<string, unknown>): ChallengeHudInfo | null {
  if (!isPracticeChallengeConfig(cfg)) return null;
  const id = String(cfg.challengeId ?? '');
  if (!isChallengeIconId(id)) return null;
  const rankFromConfig = Number(cfg.challengeRank);
  return {
    id,
    name: String(cfg.soloChallengeName ?? 'CHALLENGE'),
    rank: Number.isFinite(rankFromConfig) && rankFromConfig >= 1 && rankFromConfig <= 6
      ? rankFromConfig
      : CHALLENGE_RANK_BY_ID[id],
  };
}

interface GameInfoLabelProps {
  gameInfo: string;
  challenge?: ChallengeHudInfo | null;
  className?: string;
  id?: string;
}

export function GameInfoLabel({ gameInfo, challenge, className = '', id }: GameInfoLabelProps) {
  const classes = ['outline', 'condensed', challenge ? 'gameInfo--challenge' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div id={id} className={classes} data-rank={challenge ? challenge.rank : undefined}>
      {challenge ? (
        <>
          <span className="gameInfo__icon" aria-hidden="true">
            <ChallengeRowIcon id={challenge.id} />
          </span>
          <span className="gameInfo__name">{challenge.name}</span>
        </>
      ) : (
        gameInfo
      )}
    </div>
  );
}
