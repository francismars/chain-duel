const LOCAL_GAME_PATH = /^\/game\/?$/;
const ONLINE_ROOM_PATH = /^\/online\/r(?:\/|$)/;

/** Local `/game` match, practice or paid. */
export function isLocalGamePath(pathname: string): boolean {
  return LOCAL_GAME_PATH.test(pathname);
}

/** True while a match is on screen. An app update waits until this is false. */
export function isLiveMatchPath(pathname: string): boolean {
  return isLocalGamePath(pathname) || ONLINE_ROOM_PATH.test(pathname);
}
