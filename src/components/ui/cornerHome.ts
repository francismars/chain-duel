import { isLiveMatchPath, isLocalGamePath } from '@/lib/pwa/isLiveMatchPath';

/**
 * Corner Home leaves at once unless the page cancels the event.
 * Hide it on a live online room and on a paid local match. Practice keeps
 * the button so its "Leave game?" dialog can run.
 */
export function hideCornerHomeButton(
  pathname: string,
  practiceSession: boolean
): boolean {
  if (!isLiveMatchPath(pathname)) return false;
  if (isLocalGamePath(pathname) && practiceSession) return false;
  return true;
}
