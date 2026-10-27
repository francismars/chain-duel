import {
  CHALLENGE_ICON_IDS,
  type ChallengeIconId,
} from '@/features/practice/ChallengeRowIcon';

const STORAGE_KEY = 'challengeMenuFocus';

function challengeIdToIndex(challengeId: string): number {
  const idx = CHALLENGE_ICON_IDS.indexOf(challengeId as ChallengeIconId);
  return idx >= 0 ? idx : 0;
}

/** Persist which challenge row to focus when returning to the practice hub. */
export function saveChallengeMenuFocus(
  challengeId: string,
  won: boolean
): void {
  const current = challengeIdToIndex(challengeId);
  const focusIdx = won
    ? (current + 1) % CHALLENGE_ICON_IDS.length
    : current;
  try {
    sessionStorage.setItem(STORAGE_KEY, String(focusIdx));
  } catch {
    // ignore quota / private mode
  }
}

export function hasChallengeMenuFocus(): boolean {
  return peekChallengeMenuFocus() !== null;
}

export function peekChallengeMenuFocus(): number | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const idx = Number.parseInt(raw, 10);
    if (
      !Number.isFinite(idx) ||
      idx < 0 ||
      idx >= CHALLENGE_ICON_IDS.length
    ) {
      return null;
    }
    return idx;
  } catch {
    return null;
  }
}

export function consumeChallengeMenuFocus(): number | null {
  const idx = peekChallengeMenuFocus();
  if (idx === null) return null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return idx;
}
