import { describe, expect, it } from 'vitest';
import { PlayerRole } from '@/types/socket';
import type { OnlineRoomState } from '@/types/socket';
import { buildVictoryRevealData } from './buildVictoryRevealData';
import {
  MATCH_REVEAL_EXIT_MS,
  MATCH_REVEAL_MS,
  MATCH_REVEAL_SKIP_AFTER_MS,
} from './matchRevealTiming';

function postGameRoom(overrides: Partial<OnlineRoomState> = {}): OnlineRoomState {
  return {
    roomId: 'room-1',
    roomCode: 'ABCD',
    hostSessionID: 'host',
    buyin: 1000,
    matchRound: 1,
    phase: 'postgame',
    seats: {
      [PlayerRole.Player1]: {
        role: PlayerRole.Player1,
        status: 'paid',
        sessionID: 's1',
        name: 'Alice',
        paidAmount: 1000,
      },
      [PlayerRole.Player2]: {
        role: PlayerRole.Player2,
        status: 'paid',
        sessionID: 's2',
        name: 'Bob',
        paidAmount: 1000,
      },
    },
    spectators: [],
    snapshot: {
      tick: 100,
      phase: 'postgame',
      state: {
        p1Name: 'Alice',
        p2Name: 'Bob',
        score: [3200, 1800],
      },
      hud: {
        p1Points: 1000,
        p2Points: 1000,
        captureP1: '2%',
        captureP2: '2%',
        initialWidthP1: 50,
        initialWidthP2: 50,
        currentWidthP1: 50,
        currentWidthP2: 50,
      },
    },
    postGame: {
      winnerRole: PlayerRole.Player1,
      winnerSessionID: 's1',
      winnerName: 'Alice',
      winnerPoints: 2000,
      p1Picture: undefined,
      p2Picture: undefined,
      rematchRequested: false,
    },
    result: {
      p1Name: 'Alice',
      p2Name: 'Bob',
      p1Score: 3200,
      p2Score: 1800,
    },
    ...overrides,
  } as OnlineRoomState;
}

describe('matchRevealTiming', () => {
  it('shares intro and victory overlay durations', () => {
    expect(MATCH_REVEAL_MS).toBe(5500);
    expect(MATCH_REVEAL_SKIP_AFTER_MS).toBe(3000);
    expect(MATCH_REVEAL_EXIT_MS).toBe(1500);
    expect(MATCH_REVEAL_MS - MATCH_REVEAL_EXIT_MS).toBe(4000);
  });
});

describe('buildVictoryRevealData', () => {
  it('builds winner/loser and net prize', () => {
    const data = buildVictoryRevealData(postGameRoom(), { sessionID: 's1' });
    expect(data).not.toBeNull();
    expect(data!.winner.name).toBe('Alice');
    expect(data!.loser.name).toBe('Bob');
    expect(data!.winner.score).toBe(3200);
    expect(data!.loser.score).toBe(1800);
    expect(data!.netPrize).toBe(1900);
    expect(data!.teaseHeadline).toBe('OUTPLAYED');
  });

  it('marks winner viewer role and footer', () => {
    const data = buildVictoryRevealData(postGameRoom(), { sessionID: 's1' });
    expect(data!.viewerRole).toBe('winner');
    expect(data!.footerCopy).toContain('Claim your prize');
  });

  it('marks loser viewer role and footer', () => {
    const data = buildVictoryRevealData(postGameRoom(), { sessionID: 's2' });
    expect(data!.viewerRole).toBe('loser');
    expect(data!.footerCopy).toContain('rematch');
  });

  it('marks spectator viewer role and footer', () => {
    const data = buildVictoryRevealData(postGameRoom(), { sessionID: 'spec' });
    expect(data!.viewerRole).toBe('spectator');
    expect(data!.footerCopy).toContain('Opening results');
  });

  it('returns null without postGame', () => {
    const room = postGameRoom();
    room.postGame = undefined;
    expect(buildVictoryRevealData(room)).toBeNull();
  });
});
