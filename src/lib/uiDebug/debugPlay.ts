import {
  clearSocketDuelSessionMarker,
  GAME_CONFIG_STORAGE_KEY,
} from '@/pages/practiceHubModes';

export const DEBUG_PLAY_ORIGIN = 'debug-play';

export const DEBUG_PLAY_KINDS = [
  'p2p',
  'p2p-nostr',
  'tournament',
  'challenge',
] as const;

export type DebugPlayKind = (typeof DEBUG_PLAY_KINDS)[number];

export function isDebugPlayKind(value: string | undefined): value is DebugPlayKind {
  return (DEBUG_PLAY_KINDS as readonly string[]).includes(value ?? '');
}

export function isDebugPlayConfig(cfg: Record<string, unknown>): boolean {
  return cfg.sessionOrigin === DEBUG_PLAY_ORIGIN;
}

/** Local match that uses the real rules for a mode, without payment or a second client. */
export function saveDebugPlayConfig(kind: DebugPlayKind): void {
  clearSocketDuelSessionMarker();
  sessionStorage.removeItem('tournamentMode');

  if (kind === 'challenge') {
    sessionStorage.setItem(
      GAME_CONFIG_STORAGE_KEY,
      JSON.stringify({
        sessionOrigin: DEBUG_PLAY_ORIGIN,
        mode: 'PRACTICE',
        practiceChallenge: true,
        challengeId: 'normie',
        challengeRank: 1,
        challengeRunId: 'debug',
        challengeRunSeed: 'debug-play-normie',
        soloChallengeName: 'NORMIE DUEL',
        soloBounty: 21,
        practiceHudLabel: 'PRACTICE · 1v1',
        teamMode: 'solo',
        practiceMode: true,
        p1Human: true,
        p2Human: false,
        p1Name: 'Player 1',
        p2Name: 'BigToshi 🌊',
        aiTier: 'normie',
        convergenceMode: false,
        powerupMode: false,
        debugPlay: kind,
      })
    );
    return;
  }

  const nostr = kind === 'p2p-nostr';
  const tournament = kind === 'tournament';
  if (tournament) {
    sessionStorage.setItem('tournamentMode', 'tournament');
  }

  sessionStorage.setItem(
    GAME_CONFIG_STORAGE_KEY,
    JSON.stringify({
      sessionOrigin: DEBUG_PLAY_ORIGIN,
      mode: tournament ? 'TOURNAMENT' : nostr ? 'P2PNOSTR' : 'P2P',
      practiceMode: false,
      p1Human: true,
      p2Human: true,
      p1Name: 'Player 1',
      p2Name: 'Player 2',
      p1Points: 50000,
      p2Points: 50000,
      teamMode: 'solo',
      powerupMode: false,
      convergenceMode: false,
      debugPlay: kind,
    })
  );
}
