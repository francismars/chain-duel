import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { Button } from '@/components/ui/Button';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useSocket } from '@/hooks/useSocket';
import { useGamepad } from '@/hooks/useGamepad';
import {
  computeBracketState,
  computeFinalPrize,
  computeRefundPerPlayer,
  INITIAL_POSITIONS,
} from '@/features/tournament/bracketModel';
import { useTournamentSocketEvents } from '@/features/tournament/hooks/useTournamentSocketEvents';
import { asSocketBoundary } from '@/shared/socket/socketBoundary';
import {
  TOURNAMENT_DEFAULT_BUY_IN_SATS,
  TOURNAMENT_MIN_PLAYERS,
} from '@/shared/constants/payment';
import { createLogger } from '@/shared/utils/logger';
import { npubEncode } from 'nostr-tools/nip19';
import '@/components/ui/Button.css';
import '@/components/ui/Sponsorship.css';
import './tournbracket.css';

/** Strip external styles from SVG so page font CSS applies to inlined SVG. */
function stripSvgStyle(svgText: string): string {
  return svgText.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
}

type PanelView = 'payment' | 'confirm-cancel' | 'refunding';

type TournamentPlayerIdentity = {
  name?: string;
  value?: number;
  picture?: string;
  fallbackLabel?: string;
  /** Hex pubkey (64 chars) — used when `name` is empty to show a trimmed `npub1…` instead of `NPUB:hex…` */
  nostrPubkey?: string;
};

export default function TournamentBracket() {
  const logger = useMemo(() => createLogger('TournamentBracket'), []);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isNostrTournament = params.get('mode') === 'tournamentnostr';
  const { socket } = useSocket();

  useGamepad(true);

  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);

  const [payLink, setPayLink] = useState<string | null>(null);
  const [playersPaid, setPlayersPaid] = useState<Record<string, TournamentPlayerIdentity>>({});
  const [nostrNote1, setNostrNote1] = useState<string>('');
  const [nostrCode, setNostrCode] = useState<string>('');
  const [showPaymentPanel, setShowPaymentPanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [highlightDeposit, setHighlightDeposit] = useState(false);
  const [preStartReady, setPreStartReady] = useState(false);

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

  const numberOfPlayersFromUrl = Math.max(
    TOURNAMENT_MIN_PLAYERS,
    parseInt(params.get('players') || String(TOURNAMENT_MIN_PLAYERS), 10) || TOURNAMENT_MIN_PLAYERS
  );
  const [numberOfPlayers, setNumberOfPlayers] = useState(numberOfPlayersFromUrl);
  const parsedDeposit = parseInt(params.get('deposit') || String(TOURNAMENT_DEFAULT_BUY_IN_SATS), 10);
  const urlDeposit =
    Number.isFinite(parsedDeposit) && parsedDeposit > 0
      ? parsedDeposit
      : TOURNAMENT_DEFAULT_BUY_IN_SATS;
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
    setNostrNote1('');
    setNostrCode('');
    timesWithdrawnRef.current = 0;
  }, [urlDeposit, numberOfPlayersFromUrl, isNostrTournament]);

  // Displayed buy-in follows URL by default, then backend min when provided.
  const finalPrize = computeFinalPrize(numberOfPlayers, deposit);
  const paidCount = Object.keys(playersPaid).length;
  const canStart = paidCount >= numberOfPlayers;
  const refundPerPlayer = computeRefundPerPlayer(deposit);

  // Flat player name array by slot index (mirrors legacy playersList)
  const playersList = useMemo<string[]>(() => {
    const arr: string[] = Array(Math.max(numberOfPlayers, 4)).fill('');
    for (const [key, v] of Object.entries(playersPaid)) {
      const idx = parseInt(key.replace('Player ', '')) - 1;
      if (idx >= 0 && idx < arr.length) arr[idx] = resolveIdentityLabel(v, key);
    }
    return arr;
  }, [playersPaid, numberOfPlayers]);

  // Bracket computation: next-game players, champion name, WinnerNames list
  const bracketState = useMemo(
    () => computeBracketState(playersList, winnersList, numberOfPlayers),
    [playersList, winnersList, numberOfPlayers],
  );

  /** Profile image for each side of the upcoming match (match display label to paid roster). */
  const nextGameAvatars = useMemo(() => {
    const pictureForDisplayName = (displayName: string): string | null => {
      const t = displayName.trim();
      if (!t) return null;
      for (const [key, v] of Object.entries(playersPaid)) {
        if (resolveIdentityLabel(v, key) === t) {
          const pic = v.picture?.trim();
          return pic && pic !== '' ? pic : null;
        }
      }
      return null;
    };
    const nostrFallback = '/images/social/Nostr.png';
    const p1 = pictureForDisplayName(bracketState.nextP1);
    const p2 = pictureForDisplayName(bracketState.nextP2);
    return {
      p1Src: p1 ?? (isNostrTournament ? nostrFallback : null),
      p2Src: p2 ?? (isNostrTournament ? nostrFallback : null),
    };
  }, [playersPaid, bracketState.nextP1, bracketState.nextP2, isNostrTournament]);

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

  const handleTournamentInfos = useCallback(
    (d: {
      gameInfo?: {
        numberOfPlayers?: number;
        winners?: string[];
        players?: Record<string, TournamentPlayerIdentity>;
      };
      lnurlp?: string;
      lnurlw?: string;
      min?: number;
      claimedCount?: number;
      nostrMeta?: {
        note1: string;
        emojis: string;
        min: number;
      };
    }) => {
      if (d.gameInfo?.numberOfPlayers) setNumberOfPlayers(d.gameInfo.numberOfPlayers);
      const incomingMin =
        d.min != null ? Number(d.min) : d.nostrMeta?.min != null ? Number(d.nostrMeta.min) : null;
      if (incomingMin != null && Number.isFinite(incomingMin)) {
        setDeposit(parseInt(String(incomingMin), 10));
      }
      if (d.lnurlp) setPayLink(d.lnurlp);
      if (d.gameInfo?.players) setPlayersPaid(d.gameInfo.players);
      if (d.nostrMeta) {
        setNostrNote1(d.nostrMeta.note1);
        setNostrCode(d.nostrMeta.emojis);
      }

      if (d.gameInfo?.winners && d.gameInfo.winners.length > 0) {
        setWinnersList(d.gameInfo.winners as string[]);
        setPreStartReady(false);
        setShowPaymentPanel(false);
      } else {
        setShowPaymentPanel(true);
      }

      if (d.lnurlw) {
        const seq = d.gameInfo?.players
          ? Object.values(d.gameInfo.players).map((p) => p.name ?? '').filter(Boolean)
          : [];
        const claimed = d.claimedCount ?? 0;
        const remaining = seq.slice(claimed);
        if (remaining.length === 0) {
          navigate('/p2p');
        } else {
          setPlayerListSequential(remaining);
          setWithdrawLnurl(d.lnurlw);
          setPanelView('refunding');
          setShowPaymentPanel(true);
        }
      }
    },
    [navigate]
  );

  const handleTournamentPayments = useCallback((players: Record<string, TournamentPlayerIdentity>) => {
    setPlayersPaid(players);
    setHighlightDeposit(true);
    setTimeout(() => setHighlightDeposit(false), 1200);
  }, []);

  const handleTournamentCancel = useCallback(
    (d: { depositcount: number; lnurlw?: string }) => {
      if (d.depositcount === 0 || !d.lnurlw) {
        navigate('/p2p');
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
    },
    [navigate]
  );

  const handlePrizeWithdrawn = useCallback(() => {
    timesWithdrawnRef.current += 1;
    setPlayerListSequential((prev) => {
      const next = prev.slice(1);
      if (next.length === 0) navigate('/p2p');
      return next;
    });
  }, [navigate]);

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
    const svgRoot = svgEl.querySelector('svg');
    if (!svgRoot) return;
    svgRoot.querySelectorAll('g.bracket-avatar-wrap').forEach((node) => node.remove());
    svgRoot.querySelectorAll<SVGImageElement>('image[data-avatar="true"]').forEach((node) =>
      node.remove()
    );
    const paid = playersPaid;
    for (const key of Object.keys(paid)) {
      const idx = parseInt(key.replace('Player ', '')) - 1;
      const posId = INITIAL_POSITIONS[idx];
      if (!posId) continue;
      const nameEl = svgEl.querySelector<SVGElement>(`#${posId}_name`);
      if (nameEl) {
        const name = resolveIdentityLabel(paid[key], key);
        const tspan = nameEl.querySelector('tspan');
        if (tspan) tspan.textContent = name;
        else nameEl.textContent = name;
        nameEl.style.opacity = '1';
      }
      if (isNostrTournament && nameEl) {
        const textNode = nameEl as unknown as SVGGraphicsElement | null;
        if (!textNode) continue;
        const originalTransform = nameEl.getAttribute('data-original-transform');
        if (!originalTransform) {
          const currentTransform = nameEl.getAttribute('transform') ?? '';
          nameEl.setAttribute('data-original-transform', currentTransform);
        } else {
          nameEl.setAttribute('transform', originalTransform);
        }
        const baseBBox = textNode.getBBox();
        /** Larger than name cap-height; may extend past slot (overflow OK per design) */
        const avatarSize = Math.max(26, Math.round(baseBBox.height * 1.85));
        const gap = 5;
        const shift = (avatarSize + gap) / 2;

        const transformAttr = nameEl.getAttribute('transform') ?? '';
        const match = transformAttr.match(
          /translate\(\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s*\)/
        );
        if (match) {
          const x = Number.parseFloat(match[1]);
          const y = Number.parseFloat(match[2]);
          nameEl.setAttribute('transform', `translate(${x + shift} ${y})`);
        }

        const alignedBBox = textNode.getBBox();
        const alignedTransform = nameEl.getAttribute('transform') ?? '';
        const alignedMatch = alignedTransform.match(
          /translate\(\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s*\)/
        );
        if (!alignedMatch) continue;
        const tx = Number.parseFloat(alignedMatch[1]);
        const ty = Number.parseFloat(alignedMatch[2]);
        const picture = paid[key]?.picture;
        const imageHref =
          picture && picture.trim() !== '' ? picture : '/images/social/Nostr.png';
        const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        wrap.setAttribute('class', 'bracket-avatar-wrap');
        const ix = tx + alignedBBox.x - avatarSize - gap;
        const iy = ty + alignedBBox.y + (alignedBBox.height - avatarSize) / 2;
        const avatar = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        avatar.setAttribute('data-avatar', 'true');
        avatar.setAttribute('x', `${ix}`);
        avatar.setAttribute('y', `${iy}`);
        avatar.setAttribute('width', `${avatarSize}`);
        avatar.setAttribute('height', `${avatarSize}`);
        avatar.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        avatar.setAttributeNS('http://www.w3.org/1999/xlink', 'href', imageHref);
        avatar.setAttribute('href', imageHref);
        /* Same ring as HUD .playerImg: 1px rgba(255,255,255,0.28) — vector stroke survives clip-path on <image> */
        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ring.setAttribute('cx', `${ix + avatarSize / 2}`);
        ring.setAttribute('cy', `${iy + avatarSize / 2}`);
        ring.setAttribute('r', `${avatarSize / 2 - 0.5}`);
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', 'rgba(255, 255, 255, 0.28)');
        ring.setAttribute('stroke-width', '1');
        ring.setAttribute('pointer-events', 'none');
        ring.setAttribute('data-avatar-ring', 'true');
        wrap.appendChild(avatar);
        wrap.appendChild(ring);
        nameEl.parentNode?.appendChild(wrap);
      }
    }
  }, [playersPaid, svgMarkup, isNostrTournament]);

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

  useTournamentSocketEvents({
    socket,
    urlDeposit,
    numberOfPlayersFromUrl,
    isNostrTournament,
    onLoading: setLoading,
    onInfos: handleTournamentInfos,
    onPayments: handleTournamentPayments,
    onCancel: handleTournamentCancel,
    onPrizeWithdrawn: handlePrizeWithdrawn,
  });

  function handleCancel() {
    // Legacy behavior: Cancel always opens the refund confirmation view first.
    // If there are 0 deposits, backend responds and navigates back to P2P entry.
    setPanelView('confirm-cancel');
    setFocusedBtn('left');
  }

  function handleBackToPayment() {
    setPanelView('payment');
    setFocusedBtn('left');
  }

  function handleConfirmCancel() {
    const s = asSocketBoundary(socket);
    if (!s) return;
    // Legacy shows loading while waiting for rescanceltourn.
    setLoading(true);

    const emitCancel = () => {
      logger.debug('emitting canceltournament');
      s.emit('canceltournament');
    };

    if (s.connected) {
      emitCancel();
      return;
    }

    logger.debug('socket not connected, waiting connect for canceltournament');
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
    sessionStorage.setItem(
      'tournamentMode',
      isNostrTournament ? 'tournamentnostr' : 'tournament'
    );
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
            <div style={{ position: 'relative', overflow: 'visible' }}>
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
                    <div className="label mt-10" id="paymentNote">
                      {isNostrTournament
                        ? 'Zap the Nostr event to claim your slot'
                        : 'Set player name on payment note'}
                    </div>
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
                  ) : isNostrTournament && nostrNote1 ? (
                    <a
                      id="qrTournamentLink"
                      href={`https://next.nostrudel.ninja/#/n/${nostrNote1}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-block' }}
                    >
                      <QRCodeCanvas
                        id="qrTournament"
                        value={`nostr:${nostrNote1}`}
                        size={800}
                        level="M"
                        className="qrcode"
                      />
                      {nostrCode ? <div className="label mt-10">{nostrCode}</div> : null}
                      {highlightDeposit && (
                        <img
                          id="qrcodeDecoration"
                          className="qrcodeDecoration"
                          src="/images/qr_lightning.gif"
                          alt=""
                        />
                      )}
                    </a>
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
                    {(isNostrTournament
                      ? Object.values(playersPaid).reduce((sum, player) => sum + (player.value ?? 0), 0)
                      : deposit * paidCount
                    ).toLocaleString()}
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
            <div className="next-game-player next-game-player--p1">
              <div className="inline playerSquare white" />
              {nextGameAvatars.p1Src ? (
                <img
                  className="inline next-game-player-img"
                  id="nextGameImgP1"
                  src={nextGameAvatars.p1Src}
                  alt=""
                />
              ) : null}
              <span id="nextGame_P1" className="condensed playerName">{bracketState.nextP1}</span>
            </div>
            <span className="next-game-vs"> vs </span>
            <div className="next-game-player next-game-player--p2">
              <span id="nextGame_P2" className="condensed playerName">{bracketState.nextP2}</span>
              {nextGameAvatars.p2Src ? (
                <img
                  className="inline next-game-player-img"
                  id="nextGameImgP2"
                  src={nextGameAvatars.p2Src}
                  alt=""
                />
              ) : null}
              <div className="inline playerSquare black" />
            </div>
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
          <h2 className="m-0 tourn-finished-headline">
            <span className="tourn-finished-title">Champion</span>
          </h2>
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

function midTruncateDisplay(s: string, head: number, tail: number): string {
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

/** Bracket SVG slots are narrow — keep npub fingerprints short */
const NPUB_BRACKET_HEAD = 7;
const NPUB_BRACKET_TAIL = 4;

function isHexPubkey64(s: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(s);
}

/** Display label for roster + bracket: prefer name, else trimmed `npub1…` from hex pubkey, not `NPUB:dead…beef`. */
function resolveIdentityLabel(player: TournamentPlayerIdentity | undefined, fallbackRole: string): string {
  if (!player) return fallbackRole;
  const name = player.name?.trim() ?? '';
  if (name !== '') return name;

  const rawPk = player.nostrPubkey?.trim() ?? '';
  if (rawPk) {
    if (rawPk.startsWith('npub1')) {
      return midTruncateDisplay(rawPk, NPUB_BRACKET_HEAD, NPUB_BRACKET_TAIL);
    }
    if (isHexPubkey64(rawPk)) {
      try {
        return midTruncateDisplay(npubEncode(rawPk), NPUB_BRACKET_HEAD, NPUB_BRACKET_TAIL);
      } catch {
        /* fall through */
      }
    }
  }

  const fb = player.fallbackLabel?.trim() ?? '';
  if (fb.startsWith('npub1')) {
    return midTruncateDisplay(fb, NPUB_BRACKET_HEAD, NPUB_BRACKET_TAIL);
  }

  // Server legacy: "NPUB:29a0…aafd" — no full hex, cannot bech32; compact for bracket width
  const legacy = fb.match(/^NPUB:\s*([0-9a-fA-F]+)\s*\.\.\.\s*([0-9a-fA-F]+)\s*$/i);
  if (legacy) {
    return `${legacy[1].slice(0, 5)}…${legacy[2].slice(-4)}`;
  }

  if (fb !== '') return fb;
  return fallbackRole;
}
