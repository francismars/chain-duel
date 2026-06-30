import type { GameState } from '@/game/engine/types';
import type { OnlineRoomState } from '@/types/socket';

export function countPaidSeats(room: OnlineRoomState | null): number {
  if (!room?.seats) {
    return 0;
  }
  return Object.values(room.seats).filter((seat) => seat.status === 'paid')
    .length;
}

export function matchIntroDedupKey(room: OnlineRoomState): string {
  const round = room.matchRound ?? 1;
  return `${room.roomId}:r${round}`;
}

export type ShouldShowMatchIntroParams = {
  room: OnlineRoomState | null;
  replayMode?: boolean;
  alreadyShownKeys?: ReadonlySet<string>;
};

export function shouldShowMatchIntro({
  room,
  replayMode = false,
  alreadyShownKeys,
}: ShouldShowMatchIntroParams): boolean {
  if (!room || replayMode) {
    return false;
  }
  if (countPaidSeats(room) < 2) {
    return false;
  }
  const phase = room.phase;
  if (phase !== 'lobby' && phase !== 'playing') {
    return false;
  }
  const state = room.snapshot?.state as GameState | undefined;
  if (!state) {
    return false;
  }
  if (state.gameStarted || state.countdownStart) {
    return false;
  }
  if (alreadyShownKeys?.has(matchIntroDedupKey(room))) {
    return false;
  }
  return true;
}
