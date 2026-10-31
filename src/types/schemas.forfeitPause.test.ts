import { describe, expect, it } from 'vitest';
import {
  OnlineRoomSnapshotEventSchema,
  OnlineRoomStateSchema,
} from './schemas';

const hud = {
  p1Points: 1000,
  p2Points: 1000,
  captureP1: '2%',
  captureP2: '2%',
  initialWidthP1: 50,
  initialWidthP2: 50,
  currentWidthP1: 50,
  currentWidthP2: 50,
};

const snapshot = {
  tick: 12,
  phase: 'playing' as const,
  state: { gameStarted: true },
  hud,
};

const room = {
  roomId: 'room-1',
  roomCode: 'ABCD',
  hostSessionID: 'host',
  buyin: 1000,
  phase: 'playing' as const,
  seats: {
    'Player 1': {
      role: 'Player 1' as const,
      status: 'paid' as const,
      disconnectedAt: 1_700_000_000_000,
      disconnectMs: 4000,
    },
    'Player 2': {
      role: 'Player 2' as const,
      status: 'paid' as const,
    },
  },
  spectators: [],
  snapshot,
};

describe('online forfeit pause wire', () => {
  it('parses a room update with and without forfeit', () => {
    const absent = OnlineRoomStateSchema.parse(room);
    expect(absent.forfeit).toBeUndefined();
    expect(absent.seats['Player 1']?.disconnectedAt).toBe(1_700_000_000_000);
    expect(absent.seats['Player 1']?.disconnectMs).toBe(4000);

    const present = OnlineRoomStateSchema.parse({
      ...room,
      forfeit: {
        paused: true,
        limitMs: 300000,
        p2RemainingMs: 250000,
        p2Reason: 'idle',
        ignored: true,
      },
    });
    expect(present.forfeit).toEqual({
      paused: true,
      limitMs: 300000,
      p2RemainingMs: 250000,
      p2Reason: 'idle',
    });

    const running = OnlineRoomStateSchema.parse({
      ...room,
      forfeit: {
        paused: false,
        limitMs: 300000,
        p1RemainingMs: 272000,
        p1Reason: 'idle',
      },
    });
    expect(running.forfeit).toEqual({
      paused: false,
      limitMs: 300000,
      p1RemainingMs: 272000,
      p1Reason: 'idle',
    });

    const claimed = OnlineRoomStateSchema.parse({
      ...room,
      phase: 'postgame',
      claim: { remainingMs: 120000, limitMs: 300000, ignored: true },
    });
    expect(claimed.claim).toEqual({ remainingMs: 120000, limitMs: 300000 });
  });

  it('parses a snapshot event with and without forfeit', () => {
    const absent = OnlineRoomSnapshotEventSchema.parse({
      roomId: 'room-1',
      snapshot,
    });
    expect(absent.forfeit).toBeUndefined();
    expect(absent.snapshot.tick).toBe(12);

    const present = OnlineRoomSnapshotEventSchema.parse({
      roomId: 'room-1',
      snapshot,
      forfeit: {
        paused: true,
        limitMs: 300000,
        p1RemainingMs: 12000,
        p2RemainingMs: 8000,
      },
    });
    expect(present.forfeit).toEqual({
      paused: true,
      limitMs: 300000,
      p1RemainingMs: 12000,
      p2RemainingMs: 8000,
    });
  });
});
