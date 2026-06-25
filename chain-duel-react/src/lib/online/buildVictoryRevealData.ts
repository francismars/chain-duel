import type { GameState } from '@/game/engine/types';
import type { OnlineRoomState } from '@/types/socket';
import { PlayerRole } from '@/types/socket';

const ONLINE_FEE_MULTIPLIER = 0.95;

export type VictoryRevealPlayer = {
  name: string;
  picture?: string;
  score: number;
  side: 'p1' | 'p2';
};

export type VictoryRevealData = {
  winner: VictoryRevealPlayer;
  loser: VictoryRevealPlayer;
  teaseHeadline: string;
  teaseSubline: string;
  netPrize: number;
};

function pickTease(scoreDiff: number): { headline: string; subline: string } {
  if (scoreDiff >= 2500) {
    return {
      headline: 'ABSOLUTELY DEMOLISHED',
      subline: 'Not even close on the mempool.',
    };
  }
  if (scoreDiff >= 1200) {
    return {
      headline: 'OUTPLAYED',
      subline: 'The chain has spoken.',
    };
  }
  if (scoreDiff >= 400) {
    return {
      headline: 'SKILL DIFFERENCE',
      subline: 'Better luck next block.',
    };
  }
  return {
    headline: 'EDGE OF YOUR SEAT',
    subline: 'So close — yet so rekt.',
  };
}

export function buildVictoryRevealData(
  room: OnlineRoomState
): VictoryRevealData | null {
  const pg = room.postGame;
  if (!pg) {
    return null;
  }

  const p1Seat = room.seats['Player 1'];
  const p2Seat = room.seats['Player 2'];
  const state = room.snapshot?.state as GameState | undefined;
  const p1Name =
    p1Seat?.name?.trim() ||
    state?.p1Name?.trim() ||
    room.result?.p1Name?.trim() ||
    'Player 1';
  const p2Name =
    p2Seat?.name?.trim() ||
    state?.p2Name?.trim() ||
    room.result?.p2Name?.trim() ||
    'Player 2';

  const p1Score = Math.floor(
    room.result?.p1Score ??
      (state as { score?: number[] } | undefined)?.score?.[0] ??
      0
  );
  const p2Score = Math.floor(
    room.result?.p2Score ??
      (state as { score?: number[] } | undefined)?.score?.[1] ??
      0
  );

  const winnerIsP1 =
    pg.winnerRole === PlayerRole.Player1 ||
    (!pg.winnerRole &&
      pg.winnerName.trim().toLowerCase() === p1Name.toLowerCase());

  const winnerSide = winnerIsP1 ? 'p1' : 'p2';
  const loserSide = winnerIsP1 ? 'p2' : 'p1';

  const winner: VictoryRevealPlayer = {
    side: winnerSide,
    name: pg.winnerName.trim() || (winnerIsP1 ? p1Name : p2Name),
    picture:
      pg.winnerPicture ??
      (winnerIsP1 ? p1Seat?.picture ?? pg.p1Picture : p2Seat?.picture ?? pg.p2Picture),
    score: winnerIsP1 ? p1Score : p2Score,
  };

  const loser: VictoryRevealPlayer = {
    side: loserSide,
    name: winnerIsP1 ? p2Name : p1Name,
    picture: winnerIsP1
      ? p2Seat?.picture ?? pg.p2Picture
      : p1Seat?.picture ?? pg.p1Picture,
    score: winnerIsP1 ? p2Score : p1Score,
  };

  const tease = pickTease(Math.abs(winner.score - loser.score));

  return {
    winner,
    loser,
    teaseHeadline: tease.headline,
    teaseSubline: tease.subline,
    netPrize: Math.floor(pg.winnerPoints * ONLINE_FEE_MULTIPLIER),
  };
}
