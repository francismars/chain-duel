/** True while a match is on screen. An app update waits until this is false. */
export function isLiveMatchPath(pathname: string): boolean {
  return /^\/game\/?$/.test(pathname) || /^\/online\/r(?:\/|$)/.test(pathname);
}
