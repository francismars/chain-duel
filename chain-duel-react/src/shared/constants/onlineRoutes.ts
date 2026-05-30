/** Online multiplayer route prefix (was /network). */
export const ONLINE_HOME = '/online';
export const ONLINE_LOBBY = '/online/lobby';
export const ONLINE_GAME = '/online/game';
export const ONLINE_POSTGAME = '/online/postgame';

export function onlineLobbyUrl(roomId: string): string {
  return `${ONLINE_LOBBY}?roomId=${encodeURIComponent(roomId)}`;
}

export function onlineGameUrl(roomId: string): string {
  return `${ONLINE_GAME}?roomId=${encodeURIComponent(roomId)}`;
}

export function onlinePostGameUrl(roomId: string): string {
  return `${ONLINE_POSTGAME}?roomId=${encodeURIComponent(roomId)}`;
}

export function onlineReplayUrl(roomId: string, round?: number): string {
  const roundQ = round != null ? `&round=${encodeURIComponent(String(round))}` : '';
  return `${ONLINE_GAME}?roomId=${encodeURIComponent(roomId)}&replay=1${roundQ}`;
}
