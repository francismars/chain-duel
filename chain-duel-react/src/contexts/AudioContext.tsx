/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useRef, useEffect, useState, type ReactNode } from 'react';

interface BackgroundAudioContextType {
  play: (src: string, loop?: boolean) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  isPlaying: boolean;
  currentSrc: string | null;
}

const BackgroundAudioContext = createContext<BackgroundAudioContextType | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string | null>(null);

  // Create audio element once
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.loop = true;
    
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

  const play = (src: string, loop: boolean = true) => {
    const audio = audioRef.current;
    if (!audio) return;

    // Normalize src path for comparison
    const normalizedSrc = src.startsWith('/') ? src : `/${src}`;

    // If same source is already playing, don't restart
    if (currentSrc === normalizedSrc && isPlaying) {
      return;
    }

    audio.loop = loop;
    setCurrentSrc(normalizedSrc);

    // Play only after the new source is ready to avoid "play() interrupted by a new load"
    const onCanPlay = () => {
      audio.play().catch((error) => {
        console.warn('Audio autoplay prevented:', error.message);
      });
    };
    audio.addEventListener('canplay', onCanPlay, { once: true });
    audio.src = normalizedSrc;

    // If already loaded (e.g. same file cached), canplay may not fire
    if (audio.readyState >= 3) {
      audio.removeEventListener('canplay', onCanPlay);
      audio.play().catch((error) => {
        console.warn('Audio autoplay prevented:', error.message);
      });
    }
  };

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

  return (
    <BackgroundAudioContext.Provider value={{ play, stop, pause, resume, isPlaying, currentSrc }}>
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
