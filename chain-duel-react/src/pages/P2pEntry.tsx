import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import {
  BracketSizingHub,
  type BracketSizingHubHandle,
} from '@/components/paidEntry/BracketSizingHub';
import { useGamepad } from '@/hooks/useGamepad';
import { useAudio, SFX } from '@/contexts/AudioContext';
import { CHAIN_DUEL_SUPPRESS_NEXT_MENU_CONFIRM } from '@/shared/constants/menuNavigation';
import {
  modalHintsFor,
  type ModalPitch,
} from '@/shared/paidEntry/p2pEntryHints';
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

  const summaryLine = useMemo(() => {
    const pay = payment === 'lightning' ? 'LN' : 'NOSTR';
    if (sessionKind === 'duel') {
      return `${pay} · DUEL`;
    }
    return `${pay} · BRACKET · ${playersNumber}P · ${deposit.toLocaleString()} SATS`;
  }, [sessionKind, payment, playersNumber, deposit]);

  const detailHint = useMemo(() => {
    const kind: 'p2p' | 'tournament' =
      sessionKind === 'duel' ? 'p2p' : 'tournament';
    const pitch: ModalPitch = payment === 'lightning' ? 'lightning' : 'nostr';
    return modalHintsFor(kind)[pitch];
  }, [sessionKind, payment]);

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
        case 'buyinPrev':
          bracketHubRef.current?.triggerBuyinPrev();
          break;
        case 'buyinNext':
          bracketHubRef.current?.triggerBuyinNext();
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
      } else if (navFocus.kind === 'buyinPrev') {
        bracketHubRef.current.focusBuyinPrev();
      } else if (navFocus.kind === 'buyinPill') {
        bracketHubRef.current.focusBuyinPill(navFocus.idx);
      } else if (navFocus.kind === 'buyinNext') {
        bracketHubRef.current.focusBuyinNext();
      }
    }
  }, [navFocus, tournament]);

  const startLabel =
    sessionKind === 'duel' ? 'Open game menu' : 'Start bracket';

  return (
    <div className="practice-hub practice-hub--practice p2p-entry-page">
      <header className="practice-hub-header">
        <h2 className="practice-hub-title">P2P</h2>
        <p className="practice-hub-subtitle">PAID ENTRY</p>
        <p className="practice-hub-lede">
          Choose how you pay first, then duel or bracket. Tournament field and
          buy-in use the same controls as Local — just with real stakes.
        </p>
      </header>

      <div className="practice-panel" role="main" aria-label="P2P paid entry">
        <section className="practice-section" aria-labelledby="te-pay">
          <h3 id="te-pay" className="practice-section-title">
            Payment
          </h3>
          <p className="practice-section-hint">
            Lightning invoices or Nostr zaps — pick the rail before session type.
          </p>
          <div className="practice-seg practice-seg--two" role="group" aria-label="Payment method">
            <button
              ref={(el) => {
                paymentRefs.current[0] = el;
              }}
              type="button"
              tabIndex={navFocus.kind === 'payment' && navFocus.idx === 0 ? 0 : -1}
              className={`practice-seg-btn ${payment === 'lightning' ? 'active' : ''}${navFocus.kind === 'payment' && navFocus.idx === 0 ? ' practice-focus-target' : ''}`}
              onClick={() => {
                setNavFocus({ kind: 'payment', idx: 0 });
                playSfx(SFX.MENU_SELECT);
                setPayment('lightning');
              }}
            >
              <span className="practice-seg-label">Lightning</span>
              <span className="practice-seg-desc">LNURL · QR</span>
            </button>
            <button
              ref={(el) => {
                paymentRefs.current[1] = el;
              }}
              type="button"
              tabIndex={navFocus.kind === 'payment' && navFocus.idx === 1 ? 0 : -1}
              className={`practice-seg-btn ${payment === 'nostr' ? 'active' : ''}${navFocus.kind === 'payment' && navFocus.idx === 1 ? ' practice-focus-target' : ''}`}
              onClick={() => {
                setNavFocus({ kind: 'payment', idx: 1 });
                playSfx(SFX.MENU_SELECT);
                setPayment('nostr');
              }}
            >
              <span className="practice-seg-label">Nostr</span>
              <span className="practice-seg-desc">Zaps · notes</span>
            </button>
          </div>
        </section>

        <section className="practice-section" aria-labelledby="te-session">
          <h3 id="te-session" className="practice-section-title">
            Session
          </h3>
          <p className="practice-section-hint">
            Duel jumps to the paid game menu. Tournament keeps you here for
            field & buy-in, then opens the bracket.
          </p>
          <div className="practice-seg practice-seg--two" role="group" aria-label="Session type">
            <button
              ref={(el) => {
                sessionRefs.current[0] = el;
              }}
              type="button"
              tabIndex={navFocus.kind === 'session' && navFocus.idx === 0 ? 0 : -1}
              className={`practice-seg-btn ${sessionKind === 'duel' ? 'active' : ''}${navFocus.kind === 'session' && navFocus.idx === 0 ? ' practice-focus-target' : ''}`}
              onClick={() => {
                setNavFocus({ kind: 'session', idx: 0 });
                playSfx(SFX.MENU_SELECT);
                setSessionKind('duel');
              }}
            >
              <span className="practice-seg-label">Duel</span>
              <span className="practice-seg-desc">1v1 game menu</span>
            </button>
            <button
              ref={(el) => {
                sessionRefs.current[1] = el;
              }}
              type="button"
              tabIndex={navFocus.kind === 'session' && navFocus.idx === 1 ? 0 : -1}
              className={`practice-seg-btn ${sessionKind === 'tournament' ? 'active' : ''}${navFocus.kind === 'session' && navFocus.idx === 1 ? ' practice-focus-target' : ''}`}
              onClick={() => {
                setNavFocus({ kind: 'session', idx: 1 });
                playSfx(SFX.MENU_SELECT);
                setSessionKind('tournament');
              }}
            >
              <span className="practice-seg-label">Tournament</span>
              <span className="practice-seg-desc">Bracket flow</span>
            </button>
          </div>
        </section>

        {sessionKind === 'tournament' ? (
          <section className="practice-section" aria-labelledby="te-bracket">
            <h3 id="te-bracket" className="practice-section-title">
              Bracket size
            </h3>
            <p className="practice-section-hint">
              Field count and buy-in (same as tournament prefs).
            </p>
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

        <section className="practice-section" aria-labelledby="te-detail">
          <h3 id="te-detail" className="practice-section-title">
            Selected rail
          </h3>
          <p className="practice-section-hint p2p-entry-detail-hint">
            {detailHint}
          </p>
        </section>

        <div className="practice-summary" aria-live="polite">
          <span className="practice-summary-label">Setup</span>
          <code className="practice-summary-code">{summaryLine}</code>
        </div>

        <div className="practice-actions">
          <button
            ref={startRef}
            type="button"
            tabIndex={navFocus.kind === 'start' ? 0 : -1}
            className={`practice-start${navFocus.kind === 'start' ? ' practice-focus-target' : ''}`}
            onClick={() => {
              setNavFocus({ kind: 'start' });
              start();
            }}
          >
            {startLabel}
          </button>
        </div>
      </div>

      <div className="practice-hub-footer">
        <button
          ref={backRef}
          type="button"
          tabIndex={navFocus.kind === 'back' ? 0 : -1}
          className={`practice-back-btn${navFocus.kind === 'back' ? ' practice-focus-target' : ''}`}
          onClick={() => {
            setNavFocus({ kind: 'back' });
            playSfx(SFX.MENU_SELECT);
            navigate('/');
          }}
        >
          ← MAIN MENU
        </button>
        <span className="practice-hub-hint">
          Arrows / WASD · Enter · Tab · ESC back
        </span>
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
