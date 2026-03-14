import { PAYOUT_POOL_RATIO } from '@/shared/constants/payment';

export const INITIAL_POSITIONS = [
  'G1_P1','G1_P2','G2_P1','G2_P2','G3_P1','G3_P2','G4_P1','G4_P2',
  'G5_P1','G5_P2','G6_P1','G6_P2','G7_P1','G7_P2','G8_P1','G8_P2',
  'G9_P1','G9_P2','G10_P1','G10_P2','G11_P1','G11_P2','G12_P1','G12_P2',
  'G13_P1','G13_P2','G14_P1','G14_P2','G15_P1','G15_P2','G16_P1','G16_P2',
  'G17_P1','G17_P2','G18_P1','G18_P2','G19_P1','G19_P2','G20_P1','G20_P2',
  'G21_P1','G21_P2','G22_P1','G22_P2','G23_P1','G23_P2','G24_P1','G24_P2',
  'G25_P1','G25_P2','G26_P1','G26_P2','G27_P1','G27_P2','G28_P1','G28_P2',
  'G29_P1','G29_P2','G30_P1','G30_P2','G31_P1','G31_P2',
] as const;

export function computeFinalPrize(numberOfPlayers: number, deposit: number) {
  return Math.floor(numberOfPlayers * deposit * PAYOUT_POOL_RATIO);
}

export function computeRefundPerPlayer(deposit: number) {
  return Math.floor(deposit * PAYOUT_POOL_RATIO);
}

export function computeBracketState(
  playersList: string[],
  winnersList: string[],
  numberOfPlayers: number,
): {
  WinnerNames: string[];
  nextGameNumber: number;
  nextP1: string;
  nextP2: string;
  champion: string;
} {
  const round1 = Math.max(1, Math.floor(numberOfPlayers / 2));
  const WinnerNames: string[] = [];

  for (let i = 0; i < winnersList.length; i++) {
    if (i + 1 >= numberOfPlayers) break;
    const w = winnersList[i];
    let name = '';
    if (i < round1) {
      name = w === 'Player 1' ? (playersList[i * 2] ?? '') : (playersList[i * 2 + 1] ?? '');
    } else {
      const p1i = (i - round1) * 2;
      name = w === 'Player 1' ? (WinnerNames[p1i] ?? '') : (WinnerNames[p1i + 1] ?? '');
    }
    WinnerNames.push(name);
  }

  const isDone = winnersList.length >= numberOfPlayers - 1;
  const champion = isDone ? (WinnerNames[WinnerNames.length - 1] ?? '') : '';
  const nextIdx = winnersList.length;
  const gameNumber = nextIdx + 1;

  if (isDone) {
    return { WinnerNames, nextGameNumber: gameNumber, nextP1: '', nextP2: '', champion };
  }

  let nextP1 = '';
  let nextP2 = '';
  if (nextIdx < round1) {
    nextP1 = playersList[nextIdx * 2] ?? '';
    nextP2 = playersList[nextIdx * 2 + 1] ?? '';
  } else {
    const p1i = (nextIdx - round1) * 2;
    nextP1 = WinnerNames[p1i] ?? '';
    nextP2 = WinnerNames[p1i + 1] ?? '';
  }

  return { WinnerNames, nextGameNumber: gameNumber, nextP1, nextP2, champion };
}
