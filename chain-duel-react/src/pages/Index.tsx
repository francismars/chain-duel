import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useGamepad } from '@/hooks/useGamepad';
import { useAudio, SFX } from '@/contexts/AudioContext';
import '@/components/ui/Button.css';
import '@/components/ui/Sponsorship.css';
import '@/styles/pages/index.css';
import {
  CHAIN_DUEL_SUPPRESS_NEXT_MENU_CONFIRM,
  clearMenuNavigationState,
  indexConfirmSuppressMs,
  type MenuNavigationState,
} from '@/shared/constants/menuNavigation';
import { ONLINE_HOME } from '@/shared/constants/onlineRoutes';
import { setButtonGlow } from '@/shared/utils/buttonGlow';
import { useNostrSession } from '@/contexts/NostrSessionContext';

/** Vertical menu focus — 5 rows: FREE PLAY, P2P, ONLINE, LEDGER, ABOUT+CONFIG */
type MenuState = 1 | 2 | 3 | 4 | 5;
type Row6Focus = 'about' | 'config';

function menuStepDown(prev: MenuState): MenuState {
  if (prev === 1) return 2;
  if (prev === 2) return 3;
  if (prev === 3) return 4;
  if (prev === 4) return 5;
  return 1;
}

function menuStepUp(prev: MenuState): MenuState {
  if (prev === 1) return 5;
  if (prev === 2) return 1;
  if (prev === 3) return 2;
  if (prev === 4) return 3;
  return 4;
}

export default function Index() {
  const navigate = useNavigate();
  const location = useLocation();
  const confirmSuppressUntilRef = useRef(0);
  const { playSfx } = useAudio();
  const [menu, setMenu] = useState<MenuState>(2);
  const [hostName, setHostName] = useState<string>('@chainduel');
  const startLocalRef = useRef<HTMLButtonElement>(null);
  const startP2pRef = useRef<HTMLButtonElement>(null);
  const startOnlineRef = useRef<HTMLButtonElement>(null);
  const highscoresRef = useRef<HTMLButtonElement>(null);
  const aboutRef = useRef<HTMLButtonElement>(null);
  const configRef = useRef<HTMLButtonElement>(null);
  const menuButtonsRootRef = useRef<HTMLDivElement>(null);
  const [row6Focus, setRow6Focus] = useState<Row6Focus>('about');
  const nostrSession = useNostrSession();
  const [configAvatarBroken, setConfigAvatarBroken] = useState(false);
  const skipInitialMenuPopRef = useRef(true);
  /** Synced inside setMenu updaters so Enter always matches the latest row (avoids stale closure if Down + Enter land before re-render). */
  const menuRef = useRef<MenuState>(menu);
  menuRef.current = menu;

  // Enable gamepad support
  useGamepad(true);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      return;
    }
    if (skipInitialMenuPopRef.current) {
      skipInitialMenuPopRef.current = false;
      return;
    }
    const root = menuButtonsRootRef.current;
    if (!root) {
      return;
    }
    const inner =
      menu === 5
        ? (root.querySelector(
            `[data-menu-row="5"] [data-menu-kbd-focus="${row6Focus}"]`
          ) as HTMLElement | null)
        : (root.querySelector(
            `[data-menu-row="${menu}"] > .menu-buttons__row-inner`
          ) as HTMLElement | null);
    if (!inner) {
      return;
    }
    inner.classList.remove('menu-buttons__row-inner--pop');
    void inner.offsetWidth;
    inner.classList.add('menu-buttons__row-inner--pop');
    const onEnd = () => {
      inner.classList.remove('menu-buttons__row-inner--pop');
      inner.removeEventListener('animationend', onEnd);
    };
    inner.addEventListener('animationend', onEnd);
    return () => {
      inner.removeEventListener('animationend', onEnd);
      inner.classList.remove('menu-buttons__row-inner--pop');
    };
  }, [menu, row6Focus]);

  // Load host name from localStorage
  useEffect(() => {
    const storedHostName = localStorage.getItem('hostName');
    if (storedHostName) {
      // Match legacy behavior: use stored value as-is, or default to @chainduel
      setHostName(storedHostName || '@chainduel');
    }
  }, []);

  useEffect(() => {
    setConfigAvatarBroken(false);
  }, [nostrSession.pubkey, nostrSession.picture]);

  useEffect(() => {
    setButtonGlow(startLocalRef.current, menu === 1);
    setButtonGlow(startP2pRef.current, menu === 2);
    setButtonGlow(startOnlineRef.current, menu === 3);
    setButtonGlow(highscoresRef.current, menu === 4);
    setButtonGlow(aboutRef.current, menu === 5 && row6Focus === 'about');
    setButtonGlow(configRef.current, menu === 5 && row6Focus === 'config');
  }, [menu, row6Focus]);

  /** Swallow one ghost Enter/Space on the next page when navigation was triggered by keyboard. */
  const keyboardNavState = useMemo(
    () => ({ [CHAIN_DUEL_SUPPRESS_NEXT_MENU_CONFIRM]: true }),
    []
  );

  useEffect(() => {
    const fromMainMenu = Boolean(
      (location.state as MenuNavigationState | null)?.[
        CHAIN_DUEL_SUPPRESS_NEXT_MENU_CONFIRM
      ]
    );
    confirmSuppressUntilRef.current =
      performance.now() + indexConfirmSuppressMs(fromMainMenu);
    if (fromMainMenu) {
      clearMenuNavigationState(navigate, location);
    }
    // pathname/search/hash only — clearing `state` must not shorten gamepad suppress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, location.hash, navigate]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isConfirmKey =
        event.key === 'Enter' ||
        event.key === ' ' ||
        event.code === 'NumpadEnter';

      if (isConfirmKey) {
        if (event.repeat) {
          event.preventDefault();
          return;
        }
        if (performance.now() < confirmSuppressUntilRef.current) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        playSfx(SFX.MENU_CONFIRM);
        const row = menuRef.current;
        if (row === 1) {
          navigate('/practice', { state: keyboardNavState });
        } else if (row === 2) {
          navigate('/p2p', { state: keyboardNavState });
        } else if (row === 3) {
          navigate(ONLINE_HOME, { state: keyboardNavState });
        } else if (row === 4) {
          navigate('/highscores', { state: keyboardNavState });
        } else if (row === 5) {
          if (row6Focus === 'about') {
            navigate('/about', { state: keyboardNavState });
          } else {
            navigate('/config', { state: keyboardNavState });
          }
        }
        return;
      }

      if (menuRef.current === 5) {
        const isLeft =
          event.key === 'ArrowLeft' ||
          event.code === 'ArrowLeft' ||
          event.key === 'a' ||
          event.key === 'A';
        const isRight =
          event.key === 'ArrowRight' ||
          event.code === 'ArrowRight' ||
          event.key === 'd' ||
          event.key === 'D';
        if (isLeft) {
          event.preventDefault();
          playSfx(SFX.MENU_SELECT);
          setRow6Focus((c) => (c === 'config' ? 'about' : c));
          return;
        }
        if (isRight) {
          event.preventDefault();
          playSfx(SFX.MENU_SELECT);
          setRow6Focus((c) => (c === 'about' ? 'config' : c));
          return;
        }
      }

      if (
        event.key === 'ArrowDown' ||
        event.code === 'ArrowDown' ||
        event.key === 's' ||
        event.key === 'S'
      ) {
        event.preventDefault();
        playSfx(SFX.MENU_SELECT);
        setMenu((prev) => {
          const next = menuStepDown(prev);
          menuRef.current = next;
          if (prev === 4 && next === 5) {
            setRow6Focus('about');
          }
          return next;
        });
        return;
      }

      if (
        event.key === 'ArrowUp' ||
        event.code === 'ArrowUp' ||
        event.key === 'w' ||
        event.key === 'W'
      ) {
        event.preventDefault();
        playSfx(SFX.MENU_SELECT);
        setMenu((prev) => {
          const next = menuStepUp(prev);
          menuRef.current = next;
          if (prev === 1 && next === 5) {
            setRow6Focus('about');
          }
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [
    location.pathname,
    location.search,
    location.hash,
    navigate,
    playSfx,
    keyboardNavState,
    row6Focus,
  ]);

  return (
    <div className="flex full flex-center index-page">
      <Sponsorship id="sponsorship-index" />

      <div className="index-page__hero">
        <h1 id="chainduel">CHAIN DUEL</h1>
        <p id="slogan">KEEPING ONE BLOCK AHEAD</p>
      </div>

      <div className="index-page__main">
        <div
          ref={menuButtonsRootRef}
          className="menu-buttons menu-buttons--stagger"
        >
          <div className="menu-buttons__row" data-menu-row={1}>
            <div className="menu-buttons__row-inner">
              <Button
                ref={startLocalRef}
                id="startpractice"
                onClick={() => {
                  playSfx(SFX.MENU_CONFIRM);
                  navigate('/practice');
                }}
              >
                FREE PLAY
              </Button>
            </div>
          </div>

          <div className="menu-buttons__row" data-menu-row={2}>
            <div className="menu-buttons__row-inner">
              <Button
                ref={startP2pRef}
                id="startp2p"
                onClick={() => {
                  playSfx(SFX.MENU_CONFIRM);
                  navigate('/p2p');
                }}
              >
                P2P
              </Button>
            </div>
          </div>

          <div className="menu-buttons__row" data-menu-row={3}>
            <div className="menu-buttons__row-inner">
              <Button
                ref={startOnlineRef}
                id="startmainnet"
                onClick={() => {
                  playSfx(SFX.MENU_CONFIRM);
                  navigate(ONLINE_HOME);
                }}
              >
                ONLINE
              </Button>
            </div>
          </div>

          <div className="menu-buttons__row" data-menu-row={4}>
            <div className="menu-buttons__row-inner">
              <Button
                ref={highscoresRef}
                id="highscoresbutton"
                onClick={() => {
                  playSfx(SFX.MENU_CONFIRM);
                  navigate('/highscores');
                }}
              >
                LEDGER
              </Button>
            </div>
          </div>

          <div className="menu-buttons__row" data-menu-row={5}>
            <div className="double-button menu-buttons__double-row">
              <div
                className="menu-buttons__row-inner menu-buttons__double-cell"
                data-menu-kbd-focus="about"
              >
                <Button
                  ref={aboutRef}
                  id="aboutbutton"
                  onClick={() => {
                    playSfx(SFX.MENU_CONFIRM);
                    navigate('/about');
                  }}
                >
                  ABOUT
                </Button>
              </div>
              <div
                className="menu-buttons__row-inner menu-buttons__double-cell"
                data-menu-kbd-focus="config"
              >
                <Button
                  ref={configRef}
                  onClick={() => {
                    playSfx(SFX.MENU_CONFIRM);
                    navigate('/config');
                  }}
                  id="configbuttonhome"
                  className="index-config-home-btn"
                  aria-label={
                    nostrSession.signedIn
                      ? 'Config (signed in with Nostr)'
                      : 'Config'
                  }
                >
                  {nostrSession.signedIn ? (
                    nostrSession.picture && !configAvatarBroken ? (
                      <img
                        className="index-config-home-btn__avatar"
                        src={nostrSession.picture}
                        alt=""
                        width={22}
                        height={22}
                        decoding="async"
                        onError={() => setConfigAvatarBroken(true)}
                      />
                    ) : (
                      <span
                        className="index-config-home-btn__avatar-skeleton"
                        aria-hidden
                      />
                    )
                  ) : (
                    <span
                      id="backendStatusHome"
                      className="backend-status on"
                      aria-hidden
                    >
                      •
                    </span>
                  )}
                  <span className="index-config-home-btn__label">CONFIG</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="bottomInfo">
        <p id="splits">
          <span id="split1">
            <b>2%</b> to the host ({hostName})
          </span>{' '}
          ·{' '}
          <span id="split2">
            <b>2%</b> to the developer (@BTCfrancis)
          </span>{' '}
          ·{' '}
          <span id="split3">
            <b>1%</b> to the designer (@bitcoinanatomy)
          </span>
        </p>
        <p id="version">Version 0.021 Beta — Support at t.me/chainduel</p>
      </div>

      <img
        id="announcement"
        style={{ display: 'none' }}
        src="/images/announcement/bitcoin2024_announcement_v2.png"
        alt="Announcement"
      />

      <BackgroundAudio
        src="/sound/chain_duel_produced_menu.m4a"
        autoplay={true}
      />
    </div>
  );
}
