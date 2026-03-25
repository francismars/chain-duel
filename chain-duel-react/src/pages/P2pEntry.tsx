import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import {
  BracketSizingHub,
  type BracketSizingHubHandle,
} from '@/components/paidEntry/BracketSizingHub';
import { useGamepad } from '@/hooks/useGamepad';
import { useAudio, SFX } from '@/contexts/AudioContext';
import { CHAIN_DUEL_SUPPRESS_NEXT_MENU_CONFIRM } from '@/shared/constants/menuNavigation';
import {
  advanceFlatNav,
  isBracketNavFocus,
  moveNavFocus,
  normalizeNavFocusForSession,
  type P2pNavFocus,
} from '@/pages/p2pEntryNav';
import '@/components/ui/Button.css';
import './practiceHub.css';
import '@/styles/pages/p2p-entry.css';
import '@/styles/pages/onlinePostGame.css';

type SessionKind = 'duel' | 'tournament';
type PaymentKind = 'lightning' | 'nostr';

export default function P2pEntry() {
  const navigate = useNavigate();
  const { playSfx } = useAudio();
  useGamepad(true);

  const [navFocus, setNavFocus] = useState<P2pNavFocus>({
    kind: 'payment',
    idx: 0,
  });
  const paymentRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const sessionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const startRef = useRef<HTMLButtonElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const bracketHubRef = useRef<BracketSizingHubHandle | null>(null);

  const [sessionKind, setSessionKind] = useState<SessionKind>('duel');
  const [payment, setPayment] = useState<PaymentKind>('lightning');
  const [playersNumber, setPlayersNumber] = useState(4);
  const [deposit, setDeposit] = useState(10000);

  const tournament = sessionKind === 'tournament';
  const sessionNavIdx: 0 | 1 = sessionKind === 'duel' ? 0 : 1;

  const keyboardNavState = useMemo(
    () => ({ [CHAIN_DUEL_SUPPRESS_NEXT_MENU_CONFIRM]: true }),
    []
  );

  const playSelect = useCallback(() => playSfx(SFX.MENU_SELECT), [playSfx]);

  const bracketMenuFocus = useMemo(() => {
    if (!tournament) return null;
    return isBracketNavFocus(navFocus) ? navFocus : null;
  }, [tournament, navFocus]);


  const start = useCallback(() => {
    playSfx(SFX.MENU_CONFIRM);
    const nostr = payment === 'nostr';
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
          setSessionKind(f.idx === 0 ? 'duel' : 'tournament');
          playSfx(SFX.MENU_SELECT);
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
          navigate('/');
          break;
        default:
          break;
      }
    },
    [navigate, playSfx, start]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        playSfx(SFX.MENU_SELECT);
        navigate('/');
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

      if (isTab) {
        e.preventDefault();
        setNavFocus((prev) => advanceFlatNav(prev, 1, tournament));
        return;
      }
      if (isTabBack) {
        e.preventDefault();
        setNavFocus((prev) => advanceFlatNav(prev, -1, tournament));
        return;
      }

      if (isActivate) {
        e.preventDefault();
        activateNavFocus(navFocus);
        return;
      }

      e.preventDefault();
      setNavFocus((prev) =>
        moveNavFocus(
          prev,
          isUp ? 'up' : isDown ? 'down' : isLeft ? 'left' : 'right',
          tournament,
          sessionNavIdx
        )
      );
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [activateNavFocus, navFocus, navigate, playSfx, sessionNavIdx, tournament]);

  useEffect(() => {
    if (navFocus.kind === 'payment') {
      paymentRefs.current[navFocus.idx]?.focus();
    } else if (navFocus.kind === 'session') {
      sessionRefs.current[navFocus.idx]?.focus();
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

  const startLabel =
    sessionKind === 'duel' ? 'Open game menu' : 'Start bracket';

  return (
    <div className="practice-hub practice-hub--practice p2p-entry-page">
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>
      <header className="practice-hub-header">
        <h2 className="practice-hub-title">P2P</h2>
      </header>

      <div className="practice-panel" role="main" aria-label="P2P paid entry">
        <section className="practice-section" aria-labelledby="te-pay">
          <h3 id="te-pay" className="p2p-picker-group-label">
            PAY WITH
          </h3>
          <div className="p2p-picker-row" role="radiogroup" aria-label="Payment method">
            <button
              ref={(el) => { paymentRefs.current[0] = el; }}
              type="button"
              role="radio"
              aria-checked={payment === 'lightning'}
              tabIndex={navFocus.kind === 'payment' && navFocus.idx === 0 ? 0 : -1}
              className={[
                'p2p-picker-card',
                'p2p-picker-card--lightning',
                payment === 'lightning' ? 'p2p-picker-card--selected' : '',
                navFocus.kind === 'payment' && navFocus.idx === 0 ? 'practice-focus-target' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => {
                setNavFocus({ kind: 'payment', idx: 0 });
                playSfx(SFX.MENU_SELECT);
                setPayment('lightning');
              }}
            >
              <svg className="p2p-picker-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" fill="currentColor" fillOpacity="0.12"/>
              </svg>
              <span className="p2p-picker-label">LIGHTNING</span>
              <span className="p2p-picker-sub">Anonymous</span>
            </button>
            <button
              ref={(el) => { paymentRefs.current[1] = el; }}
              type="button"
              role="radio"
              aria-checked={payment === 'nostr'}
              tabIndex={navFocus.kind === 'payment' && navFocus.idx === 1 ? 0 : -1}
              className={[
                'p2p-picker-card',
                'p2p-picker-card--nostr',
                payment === 'nostr' ? 'p2p-picker-card--selected' : '',
                navFocus.kind === 'payment' && navFocus.idx === 1 ? 'practice-focus-target' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => {
                setNavFocus({ kind: 'payment', idx: 1 });
                playSfx(SFX.MENU_SELECT);
                setPayment('nostr');
              }}
            >
              <svg className="p2p-picker-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.12"/>
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                <path d="M17.5 3.5l2 2M20.5 2.5l-1.5 1.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
              </svg>
              <span className="p2p-picker-label">NOSTR</span>
              <span className="p2p-picker-sub">Via zap</span>
            </button>
          </div>
        </section>

        <section className="practice-section" aria-labelledby="te-session">
          <h3 id="te-session" className="p2p-picker-group-label">
            MODE
          </h3>
          <div className="p2p-picker-row" role="radiogroup" aria-label="Session type">
            <button
              ref={(el) => { sessionRefs.current[0] = el; }}
              type="button"
              role="radio"
              aria-checked={sessionKind === 'duel'}
              tabIndex={navFocus.kind === 'session' && navFocus.idx === 0 ? 0 : -1}
              className={[
                'p2p-picker-card',
                'p2p-picker-card--duel',
                sessionKind === 'duel' ? 'p2p-picker-card--selected' : '',
                navFocus.kind === 'session' && navFocus.idx === 0 ? 'practice-focus-target' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => {
                setNavFocus({ kind: 'session', idx: 0 });
                playSfx(SFX.MENU_SELECT);
                setSessionKind('duel');
              }}
            >
              <svg className="p2p-picker-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <g className="p2p-sword p2p-sword--1">
                  <path d="M19 4L5 19" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                  <path d="M13 7L17 10" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                </g>
                <g className="p2p-sword p2p-sword--2">
                  <path d="M5 4L19 19" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                  <path d="M7 10L11 7" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                </g>
              </svg>
              <span className="p2p-picker-label">DUEL</span>
              <span className="p2p-picker-sub">1 vs 1</span>
            </button>
            <button
              ref={(el) => { sessionRefs.current[1] = el; }}
              type="button"
              role="radio"
              aria-checked={sessionKind === 'tournament'}
              tabIndex={navFocus.kind === 'session' && navFocus.idx === 1 ? 0 : -1}
              className={[
                'p2p-picker-card',
                'p2p-picker-card--tournament',
                sessionKind === 'tournament' ? 'p2p-picker-card--selected' : '',
                navFocus.kind === 'session' && navFocus.idx === 1 ? 'practice-focus-target' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => {
                setNavFocus({ kind: 'session', idx: 1 });
                playSfx(SFX.MENU_SELECT);
                setSessionKind('tournament');
              }}
            >
              <svg className="p2p-picker-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <g className="p2p-bracket">
                  <rect x="9" y="2" width="6" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.12"/>
                  <rect x="2" y="10" width="6" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.12"/>
                  <rect x="16" y="10" width="6" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.12"/>
                  <rect x="9" y="18" width="6" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.12"/>
                  <path d="M12 6v4M5 14v4h7M19 14v4h-7" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                </g>
              </svg>
              <span className="p2p-picker-label">TOURNAMENT</span>
              <span className="p2p-picker-sub">
                {sessionKind === 'tournament'
                  ? `${playersNumber}P · ${deposit / 1000}K SATS`
                  : 'Bracket'}
              </span>
            </button>
          </div>
        </section>

        {/* Grid overlay: both sections occupy the same cell so height never shifts */}
        <div className="p2p-mode-config-area">
          <section
            className={`practice-section${sessionKind !== 'duel' ? ' p2p-mode-inactive' : ''}`}
            aria-labelledby="te-duel-format"
            aria-hidden={sessionKind !== 'duel'}
          >
            <h3 id="te-duel-format" className="p2p-picker-group-label">
              FORMAT
            </h3>
            <div className="p2p-duel-format" role="group" aria-label="Duel format">
              <button type="button" className="p2p-duel-format__card p2p-duel-format__card--active" aria-pressed="true">
                <svg className="p2p-duel-format__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15"/>
                  <path d="M3 17a4 3.5 0 0 1 8 0" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none"/>
                  <circle cx="17" cy="7" r="2.5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15"/>
                  <path d="M13 17a4 3.5 0 0 1 8 0" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none"/>
                </svg>
                <span className="p2p-duel-format__label">1v1</span>
                <span className="p2p-duel-format__desc">Head to head</span>
              </button>
              <button type="button" className="p2p-duel-format__card p2p-duel-format__card--disabled" disabled aria-disabled="true">
                <svg className="p2p-duel-format__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="5" cy="7" r="2" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15"/>
                  <path d="M2 15a3 3 0 0 1 6 0" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none"/>
                  <circle cx="11" cy="7" r="2" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15"/>
                  <path d="M8 15a3 3 0 0 1 6 0" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none"/>
                  <circle cx="13" cy="7" r="2" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15"/>
                  <path d="M10 15a3 3 0 0 1 6 0" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none"/>
                  <circle cx="19" cy="7" r="2" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15"/>
                  <path d="M16 15a3 3 0 0 1 6 0" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none"/>
                </svg>
                <span className="p2p-duel-format__label">2v2</span>
                <span className="p2p-duel-format__desc">Teams</span>
                <span className="p2p-duel-format__soon">SOON</span>
              </button>
              <button type="button" className="p2p-duel-format__card p2p-duel-format__card--disabled" disabled aria-disabled="true">
                <svg className="p2p-duel-format__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="7" cy="5" r="2" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15"/>
                  <path d="M4 12a3 2.5 0 0 1 6 0" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none"/>
                  <circle cx="17" cy="5" r="2" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15"/>
                  <path d="M14 12a3 2.5 0 0 1 6 0" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none"/>
                  <circle cx="7" cy="16" r="2" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15"/>
                  <path d="M4 23a3 2.5 0 0 1 6 0" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none"/>
                  <circle cx="17" cy="16" r="2" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15"/>
                  <path d="M14 23a3 2.5 0 0 1 6 0" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none"/>
                </svg>
                <span className="p2p-duel-format__label">4P</span>
                <span className="p2p-duel-format__desc">Free for all</span>
                <span className="p2p-duel-format__soon">SOON</span>
              </button>
            </div>
          </section>

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
        </div>

        <section className="practice-section p2p-modifiers-section" aria-label="Game modifiers">
          <h3 className="p2p-picker-group-label">MODIFIERS</h3>
          <div className="p2p-duel-format" role="group" aria-label="Game modifiers">
            <button type="button" className="p2p-duel-format__card p2p-duel-format__card--disabled" disabled aria-disabled="true">
              <svg className="p2p-duel-format__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1" fill="none"/>
                <circle cx="12" cy="12" r="5.5" stroke="currentColor" strokeWidth="1" fill="none"/>
                <circle cx="12" cy="12" r="1.5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.3"/>
              </svg>
              <span className="p2p-duel-format__label">Zone</span>
              <span className="p2p-duel-format__desc">Convergence</span>
              <span className="p2p-duel-format__soon">SOON</span>
            </button>
            <button type="button" className="p2p-duel-format__card p2p-duel-format__card--disabled" disabled aria-disabled="true">
              <svg className="p2p-duel-format__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1" fill="none"/>
                <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="p2p-duel-format__label">3 min</span>
              <span className="p2p-duel-format__desc">Time limit</span>
              <span className="p2p-duel-format__soon">SOON</span>
            </button>
            <button type="button" className="p2p-duel-format__card p2p-duel-format__card--disabled" disabled aria-disabled="true">
              <svg className="p2p-duel-format__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="10.5" y="3" width="3" height="18" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15"/>
                <rect x="3" y="10.5" width="18" height="3" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15"/>
              </svg>
              <span className="p2p-duel-format__label">+Items</span>
              <span className="p2p-duel-format__desc">Power-ups</span>
              <span className="p2p-duel-format__soon">SOON</span>
            </button>
          </div>
        </section>

        <div className="practice-actions">
          <Button
            ref={backRef}
            tabIndex={navFocus.kind === 'back' ? 0 : -1}
            className={`practice-back${navFocus.kind === 'back' ? ' practice-start--focused' : ''}`}
            onClick={() => {
              setNavFocus({ kind: 'back' });
              playSfx(SFX.MENU_SELECT);
              navigate('/');
            }}
          >
            MAIN MENU
          </Button>
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
        </div>
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
