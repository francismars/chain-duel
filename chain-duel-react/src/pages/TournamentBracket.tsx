import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { Button } from '@/components/ui/Button';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useSocket } from '@/hooks/useSocket';
import { useGamepad } from '@/hooks/useGamepad';
import '@/components/ui/Button.css';
import '@/components/ui/Sponsorship.css';
import './tournbracket.css';

/** Strip external styles from SVG so page font CSS applies to inlined SVG. */
function stripSvgStyle(svgText: string): string {
  return svgText.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
}

// Maps player slot index → SVG element id prefix (matches legacy initialPositions array).
// First numberOfPlayers entries = initial player slots (G1_P1..G{n/2}_P2).
// Next entries = advancing winner slots used in updateBracketWinner.
// Full array (62 entries) supports up to 32-player brackets.
const INITIAL_POSITIONS = [
  'G1_P1','G1_P2','G2_P1','G2_P2','G3_P1','G3_P2','G4_P1','G4_P2',
  'G5_P1','G5_P2','G6_P1','G6_P2','G7_P1','G7_P2','G8_P1','G8_P2',
  'G9_P1','G9_P2','G10_P1','G10_P2','G11_P1','G11_P2','G12_P1','G12_P2',
  'G13_P1','G13_P2','G14_P1','G14_P2','G15_P1','G15_P2','G16_P1','G16_P2',
  'G17_P1','G17_P2','G18_P1','G18_P2','G19_P1','G19_P2','G20_P1','G20_P2',
  'G21_P1','G21_P2','G22_P1','G22_P2','G23_P1','G23_P2','G24_P1','G24_P2',
  'G25_P1','G25_P2','G26_P1','G26_P2','G27_P1','G27_P2','G28_P1','G28_P2',
  'G29_P1','G29_P2','G30_P1','G30_P2','G31_P1','G31_P2',
];

/**
 * Compute next-game player names and full tournament champion from the
 * winnersList and playersList. Mirrors legacy updateBracketWinner /
 * updateNextGameText logic.
 *
 * The bracket is a power-of-2 single-elimination. WinnerNames accumulates as
 * games are played and each new round pairs adjacent accumulated winners:
 *   Round 1 (i < round1):        playersList[i*2] vs playersList[i*2+1]
 *   Later rounds (i >= round1):  WinnerNames[(i-round1)*2] vs WinnerNames[(i-round1)*2+1]
 */
function computeBracketState(
  playersList: string[],
  winnersList: string[],
  numberOfPlayers: number,
): {
  WinnerNames: string[];
  nextGameNumber: number;
  nextP1: string;
  nextP2: string;
  champion: string;
} {
  const round1 = Math.max(1, Math.floor(numberOfPlayers / 2));
  const WinnerNames: string[] = [];

  for (let i = 0; i < winnersList.length; i++) {
    if (i + 1 >= numberOfPlayers) break;
    const w = winnersList[i];
    let name = '';
    if (i < round1) {
      name = w === 'Player 1' ? (playersList[i * 2] ?? '') : (playersList[i * 2 + 1] ?? '');
    } else {
      const p1i = (i - round1) * 2;
      name = w === 'Player 1' ? (WinnerNames[p1i] ?? '') : (WinnerNames[p1i + 1] ?? '');
    }
    WinnerNames.push(name);
  }

  const isDone = winnersList.length >= numberOfPlayers - 1;
  const champion = isDone ? (WinnerNames[WinnerNames.length - 1] ?? '') : '';
  const nextIdx = winnersList.length;
  const gameNumber = nextIdx + 1;

  if (isDone) {
    return { WinnerNames, nextGameNumber: gameNumber, nextP1: '', nextP2: '', champion };
  }

  let nextP1 = '';
  let nextP2 = '';
  if (nextIdx < round1) {
    nextP1 = playersList[nextIdx * 2] ?? '';
    nextP2 = playersList[nextIdx * 2 + 1] ?? '';
  } else {
    const p1i = (nextIdx - round1) * 2;
    nextP1 = WinnerNames[p1i] ?? '';
    nextP2 = WinnerNames[p1i + 1] ?? '';
  }

  return { WinnerNames, nextGameNumber: gameNumber, nextP1, nextP2, champion };
}

type PanelView = 'payment' | 'confirm-cancel' | 'refunding';

export default function TournamentBracket() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { socket } = useSocket();

  useGamepad(true);

  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);

  const [payLink, setPayLink] = useState<string | null>(null);
  const [playersPaid, setPlayersPaid] = useState<Record<string, { name?: string }>>({});
  const [showPaymentPanel, setShowPaymentPanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [highlightDeposit, setHighlightDeposit] = useState(false);
  const [preStartReady, setPreStartReady] = useState(false);
  const firstPayloadLoadedRef = useRef(false);

  // In-progress tournament state
  const [winnersList, setWinnersList] = useState<string[]>([]);

  // Cancel / refund flow
  const [panelView, setPanelView] = useState<PanelView>('payment');
  const [withdrawLnurl, setWithdrawLnurl] = useState<string | null>(null);
  const [playerListSequential, setPlayerListSequential] = useState<string[]>([]);
  const timesWithdrawnRef = useRef(0);

  // Keyboard-focused button: 'left' = Cancel/Back, 'right' = Start/Confirm
  const [focusedBtn, setFocusedBtn] = useState<'left' | 'right'>('left');
  const backBtnRef = useRef<HTMLButtonElement>(null);
  const proceedBtnRef = useRef<HTMLButtonElement>(null);
  const startGameBtnRef = useRef<HTMLButtonElement>(null);
  const claimBtnRef = useRef<HTMLButtonElement>(null);

  const numberOfPlayersFromUrl = Math.max(4, parseInt(params.get('players') || '4', 10) || 4);
  const [numberOfPlayers, setNumberOfPlayers] = useState(numberOfPlayersFromUrl);
  const parsedDeposit = parseInt(params.get('deposit') || '10000', 10);
  const urlDeposit = Number.isFinite(parsedDeposit) && parsedDeposit > 0 ? parsedDeposit : 10000;
  const [deposit, setDeposit] = useState(urlDeposit);

  // Reset all server-derived state whenever URL params change
  useEffect(() => {
    setNumberOfPlayers(numberOfPlayersFromUrl);
    setDeposit(urlDeposit);
    setPayLink(null);
    setPlayersPaid({});
    setShowPaymentPanel(false);
    setLoading(true);
    setPanelView('payment');
    setWithdrawLnurl(null);
    setPlayerListSequential([]);
    setFocusedBtn('left');
    setHighlightDeposit(false);
    setWinnersList([]);
    setPreStartReady(false);
    firstPayloadLoadedRef.current = false;
    timesWithdrawnRef.current = 0;
  }, [urlDeposit, numberOfPlayersFromUrl]);

  // Displayed buy-in follows URL by default, then backend min when provided.
  const finalPrize = Math.floor(numberOfPlayers * deposit * 0.95);
  const paidCount = Object.keys(playersPaid).length;
  const canStart = paidCount >= numberOfPlayers;
  const refundPerPlayer = Math.floor(deposit * 0.95);

  // Flat player name array by slot index (mirrors legacy playersList)
  const playersList = useMemo<string[]>(() => {
    const arr: string[] = Array(Math.max(numberOfPlayers, 4)).fill('');
    for (const [key, v] of Object.entries(playersPaid)) {
      const idx = parseInt(key.replace('Player ', '')) - 1;
      if (idx >= 0 && idx < arr.length) arr[idx] = v?.name ?? '';
    }
    return arr;
  }, [playersPaid, numberOfPlayers]);

  // Bracket computation: next-game players, champion name, WinnerNames list
  const bracketState = useMemo(
    () => computeBracketState(playersList, winnersList, numberOfPlayers),
    [playersList, winnersList, numberOfPlayers],
  );

  // Tournament phase drives which overlay is shown
  const tournamentPhase: 'payment' | 'next-game' | 'finished' = useMemo(() => {
    if (winnersList.length > 0 && winnersList.length >= numberOfPlayers - 1) return 'finished';
    if (winnersList.length > 0) return 'next-game';
    return 'payment';
  }, [winnersList, numberOfPlayers]);

  const bracketSvg = useMemo(() => {
    if (numberOfPlayers === 8) return '/images/tournament/svg/8_player.svg';
    if (numberOfPlayers === 16) return '/images/tournament/svg/16_player.svg';
    if (numberOfPlayers === 32) return '/images/tournament/svg/32_player.svg';
    return '/images/tournament/svg/4_player.svg';
  }, [numberOfPlayers]);

  useEffect(() => {
    let cancelled = false;
    setSvgMarkup(null);
    fetch(bracketSvg)
      .then((r) => r.text())
      .then((text) => { if (!cancelled) setSvgMarkup(stripSvgStyle(text)); })
      .catch(() => { if (!cancelled) setSvgMarkup(null); });
    return () => { cancelled = true; };
  }, [bracketSvg]);

  // Write initial player names into inlined SVG bracket slots
  // Targets the <tspan> child to preserve x/y positioning attributes
  useEffect(() => {
    if (!svgWrapperRef.current || !svgMarkup) return;
    const svgEl = svgWrapperRef.current;
    const paid = playersPaid;
    for (const key of Object.keys(paid)) {
      const idx = parseInt(key.replace('Player ', '')) - 1;
      const posId = INITIAL_POSITIONS[idx];
      if (!posId) continue;
      const nameEl = svgEl.querySelector<SVGElement>(`#${posId}_name`);
      if (nameEl) {
        const name = paid[key]?.name ?? '';
        const tspan = nameEl.querySelector('tspan');
        if (tspan) tspan.textContent = name;
        else nameEl.textContent = name;
        nameEl.style.opacity = '1';
      }
    }
  }, [playersPaid, svgMarkup]);

  // Apply bracket winner highlighting to inlined SVG (matches legacy updateBracketWinner)
  useEffect(() => {
    if (!svgWrapperRef.current || !svgMarkup) return;
    if (winnersList.length === 0 && !preStartReady) return;
    const svgEl = svgWrapperRef.current;

    const highLight = (id: string) => {
      const n = svgEl.querySelector<SVGElement>(`#${id}_name`);
      const r = svgEl.querySelector<SVGElement>(`#${id}_rect`);
      const p = svgEl.querySelector<SVGElement>(`#${id}_path`);
      if (n) n.style.fill = 'black';
      if (r) r.style.fill = '#fff';
      if (p) { p.style.opacity = '1'; p.style.strokeWidth = '5'; }
    };

    const dimLoser = (id: string) => {
      const n = svgEl.querySelector<SVGElement>(`#${id}_name`);
      const r = svgEl.querySelector<SVGElement>(`#${id}_rect`);
      if (n) n.style.opacity = '0.5';
      if (r) r.style.opacity = '0.7';
    };

    const setAdvancingName = (posId: string, name: string) => {
      const el = posId === 'Winner'
        ? svgEl.querySelector<SVGElement>('#Winner_name')
        : svgEl.querySelector<SVGElement>(`#${posId}_name`);
      if (!el) return;
      const tspan = el.querySelector('tspan');
      if (tspan) tspan.textContent = name;
      else el.textContent = name;
      el.style.opacity = '1';
    };

    const round1 = Math.max(1, Math.floor(numberOfPlayers / 2));
    const WN: string[] = [];

    for (let i = 0; i < winnersList.length; i++) {
      if (i + 1 >= numberOfPlayers) break;
      const w = winnersList[i];
      let winnerName = '';

      if (i < round1) {
        if (w === 'Player 1') {
          highLight(INITIAL_POSITIONS[i * 2]);
          dimLoser(INITIAL_POSITIONS[i * 2 + 1]);
          winnerName = playersList[i * 2] ?? '';
        } else {
          highLight(INITIAL_POSITIONS[i * 2 + 1]);
          dimLoser(INITIAL_POSITIONS[i * 2]);
          winnerName = playersList[i * 2 + 1] ?? '';
        }
      } else {
        const p1i = (i - round1) * 2;
        if (w === 'Player 1') {
          highLight(INITIAL_POSITIONS[i * 2]);
          dimLoser(INITIAL_POSITIONS[i * 2 + 1]);
          winnerName = WN[p1i] ?? '';
        } else {
          highLight(INITIAL_POSITIONS[i * 2 + 1]);
          dimLoser(INITIAL_POSITIONS[i * 2]);
          winnerName = WN[p1i + 1] ?? '';
        }
      }

      WN.push(winnerName);

      // Write the advancing winner's name into the next-round SVG slot
      const isFinal = i + 1 === numberOfPlayers - 1;
      if (isFinal) {
        const wn = svgEl.querySelector<SVGElement>('#Winner_name');
        const wr = svgEl.querySelector<SVGElement>('#Winner_rect');
        if (wn) wn.style.fill = 'black';
        if (wr) wr.style.fill = '#fff';
        setAdvancingName('Winner', winnerName);
      } else {
        const domPos = INITIAL_POSITIONS[numberOfPlayers + i];
        if (domPos) setAdvancingName(domPos, winnerName);
      }
    }

    // Highlight the slots and game-number label for the NEXT game to be played
    const nextIdx = winnersList.length;
    if (nextIdx < numberOfPlayers - 1) {
      const p1Slot = INITIAL_POSITIONS[nextIdx * 2];
      const p2Slot = INITIAL_POSITIONS[nextIdx * 2 + 1];
      if (p1Slot) {
        const r = svgEl.querySelector<SVGElement>(`#${p1Slot}_rect`);
        if (r) r.style.strokeWidth = '6';
      }
      if (p2Slot) {
        const r = svgEl.querySelector<SVGElement>(`#${p2Slot}_rect`);
        if (r) r.style.strokeWidth = '6';
      }
      const gEl = svgEl.querySelector<SVGElement>(`#G${nextIdx + 1}`);
      if (gEl) { gEl.style.opacity = '1'; gEl.style.fontWeight = '900'; }
    }
  }, [winnersList, svgMarkup, numberOfPlayers, playersList, preStartReady]);

  useEffect(() => {
    if (!socket) return;
    const s = socket as unknown as {
      emit: (event: string, payload?: unknown) => void;
      on: (event: string, cb: (...args: unknown[]) => void) => void;
      off: (event: string, cb: (...args: unknown[]) => void) => void;
      connected: boolean;
    };

    const onInfos = (data: unknown) => {
      firstPayloadLoadedRef.current = true;
      setLoading(false);
      const d = data as {
        lnurlp?: string;
        lnurlw?: string;
        min?: number;
        gameInfo?: {
          numberOfPlayers?: number;
          winners?: unknown[];
          players?: Record<string, { name?: string }>;
        };
      };
      // Server may know the authoritative player count
      if (d.gameInfo?.numberOfPlayers) setNumberOfPlayers(d.gameInfo.numberOfPlayers);
      if (d.min != null && Number.isFinite(Number(d.min))) {
        setDeposit(parseInt(String(d.min), 10));
      }
      if (d.lnurlp) setPayLink(d.lnurlp);
      if (d.gameInfo?.players) setPlayersPaid(d.gameInfo.players);

      if (d.gameInfo?.winners && d.gameInfo.winners.length > 0) {
        // Tournament in progress – hide payment panel, show next-game / finished UI
        setWinnersList(d.gameInfo.winners as string[]);
        setPreStartReady(false);
        setShowPaymentPanel(false);
      } else {
        // No winners yet – show payment panel (tournament not started)
        setShowPaymentPanel(true);
      }

      // lnurlw present means a cancel/refund was already in progress
      if (d.lnurlw) {
        const seq = d.gameInfo?.players
          ? Object.values(d.gameInfo.players).map((p) => p.name ?? '').filter(Boolean)
          : [];
        const claimed = (d as { claimedCount?: number }).claimedCount ?? 0;
        const remaining = seq.slice(claimed);
        if (remaining.length === 0) {
          navigate('/tournprefs');
        } else {
          setPlayerListSequential(remaining);
          setWithdrawLnurl(d.lnurlw);
          setPanelView('refunding');
          setShowPaymentPanel(true);
        }
      }
    };

    const onPayments = (data: unknown) => {
      const d = data as { players?: Record<string, { name?: string }> };
      if (d.players) {
        firstPayloadLoadedRef.current = true;
        setLoading(false);
        setPlayersPaid(d.players);
        // Lightning animation on the deposits counter (matches legacy)
        setHighlightDeposit(true);
        setTimeout(() => setHighlightDeposit(false), 1200);
      }
    };

    const onCancelTourn = (data: unknown) => {
      setLoading(false);
      const d = data as { depositcount: number; lnurlw?: string };
      if (d.depositcount === 0 || !d.lnurlw) {
        navigate('/tournprefs');
        return;
      }
      setPlayersPaid((current) => {
        const seq = Object.values(current).map((p) => p.name ?? '').filter(Boolean);
        setPlayerListSequential(seq);
        return current;
      });
      setWithdrawLnurl(d.lnurlw);
      setShowPaymentPanel(true);
      setPanelView('refunding');
    };

    const onPrizeWithdrawn = () => {
      setLoading(false);
      timesWithdrawnRef.current += 1;
      setPlayerListSequential((prev) => {
        const next = prev.slice(1);
        if (next.length === 0) navigate('/tournprefs');
        return next;
      });
    };

    // Re-emit getTournamentInfos on reconnect so the server re-subscribes this
    // socket to the tournament room. Only fires on (re)connect; the initial emit
    // is handled below (guarded by s.connected to avoid double-firing).
    const onReconnect = () => {
      if (!firstPayloadLoadedRef.current) setLoading(true);
      const hostLNAddr = localStorage.getItem('hostLNAddress') || undefined;
      s.emit('getTournamentInfos', { buyin: urlDeposit, players: numberOfPlayersFromUrl, hostLNAddress: hostLNAddr });
    };

    s.on('resGetTournamentInfos', onInfos);
    s.on('updatePayments', onPayments);
    s.on('rescanceltourn', onCancelTourn);
    s.on('prizeWithdrawn', onPrizeWithdrawn);
    s.on('connect', onReconnect);

    // Emit immediately when already connected; otherwise let onReconnect handle
    // the first connect event to avoid double-firing (buffered emit + connect handler).
    const hostLNAddress = localStorage.getItem('hostLNAddress') || undefined;
    if (s.connected) {
      s.emit('getTournamentInfos', { buyin: urlDeposit, players: numberOfPlayersFromUrl, hostLNAddress });
    }

    // Legacy-like loading overlay with safety timeout.
    const loadingTimer = window.setTimeout(() => setLoading(false), 12000);

    return () => {
      window.clearTimeout(loadingTimer);
      s.off('resGetTournamentInfos', onInfos);
      s.off('updatePayments', onPayments);
      s.off('rescanceltourn', onCancelTourn);
      s.off('prizeWithdrawn', onPrizeWithdrawn);
      s.off('connect', onReconnect);
    };
    // connected intentionally excluded: matching PostGame.tsx pattern where listeners
    // outlive connection-state changes, preventing the race window where events are missed.
  }, [socket, urlDeposit, numberOfPlayersFromUrl, navigate]);

  function handleCancel() {
    // Legacy behavior: Cancel always opens the refund confirmation view first.
    // If there are 0 deposits, backend responds and navigates back to tournprefs.
    setPanelView('confirm-cancel');
    setFocusedBtn('left');
  }

  function handleBackToPayment() {
    setPanelView('payment');
    setFocusedBtn('left');
  }

  function handleConfirmCancel() {
    if (!socket) return;
    // Legacy shows loading while waiting for rescanceltourn.
    setLoading(true);
    const s = socket as unknown as {
      emit: (event: string) => void;
      connected?: boolean;
      connect?: () => void;
      once?: (event: 'connect', cb: () => void) => void;
    };

    const emitCancel = () => {
      // Keep this log until parity is fully stabilized.
      console.log('[TournamentBracket] emitting canceltournament');
      s.emit('canceltournament');
    };

    if (s.connected) {
      emitCancel();
      return;
    }

    console.log('[TournamentBracket] socket not connected, waiting connect for canceltournament');
    s.once?.('connect', emitCancel);
    s.connect?.();
  }

  function handleStartTournament() {
    if (!canStart) return;
    // Legacy behavior: first move from payment panel to "UP NEXT".
    setPreStartReady(true);
  }

  function handleStartNextGame() {
    const names = Object.fromEntries(
      Object.entries(playersPaid).map(([k, v]) => [
        k,
        typeof v === 'object' && v?.name != null ? v.name : String(v ?? ''),
      ])
    );
    sessionStorage.setItem('Players', JSON.stringify(names));
    navigate('/game');
  }

  // Sync glowing animation with focused button (matches legacy animationDuration trick)
  useEffect(() => {
    if (backBtnRef.current) {
      backBtnRef.current.style.animationDuration = focusedBtn === 'left' ? '2s' : '0s';
    }
    if (proceedBtnRef.current) {
      proceedBtnRef.current.style.animationDuration = focusedBtn === 'right' ? '2s' : '0s';
    }
  }, [focusedBtn, panelView]);

  // Focus glow on the active single-button overlays
  useEffect(() => {
    if (startGameBtnRef.current) {
      startGameBtnRef.current.style.animationDuration =
        tournamentPhase === 'next-game' || preStartReady ? '2s' : '0s';
    }
    if (claimBtnRef.current) {
      claimBtnRef.current.style.animationDuration = tournamentPhase === 'finished' ? '2s' : '0s';
    }
  }, [tournamentPhase, preStartReady]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Tournament in progress: only Enter/Space to start next game
    if (tournamentPhase === 'next-game' || preStartReady) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleStartNextGame();
      }
      return;
    }

    // Tournament finished: Enter/Space to claim sats
    if (tournamentPhase === 'finished') {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigate('/postgame');
      }
      return;
    }

    // Payment / refund panel keyboard navigation
    if (panelView === 'refunding') return;
    if (e.key === 'ArrowLeft' || e.key === 'a') {
      setFocusedBtn('left');
    } else if (e.key === 'ArrowRight' || e.key === 'd') {
      if (panelView === 'payment' && !canStart) return;
      setFocusedBtn('right');
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (panelView === 'payment') {
        if (focusedBtn === 'left') handleCancel();
        else if (focusedBtn === 'right') handleStartTournament();
      } else if (panelView === 'confirm-cancel') {
        if (focusedBtn === 'left') handleBackToPayment();
        else if (focusedBtn === 'right') handleConfirmCancel();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelView, focusedBtn, canStart, paidCount, tournamentPhase, navigate, preStartReady]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="tournbracket-page">
      <header id="brand" className="tournbracket-header">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      <div className="tournbracket-middle">
        <div id="bracket">
          <div className={loading ? 'hide' : ''} id="pageinner">
            <div className="tournament-header">
              <div className="label">Tournament Lobby</div>
              <h1 id="tournament-name" className="hero-outline">
                The Merkle Tree
              </h1>
              <Sponsorship id="sponsorshipBraket" />
            </div>
            {svgMarkup ? (
              <div
                ref={svgWrapperRef}
                className="tournbracketSVG tournbracketSVG-inline"
                role="img"
                aria-label="Tournament bracket"
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
            ) : (
              <img src={bracketSvg} alt="Tournament bracket" className="tournbracketSVG" />
            )}
          </div>
        </div>
      </div>

      {/* ── Payment collection panel ── */}
      {showPaymentPanel && tournamentPhase === 'payment' && !preStartReady && (
        <div className={`bracketPayment${canStart ? ' paymentComplete' : ''}`} id="bracketPayment">
          <Sponsorship id="sponsorshipBracketPayment" className="bracketPayment-sponsor" showLabel={false} />
          <div className="bracketPaymentInner">

            {/* View 1: normal payment / QR check-in */}
            {panelView === 'payment' && (
              <>
                <div className="buyintext" id="buyintext">
                  <div className="label mb-10" id="buyinDepositLabel">BUY IN DEPOSIT</div>
                  <div id="buyinp">
                    {canStart ? (
                      <h3 className="buyinvalue" id="buyinvalue">LET'S GO</h3>
                    ) : (
                      <>
                        <h3 className="buyinvalue" id="buyinvalue">{deposit.toLocaleString()}</h3>{' '}
                        <span className="label sats-label-inline" id="satsLabel">sats</span>
                      </>
                    )}
                  </div>
                  {!canStart && (
                    <div className="label mt-10" id="paymentNote">Set player name on payment note</div>
                  )}
                </div>
                <div className="qrCodeDiv mt-10" id="qrCodeDiv">
                  {canStart ? (
                    <img
                      id="qrTournamentCheck"
                      src="/images/tournament/svg/tournCheck.svg"
                      className="qrTournamentCheck"
                      alt="All players paid"
                    />
                  ) : payLink ? (
                    <a id="qrTournamentLink" href={`lightning:${payLink}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block' }}>
                      <QRCodeCanvas id="qrTournament" value={payLink} size={800} level="M" className="qrcode" />
                      {highlightDeposit && (
                        <img
                          id="qrcodeDecoration"
                          className="qrcodeDecoration"
                          src="/images/qr_lightning.gif"
                          alt=""
                        />
                      )}
                    </a>
                  ) : (
                    <div id="qrTournament" className="qr-placeholder" />
                  )}
                </div>
                <div className={`deposited mt-10${highlightDeposit ? ' highlight' : ''}`} id="satsdeposited">
                  <b className="depositedvalue" id="depositedvalue">
                    {(deposit * paidCount).toLocaleString()}
                  </b>{' '}
                  <span className="label">SATS DEPOSITED</span>
                </div>
              </>
            )}

            {/* View 2: issue-refunds confirmation */}
            {panelView === 'confirm-cancel' && (
              <div className="issuerefundsdiv" id="issuerefundsdiv">
                <h2>Issue Refunds</h2>
                <div id="issuerefundsfirst">
                  Are you sure you want to cancel?
                  <br /><br />
                  This will display a QR code to withdraw{' '}
                  <b id="withdrawablevaluefirst">{refundPerPlayer.toLocaleString()}</b> sats
                  for each of the{' '}
                  <b id="withdrawableuses">{paidCount}</b> player{paidCount !== 1 ? 's' : ''} that already paid.
                </div>
              </div>
            )}

            {/* View 3: per-player withdrawal QR */}
            {panelView === 'refunding' && withdrawLnurl && (
              <div className="issuerefundssecond" id="issuerefundssecond">
                <div className="label">Player</div>
                <h1 id="currentWithdrawalPlayer" className="condensed">
                  {playerListSequential[0] ?? ''}
                </h1>
                <a id="qrWithdrawalLink" href={`lightning:${withdrawLnurl}`} target="_blank" rel="noopener noreferrer">
                  <QRCodeCanvas id="qrWithdrawal" value={withdrawLnurl} size={800} level="M" className="qrcode" />
                </a>
                <div>
                  <b className="label" id="withdrawablevalue">{refundPerPlayer.toLocaleString()}</b>{' '}
                  <span className="label">sats</span>
                </div>
              </div>
            )}

          </div>

          {/* Buttons: hidden during refunding */}
          {panelView !== 'refunding' && (
            <div className="buttonsDiv">
              {panelView === 'payment' && (
                <>
                  <Button ref={backBtnRef} id="backButton" type="button" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button
                    ref={proceedBtnRef}
                    id="proceedButton"
                    type="button"
                    className={canStart ? '' : 'disabled'}
                    onClick={handleStartTournament}
                  >
                    Start
                  </Button>
                </>
              )}
              {panelView === 'confirm-cancel' && (
                <>
                  <Button ref={backBtnRef} id="backButton" type="button" onClick={handleBackToPayment}>
                    Back
                  </Button>
                  <Button ref={proceedBtnRef} id="proceedButton" type="button" onClick={handleConfirmCancel}>
                    Confirm
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tournament in progress: next game panel (matches legacy nextGameDiv) ── */}
      {(tournamentPhase === 'next-game' || preStartReady) && (
        <div className="nextGameDiv" id="nextGameDiv">
          <p className="label">UP NEXT</p>
          <h2 id="nextGameName" className="mb-0">
            GAME <span id="nextGameID">{bracketState.nextGameNumber}</span>
          </h2>
          <div id="nextGamePlayers">
            <div className="inline playerSquare white" />
            <span id="nextGame_P1" className="condensed playerName">{bracketState.nextP1}</span>
            <span> vs </span>
            <span id="nextGame_P2" className="condensed playerName">{bracketState.nextP2}</span>
            <div className="inline playerSquare black" />
          </div>
          <Button
            ref={startGameBtnRef}
            id="nextGameButton"
            className="nextGameButton"
            type="button"
            onClick={handleStartNextGame}
          >
            Start Game
          </Button>
        </div>
      )}

      {/* ── Tournament finished: champion panel (matches legacy tournFinishedDiv) ── */}
      {tournamentPhase === 'finished' && (
        <div className="tournFinishedDiv" id="tournFinishedDiv">
          <h2 className="m-0">⚡️🏆 CONGRATULATIONS 🏆⚡️</h2>
          <h1><span id="winnerName">{bracketState.champion}</span></h1>
          <Button
            ref={claimBtnRef}
            id="claimSatsButton"
            className="claimSatsButton"
            type="button"
            onClick={() => navigate('/postgame')}
          >
            Claim Sats
          </Button>
        </div>
      )}

      <div className="tournbracket-bottom">
        <div className={`bracketDetails${loading ? ' hide' : ''}`} id="bracketDetails">
          <div className="bracketDetail" id="bracketDetailPlayers">
            <div className="label">Players</div>
            <div className="value players">
              <h3 id="numberOfPlayers">{numberOfPlayers}</h3>
            </div>
          </div>
          <div className="bracketDetail" id="bracketDetailFinalPrize">
            <div className="label">Final Prize</div>
            <div className="value">
              <h3 id="bracketFinalPrize">{finalPrize.toLocaleString()}</h3> <span className="sats-bottom">sats</span>
            </div>
          </div>
          <div className="bracketDetail" id="bracketDetailBuyIn">
            <div className="label">Buy In</div>
            <div className="value">
              <h3 id="buyinvalue2">{deposit.toLocaleString()}</h3> <span className="sats-bottom">sats</span>
            </div>
          </div>
        </div>
      </div>

      <div className={`overlay${loading ? '' : ' hide'}`} id="loading">
        <img src="/images/loading.gif" alt="Loading" />
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
