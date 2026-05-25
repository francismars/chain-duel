/** `sessionStorage` key for client-only practice setup (must not overlap paid P2P/tournament). */
export const GAME_CONFIG_STORAGE_KEY = 'gameConfig';

/** Written by /practice when starting a match; cleared before paid/socket-backed /game. */
export const PRACTICE_SESSION_ORIGIN = 'practice';

/** Practice hub session modes (canonical `PRACTICE`; legacy aliases still accepted). */

export const PRACTICE_HUB_BOOTSTRAP_MODES = [
  'PRACTICE',
  'LOCAL',
  'TESTNET',
  'POWERUP',
  'POWER-UP ARENA',
  'SOLO',
] as const;

export function normalizeGameConfigMode(mode: unknown): string {
  return String(mode ?? '').toUpperCase();
}

export function isPracticeHubGameMode(mode: unknown): boolean {
  const m = normalizeGameConfigMode(mode);
  return (PRACTICE_HUB_BOOTSTRAP_MODES as readonly string[]).includes(m);
}

export function isPracticeChallengeConfig(cfg: Record<string, unknown>): boolean {
  const m = normalizeGameConfigMode(cfg.mode);
  if (m === 'SOLO') return true;
  return m === 'PRACTICE' && cfg.practiceChallenge === true;
}

export function practiceHubExitPath(cfg: Record<string, unknown>): string {
  if (isPracticeChallengeConfig(cfg)) return '/practice?play=challenges';
  return '/practice';
}

/** Parsed `sessionStorage.gameConfig` (empty object if missing or invalid). */
export function readSessionGameConfig(): Record<string, unknown> {
  try {
    const raw = sessionStorage.getItem(GAME_CONFIG_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // ignore
  }
  return {};
}

/** True only for matches started from the Practice hub (not stale mode strings alone). */
export function isExplicitPracticeSession(cfg: Record<string, unknown>): boolean {
  return cfg.sessionOrigin === PRACTICE_SESSION_ORIGIN;
}

export function sessionUsesPracticeHubConfig(): boolean {
  return isExplicitPracticeSession(readSessionGameConfig());
}

/** Persist practice setup immediately before navigating to `/game`. */
export function savePracticeGameConfig(config: Record<string, unknown>): void {
  sessionStorage.setItem(
    GAME_CONFIG_STORAGE_KEY,
    JSON.stringify({ ...config, sessionOrigin: PRACTICE_SESSION_ORIGIN }),
  );
}

/** Remove client practice blob so P2P/tournament socket bootstrap is authoritative. */
export function clearClientGameConfig(): void {
  sessionStorage.removeItem(GAME_CONFIG_STORAGE_KEY);
}

/** Server duel modes that must win over any leftover practice `gameConfig`. */
export function isSocketBackedDuelMode(mode: unknown): boolean {
  const m = normalizeGameConfigMode(mode);
  return (
    m === 'P2P' ||
    m === 'P2PNOSTR' ||
    m === 'TOURNAMENT' ||
    m === 'TOURNAMENTNOSTR'
  );
}
