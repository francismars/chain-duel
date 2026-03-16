import type { SerializedGameInfo } from '@/types/socket';

export interface DuelResolvedInfo {
  p1Name: string;
  p2Name: string;
  p1Points: number;
  p2Points: number;
  gameLabel: string;
  isTournament: boolean;
  practiceMode: boolean;
  p1Picture: string;
  p2Picture: string;
}

export interface ParsedZap {
  username: string;
  content: string;
  amount: number;
  profile: string;
  scale: number;
}

export function resolveDuelInfo(data: SerializedGameInfo): DuelResolvedInfo {
  const p1 = data.players['Player 1'];
  const p2 = data.players['Player 2'];
  const mode = data.mode?.toUpperCase();
  if (mode === 'TOURNAMENT' || mode === 'TOURNAMENTNOSTR') {
    const assignedPlayers = data.players ?? {};
    const numberOfPlayers = Object.keys(assignedPlayers).length;
    const playersList = Array(Math.max(2, numberOfPlayers)).fill('');
    const playersPictures = Array(Math.max(2, numberOfPlayers)).fill('');
    const playersValues = Array(Math.max(2, numberOfPlayers)).fill(0);
    for (const key of Object.keys(assignedPlayers)) {
      const idx = Number.parseInt(key.replace('Player ', ''), 10) - 1;
      if (idx >= 0 && idx < playersList.length) {
        playersList[idx] = assignedPlayers[key]?.name ?? '';
        playersPictures[idx] = assignedPlayers[key]?.picture ?? '';
        playersValues[idx] = Number.parseInt(
          String(assignedPlayers[key]?.value ?? 0),
          10
        );
      }
    }
    const winners = data.winners ?? [];
    let tournamentP1 = p1?.name || 'Player 1';
    let tournamentP2 = p2?.name || 'Player 2';
    let tournamentP1Picture = p1?.picture ?? '';
    let tournamentP2Picture = p2?.picture ?? '';
    let tournamentStartSats = Math.floor(Number.parseInt(String(p1?.value ?? 1000), 10));
    if (winners.length + 1 < numberOfPlayers) {
      const round1Games = Math.max(1, Math.floor(numberOfPlayers / 2));
      if (winners.length < round1Games) {
        const p1Idx = 2 * winners.length;
        const p2Idx = p1Idx + 1;
        tournamentP1 = playersList[p1Idx] || tournamentP1;
        tournamentP2 = playersList[p2Idx] || tournamentP2;
        tournamentP1Picture = playersPictures[p1Idx] || tournamentP1Picture;
        tournamentP2Picture = playersPictures[p2Idx] || tournamentP2Picture;
        tournamentStartSats = Math.floor(playersValues[p1Idx] || tournamentStartSats);
      } else {
        const winnerNames = buildWinnerProgression(playersList, winners, numberOfPlayers, '');
        const winnerPictures = buildWinnerProgression(
          playersPictures,
          winners,
          numberOfPlayers,
          ''
        );
        const winnerValues = buildWinnerProgression(playersValues, winners, numberOfPlayers, 0);
        const p1i = (winners.length - round1Games) * 2;
        tournamentP1 = winnerNames[p1i] || tournamentP1;
        tournamentP2 = winnerNames[p1i + 1] || tournamentP2;
        tournamentP1Picture = winnerPictures[p1i] || tournamentP1Picture;
        tournamentP2Picture = winnerPictures[p1i + 1] || tournamentP2Picture;
        tournamentStartSats = Math.floor(winnerValues[p1i] || tournamentStartSats);
      }
    }
    return {
      p1Name: tournamentP1,
      p2Name: tournamentP2,
      p1Points: tournamentStartSats,
      p2Points: tournamentStartSats,
      gameLabel: `GAME ${winners.length + 1} of ${Math.max(1, numberOfPlayers - 1)}`,
      isTournament: true,
      practiceMode: false,
      p1Picture: tournamentP1Picture,
      p2Picture: tournamentP2Picture,
    };
  }
  if (!p2) {
    return {
      p1Name: p1?.name || 'Player 1',
      p2Name: 'BigToshi 🌊',
      p1Points: Math.floor(Number.parseInt(String(p1?.value ?? 1000), 10)),
      p2Points: Math.floor(Number.parseInt(String(p1?.value ?? 1000), 10)),
      gameLabel: 'Practice',
      isTournament: false,
      practiceMode: true,
      p1Picture: p1?.picture ?? '',
      p2Picture: '',
    };
  }
  const baseLabel = data.mode || 'P2P';
  const donRound = data.winners?.length ?? 0;
  const donText = donRound > 0 ? `*${2 ** donRound}` : '';
  return {
    p1Name: p1?.name || 'Player 1',
    p2Name: p2?.name || 'Player 2',
    p1Points: Math.floor(Number.parseInt(String(p1?.value ?? 1000), 10)),
    p2Points: Math.floor(Number.parseInt(String(p2?.value ?? 1000), 10)),
    gameLabel: `${baseLabel}${donText}`,
    isTournament: false,
    practiceMode: false,
    p1Picture: p1?.picture ?? '',
    p2Picture: p2?.picture ?? '',
  };
}

export function parseZap(payload: unknown): ParsedZap | null {
  if (!payload || typeof payload !== 'object') return null;
  const source = payload as Record<string, unknown>;
  const amount = Number.parseInt(String(source.amount ?? 0), 10);
  const scale =
    amount > 9999 ? 2 : amount >= 5000 ? 1.6 : amount >= 2000 ? 1.4 : amount >= 500 ? 1.2 : 1;
  return {
    username: String(source.username ?? 'zapper'),
    content: String(source.content ?? ''),
    amount: Number.isFinite(amount) ? amount : 0,
    profile: String(source.profile ?? '/images/loading.gif'),
    scale,
  };
}

function buildWinnerProgression<T>(
  entrants: T[],
  winnersList: string[],
  numberOfPlayers: number,
  fallback: T
): T[] {
  const round1Games = Math.max(1, Math.floor(numberOfPlayers / 2));
  const winnerProgression: T[] = [];
  for (let i = 0; i < winnersList.length; i += 1) {
    if (i + 1 >= numberOfPlayers) break;
    const winner = winnersList[i];
    let winnerValue: T = fallback;
    if (i < round1Games) {
      winnerValue =
        winner === 'Player 1'
          ? entrants[i * 2] ?? fallback
          : entrants[i * 2 + 1] ?? fallback;
    } else {
      const p1i = (i - round1Games) * 2;
      winnerValue =
        winner === 'Player 1'
          ? winnerProgression[p1i] ?? fallback
          : winnerProgression[p1i + 1] ?? fallback;
    }
    winnerProgression.push(winnerValue);
  }
  return winnerProgression;
}
