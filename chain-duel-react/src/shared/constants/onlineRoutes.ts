/** Online multiplayer route prefix (was /network). */
export const ONLINE_HOME = '/online';
export const ONLINE_ROOM = '/online/r';

/** Canonical shareable room URL (human room code). */
export function onlineRoomUrl(
  roomCode: string,
  query?: Record<string, string | undefined>
): string {
  const base = `${ONLINE_ROOM}/${encodeURIComponent(roomCode.trim().toUpperCase())}`;
  if (!query) {
    return base;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    params.append(key, value);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Open replay viewer. Omits `round` for match 1; room code in the path is enough to bootstrap. */
export function onlineReplayRoomUrl(
  roomCode: string,
  round?: number
): string {
  const query: Record<string, string | undefined> = { replay: '1' };
  if (round != null && round > 1) {
    query.round = String(round);
  }
  return onlineRoomUrl(roomCode, query);
}
