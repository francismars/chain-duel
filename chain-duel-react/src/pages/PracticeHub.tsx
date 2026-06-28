import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useAudio, SFX } from '@/contexts/AudioContext';
import { useGamepad } from '@/hooks/useGamepad';
import { PracticeFreePlayPanel } from '@/features/practice/PracticeFreePlayPanel';
import { PracticeChallengesPanel } from '@/features/practice/PracticeChallengesPanel';
import type {
  ChallengeLaunchPhase,
  PracticeChallengesPanelHandle,
  PracticeFreePlayPanelHandle,
} from '@/features/practice/practicePanelHandles';
import { navigateToMainMenu } from '@/shared/constants/menuNavigation';
import '@/components/ui/Button.css';
import './practiceHub.css';
import '@/styles/pages/p2p-entry.css';
import '@/styles/pages/practice-hub-page.css';
import '@/styles/pages/solo-challenges.css';
import { setButtonGlow } from '@/shared/utils/buttonGlow';
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
import { hasChallengeMenuFocus } from '@/lib/challengeMenuFocus';
import { useSocket } from '@/hooks/useSocket';
import { reportClientEvent } from '@/lib/telemetry/reportClientEvent';

function readInitialHubFocus(): PracticeHubFocus {
  if (hasChallengeMenuFocus()) {
    return { zone: 'panel' };
  }
  const play = parsePlaySearchParam(
    new URLSearchParams(window.location.search).get('play')
  );
  return { zone: 'playStyle', idx: playStyleToIdx(play) };
}

const CHALLENGE_LAUNCH_COPY: Record<
  ChallengeLaunchPhase,
  { title: string; hint: string }
> = {
  checking: {
    title: 'Checking requirements…',
    hint: 'Verifying Nostr bounty eligibility',
  },
  server: {
    title: 'Starting challenge…',
    hint: 'Preparing your bounty run on the server',
  },
  entering: {
    title: 'Loading game…',
    hint: 'Setting up your challenge match',
  },
};

export default function PracticeHub() {
  const navigate = useNavigate();
  const { socket } = useSocket();
  const [searchParams, setSearchParams] = useSearchParams();
  const { playSfx } = useAudio();
  useGamepad(true);

  const playStyle = parsePlaySearchParam(searchParams.get('play'));
  const playStyleIdx = playStyleToIdx(playStyle);

  const [hubFocus, setHubFocus] = useState<PracticeHubFocus>(readInitialHubFocus);
  const [pickerRowRevealed, setPickerRowRevealed] = useState(false);
  const [challengeLaunching, setChallengeLaunching] = useState(false);
  const [challengeLaunchPhase, setChallengeLaunchPhase] =
    useState<ChallengeLaunchPhase>('server');
  const [challengeLaunchSlowHint, setChallengeLaunchSlowHint] = useState(false);

  const playStyleRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const footerBackRef = useRef<HTMLButtonElement | null>(null);
  const footerStartRef = useRef<HTMLButtonElement | null>(null);
  const freePlayPanelRef = useRef<PracticeFreePlayPanelHandle | null>(null);
  const challengesPanelRef = useRef<PracticeChallengesPanelHandle | null>(null);
  const playStyleAreaRef = useRef<HTMLDivElement | null>(null);
  const freePlayPanelShellRef = useRef<HTMLDivElement | null>(null);
  const challengesPanelShellRef = useRef<HTMLDivElement | null>(null);

  const setPlayStyle = useCallback(
    (next: PracticePlayStyle) => {
      const value = playStyleToSearchValue(next);
      if (searchParams.get('play') !== value) {
        setSearchParams({ play: value }, { replace: true });
      }
      reportClientEvent(socket, 'client.practice.tab', { mode: value });
      setHubFocus((prev) =>
        prev.zone === 'playStyle'
          ? { zone: 'playStyle', idx: playStyleToIdx(next) }
          : prev
      );
    },
    [searchParams, setSearchParams, socket]
  );

  useEffect(() => {
    setHubFocus((prev) =>
      prev.zone === 'playStyle'
        ? { zone: 'playStyle', idx: playStyleIdx }
        : prev
    );
  }, [playStyleIdx]);

  useEffect(() => {
    if (!hasChallengeMenuFocus()) return;
    setHubFocus({ zone: 'panel' });
    const frame = window.requestAnimationFrame(() => {
      challengesPanelRef.current?.focusDefault();
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

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

  const handleChallengeLaunchStateChange = useCallback(
    (active: boolean, phase?: ChallengeLaunchPhase) => {
      setChallengeLaunching(active);
      if (active && phase) setChallengeLaunchPhase(phase);
      if (!active) {
        setChallengeLaunchPhase('server');
        setChallengeLaunchSlowHint(false);
      }
    },
    []
  );

  const startFooterPrimary = useCallback(() => {
    if (playStyle === 'challenges' && challengeLaunching) return;
    playSfx(SFX.MENU_CONFIRM);
    if (playStyle === 'free') {
      freePlayPanelRef.current?.startPractice();
      return;
    }
    challengesPanelRef.current?.launchSelected();
  }, [playStyle, challengeLaunching, playSfx]);

  useEffect(() => {
    if (!challengeLaunching) return;
    const timer = window.setTimeout(() => setChallengeLaunchSlowHint(true), 2500);
    return () => window.clearTimeout(timer);
  }, [challengeLaunching]);

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

  const exitToMainMenu = useCallback(() => {
    playSfx(SFX.MENU_SELECT);
    navigateToMainMenu(navigate);
  }, [navigate, playSfx]);

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
      if (document.querySelector('.sc-gate-check-overlay')) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        exitToMainMenu();
        return;
      }

      const isLeft = e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A';
      const isRight = e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';
      const isUp = e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W';
      const isDown = e.key === 'ArrowDown' || e.key === 's' || e.key === 'S';
      const isActivate = e.key === 'Enter' || e.key === ' ';
      const isTab = e.key === 'Tab' && !e.shiftKey;
      const isTabBack = e.key === 'Tab' && e.shiftKey;

      const active = document.activeElement;
      const footerWhich: 'back' | 'start' | null =
        active === footerBackRef.current
          ? 'back'
          : active === footerStartRef.current
            ? 'start'
            : null;
      const inFooterZone = hubFocus.zone === 'footer' || footerWhich !== null;

      const handleFooterKeys = (which: 'back' | 'start') => {
        if (!isLeft && !isRight && !isUp && !isDown && !isActivate)
          return false;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.repeat && isActivate) return true;

        if (isActivate) {
          if (which === 'back') exitToMainMenu();
          else footerStartRef.current?.click();
          return true;
        }

        if (isDown) {
          return true;
        }

        const moved = movePracticeHubFooter(
          isUp ? 'up' : isLeft ? 'left' : 'right'
        );
        if (moved === 'panel') {
          playSfx(SFX.MENU_SELECT);
          resumePanelFromFooter();
          return true;
        }
        if (moved === 'back' || moved === 'start') {
          if (moved !== which) {
            playSfx(SFX.MENU_SELECT);
            enterFooter(moved);
          }
        }
        return true;
      };

      if (inFooterZone) {
        const which =
          hubFocus.zone === 'footer'
            ? hubFocus.which
            : (footerWhich ?? 'start');
        if (handleFooterKeys(which)) {
          return;
        }
      }

      if (hubFocus.zone === 'panel') {
        if (isTabBack) {
          e.preventDefault();
          e.stopImmediatePropagation();
          playSfx(SFX.MENU_SELECT);
          enterPlayStyle();
          return;
        }
        return;
      }

      // playStyle zone ("HOW TO PLAY") — Up is a no-op; nothing above this row
      if (isUp) {
        e.preventDefault();
        return;
      }

      if (
        !isLeft &&
        !isRight &&
        !isDown &&
        !isActivate &&
        !isTab &&
        !isTabBack
      ) {
        return;
      }

      if (isTab || isDown) {
        e.preventDefault();
        playSfx(SFX.MENU_SELECT);
        enterPanel();
        return;
      }

      if (isTabBack) {
        return;
      }

      if (hubFocus.zone !== 'playStyle') return;

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
    exitToMainMenu,
    enterFooter,
    enterPanel,
    enterPlayStyle,
    hubFocus,
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
    hubFocus.zone === 'playStyle' && hubFocus.idx === idx
      ? 'practice-focus-target'
      : '';

  const footerBackFocused =
    hubFocus.zone === 'footer' && hubFocus.which === 'back';
  const footerStartFocused =
    hubFocus.zone === 'footer' && hubFocus.which === 'start';

  useEffect(() => {
    setButtonGlow(footerBackRef.current, footerBackFocused);
    setButtonGlow(footerStartRef.current, footerStartFocused);
  }, [footerBackFocused, footerStartFocused]);

  const syncPlayStyleAreaHeight = useCallback(() => {
    const area = playStyleAreaRef.current;
    const freeShell = freePlayPanelShellRef.current;
    const challShell = challengesPanelShellRef.current;
    if (!area || !freeShell || !challShell) return;

    const height = Math.max(freeShell.offsetHeight, challShell.offsetHeight);
    if (height > 0) {
      area.style.minHeight = `${height}px`;
    }
  }, []);

  useLayoutEffect(() => {
    syncPlayStyleAreaHeight();

    const freeShell = freePlayPanelShellRef.current;
    const challShell = challengesPanelShellRef.current;
    if (!freeShell || !challShell) return;

    const observer = new ResizeObserver(() => {
      syncPlayStyleAreaHeight();
    });
    observer.observe(freeShell);
    observer.observe(challShell);
    return () => observer.disconnect();
  }, [playStyle, syncPlayStyleAreaHeight]);

  useEffect(() => {
    setPickerRowRevealed(false);
    const timer = window.setTimeout(() => setPickerRowRevealed(true), 480);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      className={[
        'practice-hub',
        'practice-hub--practice',
        'practice-hub-page',
        'p2p-entry-page',
        'practice-hub-page--challenges',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      <header className="practice-hub-header">
        <h2 className="practice-hub-title">FREE TO PLAY</h2>
      </header>

      <div className="practice-panel" role="main" aria-label="Practice play">
        <section
          className="practice-section practice-play-style-section"
          aria-label="Play style"
        >
          <div className="ph-picker-block">
            <div
              className={[
                'p2p-picker-row',
                pickerRowRevealed ? 'ph-picker-row--revealed' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="radiogroup"
              aria-label="Play style"
            >
              <button
                ref={(el) => {
                  playStyleRefs.current[0] = el;
                }}
                type="button"
                role="radio"
                aria-checked={playStyle === 'free'}
                tabIndex={
                  hubFocus.zone === 'playStyle' && hubFocus.idx === 0 ? 0 : -1
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
                  setHubFocus({ zone: 'playStyle', idx: 0 });
                  activatePlayStyle(0);
                }}
              >
                <svg
                  className="p2p-picker-icon p2p-picker-icon--people"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="8"
                    cy="7"
                    r="2.5"
                    stroke="currentColor"
                    strokeWidth="1"
                    fill="currentColor"
                    fillOpacity="0.15"
                  />
                  <path
                    d="M3 18a5 4 0 0 1 10 0"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <circle
                    cx="16"
                    cy="7"
                    r="2.5"
                    stroke="currentColor"
                    strokeWidth="1"
                    fill="currentColor"
                    fillOpacity="0.15"
                  />
                  <path
                    d="M11 18a5 4 0 0 1 10 0"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
                <span className="p2p-picker-label">QUICK MATCH</span>
                <span className="p2p-picker-sub">
                  1v1 or 4-player: humans, bots, or both
                </span>
              </button>

              <button
                ref={(el) => {
                  playStyleRefs.current[1] = el;
                }}
                type="button"
                role="radio"
                aria-checked={playStyle === 'challenges'}
                tabIndex={
                  hubFocus.zone === 'playStyle' && hubFocus.idx === 1 ? 0 : -1
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
                  setHubFocus({ zone: 'playStyle', idx: 1 });
                  activatePlayStyle(1);
                }}
              >
                <svg
                  className="p2p-picker-icon p2p-picker-icon--challenges"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M13.5 8.5 V20.5"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinecap="round"
                  />
                  <path
                    d="M13.5 8.5 H21 V13.5 H13.5 Z"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinejoin="round"
                    fill="currentColor"
                    fillOpacity="0.15"
                  />
                  <path
                    d="M7 14.5 C4 11.8 2.5 8.2 2.5 4.8 V2.8 L7 1.2 L11.5 2.8 V4.8 C11.5 8.2 10 11.8 7 14.5 Z"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinejoin="round"
                    fill="currentColor"
                    fillOpacity="0.12"
                  />
                </svg>
                <span className="p2p-picker-label">CHALLENGES</span>
                <span className="p2p-picker-sub">
                  Beat the bots: win sats on Nostr
                </span>
              </button>
            </div>
          </div>
        </section>

        <div className="practice-play-style-area" ref={playStyleAreaRef}>
          <div
            ref={freePlayPanelShellRef}
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
            ref={challengesPanelShellRef}
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
              menuZone={
                playStyle === 'challenges' ? hubFocus.zone : 'playStyle'
              }
              footerBackRef={footerBackRef}
              footerStartRef={footerStartRef}
              onExitToPlayStyle={enterPlayStyle}
              onEnterFooter={enterFooter}
              onLaunchStateChange={handleChallengeLaunchStateChange}
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
            onClick={exitToMainMenu}
          >
            MAIN MENU
          </Button>
          <Button
            ref={footerStartRef}
            tabIndex={footerStartFocused ? 0 : -1}
            disabled={playStyle === 'challenges' && challengeLaunching}
            className={[
              'practice-start',
              footerStartFocused ? 'practice-start--focused' : '',
              challengeLaunching ? 'practice-start--launching' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onFocus={() => enterFooter('start')}
            onClick={startFooterPrimary}
          >
            {playStyle === 'free'
              ? 'START QUICK MATCH'
              : challengeLaunching
                ? 'STARTING CHALLENGE…'
                : 'START CHALLENGE'}
          </Button>
        </div>
      </div>

      {challengeLaunching && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="practice-launch-overlay"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <div
                className="practice-launch-overlay__backdrop"
                aria-hidden="true"
              />
              <div className="practice-launch-overlay__card">
                <span
                  className="practice-launch-overlay__spinner"
                  aria-hidden="true"
                />
                <p className="practice-launch-overlay__title">
                  {CHALLENGE_LAUNCH_COPY[challengeLaunchPhase].title}
                </p>
                <p className="practice-launch-overlay__hint">
                  {challengeLaunchSlowHint
                    ? 'Still working — this can take a few seconds'
                    : CHALLENGE_LAUNCH_COPY[challengeLaunchPhase].hint}
                </p>
              </div>
            </div>,
            document.body
          )
        : null}

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
