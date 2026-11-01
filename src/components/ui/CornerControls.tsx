import {
  Suspense,
  useState,
  useEffect,
  useRef,
  type CSSProperties,
} from 'react';
import { useNavigate } from 'react-router';
import { useAudio } from '@/contexts/AudioContext';
import { useNostrSession } from '@/contexts/NostrSessionContext';
import { STORAGE_KEY_TV_SAFE_INSET } from '@/shared/constants/storageKeys';
import { useFloatingDock } from './useFloatingDock';
import {
  PHONE_QUERY,
  useCoarsePointer,
  useMediaQuery,
} from '@/shared/utils/inputMode';
import { lazyWithReload } from '@/lib/lazyWithReload';
import './CornerControls.css';

function getStoredTvSafeInset(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY_TV_SAFE_INSET);
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

/** Diameter of the floating quick-settings button (px). */
const FAB_SIZE = 44;

function MusicIcon({ muted }: { muted: boolean }) {
  return muted ? (
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
  );
}

function SpeakerIcon({ volume }: { volume: number }) {
  if (volume <= 0) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {volume >= 0.34 ? <path d="M15.54 8.46a5 5 0 0 1 0 7.07" /> : null}
      {volume >= 0.67 ? <path d="M19.07 4.93a10 10 0 0 1 0 14.14" /> : null}
    </svg>
  );
}

function VolumeControl({
  kind,
  volume,
  onToggle,
  onVolume,
}: {
  kind: 'music' | 'all';
  volume: number;
  onToggle: () => void;
  onVolume: (volume: number) => void;
}) {
  const muted = volume <= 0;
  const name = kind === 'music' ? 'Music' : 'All';
  const toggleLabel = muted
    ? `Unmute ${name.toLowerCase()}`
    : `Mute ${name.toLowerCase()}`;
  const percent = Math.round(volume * 100);

  return (
    <div className={`corner-volume${muted ? ' corner-volume--muted' : ''}`}>
      <button
        type="button"
        className={`corner-btn${muted ? ' corner-btn--muted' : ''}`}
        onClick={onToggle}
        aria-label={toggleLabel}
        data-tooltip={toggleLabel}
      >
        {kind === 'music' ? (
          <MusicIcon muted={muted} />
        ) : (
          <SpeakerIcon volume={volume} />
        )}
      </button>
      <div className="corner-volume__pop">
        <span className="corner-volume__name">{name}</span>
        <input
          className="corner-volume__slider"
          type="range"
          min={0}
          max={100}
          step={1}
          value={percent}
          aria-label={`${name} volume`}
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${percent}%`}
          style={{ '--volume': `${percent}%` } as CSSProperties}
          onChange={(event) => onVolume(Number(event.target.value) / 100)}
        />
        <span className="corner-volume__value" aria-hidden>
          {percent}
        </span>
      </div>
    </div>
  );
}

/** Same switch as the `/preview` routes in App.tsx. */
const previewLabsEnabled =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_PREVIEW === 'true';

const UiDebugMenu = previewLabsEnabled
  ? lazyWithReload(() =>
      import('@/components/ui/UiDebugMenu').then((mod) => ({
        default: mod.UiDebugMenu,
      }))
    )
  : null;

export function CornerControls() {
  const navigate = useNavigate();
  const {
    musicVolume,
    masterVolume,
    setMusicVolume,
    setMasterVolume,
    toggleMusicMute,
    toggleMute,
  } = useAudio();
  const nostr = useNostrSession();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tvSafeInset, setTvSafeInset] = useState(getStoredTvSafeInset);
  const touch = useCoarsePointer();
  // Collapse into one toggle on touch screens and on any phone-width window.
  const narrow = useMediaQuery(PHONE_QUERY);
  const compact = touch || narrow;
  const [touchOpen, setTouchOpen] = useState(false);
  const fab = useFloatingDock(FAB_SIZE, compact);
  const rootRef = useRef<HTMLDivElement>(null);
  const canFullscreen =
    typeof document !== 'undefined' && document.fullscreenEnabled === true;

  // Touch panel: close on any tap outside it.
  useEffect(() => {
    if (!compact || !touchOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setTouchOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [compact, touchOpen]);

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

  const rootClass = [
    'corner-controls',
    compact && 'corner-controls--touch',
    compact && touchOpen && 'corner-controls--open',
    compact && `corner-controls--dock-${fab.side}`,
    compact && fab.opensUp && 'corner-controls--opens-up',
    compact && fab.dragging && 'corner-controls--dragging',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={rootClass}
      ref={rootRef}
      style={
        compact
          ? {
              transform: `translate3d(${fab.point.x}px, ${fab.point.y}px, 0)`,
            }
          : undefined
      }
    >
      {compact ? (
        <button
          type="button"
          className="corner-controls__fab"
          aria-expanded={touchOpen}
          aria-label={touchOpen ? 'Close quick settings' : 'Quick settings'}
          {...fab.handlers}
          onPointerMove={(event) => {
            fab.handlers.onPointerMove(event);
            if (fab.dragging && touchOpen) setTouchOpen(false);
          }}
          onClick={() => {
            if (fab.consumeDrag()) return;
            setTouchOpen((v) => !v);
          }}
        >
          <span className="corner-controls__fab-icon" aria-hidden>
            <span />
            <span />
            <span />
          </span>
        </button>
      ) : null}
      <div className="corner-controls__panel">
        {!touch || canFullscreen ? (
          <button
            type="button"
            className="corner-btn"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            data-tooltip={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            )}
          </button>
        ) : null}

        {touch ? null : (
          <button
            type="button"
            className={`corner-btn ${tvSafeInset ? 'corner-btn--tv-safe-on' : ''}`}
            onClick={() => setTvSafeInset((v) => !v)}
            aria-label={
              tvSafeInset ? 'Disable TV safe margin' : 'TV safe margin'
            }
            data-tooltip={tvSafeInset ? 'TV margin on' : 'TV margin'}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <rect x="3" y="3" width="18" height="18" rx="1" />
              <rect
                x="7"
                y="7"
                width="10"
                height="10"
                rx="0.5"
                strokeDasharray="2 1.5"
              />
            </svg>
          </button>
        )}

        <VolumeControl
          kind="music"
          volume={musicVolume}
          onToggle={toggleMusicMute}
          onVolume={setMusicVolume}
        />

        <VolumeControl
          kind="all"
          volume={masterVolume}
          onToggle={toggleMute}
          onVolume={setMasterVolume}
        />

        <button
          type="button"
          className={`corner-btn corner-btn--nostr${nostr.signedIn ? ' corner-btn--nostr-signed-in' : ''}`}
          onClick={() => navigate('/config')}
          aria-label={
            nostr.signedIn
              ? `Nostr: ${nostr.displayName ?? 'signed in'}`
              : 'Sign in with Nostr (Settings)'
          }
          data-tooltip={
            nostr.signedIn
              ? (nostr.displayName ?? 'Nostr connected')
              : 'Not signed in — Settings'
          }
        >
          {nostr.signedIn && nostr.picture ? (
            <img
              className="corner-btn__nostr-avatar"
              src={nostr.picture}
              alt=""
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M5 20c0-4 3.6-7 7-7s7 3 7 7" />
            </svg>
          )}
        </button>
        {UiDebugMenu ? (
          <Suspense fallback={null}>
            <UiDebugMenu />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
