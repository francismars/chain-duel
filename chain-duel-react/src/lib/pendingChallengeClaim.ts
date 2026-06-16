const STORAGE_KEY = 'pendingChallengeClaim';

export type PendingChallengeClaim = {
  name: string;
  bounty: number;
  challengeId: string;
  claimToken: string;
  noteContent: string;
  noteTags: string[][];
};

export function savePendingChallengeClaim(data: PendingChallengeClaim): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota / private mode
  }
}

export function loadPendingChallengeClaim(): PendingChallengeClaim | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingChallengeClaim;
    if (
      !parsed?.claimToken ||
      !parsed.noteContent ||
      !Array.isArray(parsed.noteTags)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingChallengeClaim(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
