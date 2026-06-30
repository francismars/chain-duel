import { describe, expect, it } from 'vitest';
import { PlayerRole } from '@/types/socket';
import type { OnlineRoomState } from '@/types/socket';
import { buildMatchIntroData } from './buildMatchIntroData';
import {
  countPaidSeats,
  matchIntroDedupKey,
  shouldShowMatchIntro,
} from './shouldShowMatchIntro';

function baseRoom(overrides: Partial<OnlineRoomState> = {}): OnlineRoomState {
  return {
    roomId: 'room-1',
    roomCode: 'ABCD',
    hostSessionID: 'host',
    buyin: 1000,
    matchRound: 1,
    phase: 'lobby',
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
    spectators: ['spec1'],
    snapshot: {
      tick: 0,
      phase: 'lobby',
      state: {
        gameStarted: false,
        countdownStart: false,
        p1Name: 'Alice',
        p2Name: 'Bob',
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
    ...overrides,
  } as OnlineRoomState;
}

describe('countPaidSeats', () => {
  it('counts paid seats', () => {
    expect(countPaidSeats(baseRoom())).toBe(2);
    expect(
      countPaidSeats(
        baseRoom({
          seats: {
            [PlayerRole.Player1]: {
              role: PlayerRole.Player1,
              status: 'paid',
            },
            [PlayerRole.Player2]: {
              role: PlayerRole.Player2,
              status: 'open',
            },
          },
        })
      )
    ).toBe(1);
  });
});

describe('matchIntroDedupKey', () => {
  it('keys by roomId and matchRound', () => {
    expect(matchIntroDedupKey(baseRoom())).toBe('room-1:r1');
    expect(matchIntroDedupKey(baseRoom({ matchRound: 2 }))).toBe('room-1:r2');
  });
});

describe('shouldShowMatchIntro', () => {
  it('returns true when both paid and pre-start', () => {
    expect(shouldShowMatchIntro({ room: baseRoom() })).toBe(true);
  });

  it('returns false in replay mode', () => {
    expect(
      shouldShowMatchIntro({ room: baseRoom(), replayMode: true })
    ).toBe(false);
  });

  it('returns false when game already started', () => {
    const room = baseRoom();
    (room.snapshot.state as { gameStarted: boolean }).gameStarted = true;
    expect(shouldShowMatchIntro({ room })).toBe(false);
  });

  it('returns false when dedup key already shown', () => {
    expect(
      shouldShowMatchIntro({
        room: baseRoom(),
        alreadyShownKeys: new Set(['room-1:r1']),
      })
    ).toBe(false);
  });

  it('returns false in postgame', () => {
    expect(
      shouldShowMatchIntro({ room: baseRoom({ phase: 'postgame' }) })
    ).toBe(false);
  });
});

describe('buildMatchIntroData', () => {
  it('builds stakes and player info', () => {
    const data = buildMatchIntroData(baseRoom(), { sessionID: 's1' });
    expect(data).not.toBeNull();
    expect(data!.kicker).toBe('DUEL LOCKED IN');
    expect(data!.p1.name).toBe('Alice');
    expect(data!.p2.name).toBe('Bob');
    expect(data!.buyinEach).toBe(1000);
    expect(data!.totalPot).toBe(2000);
    expect(data!.netPrize).toBe(1900);
    expect(data!.spectatorCount).toBe(1);
    expect(data!.viewerRole).toBe('duelist');
  });

  it('uses rematch kicker for round > 1', () => {
    const data = buildMatchIntroData(baseRoom({ matchRound: 2 }));
    expect(data!.kicker).toBe('REMATCH LOCKED IN');
  });

  it('marks spectator when session not in seats', () => {
    const data = buildMatchIntroData(baseRoom(), { sessionID: 'spec1' });
    expect(data!.viewerRole).toBe('spectator');
  });

  it('returns null when seats not both paid', () => {
    const room = baseRoom();
    room.seats[PlayerRole.Player2].status = 'open';
    expect(buildMatchIntroData(room)).toBeNull();
  });
});
