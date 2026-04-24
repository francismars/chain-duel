import { npubEncode } from 'nostr-tools/nip19';
import type { SerializedGameInfo } from '@/types/socket';

const HUD_NPUB_HEAD = 10;
const HUD_NPUB_TAIL = 6;

function midTruncateHud(s: string, head: number, tail: number): string {
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function isHexPubkey64(s: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(s);
}

/**
 * In-game HUD label: real name when present; else trimmed `npub1…` from hex pubkey;
 * legacy `NPUB:dead…beef` only when pubkey is unknown.
 */
export function formatHudPlayerName(
  row: { name?: string; fallbackLabel?: string; nostrPubkey?: string } | undefined,
  roleFallback: string,
): string {
  if (!row) return roleFallback;

  const combined = (row.name?.trim() || row.fallbackLabel?.trim() || '');
  if (combined.startsWith('npub1')) {
    return midTruncateHud(combined, HUD_NPUB_HEAD, HUD_NPUB_TAIL);
  }
  if (combined && !/^NPUB:\s*/i.test(combined)) {
    return combined;
  }

  const pk = row.nostrPubkey?.trim() ?? '';
  if (pk) {
    if (pk.startsWith('npub1')) return midTruncateHud(pk, HUD_NPUB_HEAD, HUD_NPUB_TAIL);
    if (isHexPubkey64(pk)) {
      try {
        return midTruncateHud(npubEncode(pk), HUD_NPUB_HEAD, HUD_NPUB_TAIL);
      } catch {
        /* fall through */
      }
    }
  }

  const legacy = combined.match(
    /^NPUB:\s*([0-9a-fA-F]+)\s*(?:\.\.\.|…)\s*([0-9a-fA-F]+)\s*$/i
  );
  if (legacy) {
    return `${legacy[1].slice(0, 6)}…${legacy[2].slice(-5)}`;
  }

  if (combined) return combined;
  return roleFallback;
}

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
        const row = assignedPlayers[key];
        playersList[idx] = formatHudPlayerName(row, '');
        playersPictures[idx] = row?.picture?.trim() ? String(row.picture) : '';
        playersValues[idx] = Number.parseInt(
          String(assignedPlayers[key]?.value ?? 0),
          10
        );
      }
    }
    const winners = data.winners ?? [];
    /** HUD left/right when a slot has no display string — never fall back to another slot's name */
    const hudP1Fallback = 'Player 1';
    const hudP2Fallback = 'Player 2';
    let tournamentP1 = formatHudPlayerName(p1, hudP1Fallback);
    let tournamentP2 = formatHudPlayerName(p2, hudP2Fallback);
    let tournamentP1Picture = p1?.picture?.trim() ? String(p1.picture) : '';
    let tournamentP2Picture = p2?.picture?.trim() ? String(p2.picture) : '';
    let tournamentStartSats = Math.floor(Number.parseInt(String(p1?.value ?? 1000), 10));
    if (winners.length + 1 < numberOfPlayers) {
      const round1Games = Math.max(1, Math.floor(numberOfPlayers / 2));
      if (winners.length < round1Games) {
        const p1Idx = 2 * winners.length;
        const p2Idx = p1Idx + 1;
        tournamentP1 = playersList[p1Idx]?.trim() || hudP1Fallback;
        tournamentP2 = playersList[p2Idx]?.trim() || hudP2Fallback;
        tournamentP1Picture = playersPictures[p1Idx]?.trim() ? String(playersPictures[p1Idx]) : '';
        tournamentP2Picture = playersPictures[p2Idx]?.trim() ? String(playersPictures[p2Idx]) : '';
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
        tournamentP1 = winnerNames[p1i]?.trim() || hudP1Fallback;
        tournamentP2 = winnerNames[p1i + 1]?.trim() || hudP2Fallback;
        tournamentP1Picture = winnerPictures[p1i]?.trim() ? String(winnerPictures[p1i]) : '';
        tournamentP2Picture = winnerPictures[p1i + 1]?.trim() ? String(winnerPictures[p1i + 1]) : '';
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
      p1Name: formatHudPlayerName(p1, 'Player 1'),
      p2Name: 'BigToshi 🌊',
      p1Points: Math.floor(Number.parseInt(String(p1?.value ?? 1000), 10)),
      p2Points: Math.floor(Number.parseInt(String(p1?.value ?? 1000), 10)),
      gameLabel: 'Practice',
      isTournament: false,
      practiceMode: true,
      p1Picture: p1?.picture?.trim() ? String(p1.picture) : '',
      p2Picture: '',
    };
  }
  const baseLabel = data.mode || 'P2P';
  const donRound = data.winners?.length ?? 0;
  const donText = donRound > 0 ? `*${2 ** donRound}` : '';
  return {
    p1Name: formatHudPlayerName(p1, 'Player 1'),
    p2Name: formatHudPlayerName(p2, 'Player 2'),
    p1Points: Math.floor(Number.parseInt(String(p1?.value ?? 1000), 10)),
    p2Points: Math.floor(Number.parseInt(String(p2?.value ?? 1000), 10)),
    gameLabel: `${baseLabel}${donText}`,
    isTournament: false,
    practiceMode: false,
    p1Picture: p1?.picture?.trim() ? String(p1.picture) : '',
    p2Picture: p2?.picture?.trim() ? String(p2.picture) : '',
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
