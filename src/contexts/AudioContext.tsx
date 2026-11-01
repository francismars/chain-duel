/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useRef,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

import { resumeMenuMusicPosition } from '@/game/audio/resultMusicHandoff';

/** One-shot sound effect paths for menu UI */
export const SFX = {
  /** Play when moving focus between buttons (e.g. arrow keys) */
  MENU_SELECT: '/sound/button-select.mp3',
  /** Play when confirming / pressing a button (Enter, click) */
  MENU_CONFIRM: '/sound/button-focus.mp3',
} as const;

/** Gain per SFX path (0–1). Selection uses a new Audio each play so clips can overlap and finish. */
const SFX_VOLUME: Partial<Record<string, number>> = {
  [SFX.MENU_SELECT]: 0.5,
  [SFX.MENU_CONFIRM]: 0.7,
};

interface BackgroundAudioContextType {
  play: (src: string, loop?: boolean) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  playSfx: (src: string) => void;
  isPlaying: boolean;
  isMusicMuted: boolean;
  isMuted: boolean;
  /** Music channel, 0–1. Zero is music mute. */
  musicVolume: number;
  /** Master level, 0–1. Zero is mute all. Music is scaled by this too. */
  masterVolume: number;
  toggleMusicMute: () => void;
  toggleMute: () => void;
  setMusicVolume: (volume: number) => void;
  setMasterVolume: (volume: number) => void;
  currentSrc: string | null;
}

const BackgroundAudioContext = createContext<BackgroundAudioContextType | null>(
  null
);

const STORAGE_KEY_MUSIC_MUTED = 'chainduel_musicMuted';
const STORAGE_KEY_MUTED = 'chainduel_muted';
const STORAGE_KEY_MUSIC_VOLUME = 'chainduel_musicVolume';
const STORAGE_KEY_MASTER_VOLUME = 'chainduel_masterVolume';
const STORAGE_KEY_MUSIC_VOLUME_LAST = 'chainduel_musicVolumeLast';
const STORAGE_KEY_MASTER_VOLUME_LAST = 'chainduel_masterVolumeLast';

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function getStoredFlag(key: string): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

/** Volume key wins. Older installs only have the mute flag, which is 0. */
function readStoredVolume(key: string, muted: boolean): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return muted ? 0 : 1;
    return clampVolume(Number(raw));
  } catch {
    return muted ? 0 : 1;
  }
}

function readStoredLast(key: string, current: number): number {
  const stored = readStoredVolume(key, false);
  if (stored > 0) return stored;
  return current > 0 ? current : 1;
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [musicVolume, setMusicVolumeState] = useState(() =>
    readStoredVolume(
      STORAGE_KEY_MUSIC_VOLUME,
      getStoredFlag(STORAGE_KEY_MUSIC_MUTED)
    )
  );
  const [masterVolume, setMasterVolumeState] = useState(() =>
    readStoredVolume(
      STORAGE_KEY_MASTER_VOLUME,
      getStoredFlag(STORAGE_KEY_MUTED)
    )
  );
  const [currentSrc, setCurrentSrc] = useState<string | null>(null);
  const isMusicMuted = musicVolume <= 0;
  const isMuted = masterVolume <= 0;
  // Refs so play() always reads the latest mute state without stale closures
  const musicVolumeRef = useRef(musicVolume);
  const masterVolumeRef = useRef(masterVolume);
  const isMusicMutedRef = useRef(isMusicMuted);
  const isMutedRef = useRef(isMuted);
  const musicLastRef = useRef(
    readStoredLast(STORAGE_KEY_MUSIC_VOLUME_LAST, musicVolume)
  );
  const masterLastRef = useRef(
    readStoredLast(STORAGE_KEY_MASTER_VOLUME_LAST, masterVolume)
  );
  // When we skip play() because muted, we still need the src so unmute can start playback
  const lastRequestedSrcRef = useRef<string | null>(null);

  // Keep refs in sync with state (e.g. after hydration from localStorage)
  useEffect(() => {
    musicVolumeRef.current = musicVolume;
    masterVolumeRef.current = masterVolume;
    isMusicMutedRef.current = musicVolume <= 0;
    isMutedRef.current = masterVolume <= 0;
  }, [musicVolume, masterVolume]);

  const playSfx = useCallback((src: string) => {
    if (masterVolumeRef.current <= 0) return;
    const normalized = src.startsWith('/') ? src : `/${src}`;
    const audio = new Audio(normalized);
    audio.volume = (SFX_VOLUME[normalized] ?? 1) * masterVolumeRef.current;
    audio.play().catch(() => {});
    audio.addEventListener('ended', () => {
      audio.removeAttribute('src');
      audio.load();
    });
  }, []);

  // Create music audio element once
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.loop = true;
    audioRef.current.volume = musicVolumeRef.current * masterVolumeRef.current;
    audioRef.current.muted =
      musicVolumeRef.current <= 0 || masterVolumeRef.current <= 0;

    // Handle play/pause events
    audioRef.current.addEventListener('play', () => setIsPlaying(true));
    audioRef.current.addEventListener('pause', () => setIsPlaying(false));
    audioRef.current.addEventListener('ended', () => setIsPlaying(false));

    // Don't try to autoplay without a source - wait for a page to request music
    // Audio will be played when BackgroundAudio components mount

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const play = useCallback((src: string, loop: boolean = true) => {
    const audio = audioRef.current;
    if (!audio) return;

    // Normalize src path for comparison
    const normalizedSrc = src.startsWith('/') ? src : `/${src}`;
    lastRequestedSrcRef.current = normalizedSrc;

    // Don't start or restart music when muted (e.g. after cancel game back to menu)
    if (isMusicMutedRef.current || isMutedRef.current) {
      return;
    }

    // If same source is already playing, don't restart
    if (audio.src.endsWith(normalizedSrc) && !audio.paused) {
      return;
    }

    audio.loop = loop;
    setCurrentSrc(normalizedSrc);

    const attemptPlay = () => {
      // Respect mute state — don't play if music or all audio is muted
      if (isMusicMutedRef.current || isMutedRef.current) return;
      audio.volume = musicVolumeRef.current * masterVolumeRef.current;
      resumeMenuMusicPosition(audio);
      audio.play().catch((error) => {
        console.warn('Audio autoplay prevented:', error.message);
      });
    };

    // Play only after the new source is ready to avoid "play() interrupted by a new load"
    audio.addEventListener('canplay', attemptPlay, { once: true });
    audio.src = normalizedSrc;

    // If already loaded (e.g. same file cached), canplay may not fire
    if (audio.readyState >= 3) {
      audio.removeEventListener('canplay', attemptPlay);
      attemptPlay();
    }
  }, []);

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      setCurrentSrc(null);
    }
  };

  const pause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
  };

  const resume = () => {
    if (audioRef.current) {
      audioRef.current.play().catch((error) => {
        console.warn('Audio resume failed:', error);
      });
    }
  };

  const resumeMenuMusic = (audio: HTMLAudioElement) => {
    const src = lastRequestedSrcRef.current;
    audio.volume = musicVolumeRef.current * masterVolumeRef.current;
    if (src) {
      audio.loop = true;
      setCurrentSrc(src);
      audio.addEventListener(
        'canplay',
        () => {
          resumeMenuMusicPosition(audio);
          void audio.play().catch(() => {});
        },
        {
          once: true,
        }
      );
      audio.src = src;
      if (audio.readyState >= 3) {
        resumeMenuMusicPosition(audio);
        audio.play().catch(() => {});
      }
    } else {
      audio.play().catch(() => {});
    }
  };

  const applyMenuLevel = (wasAudible: boolean) => {
    const audio = audioRef.current;
    if (!audio) return;
    const audible = musicVolumeRef.current > 0 && masterVolumeRef.current > 0;
    audio.volume = musicVolumeRef.current * masterVolumeRef.current;
    audio.muted = !audible;
    if (!audible) {
      audio.pause();
      return;
    }
    if (!wasAudible) resumeMenuMusic(audio);
  };

  const commitMusicVolume = (next: number, remember: number | null) => {
    const wasAudible =
      musicVolumeRef.current > 0 && masterVolumeRef.current > 0;
    const volume = clampVolume(next);
    musicVolumeRef.current = volume;
    isMusicMutedRef.current = volume <= 0;
    if (remember != null && remember > 0) {
      musicLastRef.current = remember;
      writeStored(STORAGE_KEY_MUSIC_VOLUME_LAST, String(remember));
    }
    writeStored(STORAGE_KEY_MUSIC_VOLUME, String(volume));
    writeStored(STORAGE_KEY_MUSIC_MUTED, volume <= 0 ? '1' : '0');
    setMusicVolumeState(volume);
    applyMenuLevel(wasAudible);
  };

  const commitMasterVolume = (next: number, remember: number | null) => {
    const wasAudible =
      musicVolumeRef.current > 0 && masterVolumeRef.current > 0;
    const volume = clampVolume(next);
    masterVolumeRef.current = volume;
    isMutedRef.current = volume <= 0;
    if (remember != null && remember > 0) {
      masterLastRef.current = remember;
      writeStored(STORAGE_KEY_MASTER_VOLUME_LAST, String(remember));
    }
    writeStored(STORAGE_KEY_MASTER_VOLUME, String(volume));
    writeStored(STORAGE_KEY_MUTED, volume <= 0 ? '1' : '0');
    setMasterVolumeState(volume);
    applyMenuLevel(wasAudible);
  };

  const setMusicVolume = (value: number) => {
    const next = clampVolume(value);
    const prev = musicVolumeRef.current;
    commitMusicVolume(next, next > 0 ? next : prev > 0 ? prev : null);
  };

  const setMasterVolume = (value: number) => {
    const next = clampVolume(value);
    const prev = masterVolumeRef.current;
    commitMasterVolume(next, next > 0 ? next : prev > 0 ? prev : null);
  };

  const toggleMusicMute = () => {
    if (musicVolumeRef.current > 0) {
      commitMusicVolume(0, musicVolumeRef.current);
      return;
    }
    commitMusicVolume(
      musicLastRef.current > 0 ? musicLastRef.current : 1,
      null
    );
  };

  const toggleMute = () => {
    if (masterVolumeRef.current > 0) {
      commitMasterVolume(0, masterVolumeRef.current);
      return;
    }
    commitMasterVolume(
      masterLastRef.current > 0 ? masterLastRef.current : 1,
      null
    );
  };

  return (
    <BackgroundAudioContext.Provider
      value={{
        play,
        stop,
        pause,
        resume,
        playSfx,
        isPlaying,
        isMusicMuted,
        isMuted,
        musicVolume,
        masterVolume,
        toggleMusicMute,
        toggleMute,
        setMusicVolume,
        setMasterVolume,
        currentSrc,
      }}
    >
      {children}
    </BackgroundAudioContext.Provider>
  );
}

export function useAudio() {
  const context = useContext(BackgroundAudioContext);
  if (!context) {
    throw new Error('useAudio must be used within AudioProvider');
  }
  return context;
}
