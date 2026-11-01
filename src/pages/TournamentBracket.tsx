import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/Button';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useSocket } from '@/hooks/useSocket';
import { useGamepad } from '@/hooks/useGamepad';
import { useMenuSfx } from '@/hooks/useMenuSfx';
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
import {
  navigateToMainMenu,
  navigateToPostGame,
} from '@/shared/constants/menuNavigation';
import {
  bracketBlocksCornerHome,
  bracketHomeConfirm,
  type BracketHomeConfirm,
} from '@/pages/bracketCornerHome';
import { useBlockMainMenu } from '@/shared/hooks/useBlockMainMenu';
import {
  clearClientGameConfig,
  markSocketDuelSession,
} from '@/pages/practiceHubModes';
import { npubEncode } from 'nostr-tools/nip19';
import '@/components/ui/Button.css';
import '@/components/ui/Sponsorship.css';
import './tournbracket.css';
import { SoloZapRadiatingLines } from '@/features/game/SoloZapRadiatingLines';
import { useLnurlQrCompatiblePulse } from '@/features/setup-menu/hooks/useLnurlQrCompatiblePulse';
import { BrandHeader } from '@/components/layout/BrandHeader';

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
  const isFinishedPreview = params.get('preview') === 'finished';
  const isNostrPreview = params.get('preview') === 'nostr';
  const isBracketPreview = isFinishedPreview || isNostrPreview;
  const { socket } = useSocket();

  useGamepad(true);

  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);

  const [payLink, setPayLink] = useState<string | null>(null);
  const [playersPaid, setPlayersPaid] = useState<
    Record<string, TournamentPlayerIdentity>
  >({});
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
  const [bracketLeave, setBracketLeave] = useState<Exclude<
    BracketHomeConfirm,
    'buy-in'
  > | null>(null);
  const [withdrawLnurl, setWithdrawLnurl] = useState<string | null>(null);
  const [playerListSequential, setPlayerListSequential] = useState<string[]>(
    []
  );
  const timesWithdrawnRef = useRef(0);

  // Keyboard-focused button: 'left' = Cancel/Back, 'right' = Start/Confirm
  const [focusedBtn, setFocusedBtn] = useState<'left' | 'right'>('left');
  const backBtnRef = useRef<HTMLButtonElement>(null);
  const proceedBtnRef = useRef<HTMLButtonElement>(null);
  const startGameBtnRef = useRef<HTMLButtonElement>(null);
  const claimBtnRef = useRef<HTMLButtonElement>(null);
  const { playSelect, playConfirm } = useMenuSfx();

  const numberOfPlayersFromUrl = Math.max(
    TOURNAMENT_MIN_PLAYERS,
    parseInt(params.get('players') || String(TOURNAMENT_MIN_PLAYERS), 10) ||
      TOURNAMENT_MIN_PLAYERS
  );
  const [numberOfPlayers, setNumberOfPlayers] = useState(
    numberOfPlayersFromUrl
  );
  const parsedDeposit = parseInt(
    params.get('deposit') || String(TOURNAMENT_DEFAULT_BUY_IN_SATS),
    10
  );
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
    if (isBracketPreview) {
      setPlayersPaid(
        isNostrPreview
          ? {
              'Player 1': {
                name: 'Ada ⚡',
                picture: '/images/preview/player-lena.jpg',
              },
              'Player 2': {
                name: 'Kenji',
                picture: '/images/preview/player-samir.jpg',
              },
              'Player 3': {
                name: 'Satoshi Nakamoto the First',
                picture: '/images/preview/player-nova.jpg',
              },
              'Player 4': {
                name: '🔥',
                picture: '/images/preview/player-kai.jpg',
              },
            }
          : {
              'Player 1': { name: 'Ada ⚡' },
              'Player 2': { name: 'Kenji' },
              'Player 3': { name: 'Satoshi Nakamoto the First' },
              'Player 4': { name: '🔥' },
            }
      );
      setWinnersList(['Player 1', 'Player 1', 'Player 1']);
      setLoading(false);
      setShowPaymentPanel(false);
    }
  }, [
    urlDeposit,
    numberOfPlayersFromUrl,
    isNostrTournament,
    isBracketPreview,
    isNostrPreview,
  ]);

  // Displayed buy-in follows URL by default, then backend min when provided.
  const finalPrize = computeFinalPrize(numberOfPlayers, deposit);
  const paidCount = Object.keys(playersPaid).length;
  const canStart = paidCount >= numberOfPlayers;
  const refundPerPlayer = computeRefundPerPlayer(deposit);
  const paymentQrVisible =
    showPaymentPanel &&
    panelView === 'payment' &&
    !canStart &&
    Boolean(payLink || nostrNote1);
  const qrCompatPulse = useLnurlQrCompatiblePulse(paymentQrVisible);
  const qrLinkClassName = [
    'qr-code-link',
    qrCompatPulse ? 'qr-code-link--compatible' : '',
  ]
    .filter(Boolean)
    .join(' ');

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
    [playersList, winnersList, numberOfPlayers]
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
      championSrc:
        pictureForDisplayName(bracketState.champion) ??
        (isNostrTournament ? nostrFallback : null),
    };
  }, [
    playersPaid,
    bracketState.nextP1,
    bracketState.nextP2,
    bracketState.champion,
    isNostrTournament,
  ]);

  // Tournament phase drives which overlay is shown
  const tournamentPhase: 'payment' | 'next-game' | 'finished' = useMemo(() => {
    if (winnersList.length > 0 && winnersList.length >= numberOfPlayers - 1)
      return 'finished';
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
      if (isBracketPreview) return;
      if (d.gameInfo?.numberOfPlayers)
        setNumberOfPlayers(d.gameInfo.numberOfPlayers);
      const incomingMin =
        d.min != null
          ? Number(d.min)
          : d.nostrMeta?.min != null
            ? Number(d.nostrMeta.min)
            : null;
      if (incomingMin != null && Number.isFinite(incomingMin)) {
        setDeposit(parseInt(String(incomingMin), 10));
      }
      if (d.lnurlp) setPayLink(d.lnurlp);
      if (
        !isBracketPreview &&
        d.gameInfo?.players &&
        Object.keys(d.gameInfo.players).length > 0
      ) {
        setPlayersPaid(d.gameInfo.players);
      }
      if (d.nostrMeta) {
        setNostrNote1(d.nostrMeta.note1);
        setNostrCode(d.nostrMeta.emojis);
      }

      if (
        !isBracketPreview &&
        d.gameInfo?.winners &&
        d.gameInfo.winners.length > 0
      ) {
        setWinnersList(d.gameInfo.winners as string[]);
        setPreStartReady(false);
        setShowPaymentPanel(false);
      } else {
        setShowPaymentPanel(true);
      }

      if (d.lnurlw) {
        const seq = d.gameInfo?.players
          ? Object.values(d.gameInfo.players)
              .map((p) => p.name ?? '')
              .filter(Boolean)
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
    [navigate, isBracketPreview]
  );

  const handleTournamentPayments = useCallback(
    (players: Record<string, TournamentPlayerIdentity>) => {
      if (isBracketPreview || Object.keys(players).length === 0) return;
      setPlayersPaid(players);
      setHighlightDeposit(true);
      setTimeout(() => setHighlightDeposit(false), 1200);
    },
    [isBracketPreview]
  );

  const handleTournamentCancel = useCallback(
    (d: { depositcount: number; lnurlw?: string }) => {
      if (d.depositcount === 0 || !d.lnurlw) {
        navigate('/p2p');
        return;
      }
      setPlayersPaid((current) => {
        const seq = Object.values(current)
          .map((p) => p.name ?? '')
          .filter(Boolean);
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
      .then((text) => {
        if (!cancelled) setSvgMarkup(stripSvgStyle(text));
      })
      .catch(() => {
        if (!cancelled) setSvgMarkup(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bracketSvg]);

  // Write initial player names into inlined SVG bracket slots
  // Targets the <tspan> child to preserve x/y positioning attributes
  useEffect(() => {
    if (!svgWrapperRef.current || !svgMarkup) return;
    const svgEl = svgWrapperRef.current;
    const svgRoot = svgEl.querySelector('svg');
    if (!svgRoot) return;
    svgRoot
      .querySelectorAll('g.bracket-avatar-wrap')
      .forEach((node) => node.remove());
    svgRoot
      .querySelectorAll<SVGImageElement>('image[data-avatar="true"]')
      .forEach((node) => node.remove());
    const paid = playersPaid;
    for (const key of Object.keys(paid)) {
      const idx = parseInt(key.replace('Player ', '')) - 1;
      const posId = INITIAL_POSITIONS[idx];
      if (!posId) continue;
      const nameEl = svgEl.querySelector<SVGElement>(`#${posId}_name`);
      if (nameEl) {
        const name = resolveIdentityLabel(paid[key], key);
        applyBracketNameText(nameEl, name, isNostrTournament);
        nameEl.style.opacity = '1';
      }
      if (isNostrTournament && nameEl) {
        const picture = paid[key]?.picture;
        const imageHref =
          picture && picture.trim() !== ''
            ? picture
            : '/images/social/Nostr.png';
        attachBracketAvatar(nameEl, imageHref);
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
      if (n) {
        n.style.fill = 'black';
        n.style.webkitTextFillColor = 'black';
      }
      if (r) r.style.fill = '#fff';
      if (p) {
        p.style.opacity = '1';
        p.style.strokeWidth = '5';
      }
    };

    const dimLoser = (id: string) => {
      const n = svgEl.querySelector<SVGElement>(`#${id}_name`);
      const r = svgEl.querySelector<SVGElement>(`#${id}_rect`);
      if (n) n.style.opacity = '0.5';
      if (r) r.style.opacity = '0.7';
    };

    // Same solid winner treatment, in grey, once that player is eliminated.
    const muteEliminated = (id: string) => {
      const n = svgEl.querySelector<SVGElement>(`#${id}_name`);
      const r = svgEl.querySelector<SVGElement>(`#${id}_rect`);
      const p = svgEl.querySelector<SVGElement>(`#${id}_path`);
      if (n) {
        n.style.fill = 'black';
        n.style.webkitTextFillColor = 'black';
        n.style.opacity = '1';
      }
      if (r) {
        r.style.fill = '#8a8a8a';
        r.style.stroke = '#8a8a8a';
        r.style.opacity = '1';
      }
      if (p) {
        p.style.opacity = '1';
        p.style.stroke = '#8a8a8a';
        p.style.strokeWidth = '5';
      }
    };

    const setAdvancingName = (posId: string, name: string) => {
      const el =
        posId === 'Winner'
          ? svgEl.querySelector<SVGElement>('#Winner_name')
          : svgEl.querySelector<SVGElement>(`#${posId}_name`);
      if (!el) return;
      applyBracketNameText(el, name, isNostrTournament);
      el.style.opacity = '1';
      if (!isNostrTournament) return;
      const picture = pictureForName(name);
      attachBracketAvatar(
        el,
        picture && picture.trim() !== '' ? picture : '/images/social/Nostr.png'
      );
    };

    const pictureForName = (displayName: string): string | undefined => {
      const t = displayName.trim().toLocaleUpperCase('en-US');
      for (const [key, v] of Object.entries(playersPaid)) {
        if (
          resolveIdentityLabel(v, key).trim().toLocaleUpperCase('en-US') === t
        ) {
          return v.picture;
        }
      }
      return undefined;
    };

    const round1 = Math.max(1, Math.floor(numberOfPlayers / 2));
    const WN: string[] = [];
    const winnerSlots: string[] = [];

    for (let i = 0; i < winnersList.length; i++) {
      if (i + 1 >= numberOfPlayers) break;
      const w = winnersList[i];
      let winnerName: string;
      const winnerSlot =
        w === 'Player 1'
          ? INITIAL_POSITIONS[i * 2]
          : INITIAL_POSITIONS[i * 2 + 1];
      const loserSlot =
        w === 'Player 1'
          ? INITIAL_POSITIONS[i * 2 + 1]
          : INITIAL_POSITIONS[i * 2];

      if (i < round1) {
        winnerName =
          w === 'Player 1'
            ? (playersList[i * 2] ?? '')
            : (playersList[i * 2 + 1] ?? '');
      } else {
        const p1i = (i - round1) * 2;
        winnerName = w === 'Player 1' ? (WN[p1i] ?? '') : (WN[p1i + 1] ?? '');
      }

      if (winnerSlot) highLight(winnerSlot);
      if (loserSlot) dimLoser(loserSlot);

      WN.push(winnerName);
      winnerSlots.push(winnerSlot ?? '');

      // An empty pass (roster not ready yet) must not wipe a name already shown.
      if (!winnerName.trim()) continue;

      // Write the advancing winner's name into the next-round SVG slot
      const isFinal = i + 1 === numberOfPlayers - 1;
      if (isFinal) {
        const wn = svgEl.querySelector<SVGElement>('#Winner_name');
        const wr = svgEl.querySelector<SVGElement>('#Winner_rect');
        if (wn) {
          wn.style.fill = 'black';
          wn.style.webkitTextFillColor = 'black';
        }
        if (wr) wr.style.fill = '#fff';
        setAdvancingName('Winner', winnerName);
      } else {
        const domPos = INITIAL_POSITIONS[numberOfPlayers + i];
        if (domPos) setAdvancingName(domPos, winnerName);
      }
    }

    const matchPlayers = (match: number): [string, string] => {
      if (match < round1) {
        return [playersList[match * 2] ?? '', playersList[match * 2 + 1] ?? ''];
      }
      const p1i = (match - round1) * 2;
      return [WN[p1i] ?? '', WN[p1i + 1] ?? ''];
    };

    for (let i = 0; i < winnerSlots.length; i++) {
      const name = WN[i];
      const slot = winnerSlots[i];
      if (!name || !slot) continue;
      let eliminated = false;
      for (let j = i + 1; j < WN.length; j++) {
        const [p1, p2] = matchPlayers(j);
        if ((p1 === name || p2 === name) && WN[j] !== name) {
          eliminated = true;
          break;
        }
      }
      if (eliminated) muteEliminated(slot);
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
      if (gEl) {
        gEl.style.opacity = '1';
        gEl.style.fontWeight = '900';
      }
    }
  }, [
    winnersList,
    svgMarkup,
    numberOfPlayers,
    playersList,
    playersPaid,
    isNostrTournament,
    preStartReady,
  ]);

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

  const handleCancel = useCallback(() => {
    playConfirm();
    // Legacy behavior: Cancel always opens the refund confirmation view first.
    // If there are 0 deposits, backend responds and navigates back to P2P entry.
    setPanelView('confirm-cancel');
    setFocusedBtn('left');
  }, [playConfirm]);

  const blockCornerHome = bracketBlocksCornerHome({
    preview: isBracketPreview,
    phase: tournamentPhase,
    // The champion prize is claimed on /postgame, so this screen stays guarded.
    prizeClaimed: false,
  });
  const onCornerHome = useCallback(() => {
    const kind = bracketHomeConfirm({
      phase: tournamentPhase,
      preStartReady,
    });
    if (kind === 'buy-in') {
      setShowPaymentPanel(true);
      if (panelView === 'payment') handleCancel();
      return;
    }
    setBracketLeave(kind);
  }, [handleCancel, panelView, preStartReady, tournamentPhase]);
  useBlockMainMenu(blockCornerHome, onCornerHome);

  const handleBackToPayment = useCallback(() => {
    playSelect();
    setPanelView('payment');
    setFocusedBtn('left');
  }, [playSelect]);

  const handleConfirmCancel = useCallback(() => {
    playConfirm();
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
  }, [playConfirm, socket, logger]);

  const handleStartTournament = useCallback(() => {
    if (!canStart) return;
    playConfirm();
    // Legacy behavior: first move from payment panel to "UP NEXT".
    setPreStartReady(true);
  }, [canStart, playConfirm]);

  const handleStartNextGame = useCallback(() => {
    playConfirm();
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
    clearClientGameConfig();
    markSocketDuelSession();
    navigate('/game');
  }, [isNostrTournament, navigate, playConfirm, playersPaid]);

  // Sync glowing animation with focused button (matches legacy animationDuration trick)
  useEffect(() => {
    if (backBtnRef.current) {
      backBtnRef.current.style.animationDuration =
        focusedBtn === 'left' ? '2s' : '0s';
    }
    if (proceedBtnRef.current) {
      proceedBtnRef.current.style.animationDuration =
        focusedBtn === 'right' ? '2s' : '0s';
    }
  }, [focusedBtn, panelView]);

  // Focus glow on the active single-button overlays
  useEffect(() => {
    if (startGameBtnRef.current) {
      startGameBtnRef.current.style.animationDuration =
        tournamentPhase === 'next-game' || preStartReady ? '2s' : '0s';
    }
    if (claimBtnRef.current) {
      claimBtnRef.current.style.animationDuration =
        tournamentPhase === 'finished' ? '2s' : '0s';
    }
  }, [tournamentPhase, preStartReady]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (bracketLeave) {
        if (e.key === 'Escape') setBracketLeave(null);
        return;
      }
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
          playConfirm();
          navigateToPostGame(navigate);
        }
        return;
      }

      // Payment / refund panel keyboard navigation
      if (panelView === 'refunding') return;
      if (e.key === 'ArrowLeft' || e.key === 'a') {
        if (focusedBtn !== 'left') playSelect();
        setFocusedBtn('left');
      } else if (e.key === 'ArrowRight' || e.key === 'd') {
        if (panelView === 'payment' && !canStart) return;
        if (focusedBtn !== 'right') playSelect();
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
    },
    [
      panelView,
      focusedBtn,
      canStart,
      tournamentPhase,
      navigate,
      playConfirm,
      playSelect,
      preStartReady,
      handleBackToPayment,
      handleCancel,
      handleConfirmCancel,
      handleStartNextGame,
      handleStartTournament,
      bracketLeave,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="tournbracket-page">
      <BrandHeader className="tournbracket-header" />

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
                <img
                  src={bracketSvg}
                  alt="Tournament bracket"
                  className="tournbracketSVG"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Payment collection panel ── */}
      {showPaymentPanel && tournamentPhase === 'payment' && !preStartReady && (
        <div
          className={`bracketPayment${canStart ? ' paymentComplete' : ''}`}
          id="bracketPayment"
        >
          <Sponsorship
            id="sponsorshipBracketPayment"
            className="bracketPayment-sponsor"
          />
          <div className="bracketPaymentInner">
            {/* View 1: normal payment / QR check-in */}
            {panelView === 'payment' && (
              <>
                <div className="buyintext" id="buyintext">
                  <div className="label mb-10" id="buyinDepositLabel">
                    BUY IN DEPOSIT
                  </div>
                  <div id="buyinp">
                    {canStart ? (
                      <h3 className="buyinvalue" id="buyinvalue">
                        LET'S GO
                      </h3>
                    ) : (
                      <>
                        <h3 className="buyinvalue" id="buyinvalue">
                          {deposit.toLocaleString()}
                        </h3>{' '}
                        <span
                          className="label sats-label-inline"
                          id="satsLabel"
                        >
                          sats
                        </span>
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
                      href={`https://njump.me/${nostrNote1}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={qrLinkClassName}
                    >
                      <span className="qr-code-stack">
                        <QRCodeSVG
                          id="qrTournament"
                          value={`nostr:${nostrNote1}`}
                          size={800}
                          level="M"
                          marginSize={0}
                          className="qrcode"
                        />
                        {highlightDeposit && (
                          <img
                            id="qrcodeDecoration"
                            className="qrcodeDecoration"
                            src="/images/qr_lightning.gif"
                            alt=""
                          />
                        )}
                      </span>
                      {nostrCode ? (
                        <div className="label mt-10">{nostrCode}</div>
                      ) : null}
                    </a>
                  ) : payLink ? (
                    <a
                      id="qrTournamentLink"
                      href={`lightning:${payLink}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={qrLinkClassName}
                    >
                      <span className="qr-code-stack">
                        <QRCodeSVG
                          id="qrTournament"
                          value={payLink}
                          size={800}
                          level="M"
                          marginSize={0}
                          className="qrcode"
                        />
                        {highlightDeposit && (
                          <img
                            id="qrcodeDecoration"
                            className="qrcodeDecoration"
                            src="/images/qr_lightning.gif"
                            alt=""
                          />
                        )}
                      </span>
                    </a>
                  ) : (
                    <div id="qrTournament" className="qr-placeholder" />
                  )}
                </div>
                <div
                  className={`deposited mt-10${highlightDeposit ? ' highlight' : ''}`}
                  id="satsdeposited"
                >
                  <b className="depositedvalue" id="depositedvalue">
                    {(isNostrTournament
                      ? Object.values(playersPaid).reduce(
                          (sum, player) => sum + (player.value ?? 0),
                          0
                        )
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
                  <br />
                  <br />
                  This will display a QR code to withdraw{' '}
                  <b id="withdrawablevaluefirst">
                    {refundPerPlayer.toLocaleString()}
                  </b>{' '}
                  sats for each of the <b id="withdrawableuses">{paidCount}</b>{' '}
                  player{paidCount !== 1 ? 's' : ''} that already paid.
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
                <a
                  id="qrWithdrawalLink"
                  href={`lightning:${withdrawLnurl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <QRCodeCanvas
                    id="qrWithdrawal"
                    value={withdrawLnurl}
                    size={800}
                    level="M"
                    className="qrcode"
                  />
                </a>
                <div>
                  <b className="label" id="withdrawablevalue">
                    {refundPerPlayer.toLocaleString()}
                  </b>{' '}
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
                  <Button
                    ref={backBtnRef}
                    id="backButton"
                    type="button"
                    onClick={handleCancel}
                  >
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
                  <Button
                    ref={backBtnRef}
                    id="backButton"
                    type="button"
                    onClick={handleBackToPayment}
                  >
                    Back
                  </Button>
                  <Button
                    ref={proceedBtnRef}
                    id="proceedButton"
                    type="button"
                    onClick={handleConfirmCancel}
                  >
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
              <span id="nextGame_P1" className="condensed playerName">
                {bracketState.nextP1}
              </span>
            </div>
            <span className="next-game-vs"> vs </span>
            <div className="next-game-player next-game-player--p2">
              <span id="nextGame_P2" className="condensed playerName">
                {bracketState.nextP2}
              </span>
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
        <SoloZapRadiatingLines className="end-screen-rays" />
      )}
      {tournamentPhase === 'finished' && (
        <div className="tournbracket-lines-scrim" aria-hidden="true" />
      )}
      {tournamentPhase === 'finished' && (
        <div className="tournFinishedDiv" id="tournFinishedDiv">
          <h2 className="m-0 tourn-finished-headline">
            <span className="tourn-finished-title">Champion</span>
          </h2>
          <h1>
            {nextGameAvatars.championSrc ? (
              <img
                className="tourn-champion-avatar"
                src={nextGameAvatars.championSrc}
                alt=""
              />
            ) : null}
            <span id="winnerName">{bracketState.champion}</span>
          </h1>
          <Button
            ref={claimBtnRef}
            id="claimSatsButton"
            className="claimSatsButton"
            type="button"
            onClick={() => {
              playConfirm();
              navigateToPostGame(navigate);
            }}
          >
            Claim Sats
          </Button>
        </div>
      )}

      <div className="tournbracket-bottom">
        <div
          className={`bracketDetails${loading ? ' hide' : ''}`}
          id="bracketDetails"
        >
          <div className="bracketDetail" id="bracketDetailPlayers">
            <div className="label">Players</div>
            <div className="value players">
              <h3 id="numberOfPlayers">{numberOfPlayers}</h3>
            </div>
          </div>
          <div className="bracketDetail" id="bracketDetailFinalPrize">
            <div className="label">Final Prize</div>
            <div className="value">
              <h3 id="bracketFinalPrize">{finalPrize.toLocaleString()}</h3>{' '}
              <span className="sats-bottom">sats</span>
            </div>
          </div>
          <div className="bracketDetail" id="bracketDetailBuyIn">
            <div className="label">Buy In</div>
            <div className="value">
              <h3 id="buyinvalue2">{deposit.toLocaleString()}</h3>{' '}
              <span className="sats-bottom">sats</span>
            </div>
          </div>
        </div>
      </div>

      <div className={`overlay${loading ? '' : ' hide'}`} id="loading">
        <img src="/images/loading.gif" alt="Loading" />
      </div>

      {bracketLeave ? (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Leave the bracket"
        >
          <div className="warning">
            <div className="warning-inner">
              <h2 className="warning-title condensed">Leave the bracket?</h2>
              <div className="warning-text">
                {bracketLeave === 'unclaimed-prize'
                  ? 'The prize is not claimed yet. Leave anyway?'
                  : 'Buy-ins are already in. Leave the bracket anyway?'}
              </div>
            </div>
            <div className="warning-actions">
              <Button
                className="button half"
                type="button"
                onClick={() => setBracketLeave(null)}
              >
                No
              </Button>
              <Button
                className="button half"
                type="button"
                onClick={() => {
                  playConfirm();
                  navigateToMainMenu(navigate);
                }}
              >
                Yes
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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
function resolveIdentityLabel(
  player: TournamentPlayerIdentity | undefined,
  fallbackRole: string
): string {
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
        return midTruncateDisplay(
          npubEncode(rawPk),
          NPUB_BRACKET_HEAD,
          NPUB_BRACKET_TAIL
        );
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
  const legacy = fb.match(
    /^NPUB:\s*([0-9a-fA-F]+)\s*\.\.\.\s*([0-9a-fA-F]+)\s*$/i
  );
  if (legacy) {
    return `${legacy[1].slice(0, 5)}…${legacy[2].slice(-4)}`;
  }

  if (fb !== '') return fb;
  return fallbackRole;
}

/** Slot rect edges in the same coordinates as the name's translate x. */
function getBracketSlotEdges(nameEl: SVGElement): {
  left: number;
  right: number;
} {
  const posId = nameEl.id.replace(/_name$/, '');
  const slotGroup = nameEl.parentElement;
  const rectG =
    slotGroup?.querySelector(`#${posId}_rect`) ??
    slotGroup?.querySelector('[id$="_rect"]');
  const rect = rectG?.querySelector('rect');
  if (!rect) return { left: 0, right: 120 };

  const rectBBox = (rect as SVGGraphicsElement).getBBox();
  const left = translateX(rectG ?? null) + rectBBox.x;
  return { left, right: left + rectBBox.width };
}

function bracketNameAnchorX(nameEl: SVGElement): number {
  const transformAttr =
    nameEl.getAttribute('data-original-transform') ??
    nameEl.getAttribute('transform') ??
    '';
  const match = transformAttr.match(
    /translate\(\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s*\)/
  );
  return match ? Number.parseFloat(match[1]) : 0;
}

function translateX(el: Element | null): number {
  const transform = el?.getAttribute('transform') ?? '';
  const match = transform.match(/translate\(\s*([-+]?\d*\.?\d+)/);
  return match ? Number.parseFloat(match[1]) : 0;
}

function fitBracketNameText(
  nameEl: SVGElement,
  name: string,
  reserveRightShift = 0
): void {
  const tspan = nameEl.querySelector('tspan');
  const storedBase = nameEl.getAttribute('data-base-font-size');
  const attrBase = nameEl.getAttribute('font-size');
  const baseFontSize = Number.parseFloat(storedBase ?? attrBase ?? '26');
  if (!storedBase && attrBase) {
    nameEl.setAttribute('data-base-font-size', attrBase);
  }

  const fittedName = name.toLocaleUpperCase('en-US');
  const setLabel = (label: string) => {
    if (tspan) tspan.textContent = label;
    else nameEl.textContent = label;
  };
  setLabel(fittedName);
  nameEl.setAttribute('font-size', `${baseFontSize}`);

  const edges = getBracketSlotEdges(nameEl);
  const textGfx = nameEl as unknown as SVGGraphicsElement;
  const nameX = bracketNameAnchorX(nameEl) + reserveRightShift;
  const leftRoom = nameX - edges.left;
  const rightRoom = edges.right - nameX;
  const maxWidth = Math.max(48, 2 * Math.min(leftRoom, rightRoom) * 0.84);
  const fits = () => textGfx.getBBox().width <= maxWidth;

  if (!fits()) {
    const minFontSize = Math.max(16, Math.round(baseFontSize * 0.7));
    const width = Math.max(1, textGfx.getBBox().width);
    const scaled = Math.floor(baseFontSize * (maxWidth / width));
    nameEl.setAttribute(
      'font-size',
      `${Math.max(minFontSize, Math.min(baseFontSize, scaled))}`
    );
  }

  if (fits() || fittedName.length <= 1) {
    liftShrunkBracketName(nameEl, baseFontSize);
    return;
  }

  let lo = 1;
  let hi = fittedName.length - 1;
  let best = '…';
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = `${fittedName.slice(0, mid).trimEnd()}…`;
    setLabel(candidate);
    if (fits()) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  setLabel(best);
  liftShrunkBracketName(nameEl, baseFontSize);
}

/** Baseline-anchored labels sink when the font shrinks. Center them in the slot. */
function liftShrunkBracketName(nameEl: SVGElement, baseFontSize: number): void {
  const current = Number.parseFloat(
    nameEl.getAttribute('font-size') ?? `${baseFontSize}`
  );
  const stored =
    nameEl.getAttribute('data-original-transform') ??
    nameEl.getAttribute('transform') ??
    '';
  if (!nameEl.getAttribute('data-original-transform')) {
    nameEl.setAttribute('data-original-transform', stored);
  }
  const match = stored.match(
    /translate\(\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s*\)/
  );
  if (!match) return;
  const tx = Number.parseFloat(match[1]);
  let ty = Number.parseFloat(match[2]);
  if (baseFontSize - current >= 0.5) {
    const posId = nameEl.id.replace(/_name$/, '');
    const rectG =
      nameEl.parentElement?.querySelector(`#${posId}_rect`) ??
      nameEl.parentElement?.querySelector('[id$="_rect"]');
    const rect = rectG?.querySelector('rect');
    if (rect) {
      nameEl.setAttribute('transform', stored);
      const box = (nameEl as unknown as SVGGraphicsElement).getBBox();
      const rectBox = (rect as SVGGraphicsElement).getBBox();
      const rectShift = translateXY(rectG ?? null);
      const rectMid = rectShift.y + rectBox.y + rectBox.height / 2;
      const textMid = ty + box.y + box.height / 2;
      ty -= textMid - rectMid;
    }
  }
  nameEl.setAttribute('transform', `translate(${tx} ${ty})`);
}

function bracketSlotRectMidY(nameEl: SVGElement): number | null {
  const posId = nameEl.id.replace(/_name$/, '');
  const rectG =
    nameEl.parentElement?.querySelector(`#${posId}_rect`) ??
    nameEl.parentElement?.querySelector('[id$="_rect"]');
  const rect = rectG?.querySelector('rect');
  if (!rect) return null;
  const rectBox = (rect as SVGGraphicsElement).getBBox();
  const rectShift = translateXY(rectG ?? null);
  return rectShift.y + rectBox.y + rectBox.height / 2;
}

function translateXY(el: Element | null): { x: number; y: number } {
  const transform = el?.getAttribute('transform') ?? '';
  const match = transform.match(
    /translate\(\s*([-+]?\d*\.?\d+)(?:[\s,]+([-+]?\d*\.?\d+))?\s*\)/
  );
  return {
    x: match ? Number.parseFloat(match[1]) : 0,
    y: match?.[2] ? Number.parseFloat(match[2]) : 0,
  };
}

/** Fixed avatar size from base slot font — independent of shrunk long-name text. */
function getBracketAvatarLayout(nameEl: SVGElement): {
  size: number;
  refBBox: DOMRect;
} {
  const textGfx = nameEl as unknown as SVGGraphicsElement;
  const baseFontSize = Number.parseFloat(
    nameEl.getAttribute('data-base-font-size') ??
      nameEl.getAttribute('font-size') ??
      '26'
  );
  const currentFontSize = nameEl.getAttribute('font-size');
  nameEl.setAttribute('font-size', `${baseFontSize}`);
  const refBBox = textGfx.getBBox();
  if (currentFontSize) {
    nameEl.setAttribute('font-size', currentFontSize);
  }
  const size = Math.max(22, Math.round(refBBox.height * 1.55));
  return { size, refBBox };
}

/** Portrait to the left of a bracket name. Resets the label anchor so it is not shifted twice. */
function attachBracketAvatar(nameEl: SVGElement, imageHref: string): void {
  const originalTransform = nameEl.getAttribute('data-original-transform');
  if (!originalTransform) {
    nameEl.setAttribute(
      'data-original-transform',
      nameEl.getAttribute('transform') ?? ''
    );
  } else {
    nameEl.setAttribute('transform', originalTransform);
  }

  const { size: avatarSize, refBBox } = getBracketAvatarLayout(nameEl);
  const gap = 10;
  const avatarLeftExtra = 5;
  const avatarLeftNudge = 4;
  const shift = (avatarSize + gap + avatarLeftExtra) / 2;
  const transformAttr = nameEl.getAttribute('transform') ?? '';
  const match = transformAttr.match(
    /translate\(\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s*\)/
  );
  if (!match) return;
  const tx = Number.parseFloat(match[1]) + shift;
  const fallbackTy = Number.parseFloat(match[2]);
  const textNode = nameEl as unknown as SVGGraphicsElement;
  nameEl.setAttribute('transform', `translate(${tx} ${fallbackTy})`);
  const glyph = textNode.getBBox();
  const rectMid = bracketSlotRectMidY(nameEl);
  const ty =
    rectMid == null ? fallbackTy - 2 : rectMid - (glyph.y + glyph.height / 2);
  nameEl.removeAttribute('dominant-baseline');
  nameEl.setAttribute('transform', `translate(${tx} ${ty})`);

  const parent = nameEl.parentNode;
  parent
    ?.querySelectorAll('g.bracket-avatar-wrap')
    .forEach((node) => node.remove());

  const alignedBBox = textNode.getBBox();
  const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  wrap.setAttribute('class', 'bracket-avatar-wrap');
  const ix =
    tx + alignedBBox.x - avatarSize - gap - avatarLeftExtra - avatarLeftNudge;
  const iy =
    rectMid == null
      ? ty + refBBox.y + (refBBox.height - avatarSize) / 2
      : rectMid - avatarSize / 2;
  const avatar = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'image'
  );
  avatar.setAttribute('data-avatar', 'true');
  avatar.setAttribute('x', `${ix}`);
  avatar.setAttribute('y', `${iy}`);
  avatar.setAttribute('width', `${avatarSize}`);
  avatar.setAttribute('height', `${avatarSize}`);
  avatar.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  avatar.setAttributeNS('http://www.w3.org/1999/xlink', 'href', imageHref);
  avatar.setAttribute('href', imageHref);
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
  parent?.appendChild(wrap);
}

/** Shrink long names to fit bracket slots; reserve space when a Nostr avatar shifts the label right. */
function applyBracketNameText(
  nameEl: SVGElement,
  name: string,
  withNostrAvatar: boolean
): void {
  const tspan = nameEl.querySelector('tspan');
  if (tspan) tspan.textContent = name;
  else nameEl.textContent = name;

  const reserve = withNostrAvatar
    ? (getBracketAvatarLayout(nameEl).size + 10 + 5) / 2
    : 0;
  fitBracketNameText(nameEl, name, reserve);
}
