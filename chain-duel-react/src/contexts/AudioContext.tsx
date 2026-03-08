/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useRef, useEffect, useState, useCallback, type ReactNode } from 'react';

/** One-shot sound effect paths for menu UI (existing audio files) */
export const SFX = {
  /** Play when changing button selection (e.g. arrow keys) */
  MENU_SELECT: '/sound/Beep1.m4a',
  /** Play when confirming / pressing a button (Enter, click) */
  MENU_CONFIRM: '/sound/Beep2.m4a',
} as const;

interface BackgroundAudioContextType {
  play: (src: string, loop?: boolean) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  playSfx: (src: string) => void;
  isPlaying: boolean;
  isMusicMuted: boolean;
  isMuted: boolean;
  toggleMusicMute: () => void;
  toggleMute: () => void;
  currentSrc: string | null;
}

const BackgroundAudioContext = createContext<BackgroundAudioContextType | null>(null);

const STORAGE_KEY_MUSIC_MUTED = 'chainduel_musicMuted';
const STORAGE_KEY_MUTED = 'chainduel_muted';

function getStoredMusicMuted(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY_MUSIC_MUTED);
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

function getStoredMuted(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY_MUTED);
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMusicMuted, setIsMusicMuted] = useState(getStoredMusicMuted);
  const [isMuted, setIsMuted] = useState(getStoredMuted);
  const [currentSrc, setCurrentSrc] = useState<string | null>(null);
  // Refs so play() always reads the latest mute state without stale closures
  const isMusicMutedRef = useRef(getStoredMusicMuted());
  const isMutedRef = useRef(getStoredMuted());
  // When we skip play() because muted, we still need the src so unmute can start playback
  const lastRequestedSrcRef = useRef<string | null>(null);
  const sfxRef = useRef<HTMLAudioElement | null>(null);

  // Keep refs in sync with state (e.g. after hydration from localStorage)
  useEffect(() => {
    isMusicMutedRef.current = isMusicMuted;
    isMutedRef.current = isMuted;
  }, [isMusicMuted, isMuted]);

  const playSfx = useCallback((src: string) => {
    if (isMutedRef.current) return;
    const normalized = src.startsWith('/') ? src : `/${src}`;
    if (!sfxRef.current) {
      sfxRef.current = new Audio();
    }
    const sfx = sfxRef.current;
    sfx.currentTime = 0;
    sfx.src = normalized;
    sfx.play().catch(() => {});
  }, []);

  // Create music audio element once
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.loop = true;
    if (getStoredMuted()) {
      audioRef.current.muted = true;
    }

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
      if (sfxRef.current) {
        sfxRef.current.pause();
        sfxRef.current.src = '';
        sfxRef.current = null;
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

  const toggleMusicMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = !isMusicMutedRef.current;
    isMusicMutedRef.current = next;
    setIsMusicMuted(next);
    try {
      localStorage.setItem(STORAGE_KEY_MUSIC_MUTED, next ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (next) {
      audio.pause();
    } else if (!isMutedRef.current) {
      // Unmuting: ensure we have a source (play() may have been skipped when muted)
      const src = lastRequestedSrcRef.current;
      if (src) {
        audio.loop = true;
        setCurrentSrc(src);
        audio.addEventListener('canplay', () => audio.play().catch(() => {}), { once: true });
        audio.src = src;
        if (audio.readyState >= 3) {
          audio.play().catch(() => {});
        }
      } else {
        audio.play().catch(() => {});
      }
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = !isMutedRef.current;
    isMutedRef.current = next;
    isMusicMutedRef.current = next;
    setIsMuted(next);
    setIsMusicMuted(next);
    try {
      localStorage.setItem(STORAGE_KEY_MUTED, next ? '1' : '0');
    } catch {
      /* ignore */
    }
    audio.muted = next;
    if (!next) {
      // Unmuting: ensure we have a source (play() may have been skipped when muted)
      const src = lastRequestedSrcRef.current;
      if (src) {
        audio.loop = true;
        setCurrentSrc(src);
        audio.addEventListener('canplay', () => audio.play().catch(() => {}), { once: true });
        audio.src = src;
        if (audio.readyState >= 3) {
          audio.play().catch(() => {});
        }
      } else {
        audio.play().catch(() => {});
      }
    }
  };

  return (
    <BackgroundAudioContext.Provider value={{ play, stop, pause, resume, playSfx, isPlaying, isMusicMuted, isMuted, toggleMusicMute, toggleMute, currentSrc }}>
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
