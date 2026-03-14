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
  if (mode === 'TOURNAMENT') {
    const assignedPlayers = data.players ?? {};
    const numberOfPlayers = Object.keys(assignedPlayers).length;
    const playersList = Array(Math.max(2, numberOfPlayers)).fill('');
    for (const key of Object.keys(assignedPlayers)) {
      const idx = Number.parseInt(key.replace('Player ', ''), 10) - 1;
      if (idx >= 0 && idx < playersList.length) {
        playersList[idx] = assignedPlayers[key]?.name ?? '';
      }
    }
    const winners = data.winners ?? [];
    let tournamentP1 = p1?.name || 'Player 1';
    let tournamentP2 = p2?.name || 'Player 2';
    if (winners.length + 1 < numberOfPlayers) {
      if (winners.length < numberOfPlayers / 2) {
        tournamentP1 = playersList[2 * winners.length] || tournamentP1;
        tournamentP2 = playersList[2 * winners.length + 1] || tournamentP2;
      } else {
        const winnerNames = buildWinnerNamesList(playersList, winners);
        tournamentP1 = winnerNames[2 * winners.length] || tournamentP1;
        tournamentP2 = winnerNames[2 * winners.length + 1] || tournamentP2;
      }
    }
    const startSats = Math.floor(Number.parseInt(String(p1?.value ?? 1000), 10));
    return {
      p1Name: tournamentP1,
      p2Name: tournamentP2,
      p1Points: startSats,
      p2Points: startSats,
      gameLabel: `GAME ${winners.length + 1} of ${Math.max(1, numberOfPlayers - 1)}`,
      isTournament: true,
      practiceMode: false,
      p1Picture: p1?.picture ?? '',
      p2Picture: p2?.picture ?? '',
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

function buildWinnerNamesList(playersList: string[], winnersList: string[]): string[] {
  const playersListCopy = [...playersList];
  for (let i = 0; i < winnersList.length; i += 1) {
    const winner = winnersList[i];
    if (winner === 'Player 1') {
      playersListCopy.push(playersListCopy[2 * i] ?? '');
    } else {
      playersListCopy.push(playersListCopy[2 * i + 1] ?? '');
    }
  }
  return playersListCopy;
}
