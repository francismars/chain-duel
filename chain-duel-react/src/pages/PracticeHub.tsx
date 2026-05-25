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
  parsePlaySearchParam,
  playStyleFromIdx,
  playStyleToIdx,
  playStyleToSearchValue,
  type PracticeHubPlayStyleFocus,
  type PracticePlayStyle,
} from '@/pages/practiceHubPlayStyleNav';

export default function PracticeHub() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { playSfx } = useAudio();
  useGamepad(true);

  const playStyle = parsePlaySearchParam(searchParams.get('play'));
  const playStyleIdx = playStyleToIdx(playStyle);

  const [playStyleNav, setPlayStyleNav] = useState<PracticeHubPlayStyleFocus>({
    kind: 'playStyle',
    idx: playStyleIdx,
  });

  const playStyleRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const footerBackRef = useRef<HTMLButtonElement | null>(null);
  const footerStartRef = useRef<HTMLButtonElement | null>(null);
  const freePlayPanelRef = useRef<PracticeFreePlayPanelHandle | null>(null);
  const challengesPanelRef = useRef<PracticeChallengesPanelHandle | null>(null);
  const [freeFooterNav, setFreeFooterNav] = useState<'back' | 'start' | null>(null);

  const setPlayStyle = useCallback(
    (next: PracticePlayStyle) => {
      const value = playStyleToSearchValue(next);
      if (searchParams.get('play') !== value) {
        setSearchParams({ play: value }, { replace: true });
      }
      setPlayStyleNav({ kind: 'playStyle', idx: playStyleToIdx(next) });
    },
    [searchParams, setSearchParams]
  );

  useEffect(() => {
    setPlayStyleNav((prev) =>
      prev.kind === 'playStyle' ? { kind: 'playStyle', idx: playStyleIdx } : prev
    );
  }, [playStyleIdx]);

  useEffect(() => {
    if (playStyle !== 'free') setFreeFooterNav(null);
  }, [playStyle]);

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

  const focusFirstInPanel = useCallback(() => {
    if (playStyle === 'free') {
      const el =
        document.querySelector<HTMLElement>(
          '.practice-free-play-panel button[tabindex="0"]'
        ) ??
        document.querySelector<HTMLElement>('.practice-free-play-panel button');
      el?.focus();
    } else {
      const el =
        document.querySelector<HTMLElement>('.practice-challenges-panel button');
      el?.focus();
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

      const active = document.activeElement as HTMLElement | null;
      const playStyleCardIdx = playStyleRefs.current.indexOf(
        active as HTMLButtonElement
      );
      const onPlayStyleCard = playStyleCardIdx >= 0;

      if (
        e.key === 'Tab' &&
        e.shiftKey &&
        active?.closest('.practice-play-style-area') &&
        !onPlayStyleCard
      ) {
        e.preventDefault();
        focusPlayStyleCard(playStyleIdx);
        setPlayStyleNav({ kind: 'playStyle', idx: playStyleIdx });
        return;
      }

      if (!onPlayStyleCard) {
        return;
      }

      const isLeft = e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A';
      const isRight = e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';
      const isUp = e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W';
      const isDown = e.key === 'ArrowDown' || e.key === 's' || e.key === 'S';
      const isActivate = e.key === 'Enter' || e.key === ' ';
      const isTab = e.key === 'Tab' && !e.shiftKey;

      if (isTab) {
        e.preventDefault();
        focusFirstInPanel();
        return;
      }

      if (isActivate) {
        e.preventDefault();
        if (e.repeat) return;
        if (playStyleCardIdx === 0 || playStyleCardIdx === 1) {
          activatePlayStyle(playStyleCardIdx);
        }
        return;
      }

      if (!isLeft && !isRight && !isUp && !isDown) return;

      e.preventDefault();
      const currentIdx = playStyleCardIdx as 0 | 1;
      const nextIdx = movePlayStyleNav(
        currentIdx,
        isLeft || isUp ? 'left' : 'right'
      );
      setPlayStyleNav({ kind: 'playStyle', idx: nextIdx });
      playSfx(SFX.MENU_SELECT);
      setPlayStyle(playStyleFromIdx(nextIdx));
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    activatePlayStyle,
    focusFirstInPanel,
    focusPlayStyleCard,
    navigate,
    playSfx,
    playStyleIdx,
    setPlayStyle,
  ]);

  useEffect(() => {
    if (playStyleNav.kind !== 'playStyle') return;
    focusPlayStyleCard(playStyleNav.idx);
  }, [playStyleNav, focusPlayStyleCard, playStyle]);

  const playStyleFocusClass = (idx: 0 | 1) =>
    playStyleNav.kind === 'playStyle' && playStyleNav.idx === idx
      ? 'practice-focus-target'
      : '';

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
          aria-labelledby="lh-play-style"
        >
          <h3 id="lh-play-style" className="p2p-picker-group-label">
            HOW TO PLAY
          </h3>
          <div className="p2p-picker-row" role="radiogroup" aria-label="Play style">
            <button
              ref={(el) => {
                playStyleRefs.current[0] = el;
              }}
              type="button"
              role="radio"
              aria-checked={playStyle === 'free'}
              tabIndex={
                playStyleNav.kind === 'playStyle' && playStyleNav.idx === 0 ? 0 : -1
              }
              className={[
                'p2p-picker-card',
                'p2p-picker-card--lightning',
                playStyle === 'free' ? 'p2p-picker-card--selected' : '',
                playStyleFocusClass(0),
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                setPlayStyleNav({ kind: 'playStyle', idx: 0 });
                activatePlayStyle(0);
              }}
            >
              <svg className="p2p-picker-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
              tabIndex={
                playStyleNav.kind === 'playStyle' && playStyleNav.idx === 1 ? 0 : -1
              }
              className={[
                'p2p-picker-card',
                'p2p-picker-card--nostr',
                playStyle === 'challenges' ? 'p2p-picker-card--selected' : '',
                playStyleFocusClass(1),
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                setPlayStyleNav({ kind: 'playStyle', idx: 1 });
                activatePlayStyle(1);
              }}
            >
              <svg className="p2p-picker-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="6" y="8" width="12" height="10" rx="1" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.12" />
                <circle cx="9.5" cy="12" r="1.5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.3" />
                <circle cx="14.5" cy="12" r="1.5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.3" />
                <path d="M9 18v2M15 18v2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                <path d="M12 4v4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                <circle cx="12" cy="3.5" r="1" stroke="currentColor" strokeWidth="1" />
              </svg>
              <span className="p2p-picker-label">CHALLENGES</span>
              <span className="p2p-picker-sub">Beat the bots: win sats on Nostr</span>
            </button>
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
              footerBackRef={footerBackRef}
              footerStartRef={footerStartRef}
              onFooterNav={setFreeFooterNav}
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
              footerBackRef={footerBackRef}
              footerStartRef={footerStartRef}
            />
          </div>
        </div>

        <div className="practice-actions practice-hub-panel-footer">
          <Button
            ref={footerBackRef}
            tabIndex={playStyle === 'free' && freeFooterNav === 'back' ? 0 : playStyle === 'challenges' ? 0 : -1}
            className={[
              'practice-back',
              playStyle === 'free' && freeFooterNav === 'back' ? 'practice-start--focused' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              playSfx(SFX.MENU_SELECT);
              navigate('/');
            }}
          >
            MAIN MENU
          </Button>
          <Button
            ref={footerStartRef}
            tabIndex={playStyle === 'free' && freeFooterNav === 'start' ? 0 : playStyle === 'challenges' ? 0 : -1}
            className={[
              'practice-start',
              playStyle === 'free' && freeFooterNav === 'start' ? 'practice-start--focused' : '',
            ]
              .filter(Boolean)
              .join(' ')}
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
