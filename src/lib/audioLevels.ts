/**
 * Listener volume levels persisted by the corner controls.
 * Read straight from storage so audio built after a remount or hot reload
 * starts at the saved level instead of full volume.
 */

export const STORAGE_KEY_MUSIC_MUTED = 'chainduel_musicMuted';
export const STORAGE_KEY_MUTED = 'chainduel_muted';
export const STORAGE_KEY_MUSIC_VOLUME = 'chainduel_musicVolume';
export const STORAGE_KEY_MASTER_VOLUME = 'chainduel_masterVolume';
export const STORAGE_KEY_MUSIC_VOLUME_LAST = 'chainduel_musicVolumeLast';
export const STORAGE_KEY_MASTER_VOLUME_LAST = 'chainduel_masterVolumeLast';

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

export function getStoredFlag(key: string): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

/** Volume key wins. Older installs only have the mute flag, which is 0. */
export function readStoredVolume(key: string, muted: boolean): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return muted ? 0 : 1;
    return clampVolume(Number(raw));
  } catch {
    return muted ? 0 : 1;
  }
}

export function readStoredAudioLevels(): {
  musicVolume: number;
  masterVolume: number;
} {
  return {
    musicVolume: readStoredVolume(
      STORAGE_KEY_MUSIC_VOLUME,
      getStoredFlag(STORAGE_KEY_MUSIC_MUTED)
    ),
    masterVolume: readStoredVolume(
      STORAGE_KEY_MASTER_VOLUME,
      getStoredFlag(STORAGE_KEY_MUTED)
    ),
  };
}
