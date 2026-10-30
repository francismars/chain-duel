import type { GameState } from '@/game/engine/types';
import { seatAwayLine } from '@/lib/online/forfeitPause';
import type { OnlineRoomState } from '@/types/socket';
import { PlayerRole } from '@/types/socket';

const ONLINE_FEE_MULTIPLIER = 0.95;

export type MatchIntroPlayer = {
  name: string;
  picture?: string;
  side: 'p1' | 'p2';
};

export type MatchIntroViewerRole = 'duelist' | 'spectator';
export type MatchIntroViewerSide = 'p1' | 'p2';

export type MatchIntroData = {
  kicker: string;
  p1: MatchIntroPlayer;
  p2: MatchIntroPlayer;
  buyinEach: number;
  totalPot: number;
  netPrize: number;
  spectatorCount: number;
  viewerRole: MatchIntroViewerRole;
  viewerSide: MatchIntroViewerSide | null;
  roomCode: string;
  awayLine: string | null;
};

function seatName(
  seat: OnlineRoomState['seats'][string] | undefined,
  fallback: string
): string {
  const trimmed = seat?.name?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (seat?.status === 'paid' && seat.pubkey) {
    const hex = seat.pubkey
      .replace(/[^a-f0-9]/gi, '')
      .slice(0, 6)
      .toLowerCase();
    return hex ? `Anon${hex}` : 'Anonymous';
  }
  return fallback;
}

function seatIsViewer(
  seat: OnlineRoomState['seats'][string] | undefined,
  sessionID: string,
  socketID: string
): boolean {
  return (
    seat?.status === 'paid' &&
    ((Boolean(seat.sessionID) && seat.sessionID === sessionID) ||
      (Boolean(seat.socketID) && seat.socketID === socketID))
  );
}

function resolveViewerSide(
  room: OnlineRoomState,
  sessionID: string,
  socketID: string
): MatchIntroViewerSide | null {
  if (seatIsViewer(room.seats[PlayerRole.Player1], sessionID, socketID)) {
    return 'p1';
  }
  if (seatIsViewer(room.seats[PlayerRole.Player2], sessionID, socketID)) {
    return 'p2';
  }
  return null;
}

export function buildMatchIntroData(
  room: OnlineRoomState,
  viewer: { sessionID?: string; socketID?: string } = {}
): MatchIntroData | null {
  const p1Seat = room.seats[PlayerRole.Player1];
  const p2Seat = room.seats[PlayerRole.Player2];
  if (p1Seat?.status !== 'paid' || p2Seat?.status !== 'paid') {
    return null;
  }

  const state = room.snapshot?.state as GameState | undefined;
  const p1Name = seatName(p1Seat, state?.p1Name?.trim() || 'Player 1');
  const p2Name = seatName(p2Seat, state?.p2Name?.trim() || 'Player 2');

  const buyinEach = Math.floor(
    p1Seat.paidAmount ?? p2Seat.paidAmount ?? room.buyin ?? 0
  );
  const totalPot = buyinEach * 2;
  const netPrize = Math.floor(totalPot * ONLINE_FEE_MULTIPLIER);
  const matchRound = room.matchRound ?? 1;
  const kicker = matchRound > 1 ? 'REMATCH LOCKED IN' : 'DUEL LOCKED IN';

  const sessionID = viewer.sessionID ?? '';
  const socketID = viewer.socketID ?? '';
  const viewerSide = resolveViewerSide(room, sessionID, socketID);

  return {
    kicker,
    p1: {
      side: 'p1',
      name: p1Name,
      picture: p1Seat.picture,
    },
    p2: {
      side: 'p2',
      name: p2Name,
      picture: p2Seat.picture,
    },
    buyinEach,
    totalPot,
    netPrize,
    spectatorCount: room.spectators?.length ?? 0,
    viewerRole: viewerSide ? 'duelist' : 'spectator',
    viewerSide,
    roomCode: room.roomCode,
    awayLine: seatAwayLine({
      p1Away: p1Seat.disconnectedAt != null,
      p2Away: p2Seat.disconnectedAt != null,
      viewer: viewerSide ?? 'spectator',
      p1Name,
      p2Name,
      forfeit: room.forfeit,
    }),
  };
}
