import { onlineLobbyUrl } from '@/shared/constants/onlineRoutes';

const CHAINDUEL_GAME_ORIGIN = 'https://game.chainduel.net';
const CHAINDUEL_SITE_URL = 'https://chainduel.net';

function isLocalDevOrigin(origin: string): boolean {
  return (
    !origin ||
    /localhost/i.test(origin) ||
    /127\.0\.0\.1/.test(origin) ||
    /0\.0\.0\.0/.test(origin)
  );
}

/** Lobby URL for the current browser origin (dev-friendly). */
export function buildOnlineRoomLobbyUrl(roomId: string): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${onlineLobbyUrl(roomId)}`;
  }
  return onlineLobbyUrl(roomId);
}

/** Lobby URL to paste or post — uses game.chainduel.net when sharing from local dev. */
export function buildOnlineRoomLobbyShareUrl(roomId: string): string {
  const path = onlineLobbyUrl(roomId);
  if (typeof window !== 'undefined') {
    const origin = window.location?.origin ?? '';
    if (!isLocalDevOrigin(origin)) {
      return `${origin}${path}`;
    }
  }
  return `${CHAINDUEL_GAME_ORIGIN}${path}`;
}

export function buildOnlineRoomInviteText(params: {
  roomCode: string;
  buyin: number;
  lobbyUrl: string;
  emojis?: string;
}): string {
  const emojiSuffix = params.emojis?.trim() ? ` ${params.emojis.trim()}` : '';
  const buyin = Math.floor(params.buyin);
  const code = params.roomCode.trim().toUpperCase();
  return [
    `Chain Duel — you're challenged${emojiSuffix}`,
    '',
    `${buyin} sats on the line · room ${code}`,
    'Join me in the lobby and take the open seat:',
    params.lobbyUrl,
    '',
    'Spectators welcome — same link, watch without playing.',
    CHAINDUEL_SITE_URL,
  ].join('\n');
}
