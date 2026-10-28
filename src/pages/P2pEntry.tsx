import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import {
  BracketSizingHub,
  type BracketSizingHubHandle,
} from '@/components/paidEntry/BracketSizingHub';
import { GameModifiersSection } from '@/components/paidEntry/GameModifiersSection';
import { useGamepad } from '@/hooks/useGamepad';
import { useAudio, SFX } from '@/contexts/AudioContext';
import { useSocket } from '@/hooks/useSocket';
import { reportClientEvent } from '@/lib/telemetry/reportClientEvent';
import {
  CHAIN_DUEL_SUPPRESS_NEXT_MENU_CONFIRM,
  navigateToMainMenu,
} from '@/shared/constants/menuNavigation';
import {
  advanceFlatNav,
  buildFlatNavOrder,
  isBracketNavFocus,
  moveNavFocus,
  navFocusEqual,
  normalizeNavFocusForSession,
  type P2pNavFocus,
} from '@/pages/p2pEntryNav';
import '@/components/ui/Button.css';
import './practiceHub.css';
import '@/styles/pages/p2p-entry.css';
import '@/styles/pages/onlinePostGame.css';

type SessionKind = 'duel' | 'tournament';
type PaymentKind = 'lightning' | 'nostr';
type P2pStep = 'mode' | 'options';

const STEPPED_BUYIN_SATS = [10000, 20000, 50000, 100000] as const;

export default function P2pEntry({
  flow = 'flat',
}: {
  /** `stepped` is the settings preview: pick a mode, then open that mode's options. */
  flow?: 'flat' | 'stepped';
} = {}) {
  const navigate = useNavigate();
  const { playSfx } = useAudio();
  const { socket } = useSocket();
  useGamepad(true);

  const stepped = flow === 'stepped';
  const [step, setStep] = useState<P2pStep>('mode');
  const [modeChosen, setModeChosen] = useState(false);
  const [navFocus, setNavFocus] = useState<P2pNavFocus>(
    stepped ? { kind: 'session', idx: 0 } : { kind: 'start' }
  );
  const paymentRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const sessionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const duelFormatRef = useRef<HTMLButtonElement | null>(null);
  const startRef = useRef<HTMLButtonElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const bracketHubRef = useRef<BracketSizingHubHandle | null>(null);

  const [sessionKind, setSessionKind] = useState<SessionKind>('duel');
  const [payment, setPayment] = useState<PaymentKind>('lightning');
  const [playersNumber, setPlayersNumber] = useState(4);
  const [deposit, setDeposit] = useState(10000);

  const tournament = sessionKind === 'tournament';
  const showMode = !stepped || step === 'mode';
  const showOptions = !stepped || step === 'options';
  const duelSelected = (!stepped || modeChosen) && sessionKind === 'duel';
  const tournamentSelected =
    (!stepped || modeChosen) && sessionKind === 'tournament';

  const keyboardNavState = useMemo(
    () => ({ [CHAIN_DUEL_SUPPRESS_NEXT_MENU_CONFIRM]: true }),
    []
  );

  const playSelect = useCallback(() => playSfx(SFX.MENU_SELECT), [playSfx]);

  const openModeOptions = useCallback(
    (kind: SessionKind) => {
      setSessionKind(kind);
      setModeChosen(true);
      if (!stepped) return;
      setStep('options');
      setNavFocus(
        kind === 'tournament'
          ? { kind: 'players', idx: 0 }
          : { kind: 'duelFormat' }
      );
    },
    [stepped]
  );

  const leaveOptions = useCallback(() => {
    setStep('mode');
    setNavFocus({ kind: 'session', idx: tournament ? 1 : 0 });
  }, [tournament]);

  const bracketMenuFocus = useMemo(() => {
    if (!tournament) return null;
    return isBracketNavFocus(navFocus) ? navFocus : null;
  }, [tournament, navFocus]);

  const start = useCallback(() => {
    playSfx(SFX.MENU_CONFIRM);
    const nostr = payment === 'nostr';
    reportClientEvent(socket, 'client.p2p.configured', {
      mode: nostr ? 'nostr' : 'lightning',
      buyinSats: deposit,
      bracketSize: sessionKind === 'tournament' ? playersNumber : undefined,
      detail: sessionKind,
    });
    if (sessionKind === 'duel') {
      navigate(
        { pathname: '/gamemenu', search: nostr ? '?nostr=true' : '' },
        { state: keyboardNavState }
      );
      return;
    }
    const mode = nostr ? '&mode=tournamentnostr' : '';
    navigate(
      `/tournbracket?players=${playersNumber}&deposit=${deposit}${mode}`
    );
  }, [
    sessionKind,
    payment,
    playersNumber,
    deposit,
    navigate,
    playSfx,
    keyboardNavState,
    socket,
  ]);

  useEffect(() => {
    setNavFocus((f) => normalizeNavFocusForSession(f, tournament));
  }, [tournament]);

  const activateNavFocus = useCallback(
    (f: P2pNavFocus) => {
      switch (f.kind) {
        case 'payment':
          setPayment(f.idx === 0 ? 'lightning' : 'nostr');
          playSfx(SFX.MENU_SELECT);
          break;
        case 'session':
          playSfx(SFX.MENU_SELECT);
          openModeOptions(f.idx === 0 ? 'duel' : 'tournament');
          break;
        case 'players':
          bracketHubRef.current?.triggerPlayer(f.idx);
          break;
        case 'buyinPill':
          bracketHubRef.current?.triggerBuyinPill(f.idx);
          break;
        case 'start':
          start();
          break;
        case 'back':
          playSfx(SFX.MENU_SELECT);
          if (stepped && step === 'options') {
            leaveOptions();
            break;
          }
          navigateToMainMenu(navigate);
          break;
        default:
          break;
      }
    },
    [leaveOptions, navigate, openModeOptions, playSfx, start, step, stepped]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        playSfx(SFX.MENU_SELECT);
        if (stepped && step === 'options') {
          leaveOptions();
          return;
        }
        navigateToMainMenu(navigate);
        return;
      }

      const isUp = e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W';
      const isDown = e.key === 'ArrowDown' || e.key === 's' || e.key === 'S';
      const isLeft = e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A';
      const isRight = e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';
      const isActivate = e.key === 'Enter' || e.key === ' ';
      const isTab = e.key === 'Tab' && !e.shiftKey;
      const isTabBack = e.key === 'Tab' && e.shiftKey;

      if (
        !isUp &&
        !isDown &&
        !isLeft &&
        !isRight &&
        !isActivate &&
        !isTab &&
        !isTabBack
      ) {
        return;
      }

      if (e.repeat && isActivate) return;

      const advance = (delta: 1 | -1) => {
        if (stepped && step === 'mode') {
          setNavFocus((prev) => {
            const order: P2pNavFocus[] = [
              { kind: 'session', idx: 0 },
              { kind: 'session', idx: 1 },
              { kind: 'back' },
            ];
            const i = order.findIndex((item) => navFocusEqual(item, prev));
            const next = order[(i + delta + order.length) % order.length];
            return next ?? prev;
          });
          return;
        }
        if (stepped && step === 'options') {
          setNavFocus((prev) => {
            const base = buildFlatNavOrder(tournament).filter(
              (item) => item.kind !== 'session'
            );
            const flat = tournament
              ? [
                  ...base.filter(
                    (item) =>
                      item.kind === 'players' ||
                      (item.kind === 'buyinPill' &&
                        item.idx < STEPPED_BUYIN_SATS.length)
                  ),
                  ...base.filter((item) => item.kind === 'payment'),
                  ...base.filter(
                    (item) => item.kind === 'start' || item.kind === 'back'
                  ),
                ]
              : [
                  ...base.filter((item) => item.kind === 'duelFormat'),
                  ...base.filter((item) => item.kind === 'payment'),
                  ...base.filter(
                    (item) => item.kind === 'start' || item.kind === 'back'
                  ),
                ];
            if (prev.kind === 'none' || prev.kind === 'session') {
              return delta === 1
                ? (flat[0] ?? prev)
                : (flat[flat.length - 1] ?? prev);
            }
            const i = flat.findIndex((item) => navFocusEqual(item, prev));
            if (i < 0) return flat[0] ?? prev;
            return flat[(i + delta + flat.length) % flat.length] ?? prev;
          });
          return;
        }
        setNavFocus((prev) => advanceFlatNav(prev, delta, tournament));
      };

      if (isTab) {
        e.preventDefault();
        advance(1);
        return;
      }
      if (isTabBack) {
        e.preventDefault();
        advance(-1);
        return;
      }

      if (isActivate) {
        e.preventDefault();
        if (navFocus.kind === 'none') return;
        activateNavFocus(navFocus);
        return;
      }

      if (navFocus.kind === 'none' && isUp) {
        return;
      }

      e.preventDefault();
      const dir = isUp ? 'up' : isDown ? 'down' : isLeft ? 'left' : 'right';
      if (stepped && step === 'mode') {
        setNavFocus((prev) => {
          let next = prev;
          if (prev.kind === 'session') {
            if (dir === 'left') next = { kind: 'session', idx: 0 };
            else if (dir === 'right') next = { kind: 'session', idx: 1 };
            else if (dir === 'down') next = { kind: 'back' };
          } else if (prev.kind === 'back' && dir === 'up') {
            next = { kind: 'session', idx: tournament ? 1 : 0 };
          }
          if (!navFocusEqual(prev, next)) playSelect();
          return next;
        });
        return;
      }
      setNavFocus((prev) => {
        let next = moveNavFocus(prev, dir, tournament);
        if (stepped && step === 'options' && tournament) {
          if (prev.kind === 'players') {
            if (dir === 'left' && prev.idx > 0) {
              next = { kind: 'players', idx: (prev.idx - 1) as 0 | 1 | 2 };
            } else if (dir === 'right' && prev.idx < 2) {
              next = { kind: 'players', idx: (prev.idx + 1) as 0 | 1 | 2 };
            } else if (dir === 'down') {
              next = { kind: 'buyinPill', idx: 0 };
            } else {
              next = prev;
            }
          } else if (prev.kind === 'buyinPill') {
            if (dir === 'left' && prev.idx > 0) {
              next = { kind: 'buyinPill', idx: prev.idx - 1 };
            } else if (
              dir === 'right' &&
              prev.idx < STEPPED_BUYIN_SATS.length - 1
            ) {
              next = { kind: 'buyinPill', idx: prev.idx + 1 };
            } else if (dir === 'up') {
              next = { kind: 'players', idx: 0 };
            } else if (dir === 'down') {
              next = { kind: 'payment', idx: 0 };
            } else {
              next = prev;
            }
          } else if (prev.kind === 'payment' && dir === 'up') {
            next = {
              kind: 'buyinPill',
              idx: prev.idx === 0 ? 0 : STEPPED_BUYIN_SATS.length - 1,
            };
          } else if (prev.kind === 'payment' && dir === 'down') {
            next = { kind: 'start' };
          } else if (
            (prev.kind === 'start' || prev.kind === 'back') &&
            dir === 'up'
          ) {
            next = { kind: 'payment', idx: prev.kind === 'back' ? 0 : 1 };
          }
        } else if (stepped && step === 'options') {
          if (prev.kind === 'payment' && dir === 'up') {
            next = { kind: 'duelFormat' };
          } else if (prev.kind === 'payment' && dir === 'down') {
            next = { kind: 'start' };
          } else if (prev.kind === 'duelFormat' && dir === 'down') {
            next = { kind: 'payment', idx: 0 };
          } else if (prev.kind === 'duelFormat' && dir === 'up') {
            next = prev;
          } else if (
            (prev.kind === 'start' || prev.kind === 'back') &&
            dir === 'up'
          ) {
            next = { kind: 'payment', idx: prev.kind === 'back' ? 0 : 1 };
          }
        }
        if (!navFocusEqual(prev, next)) {
          playSelect();
        }
        return next;
      });
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    activateNavFocus,
    leaveOptions,
    navFocus,
    navigate,
    playSelect,
    playSfx,
    step,
    stepped,
    tournament,
  ]);

  useEffect(() => {
    if (navFocus.kind === 'none') {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      return;
    }
    if (navFocus.kind === 'payment') {
      paymentRefs.current[navFocus.idx]?.focus();
    } else if (navFocus.kind === 'session') {
      sessionRefs.current[navFocus.idx]?.focus();
    } else if (navFocus.kind === 'duelFormat') {
      duelFormatRef.current?.focus();
    } else if (navFocus.kind === 'start') {
      startRef.current?.focus();
    } else if (navFocus.kind === 'back') {
      backRef.current?.focus();
    } else if (tournament && bracketHubRef.current) {
      if (navFocus.kind === 'players') {
        bracketHubRef.current.focusPlayer(navFocus.idx);
      } else if (navFocus.kind === 'buyinPill') {
        bracketHubRef.current.focusBuyinPill(navFocus.idx);
      }
    }
  }, [navFocus, tournament]);

  const startLabel = sessionKind === 'duel' ? 'Start duel' : 'Start bracket';
  const pageTitle =
    stepped && step === 'options'
      ? sessionKind === 'duel'
        ? 'P2P Duel'
        : 'P2P Tournament'
      : 'P2P';

  return (
    <div
      className={`practice-hub practice-hub--practice p2p-entry-page${stepped ? ' p2p-entry-page--stepped' : ''}`}
    >
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>
      <header className="practice-hub-header">
        <h2 className="practice-hub-title">{pageTitle}</h2>
      </header>

      <div className="practice-panel" role="main" aria-label="P2P paid entry">
        {showOptions && stepped && tournament ? (
          <section className="practice-section" aria-labelledby="te-bracket">
            <BracketSizingHub
              ref={bracketHubRef}
              menuFocus={bracketMenuFocus}
              onMenuFocus={setNavFocus}
              playersNumber={playersNumber}
              deposit={deposit}
              onPlayersChange={setPlayersNumber}
              onDepositChange={setDeposit}
              playSelect={playSelect}
              buyinSteps={STEPPED_BUYIN_SATS}
            />
          </section>
        ) : null}
        {showOptions ? (
          <section className="practice-section" aria-labelledby="te-pay">
            <h3 id="te-pay" className="p2p-picker-group-label">
              PAY WITH
            </h3>
            <div
              className="p2p-picker-row"
              role="radiogroup"
              aria-label="Payment method"
            >
              <button
                ref={(el) => {
                  paymentRefs.current[0] = el;
                }}
                type="button"
                role="radio"
                aria-checked={payment === 'lightning'}
                tabIndex={
                  navFocus.kind === 'payment' && navFocus.idx === 0 ? 0 : -1
                }
                className={[
                  'p2p-picker-card',
                  'p2p-picker-card--lightning',
                  payment === 'lightning' ? 'p2p-picker-card--selected' : '',
                  navFocus.kind === 'payment' && navFocus.idx === 0
                    ? 'practice-focus-target'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  setNavFocus({ kind: 'payment', idx: 0 });
                  playSfx(SFX.MENU_SELECT);
                  setPayment('lightning');
                }}
              >
                <svg
                  className="p2p-picker-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinejoin="round"
                    fill="currentColor"
                    fillOpacity="0.12"
                  />
                </svg>
                <span className="p2p-picker-label">LIGHTNING</span>
                <span className="p2p-picker-sub">Private game</span>
              </button>
              <button
                ref={(el) => {
                  paymentRefs.current[1] = el;
                }}
                type="button"
                role="radio"
                aria-checked={payment === 'nostr'}
                tabIndex={
                  navFocus.kind === 'payment' && navFocus.idx === 1 ? 0 : -1
                }
                className={[
                  'p2p-picker-card',
                  'p2p-picker-card--nostr',
                  payment === 'nostr' ? 'p2p-picker-card--selected' : '',
                  navFocus.kind === 'payment' && navFocus.idx === 1
                    ? 'practice-focus-target'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  setNavFocus({ kind: 'payment', idx: 1 });
                  playSfx(SFX.MENU_SELECT);
                  setPayment('nostr');
                }}
              >
                <svg
                  className="p2p-picker-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="8"
                    r="4"
                    stroke="currentColor"
                    strokeWidth="1"
                    fill="currentColor"
                    fillOpacity="0.12"
                  />
                  <path
                    d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinecap="round"
                  />
                  <path
                    d="M17.5 3.5l2 2M20.5 2.5l-1.5 1.5"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="p2p-picker-label">NOSTR ZAP</span>
                <span className="p2p-picker-sub">Public game</span>
              </button>
            </div>
          </section>
        ) : null}

        {showMode ? (
          <section className="practice-section" aria-labelledby="te-session">
            <h3 id="te-session" className="p2p-picker-group-label">
              MODE
            </h3>
            <div
              className="p2p-picker-row"
              role="radiogroup"
              aria-label="Session type"
            >
              <button
                ref={(el) => {
                  sessionRefs.current[0] = el;
                }}
                type="button"
                role="radio"
                aria-checked={duelSelected}
                tabIndex={
                  navFocus.kind === 'session' && navFocus.idx === 0 ? 0 : -1
                }
                className={[
                  'p2p-picker-card',
                  'p2p-picker-card--duel',
                  duelSelected ? 'p2p-picker-card--selected' : '',
                  navFocus.kind === 'session' && navFocus.idx === 0
                    ? 'practice-focus-target'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  setNavFocus({ kind: 'session', idx: 0 });
                  playSfx(SFX.MENU_SELECT);
                  openModeOptions('duel');
                }}
              >
                <svg
                  className="p2p-picker-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <g className="p2p-sword p2p-sword--1">
                    <path
                      d="M19 4L5 19"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeLinecap="round"
                    />
                    <path
                      d="M13 7L17 10"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeLinecap="round"
                    />
                  </g>
                  <g className="p2p-sword p2p-sword--2">
                    <path
                      d="M5 4L19 19"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeLinecap="round"
                    />
                    <path
                      d="M7 10L11 7"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeLinecap="round"
                    />
                  </g>
                </svg>
                <span className="p2p-picker-label">DUEL</span>
                <span className="p2p-picker-sub">1 vs 1</span>
              </button>
              <button
                ref={(el) => {
                  sessionRefs.current[1] = el;
                }}
                type="button"
                role="radio"
                aria-checked={tournamentSelected}
                tabIndex={
                  navFocus.kind === 'session' && navFocus.idx === 1 ? 0 : -1
                }
                className={[
                  'p2p-picker-card',
                  'p2p-picker-card--tournament',
                  tournamentSelected ? 'p2p-picker-card--selected' : '',
                  navFocus.kind === 'session' && navFocus.idx === 1
                    ? 'practice-focus-target'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  setNavFocus({ kind: 'session', idx: 1 });
                  playSfx(SFX.MENU_SELECT);
                  openModeOptions('tournament');
                }}
              >
                <svg
                  className="p2p-picker-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <g className="p2p-bracket">
                    <rect
                      x="9"
                      y="2"
                      width="6"
                      height="4"
                      rx="0.5"
                      stroke="currentColor"
                      strokeWidth="1"
                      fill="currentColor"
                      fillOpacity="0.12"
                    />
                    <rect
                      x="2"
                      y="14"
                      width="6"
                      height="4"
                      rx="0.5"
                      stroke="currentColor"
                      strokeWidth="1"
                      fill="currentColor"
                      fillOpacity="0.12"
                    />
                    <rect
                      x="16"
                      y="14"
                      width="6"
                      height="4"
                      rx="0.5"
                      stroke="currentColor"
                      strokeWidth="1"
                      fill="currentColor"
                      fillOpacity="0.12"
                    />
                    <path
                      d="M12 6v4M5 14v-4h7M19 14v-4h-7"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeLinecap="round"
                    />
                  </g>
                </svg>
                <span className="p2p-picker-label">TOURNAMENT</span>
                <span className="p2p-picker-sub">
                  {tournamentSelected
                    ? `${playersNumber}P · ${deposit / 1000}K SATS`
                    : 'Bracket'}
                </span>
              </button>
            </div>
          </section>
        ) : null}

        {/* Grid overlay: both sections occupy the same cell so height never shifts */}
        {showOptions && !(stepped && tournament) ? (
          <div className="p2p-mode-config-area">
            <section
              className={`practice-section${sessionKind !== 'duel' ? ' p2p-mode-inactive' : ''}`}
              aria-labelledby="te-duel-format"
              aria-hidden={sessionKind !== 'duel'}
            >
              <h3 id="te-duel-format" className="p2p-picker-group-label">
                FORMAT
              </h3>
              <div
                className="p2p-duel-format"
                role="group"
                aria-label="Duel format"
              >
                <button
                  ref={duelFormatRef}
                  type="button"
                  tabIndex={navFocus.kind === 'duelFormat' ? 0 : -1}
                  className={[
                    'p2p-duel-format__card',
                    'p2p-duel-format__card--active',
                    navFocus.kind === 'duelFormat'
                      ? 'practice-focus-target'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed="true"
                  onClick={() => {
                    setNavFocus({ kind: 'duelFormat' });
                    playSfx(SFX.MENU_SELECT);
                  }}
                >
                  <svg
                    className="p2p-duel-format__icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      cx="7"
                      cy="7"
                      r="2.5"
                      stroke="currentColor"
                      strokeWidth="1"
                      fill="currentColor"
                      fillOpacity="0.15"
                    />
                    <path
                      d="M3 17a4 3.5 0 0 1 8 0"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeLinecap="round"
                      fill="none"
                    />
                    <circle
                      cx="17"
                      cy="7"
                      r="2.5"
                      stroke="currentColor"
                      strokeWidth="1"
                      fill="currentColor"
                      fillOpacity="0.15"
                    />
                    <path
                      d="M13 17a4 3.5 0 0 1 8 0"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </svg>
                  <span className="p2p-duel-format__label">1v1</span>
                  <span className="p2p-duel-format__desc">Head to head</span>
                </button>
                <button
                  type="button"
                  className="p2p-duel-format__card p2p-duel-format__card--disabled"
                  disabled
                  aria-disabled="true"
                >
                  <svg
                    className="p2p-duel-format__icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      cx="5"
                      cy="7"
                      r="2"
                      stroke="currentColor"
                      strokeWidth="1"
                      fill="currentColor"
                      fillOpacity="0.15"
                    />
                    <path
                      d="M2 15a3 3 0 0 1 6 0"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeLinecap="round"
                      fill="none"
                    />
                    <circle
                      cx="11"
                      cy="7"
                      r="2"
                      stroke="currentColor"
                      strokeWidth="1"
                      fill="currentColor"
                      fillOpacity="0.15"
                    />
                    <path
                      d="M8 15a3 3 0 0 1 6 0"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeLinecap="round"
                      fill="none"
                    />
                    <circle
                      cx="13"
                      cy="7"
                      r="2"
                      stroke="currentColor"
                      strokeWidth="1"
                      fill="currentColor"
                      fillOpacity="0.15"
                    />
                    <path
                      d="M10 15a3 3 0 0 1 6 0"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeLinecap="round"
                      fill="none"
                    />
                    <circle
                      cx="19"
                      cy="7"
                      r="2"
                      stroke="currentColor"
                      strokeWidth="1"
                      fill="currentColor"
                      fillOpacity="0.15"
                    />
                    <path
                      d="M16 15a3 3 0 0 1 6 0"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </svg>
                  <span className="p2p-duel-format__label">2v2</span>
                  <span className="p2p-duel-format__desc">Teams</span>
                  <span className="p2p-duel-format__soon">SOON</span>
                </button>
                <button
                  type="button"
                  className="p2p-duel-format__card p2p-duel-format__card--disabled"
                  disabled
                  aria-disabled="true"
                >
                  <svg
                    className="p2p-duel-format__icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      cx="7"
                      cy="5"
                      r="2"
                      stroke="currentColor"
                      strokeWidth="1"
                      fill="currentColor"
                      fillOpacity="0.15"
                    />
                    <path
                      d="M4 12a3 2.5 0 0 1 6 0"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeLinecap="round"
                      fill="none"
                    />
                    <circle
                      cx="17"
                      cy="5"
                      r="2"
                      stroke="currentColor"
                      strokeWidth="1"
                      fill="currentColor"
                      fillOpacity="0.15"
                    />
                    <path
                      d="M14 12a3 2.5 0 0 1 6 0"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeLinecap="round"
                      fill="none"
                    />
                    <circle
                      cx="7"
                      cy="16"
                      r="2"
                      stroke="currentColor"
                      strokeWidth="1"
                      fill="currentColor"
                      fillOpacity="0.15"
                    />
                    <path
                      d="M4 23a3 2.5 0 0 1 6 0"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeLinecap="round"
                      fill="none"
                    />
                    <circle
                      cx="17"
                      cy="16"
                      r="2"
                      stroke="currentColor"
                      strokeWidth="1"
                      fill="currentColor"
                      fillOpacity="0.15"
                    />
                    <path
                      d="M14 23a3 2.5 0 0 1 6 0"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </svg>
                  <span className="p2p-duel-format__label">4P</span>
                  <span className="p2p-duel-format__desc">Free for all</span>
                  <span className="p2p-duel-format__soon">SOON</span>
                </button>
              </div>
            </section>

            {!stepped ? (
              <section
                className={`practice-section${sessionKind !== 'tournament' ? ' p2p-mode-inactive' : ''}`}
                aria-labelledby="te-bracket"
                aria-hidden={sessionKind !== 'tournament'}
              >
                <BracketSizingHub
                  ref={bracketHubRef}
                  menuFocus={bracketMenuFocus}
                  onMenuFocus={setNavFocus}
                  playersNumber={playersNumber}
                  deposit={deposit}
                  onPlayersChange={setPlayersNumber}
                  onDepositChange={setDeposit}
                  playSelect={playSelect}
                />
              </section>
            ) : null}
          </div>
        ) : null}

        {showOptions ? <GameModifiersSection /> : null}

        <div className="practice-actions">
          <Button
            ref={backRef}
            tabIndex={navFocus.kind === 'back' ? 0 : -1}
            className={`practice-back${navFocus.kind === 'back' ? ' practice-start--focused' : ''}`}
            onClick={() => {
              setNavFocus({ kind: 'back' });
              playSfx(SFX.MENU_SELECT);
              if (stepped && step === 'options') {
                leaveOptions();
                return;
              }
              navigateToMainMenu(navigate);
            }}
          >
            {stepped && step === 'options' ? 'BACK' : 'MAIN MENU'}
          </Button>
          {showOptions ? (
            <Button
              ref={startRef}
              tabIndex={navFocus.kind === 'start' ? 0 : -1}
              className={`practice-start${navFocus.kind === 'start' ? ' practice-start--focused' : ''}`}
              onClick={() => {
                setNavFocus({ kind: 'start' });
                start();
              }}
            >
              {startLabel}
            </Button>
          ) : null}
        </div>
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
