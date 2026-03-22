import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
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

/** Vertical menu focus — 7 rows: SOVEREIGN, P2P, TOURNAMENT, ONLINE, BOUNTY, HIGHSCORES, ABOUT+CONFIG */
type MenuState = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type ModeModal = null | 'p2p' | 'tournament';
type ModalPitch = 'lightning' | 'nostr';

function modalHintsFor(kind: 'p2p' | 'tournament'): Record<ModalPitch, string> {
  if (kind === 'p2p') {
    return {
      lightning:
        'Lightning (LNURL): each player pays with a normal Lightning invoice—scan the QR codes on the game menu with any Lightning wallet.',
      nostr:
        "Nostr: you pay by zapping a published note. Match the room's emoji id on screen, and put your seat PIN in the zap comment so the server can assign your slot.",
    };
  }
  return {
    lightning:
      'Lightning (LNURL): tournament buy-in uses standard Lightning invoices and QR-style links from the tournament screens—same idea as P2P, scaled for brackets.',
    nostr:
      'Nostr: buy-in and room details go through Nostr zaps and a Kind 1 note instead of classic LNURL-only links—useful if your group already coordinates on Nostr.',
  };
}

function menuStepDown(prev: MenuState): MenuState {
  if (prev === 1) return 2;
  if (prev === 2) return 3;
  if (prev === 3) return 4;
  if (prev === 4) return 5;
  if (prev === 5) return 6;
  if (prev === 6) return 7;
  return 1;
}

function menuStepUp(prev: MenuState): MenuState {
  if (prev === 1) return 7;
  if (prev === 2) return 1;
  if (prev === 3) return 2;
  if (prev === 4) return 3;
  if (prev === 5) return 4;
  if (prev === 6) return 5;
  return 6;
}

export default function Index() {
  const navigate = useNavigate();
  const { playSfx } = useAudio();
  const [menu, setMenu] = useState<MenuState>(2);
  const [modeModal, setModeModal] = useState<ModeModal>(null);
  const [modalPitch, setModalPitch] = useState<ModalPitch>('lightning');
  /** Which modal control is active (drives pulse); separate from modalPitch for hint text */
  const [modalNavSlot, setModalNavSlot] = useState<0 | 1 | 2>(0);
  const [hostName, setHostName] = useState<string>('@chainduel');
  const startSovereignRef = useRef<HTMLButtonElement>(null);
  const startGameRef = useRef<HTMLButtonElement>(null);
  const startTournRef = useRef<HTMLButtonElement>(null);
  const startOnlineRef = useRef<HTMLButtonElement>(null);
  const startBountyRef = useRef<HTMLButtonElement>(null);
  const highscoresRef = useRef<HTMLButtonElement>(null);
  const aboutRef = useRef<HTMLButtonElement>(null);
  const modalLightningRef = useRef<HTMLButtonElement>(null);
  const modalNostrRef = useRef<HTMLButtonElement>(null);
  const modalCancelRef = useRef<HTMLButtonElement>(null);
  const menuButtonsRootRef = useRef<HTMLDivElement>(null);
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
      menu === 7
        ? (root.querySelector(
            '[data-menu-row="7"] [data-menu-kbd-focus]'
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
  }, [menu]);

  // Load host name from localStorage
  useEffect(() => {
    const storedHostName = localStorage.getItem('hostName');
    if (storedHostName) {
      // Match legacy behavior: use stored value as-is, or default to @chainduel
      setHostName(storedHostName || '@chainduel');
    }
  }, []);

  // Update button animations based on menu state
  useEffect(() => {
    const updateAnimations = () => {
      if (startSovereignRef.current) {
        startSovereignRef.current.style.animationDuration = menu === 1 ? '2s' : '0s';
      }
      if (startGameRef.current) {
        startGameRef.current.style.animationDuration = menu === 2 ? '2s' : '0s';
      }
      if (startTournRef.current) {
        startTournRef.current.style.animationDuration = menu === 3 ? '2s' : '0s';
      }
      if (startOnlineRef.current) {
        startOnlineRef.current.style.animationDuration = menu === 4 ? '2s' : '0s';
      }
      if (startBountyRef.current) {
        startBountyRef.current.style.animationDuration = menu === 5 ? '2s' : '0s';
      }
      if (highscoresRef.current) {
        highscoresRef.current.style.animationDuration = menu === 6 ? '2s' : '0s';
      }
      if (aboutRef.current) {
        aboutRef.current.style.animationDuration = menu === 7 ? '2s' : '0s';
      }
    };

    updateAnimations();
  }, [menu]);

  const modalHints = useMemo(
    () => (modeModal ? modalHintsFor(modeModal) : null),
    [modeModal]
  );

  /** 0 = Lightning, 1 = Nostr, 2 = Cancel — avoids activeElement/ref mismatches */
  const modalNavIndexRef = useRef(0);

  const closeModeModal = useCallback(() => {
    modalNavIndexRef.current = 0;
    setModeModal(null);
  }, []);

  /** Swallow one ghost Enter/Space on the next page when navigation was triggered by keyboard. */
  const keyboardNavState = useMemo(
    () => ({ [CHAIN_DUEL_SUPPRESS_NEXT_MENU_CONFIRM]: true }),
    []
  );

  const confirmMode = useCallback(
    (nostr: boolean, opts?: { fromKeyboard?: boolean }) => {
      const state = opts?.fromKeyboard ? keyboardNavState : undefined;
      const navOpts = state ? { state } : undefined;
      if (modeModal === 'p2p') {
        navigate(
          {
            pathname: '/gamemenu',
            search: nostr ? '?nostr=true' : '',
          },
          navOpts
        );
      } else if (modeModal === 'tournament') {
        navigate(
          {
            pathname: '/tournprefs',
            search: nostr ? '?mode=tournamentnostr' : '',
          },
          navOpts
        );
      }
      modalNavIndexRef.current = 0;
      setModeModal(null);
    },
    [modeModal, navigate, keyboardNavState]
  );

  const focusModalSlot = useCallback((index: 0 | 1 | 2) => {
    modalNavIndexRef.current = index;
    setModalNavSlot(index);
    if (index === 0) {
      setModalPitch('lightning');
      modalLightningRef.current?.focus();
    } else if (index === 1) {
      setModalPitch('nostr');
      modalNostrRef.current?.focus();
    } else {
      modalCancelRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (!modeModal) {
      return;
    }
    const t = window.setTimeout(() => {
      focusModalSlot(0);
    }, 0);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
    };
  }, [modeModal, focusModalSlot]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (modeModal) {
        if (event.key === 'Escape') {
          event.preventDefault();
          playSfx(SFX.MENU_SELECT);
          closeModeModal();
          return;
        }

        const modalNext = () => {
          const i = (modalNavIndexRef.current + 1) % 3;
          focusModalSlot(i as 0 | 1 | 2);
        };
        const modalPrev = () => {
          const i = (modalNavIndexRef.current + 2) % 3;
          focusModalSlot(i as 0 | 1 | 2);
        };

        if (
          event.key === 'ArrowRight' ||
          event.key === 'd' ||
          event.key === 'D' ||
          event.key === 'ArrowDown' ||
          event.code === 'ArrowDown' ||
          event.key === 's' ||
          event.key === 'S'
        ) {
          event.preventDefault();
          playSfx(SFX.MENU_SELECT);
          modalNext();
          return;
        }
        if (
          event.key === 'ArrowLeft' ||
          event.key === 'a' ||
          event.key === 'A' ||
          event.key === 'ArrowUp' ||
          event.code === 'ArrowUp' ||
          event.key === 'w' ||
          event.key === 'W'
        ) {
          event.preventDefault();
          playSfx(SFX.MENU_SELECT);
          modalPrev();
          return;
        }
        if (event.key === 'Tab') {
          event.preventDefault();
          playSfx(SFX.MENU_SELECT);
          if (event.shiftKey) {
            modalPrev();
          } else {
            modalNext();
          }
          return;
        }
        if (event.key === 'Enter' || event.key === ' ' || event.code === 'NumpadEnter') {
          if (event.repeat) {
            event.preventDefault();
            return;
          }
          event.preventDefault();
          playSfx(SFX.MENU_CONFIRM);
          const i = modalNavIndexRef.current;
          if (i === 0) {
            confirmMode(false, { fromKeyboard: true });
          } else if (i === 1) {
            confirmMode(true, { fromKeyboard: true });
          } else {
            closeModeModal();
          }
          return;
        }
        return;
      }

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
          navigate('/solo', { state: keyboardNavState });
        } else if (row === 2) {
          setModeModal('p2p');
        } else if (row === 3) {
          setModeModal('tournament');
        } else if (row === 4) {
          navigate('/online', { state: keyboardNavState });
        } else if (row === 5) {
          navigate('/bounty', { state: keyboardNavState });
        } else if (row === 6) {
          navigate('/highscores', { state: keyboardNavState });
        } else if (row === 7) {
          navigate('/about', { state: keyboardNavState });
        }
        return;
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
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [
    modeModal,
    navigate,
    playSfx,
    closeModeModal,
    confirmMode,
    focusModalSlot,
    keyboardNavState,
  ]);

  return (
    <div className="flex full flex-center">
      <Sponsorship id="sponsorship-index" />

      <h1 id="chainduel">CHAIN DUEL</h1>
      <p id="slogan">KEEPING ONE BLOCK AHEAD</p>

      <div
        ref={menuButtonsRootRef}
        className="menu-buttons menu-buttons--stagger"
      >
        <div className="menu-buttons__row" data-menu-row={1}>
          <div className="menu-buttons__row-inner">
            <Button
              ref={startSovereignRef}
              id="startsovereign"
              onClick={() => {
                playSfx(SFX.MENU_CONFIRM);
                navigate('/solo');
              }}
            >
              SOLO
            </Button>
          </div>
        </div>

        <div className="menu-buttons__row" data-menu-row={2}>
          <div className="menu-buttons__row-inner">
            <Button
              ref={startGameRef}
              id="startgame"
              onClick={() => {
                playSfx(SFX.MENU_CONFIRM);
                setModeModal('p2p');
              }}
            >
              P2P
            </Button>
          </div>
        </div>

        <div className="menu-buttons__row" data-menu-row={3}>
          <div className="menu-buttons__row-inner">
            <Button
              ref={startTournRef}
              id="starttourn"
              onClick={() => {
                playSfx(SFX.MENU_CONFIRM);
                setModeModal('tournament');
              }}
            >
              TOURNAMENT
            </Button>
          </div>
        </div>

        <div className="menu-buttons__row" data-menu-row={4}>
          <div className="menu-buttons__row-inner">
            <Button
              ref={startOnlineRef}
              id="startonline"
              onClick={() => {
                playSfx(SFX.MENU_CONFIRM);
                navigate('/online');
              }}
            >
              ONLINE
            </Button>
          </div>
        </div>

        <div className="menu-buttons__row" data-menu-row={5}>
          <div className="menu-buttons__row-inner">
            <Button
              ref={startBountyRef}
              id="startbounty"
              onClick={() => {
                playSfx(SFX.MENU_CONFIRM);
                navigate('/bounty');
              }}
            >
              BOUNTY HUNT
            </Button>
          </div>
        </div>

        <div className="menu-buttons__row" data-menu-row={6}>
          <div className="menu-buttons__row-inner">
            <Button
              ref={highscoresRef}
              id="highscoresbutton"
              onClick={() => {
                playSfx(SFX.MENU_CONFIRM);
                navigate('/highscores');
              }}
            >
              HIGHSCORES
            </Button>
          </div>
        </div>

        <div className="menu-buttons__row" data-menu-row={7}>
          <div className="double-button menu-buttons__double-row">
            <div
              className="menu-buttons__row-inner menu-buttons__double-cell"
              data-menu-kbd-focus
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
            <div className="menu-buttons__row-inner menu-buttons__double-cell">
              <Button
                className="disabled"
                onClick={() => {
                  playSfx(SFX.MENU_CONFIRM);
                  navigate('/config');
                }}
                id="configbuttonhome"
              >
                <span id="backendStatusHome" className="backend-status on">•</span>
                CONFIG
              </Button>
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

      {modeModal && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="index-mode-modal-backdrop"
              role="presentation"
              onClick={closeModeModal}
            >
              <div
                className="index-mode-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="index-mode-modal-title"
                aria-describedby="index-mode-modal-hint"
                onClick={(e) => e.stopPropagation()}
              >
                <h2
                  id="index-mode-modal-title"
                  className="index-mode-modal-title"
                >
                  {modeModal === 'p2p' ? 'P2P DUEL' : 'TOURNAMENT'}
                </h2>
                <p className="index-mode-modal-copy">
                  Pick how you want to pay.
                </p>
                <div className="index-mode-modal-actions">
                  <Button
                    ref={modalLightningRef}
                    type="button"
                    glowing={modalNavSlot === 0}
                    onFocus={() => {
                      modalNavIndexRef.current = 0;
                      setModalNavSlot(0);
                      setModalPitch('lightning');
                    }}
                    onMouseEnter={() => setModalPitch('lightning')}
                    onClick={() => {
                      playSfx(SFX.MENU_CONFIRM);
                      confirmMode(false);
                    }}
                  >
                    LIGHTNING
                  </Button>
                  <Button
                    ref={modalNostrRef}
                    type="button"
                    glowing={modalNavSlot === 1}
                    onFocus={() => {
                      modalNavIndexRef.current = 1;
                      setModalNavSlot(1);
                      setModalPitch('nostr');
                    }}
                    onMouseEnter={() => setModalPitch('nostr')}
                    onClick={() => {
                      playSfx(SFX.MENU_CONFIRM);
                      confirmMode(true);
                    }}
                  >
                    NOSTR
                  </Button>
                </div>
                {modalHints ? (
                  <p
                    id="index-mode-modal-hint"
                    className="index-mode-modal-hint"
                    aria-live="polite"
                  >
                    {modalHints[modalPitch]}
                  </p>
                ) : null}
                <Button
                  ref={modalCancelRef}
                  type="button"
                  className="index-mode-modal-cancel"
                  glowing={modalNavSlot === 2}
                  onFocus={() => {
                    modalNavIndexRef.current = 2;
                    setModalNavSlot(2);
                  }}
                  onClick={() => {
                    playSfx(SFX.MENU_SELECT);
                    closeModeModal();
                  }}
                >
                  CANCEL
                </Button>
              </div>
            </div>,
            document.body
          )
        : null}

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay={true} />
    </div>
  );
}
