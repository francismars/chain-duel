import { onlineRoomUrl } from '@/shared/constants/onlineRoutes';

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

/** Room URL for the current browser origin (dev-friendly). */
export function buildOnlineRoomUrl(roomCode: string): string {
  const path = onlineRoomUrl(roomCode);
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

/** Room URL to paste or post — uses game.chainduel.net when sharing from local dev. */
export function buildOnlineRoomShareUrl(roomCode: string): string {
  const path = onlineRoomUrl(roomCode);
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
}): string {
  const buyin = Math.floor(params.buyin);
  const code = params.roomCode.trim().toUpperCase();
  return [
    `Chain Duel — you're challenged`,
    '',
    `${buyin} sats on the line · room ${code}`,
    'Join the room and take the open seat:',
    params.lobbyUrl,
    '',
    'Spectators welcome — same link, watch without playing.',
    CHAINDUEL_SITE_URL,
  ].join('\n');
}
