import { useState, useEffect } from 'react';
import { useAudio } from '@/contexts/AudioContext';
import { STORAGE_KEY_TV_SAFE_INSET } from '@/shared/constants/storageKeys';
import './CornerControls.css';

function getStoredTvSafeInset(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY_TV_SAFE_INSET);
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

export function CornerControls() {
  const { isMusicMuted, isMuted, toggleMusicMute, toggleMute } = useAudio();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tvSafeInset, setTvSafeInset] = useState(getStoredTvSafeInset);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    const el = document.documentElement;
    if (tvSafeInset) {
      el.classList.add('tv-safe-inset');
    } else {
      el.classList.remove('tv-safe-inset');
    }
    try {
      localStorage.setItem(STORAGE_KEY_TV_SAFE_INSET, tvSafeInset ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [tvSafeInset]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div className="corner-controls">
      <button
        className="corner-btn"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        data-tooltip={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        {isFullscreen ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
        )}
      </button>

      <button
        type="button"
        className={`corner-btn ${tvSafeInset ? 'corner-btn--tv-safe-on' : ''}`}
        onClick={() => setTvSafeInset((v) => !v)}
        aria-label={tvSafeInset ? 'Disable TV safe margin' : 'TV safe margin'}
        data-tooltip={tvSafeInset ? 'TV margin on' : 'TV margin'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="1" />
          <rect x="7" y="7" width="10" height="10" rx="0.5" strokeDasharray="2 1.5" />
        </svg>
      </button>

      <button
        className={`corner-btn ${isMusicMuted ? 'corner-btn--muted' : ''}`}
        onClick={toggleMusicMute}
        aria-label={isMusicMuted ? 'Unmute music' : 'Mute music'}
        data-tooltip={isMusicMuted ? 'Unmute music' : 'Mute music'}
      >
        {isMusicMuted ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18V5l12-2v13" />
            <line x1="1" y1="1" x2="23" y2="23" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        )}
      </button>

      <button
        className={`corner-btn ${isMuted ? 'corner-btn--muted' : ''}`}
        onClick={toggleMute}
        aria-label={isMuted ? 'Unmute all' : 'Mute all'}
        data-tooltip={isMuted ? 'Unmute all' : 'Mute all'}
      >
        {isMuted ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        )}
      </button>
    </div>
  );
}
