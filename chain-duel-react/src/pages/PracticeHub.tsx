import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useAudio, SFX } from '@/contexts/AudioContext';
import { useGamepad } from '@/hooks/useGamepad';
import { PracticeFreePlayPanel } from '@/features/practice/PracticeFreePlayPanel';
import { PracticeChallengesPanel } from '@/features/practice/PracticeChallengesPanel';
import type {
  PracticeChallengesPanelHandle,
  PracticeFreePlayPanelHandle,
} from '@/features/practice/practicePanelHandles';
import '@/components/ui/Button.css';
import './practiceHub.css';
import '@/styles/pages/p2p-entry.css';
import '@/styles/pages/practice-hub-page.css';
import '@/styles/pages/solo-challenges.css';
import {
  movePlayStyleNav,
  movePracticeHubFooter,
  parsePlaySearchParam,
  playStyleFromIdx,
  playStyleToIdx,
  playStyleToSearchValue,
  type PracticeHubFocus,
  type PracticePlayStyle,
} from '@/pages/practiceHubPlayStyleNav';

export default function PracticeHub() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { playSfx } = useAudio();
  useGamepad(true);

  const playStyle = parsePlaySearchParam(searchParams.get('play'));
  const playStyleIdx = playStyleToIdx(playStyle);

  const [hubFocus, setHubFocus] = useState<PracticeHubFocus>({
    zone: 'playStyle',
    idx: playStyleIdx,
  });

  const playStyleRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const footerBackRef = useRef<HTMLButtonElement | null>(null);
  const footerStartRef = useRef<HTMLButtonElement | null>(null);
  const freePlayPanelRef = useRef<PracticeFreePlayPanelHandle | null>(null);
  const challengesPanelRef = useRef<PracticeChallengesPanelHandle | null>(null);

  const setPlayStyle = useCallback(
    (next: PracticePlayStyle) => {
      const value = playStyleToSearchValue(next);
      if (searchParams.get('play') !== value) {
        setSearchParams({ play: value }, { replace: true });
      }
      setHubFocus((prev) =>
        prev.zone === 'playStyle' ? { zone: 'playStyle', idx: playStyleToIdx(next) } : prev
      );
    },
    [searchParams, setSearchParams]
  );

  useEffect(() => {
    setHubFocus((prev) =>
      prev.zone === 'playStyle' ? { zone: 'playStyle', idx: playStyleIdx } : prev
    );
  }, [playStyleIdx]);

  const focusPlayStyleCard = useCallback((idx: 0 | 1) => {
    playStyleRefs.current[idx]?.focus();
  }, []);

  const activatePlayStyle = useCallback(
    (idx: 0 | 1) => {
      playSfx(SFX.MENU_SELECT);
      setPlayStyle(playStyleFromIdx(idx));
    },
    [playSfx, setPlayStyle]
  );

  const enterPanel = useCallback(() => {
    setHubFocus({ zone: 'panel' });
    if (playStyle === 'free') {
      freePlayPanelRef.current?.focusDefault();
    } else {
      challengesPanelRef.current?.focusDefault();
    }
  }, [playStyle]);

  const enterPlayStyle = useCallback(() => {
    setHubFocus({ zone: 'playStyle', idx: playStyleIdx });
    focusPlayStyleCard(playStyleIdx);
  }, [focusPlayStyleCard, playStyleIdx]);

  const enterFooter = useCallback((which: 'back' | 'start') => {
    setHubFocus({ zone: 'footer', which });
    if (which === 'back') footerBackRef.current?.focus();
    else footerStartRef.current?.focus();
  }, []);

  const resumePanelFromFooter = useCallback(() => {
    setHubFocus({ zone: 'panel' });
    if (playStyle === 'free') {
      freePlayPanelRef.current?.focusBeforeFooter();
    } else {
      challengesPanelRef.current?.focusBeforeFooter();
    }
  }, [playStyle]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        playSfx(SFX.MENU_SELECT);
        navigate('/');
        return;
      }

      const isLeft = e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A';
      const isRight = e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';
      const isUp = e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W';
      const isDown = e.key === 'ArrowDown' || e.key === 's' || e.key === 'S';
      const isActivate = e.key === 'Enter' || e.key === ' ';
      const isTab = e.key === 'Tab' && !e.shiftKey;
      const isTabBack = e.key === 'Tab' && e.shiftKey;

      if (hubFocus.zone === 'footer') {
        if (!isLeft && !isRight && !isUp && !isDown && !isActivate) return;
        e.preventDefault();
        if (e.repeat && isActivate) return;

        if (isActivate) {
          if (hubFocus.which === 'back') footerBackRef.current?.click();
          else footerStartRef.current?.click();
          return;
        }

        if (isDown) {
          return;
        }

        const moved = movePracticeHubFooter(
          isUp ? 'up' : isLeft ? 'left' : 'right'
        );
        if (moved === 'panel') {
          playSfx(SFX.MENU_SELECT);
          resumePanelFromFooter();
          return;
        }
        if (moved === 'back' || moved === 'start') {
          if (moved !== hubFocus.which) {
            playSfx(SFX.MENU_SELECT);
            enterFooter(moved);
          }
        }
        return;
      }

      if (hubFocus.zone === 'panel') {
        if (isTabBack) {
          e.preventDefault();
          enterPlayStyle();
          return;
        }
        if (isActivate) {
          const active = document.activeElement;
          if (active === footerBackRef.current || active === footerStartRef.current) {
            e.preventDefault();
            if (e.repeat) return;
            (active as HTMLButtonElement).click();
            return;
          }
        }
        return;
      }

      // playStyle zone ("HOW TO PLAY") — Up is a no-op; nothing above this row
      if (isUp) {
        e.preventDefault();
        return;
      }

      if (!isLeft && !isRight && !isDown && !isActivate && !isTab && !isTabBack) {
        return;
      }

      if (isTab || isDown) {
        e.preventDefault();
        enterPanel();
        return;
      }

      if (isTabBack) {
        return;
      }

      if (isActivate) {
        e.preventDefault();
        if (e.repeat) return;
        activatePlayStyle(hubFocus.idx);
        return;
      }

      if (!isLeft && !isRight) return;

      e.preventDefault();
      const nextIdx = movePlayStyleNav(isLeft ? 'left' : 'right');
      if (nextIdx === hubFocus.idx) return;
      setHubFocus({ zone: 'playStyle', idx: nextIdx });
      playSfx(SFX.MENU_SELECT);
      setPlayStyle(playStyleFromIdx(nextIdx));
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    activatePlayStyle,
    enterFooter,
    enterPanel,
    enterPlayStyle,
    hubFocus,
    navigate,
    playSfx,
    resumePanelFromFooter,
    setPlayStyle,
  ]);

  useEffect(() => {
    if (hubFocus.zone === 'playStyle') {
      focusPlayStyleCard(hubFocus.idx);
      return;
    }
    if (hubFocus.zone === 'footer') {
      if (hubFocus.which === 'back') footerBackRef.current?.focus();
      else footerStartRef.current?.focus();
    }
  }, [hubFocus, focusPlayStyleCard]);

  const playStyleFocusClass = (idx: 0 | 1) =>
    hubFocus.zone === 'playStyle' && hubFocus.idx === idx ? 'practice-focus-target' : '';

  const footerBackFocused =
    hubFocus.zone === 'footer' && hubFocus.which === 'back';
  const footerStartFocused =
    hubFocus.zone === 'footer' && hubFocus.which === 'start';

  return (
    <div
      className={[
        'practice-hub',
        'practice-hub--practice',
        'practice-hub-page',
        'p2p-entry-page',
        playStyle === 'challenges' ? 'practice-hub-page--challenges' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      <header className="practice-hub-header">
        <h2 className="practice-hub-title">PRACTICE</h2>
      </header>

      <div className="practice-panel" role="main" aria-label="Practice play">
        <section
          className="practice-section practice-play-style-section"
          aria-label="Play style"
        >
          <div className="ph-picker-block">
            <div className="p2p-picker-row" role="radiogroup" aria-label="Play style">
            <button
              ref={(el) => {
                playStyleRefs.current[0] = el;
              }}
              type="button"
              role="radio"
              aria-checked={playStyle === 'free'}
              tabIndex={hubFocus.zone === 'playStyle' && hubFocus.idx === 0 ? 0 : -1}
              className={[
                'p2p-picker-card',
                'p2p-picker-card--lightning',
                playStyle === 'free' ? 'p2p-picker-card--selected' : '',
                playStyleFocusClass(0),
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                setHubFocus({ zone: 'playStyle', idx: 0 });
                activatePlayStyle(0);
              }}
            >
              <svg className="p2p-picker-icon p2p-picker-icon--people" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="8" cy="7" r="2.5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15" />
                <path d="M3 18a5 4 0 0 1 10 0" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none" />
                <circle cx="16" cy="7" r="2.5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15" />
                <path d="M11 18a5 4 0 0 1 10 0" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none" />
              </svg>
              <span className="p2p-picker-label">FREE PLAY</span>
              <span className="p2p-picker-sub">1v1 or 4-player: humans, bots, or both</span>
            </button>

            <button
              ref={(el) => {
                playStyleRefs.current[1] = el;
              }}
              type="button"
              role="radio"
              aria-checked={playStyle === 'challenges'}
              tabIndex={hubFocus.zone === 'playStyle' && hubFocus.idx === 1 ? 0 : -1}
              className={[
                'p2p-picker-card',
                'p2p-picker-card--nostr',
                playStyle === 'challenges' ? 'p2p-picker-card--selected' : '',
                playStyleFocusClass(1),
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                setHubFocus({ zone: 'playStyle', idx: 1 });
                activatePlayStyle(1);
              }}
            >
              <svg className="p2p-picker-icon p2p-picker-icon--challenges" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M13.5 4 V17.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                <path
                  d="M13.5 4.5 H21 V10 H13.5 Z"
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeLinejoin="round"
                  fill="currentColor"
                  fillOpacity="0.15"
                />
                <path
                  d="M7 16.5 C4 13.8 2.5 10.2 2.5 6.8 V4.8 L7 3.2 L11.5 4.8 V6.8 C11.5 10.2 10 13.8 7 16.5 Z"
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeLinejoin="round"
                  fill="currentColor"
                  fillOpacity="0.12"
                />
              </svg>
              <span className="p2p-picker-label">CHALLENGES</span>
              <span className="p2p-picker-sub">Beat the bots: win sats on Nostr</span>
            </button>
          </div>
          </div>
        </section>

        <div className="practice-play-style-area">
          <div
            className={[
              'practice-play-style-panel',
              playStyle !== 'free' ? 'practice-play-style-inactive' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-hidden={playStyle !== 'free'}
          >
            <PracticeFreePlayPanel
              ref={freePlayPanelRef}
              isActive={playStyle === 'free'}
              menuZone={playStyle === 'free' ? hubFocus.zone : 'playStyle'}
              footerBackRef={footerBackRef}
              footerStartRef={footerStartRef}
              onExitToPlayStyle={enterPlayStyle}
              onEnterFooter={enterFooter}
            />
          </div>
          <div
            className={[
              'practice-play-style-panel',
              playStyle !== 'challenges' ? 'practice-play-style-inactive' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-hidden={playStyle !== 'challenges'}
          >
            <PracticeChallengesPanel
              ref={challengesPanelRef}
              isActive={playStyle === 'challenges'}
              menuZone={playStyle === 'challenges' ? hubFocus.zone : 'playStyle'}
              footerBackRef={footerBackRef}
              footerStartRef={footerStartRef}
              onExitToPlayStyle={enterPlayStyle}
              onEnterFooter={enterFooter}
            />
          </div>
        </div>

        <div className="practice-actions practice-hub-panel-footer">
          <Button
            ref={footerBackRef}
            tabIndex={footerBackFocused ? 0 : -1}
            className={[
              'practice-back',
              footerBackFocused ? 'practice-start--focused' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onFocus={() => enterFooter('back')}
            onClick={() => {
              playSfx(SFX.MENU_SELECT);
              navigate('/');
            }}
          >
            MAIN MENU
          </Button>
          <Button
            ref={footerStartRef}
            tabIndex={footerStartFocused ? 0 : -1}
            className={[
              'practice-start',
              footerStartFocused ? 'practice-start--focused' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onFocus={() => enterFooter('start')}
            onClick={() => {
              playSfx(SFX.MENU_CONFIRM);
              if (playStyle === 'free') {
                freePlayPanelRef.current?.startPractice();
              } else {
                challengesPanelRef.current?.launchSelected();
              }
            }}
          >
            {playStyle === 'free' ? 'START FREE PLAY' : 'START CHALLENGE'}
          </Button>
        </div>
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
