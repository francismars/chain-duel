/** Online multiplayer route prefix (was /network). */
export const ONLINE_HOME = '/online';
export const ONLINE_ROOM = '/online/r';

/** Canonical shareable room URL (human room code). */
export function onlineRoomUrl(
  roomCode: string,
  query?: Record<string, string>
): string {
  const base = `${ONLINE_ROOM}/${encodeURIComponent(roomCode.trim().toUpperCase())}`;
  if (!query || Object.keys(query).length === 0) {
    return base;
  }
  const params = new URLSearchParams(query);
  return `${base}?${params.toString()}`;
}

export function onlineReplayRoomUrl(roomCode: string, round?: number): string {
  const query: Record<string, string> = { replay: '1' };
  if (round != null) {
    query.round = String(round);
  }
  return onlineRoomUrl(roomCode, query);
}
