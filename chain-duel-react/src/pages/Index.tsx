import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useGamepad } from '@/hooks/useGamepad';
import { useAudio, SFX } from '@/contexts/AudioContext';
import '@/components/ui/Button.css';
import '@/components/ui/Sponsorship.css';
import '@/styles/pages/index.css';
import { CHAIN_DUEL_SUPPRESS_NEXT_MENU_CONFIRM } from '@/shared/constants/menuNavigation';
import { fetchLatestKind0Profile } from '@/lib/nostr/fetchKind0Profile';
import { STORED_NOSTR_PUBKEY_KEY } from '@/lib/nostr/signerSession';


/** Vertical menu focus — 6 rows: LOCAL, SOLO, P2P, NETWORK, LEDGER, ABOUT+CONFIG */
type MenuState = 1 | 2 | 3 | 4 | 5 | 6;
type Row6Focus = 'about' | 'config';

function menuStepDown(prev: MenuState): MenuState {
  if (prev === 1) return 2;
  if (prev === 2) return 3;
  if (prev === 3) return 4;
  if (prev === 4) return 5;
  if (prev === 5) return 6;
  return 1;
}

function menuStepUp(prev: MenuState): MenuState {
  if (prev === 1) return 6;
  if (prev === 2) return 1;
  if (prev === 3) return 2;
  if (prev === 4) return 3;
  if (prev === 5) return 4;
  return 5;
}

export default function Index() {
  const navigate = useNavigate();
  const { playSfx } = useAudio();
  const [menu, setMenu] = useState<MenuState>(1);
  const [hostName, setHostName] = useState<string>('@chainduel');
  const startLocalRef = useRef<HTMLButtonElement>(null);
  const startSoloRef = useRef<HTMLButtonElement>(null);
  const startP2pRef = useRef<HTMLButtonElement>(null);
  const startOnlineRef = useRef<HTMLButtonElement>(null);
  const highscoresRef = useRef<HTMLButtonElement>(null);
  const aboutRef = useRef<HTMLButtonElement>(null);
  const configRef = useRef<HTMLButtonElement>(null);
  const menuButtonsRootRef = useRef<HTMLDivElement>(null);
  const [row6Focus, setRow6Focus] = useState<Row6Focus>('about');
  const [nostrPubkeyHex, setNostrPubkeyHex] = useState<string | null>(null);
  const [configProfilePicture, setConfigProfilePicture] = useState<string | null>(null);
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
      menu === 6
        ? (root.querySelector(
            `[data-menu-row="6"] [data-menu-kbd-focus="${row6Focus}"]`
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

  // Config button: show Nostr profile image when signed in (same key as Config / Solo).
  useEffect(() => {
    let cancelled = false;

    const syncNostrAvatar = () => {
      const pk = localStorage.getItem(STORED_NOSTR_PUBKEY_KEY);
      setNostrPubkeyHex(pk);
      setConfigAvatarBroken(false);
      if (!pk) {
        setConfigProfilePicture(null);
        return;
      }
      void fetchLatestKind0Profile(pk).then((p) => {
        if (cancelled) return;
        const pic = p?.picture?.trim();
        setConfigProfilePicture(pic || null);
      });
    };

    syncNostrAvatar();

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORED_NOSTR_PUBKEY_KEY || e.key === null) {
        syncNostrAvatar();
      }
    };
    window.addEventListener('storage', onStorage);

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        syncNostrAvatar();
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Pulse glow on the focused menu row (legacy look)
  useEffect(() => {
    const updateAnimations = () => {
      if (startLocalRef.current) {
        startLocalRef.current.style.animationDuration = menu === 1 ? '2s' : '0s';
      }
      if (startSoloRef.current) {
        startSoloRef.current.style.animationDuration = menu === 2 ? '2s' : '0s';
      }
      if (startP2pRef.current) {
        startP2pRef.current.style.animationDuration = menu === 3 ? '2s' : '0s';
      }
      if (startOnlineRef.current) {
        startOnlineRef.current.style.animationDuration = menu === 4 ? '2s' : '0s';
      }
      if (highscoresRef.current) {
        highscoresRef.current.style.animationDuration = menu === 5 ? '2s' : '0s';
      }
      if (aboutRef.current) {
        aboutRef.current.style.animationDuration =
          menu === 6 && row6Focus === 'about' ? '2s' : '0s';
      }
      if (configRef.current) {
        configRef.current.style.animationDuration =
          menu === 6 && row6Focus === 'config' ? '2s' : '0s';
      }
    };

    updateAnimations();
  }, [menu, row6Focus]);

  /** Swallow one ghost Enter/Space on the next page when navigation was triggered by keyboard. */
  const keyboardNavState = useMemo(
    () => ({ [CHAIN_DUEL_SUPPRESS_NEXT_MENU_CONFIRM]: true }),
    []
  );

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
        event.preventDefault();
        playSfx(SFX.MENU_CONFIRM);
        const row = menuRef.current;
        if (row === 1) {
          navigate('/local', { state: keyboardNavState });
        } else if (row === 2) {
          navigate('/solo', { state: keyboardNavState });
        } else if (row === 3) {
          navigate('/p2p', { state: keyboardNavState });
        } else if (row === 4) {
          navigate('/network', { state: keyboardNavState });
        } else if (row === 5) {
          navigate('/highscores', { state: keyboardNavState });
        } else if (row === 6) {
          if (row6Focus === 'about') {
            navigate('/about', { state: keyboardNavState });
          } else {
            navigate('/config', { state: keyboardNavState });
          }
        }
        return;
      }

      if (menuRef.current === 6) {
        if (event.key === 'ArrowLeft' || event.code === 'ArrowLeft') {
          event.preventDefault();
          playSfx(SFX.MENU_SELECT);
          setRow6Focus((c) => (c === 'config' ? 'about' : c));
          return;
        }
        if (event.key === 'ArrowRight' || event.code === 'ArrowRight') {
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
          if (prev === 5 && next === 6) {
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
          if (prev === 1 && next === 6) {
            setRow6Focus('about');
          }
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [navigate, playSfx, keyboardNavState, row6Focus]);

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
                id="startlocal"
                onClick={() => {
                  playSfx(SFX.MENU_CONFIRM);
                  navigate('/local');
                }}
              >
                LOCAL
              </Button>
            </div>
          </div>

          <div className="menu-buttons__row" data-menu-row={2}>
            <div className="menu-buttons__row-inner">
              <Button
                ref={startSoloRef}
                id="startsolo"
                onClick={() => {
                  playSfx(SFX.MENU_CONFIRM);
                  navigate('/solo');
                }}
              >
                SOLO
              </Button>
            </div>
          </div>

          <div className="menu-buttons__row" data-menu-row={3}>
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

          <div className="menu-buttons__row" data-menu-row={4}>
            <div className="menu-buttons__row-inner">
              <Button
                ref={startOnlineRef}
                id="startmainnet"
                onClick={() => {
                  playSfx(SFX.MENU_CONFIRM);
                  navigate('/network');
                }}
              >
                NETWORK
              </Button>
            </div>
          </div>

          <div className="menu-buttons__row" data-menu-row={5}>
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

          <div className="menu-buttons__row" data-menu-row={6}>
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
                  aria-label={nostrPubkeyHex ? 'Config (signed in with Nostr)' : 'Config'}
                >
                  {nostrPubkeyHex ? (
                    configProfilePicture && !configAvatarBroken ? (
                      <img
                        className="index-config-home-btn__avatar"
                        src={configProfilePicture}
                        alt=""
                        width={22}
                        height={22}
                        decoding="async"
                        onError={() => setConfigAvatarBroken(true)}
                      />
                    ) : (
                      <span className="index-config-home-btn__avatar-skeleton" aria-hidden />
                    )
                  ) : (
                    <span id="backendStatusHome" className="backend-status on" aria-hidden>
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

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay={true} />
    </div>
  );
}
