// P2P game menu page – two players LNURL setup
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { GameSetupLayout } from '@/components/layout/GameSetupLayout';
import { useSocket } from '@/hooks/useSocket';
import { useGamepad } from '@/hooks/useGamepad';
import { useAudio, SFX } from '@/contexts/AudioContext';
import type { LNURLP, SerializedGameInfo } from '@/types/socket';
import { useMenuSocketInfo } from '@/features/setup-menu/hooks/useMenuSocketInfo';
import type { MenuParseResult } from '@/lib/menuAdapters';
import { useSessionPersistence } from '@/shared/hooks/useSessionPersistence';
import { useQrExpandState } from '@/features/setup-menu/hooks/useQrExpandState';
import { createLogger } from '@/shared/utils/logger';
import {
  HIGHLIGHT_FLASH_TIMEOUT_MS,
} from '@/shared/constants/timeouts';
import {
  DEVELOPER_FEE_RATIO,
  DESIGNER_FEE_RATIO,
  HOST_FEE_RATIO,
  P2P_DEFAULT_MIN_DEPOSIT_SATS,
  SATS_DISPLAY_MAX,
} from '@/shared/constants/payment';
import { QR_CODE_CARD_SIZE } from '@/shared/constants/ui';
import {
  CHAIN_DUEL_SUPPRESS_NEXT_MENU_CONFIRM,
  clearMenuNavigationState,
  type MenuNavigationState,
} from '@/shared/constants/menuNavigation';
import './gamemenu.css';

type ButtonSelected =
  | 'mainMenuButton'
  | 'startgame'
  | 'cancelGameAbort'
  | 'cancelGameConfirm';

export default function GameMenu() {
  const logger = useMemo(() => createLogger('GameMenu'), []);
  const navigate = useNavigate();
  const location = useLocation();
  const suppressNextMenuConfirmRef = useRef(
    Boolean(
      (location.state as MenuNavigationState | null)?.[
        CHAIN_DUEL_SUPPRESS_NEXT_MENU_CONFIRM
      ]
    )
  );
  const [searchParams] = useSearchParams();
  const useNostrFromQuery = searchParams.get('nostr') === 'true';
  /** URL is the source of truth so /gamemenu (no query) never stays stuck in Nostr UI after leaving ?nostr=true. */
  const isNostrMode = useNostrFromQuery;
  const { socket } = useSocket();
  const { playSfx } = useAudio();
  const [loading, setLoading] = useState(true);
  const [payLinks, setPayLinks] = useState<LNURLP[] | null>(null);
  const [player1Sats, setPlayer1Sats] = useState(0);
  const [player2Sats, setPlayer2Sats] = useState(0);
  const [p1Name, setP1Name] = useState('Player 1');
  const [p2Name, setP2Name] = useState('Player 2');
  const [buttonSelected, setButtonSelected] = useState<ButtonSelected>('mainMenuButton');
  const [showCancelOverlay, setShowCancelOverlay] = useState(false);
  const [player1CardExpanded, setPlayer1CardExpanded] = useState(false);
  const [player2CardExpanded, setPlayer2CardExpanded] = useState(false);
  const [qrBackdropVisible, setQrBackdropVisible] = useState(false);
  const [highlightP1, setHighlightP1] = useState(false);
  const [highlightP2, setHighlightP2] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [gameMenuTitle, setGameMenuTitle] = useState<string>('P2P');
  const [prevWinner, setPrevWinner] = useState<string | null>(null);
  const [winnerSats, setWinnerSats] = useState<number>(0);
  const [loserSats, setLoserSats] = useState<number>(0);
  const [nostrCode, setNostrCode] = useState<string>('');
  const [nostrNote1, setNostrNote1] = useState<string>('');
  const [nostrMinP1, setNostrMinP1] = useState<number>(1);
  const [nostrMinP2, setNostrMinP2] = useState<number>(1);
  const [player1Image, setPlayer1Image] = useState<string>('');
  const [player2Image, setPlayer2Image] = useState<string>('');
  const [leaderboardThreshold, setLeaderboardThreshold] = useState<number>(1);

  const lastKnownP1SatsRef = useRef(0);
  const lastKnownP2SatsRef = useRef(0);
  const highlightTimeoutP1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimeoutP2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  useGamepad(true);

  useEffect(() => {
    if (!socket) return;
    const onAny = (event: string, ...args: unknown[]) => {
      logger.debug('onAny event', event, args);
    };
    socket.onAny(onAny);
    return () => {
      socket.offAny(onAny);
    };
  }, [logger, socket]);

  const handleMenuParsed = useCallback(
    (parsed: MenuParseResult) => {
      if (parsed.hasLnurlw) {
        navigate('/postgame', { replace: true });
        return;
      }
      const links = parsed.payLinks;
      setPayLinks(links.length > 0 ? links : null);
      if (parsed.modeMeta?.mode) {
        const mode = parsed.modeMeta.mode;
        const isNostrModeMeta = /nostr/i.test(mode);
        const winnersCount = parsed.modeMeta.winnersCount ?? 0;
        const donMultiple = winnersCount > 0 ? `*${2 ** winnersCount}` : '';
        // Legacy keeps P2P label even when the panel switches to Nostr mode.
        setGameMenuTitle(`${isNostrModeMeta ? 'P2P' : mode}${donMultiple}`);
      }
      if (parsed.nostrMeta && useNostrFromQuery) {
        setNostrCode(parsed.nostrMeta.emojis);
        setNostrNote1(parsed.nostrMeta.note1);
        setNostrMinP1(parsed.nostrMeta.min);
        setNostrMinP2(parsed.nostrMeta.min);
      }
      const isNostrPayload =
        useNostrFromQuery &&
        (Boolean(parsed.nostrMeta) ||
          Boolean(parsed.modeMeta?.mode && /nostr/i.test(parsed.modeMeta.mode)));
      setStatusMessage(isNostrPayload ? '' : links.length > 0 ? '' : 'Waiting for payment links from backend...');
      setLoading(false);
    },
    [navigate, useNostrFromQuery]
  );

  const handleMenuLoadingTimeout = useCallback(() => {
    setLoading(false);
  }, []);

  useMenuSocketInfo({
    socket,
    connected: true,
    requestEvent: useNostrFromQuery ? 'getGameMenuInfosNostr' : 'getGameMenuInfos',
    responseEvent: 'resGetGameMenuInfos',
    maxRetries: 3,
    onParsed: handleMenuParsed,
    onLoadingTimeout: handleMenuLoadingTimeout,
  });

  useEffect(() => {
    if (useNostrFromQuery) {
      return;
    }
    setNostrCode('');
    setNostrNote1('');
    setNostrMinP1(1);
    setNostrMinP2(1);
  }, [useNostrFromQuery]);

  useEffect(() => {
    if (!socket) return;
    const handler = (body: SerializedGameInfo) => {
      logger.debug('updatePayments payload', body);
      if (
        useNostrFromQuery &&
        typeof body.mode === 'string' &&
        /nostr/i.test(body.mode)
      ) {
        // Legacy flow can emit updatePayments without re-sending nostr menu metadata.
        // Ensure we fetch note1/emojis payload when switching into Nostr mode.
        if (!nostrNote1) {
          const hostLNAddress = localStorage.getItem('hostLNAddress');
          const hostInfo = hostLNAddress ? { LNAddress: hostLNAddress } : undefined;
          if (hostInfo) socket.emit('getGameMenuInfosNostr', hostInfo);
          else socket.emit('getGameMenuInfosNostr');
        }
      }
      const latestWinner = body.winners?.length ? body.winners.slice(-1)[0] : null;
      if (body.winners && body.winners.length > 0) {
        setPrevWinner(latestWinner);
        const donMultiple = 2 ** body.winners.length;
        setGameMenuTitle(`P2P*${donMultiple}`);
      }
      const players = body.players ?? {};
      const p1 = players['Player 1'];
      const p2 = players['Player 2'];
      if (p1) {
        setP1Name((prev) => resolvePlayerName(p1, prev || 'Player 1'));
        if (typeof p1.picture === 'string' && p1.picture.trim() !== '') {
          setPlayer1Image(p1.picture);
        }
        if (p1.value !== undefined) {
          const nextP1Sats = Number(p1.value);
          const didP1Change = nextP1Sats !== lastKnownP1SatsRef.current;
          setPlayer1Sats(nextP1Sats);
          if (didP1Change) {
            lastKnownP1SatsRef.current = nextP1Sats;
            if (highlightTimeoutP1Ref.current) clearTimeout(highlightTimeoutP1Ref.current);
            setHighlightP1(true);
            highlightTimeoutP1Ref.current = setTimeout(
              () => setHighlightP1(false),
              HIGHLIGHT_FLASH_TIMEOUT_MS
            );
          }
        }
      }
      if (p2) {
        setP2Name((prev) => resolvePlayerName(p2, prev || 'Player 2'));
        if (typeof p2.picture === 'string' && p2.picture.trim() !== '') {
          setPlayer2Image(p2.picture);
        }
        if (p2.value !== undefined) {
          const nextP2Sats = Number(p2.value);
          const didP2Change = nextP2Sats !== lastKnownP2SatsRef.current;
          setPlayer2Sats(nextP2Sats);
          if (didP2Change) {
            lastKnownP2SatsRef.current = nextP2Sats;
            if (highlightTimeoutP2Ref.current) clearTimeout(highlightTimeoutP2Ref.current);
            setHighlightP2(true);
            highlightTimeoutP2Ref.current = setTimeout(
              () => setHighlightP2(false),
              HIGHLIGHT_FLASH_TIMEOUT_MS
            );
          }
        }
      }

      const effectiveWinner = latestWinner ?? prevWinner;
      if (effectiveWinner) {
        const loser = effectiveWinner === 'Player 1' ? 'Player 2' : 'Player 1';
        const winnerValue = players[effectiveWinner]?.value ?? 0;
        const loserValue = players[loser]?.value ?? 0;
        setWinnerSats(winnerValue);
        setLoserSats(loserValue);
      }
    };
    socket.on('updatePayments', handler);
    return () => {
      socket.off('updatePayments', handler);
      if (highlightTimeoutP1Ref.current) clearTimeout(highlightTimeoutP1Ref.current);
      if (highlightTimeoutP2Ref.current) clearTimeout(highlightTimeoutP2Ref.current);
    };
  }, [socket, prevWinner, logger, nostrNote1, useNostrFromQuery]);

  useSessionPersistence(socket);

  useEffect(() => {
    let mounted = true;
    const loadLeaderboardThreshold = async () => {
      try {
        const response = await fetch('/files/highscores.json');
        if (!response.ok) return;
        const highscores = (await response.json()) as Array<{
          p1sats?: number;
          p2sats?: number;
          prize?: number;
        }>;
        if (!Array.isArray(highscores) || highscores.length === 0) return;

        const ordered = [...highscores].sort((a, b) => Number(b.prize ?? 0) - Number(a.prize ?? 0));
        const last = ordered[ordered.length - 1];
        const threshold = Number(last?.p1sats ?? 0) + Number(last?.p2sats ?? 0) + 1;
        if (mounted && Number.isFinite(threshold) && threshold > 0) {
          setLeaderboardThreshold(threshold);
        }
      } catch {
        // Keep default fallback threshold when file cannot be loaded.
      }
    };

    void loadLeaderboardThreshold();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const canStartNow = prevWinner
      ? winnerSats > 0 && loserSats >= winnerSats
      : player1Sats !== 0 && player2Sats !== 0;
    if (canStartNow) {
      setButtonSelected('startgame');
    }
  }, [player1Sats, player2Sats, prevWinner, loserSats, winnerSats]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const canStartNow = prevWinner ? loserSats >= winnerSats : player1Sats !== 0 && player2Sats !== 0;
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.repeat) {
          return;
        }
        if (suppressNextMenuConfirmRef.current) {
          suppressNextMenuConfirmRef.current = false;
          e.preventDefault();
          clearMenuNavigationState(navigate, location);
          return;
        }
        e.preventDefault();
        playSfx(SFX.MENU_CONFIRM);
        if (buttonSelected === 'startgame') {
          if (canStartNow) {
            navigate('/game');
          }
        } else if (buttonSelected === 'mainMenuButton') {
          if (player1Sats === 0 && player2Sats === 0) {
            setShowCancelOverlay(true);
            setButtonSelected('cancelGameAbort');
          } else {
            navigate('/');
          }
        } else if (buttonSelected === 'cancelGameAbort') {
          setShowCancelOverlay(false);
          setButtonSelected('mainMenuButton');
        } else if (buttonSelected === 'cancelGameConfirm' && player1Sats === 0 && player2Sats === 0) {
          socket?.emit('cancelp2p');
          navigate('/', { replace: true });
        }
      }
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        if (buttonSelected === 'cancelGameConfirm') {
          playSfx(SFX.MENU_SELECT);
          setButtonSelected('cancelGameAbort');
        }
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        if (buttonSelected === 'cancelGameAbort') {
          playSfx(SFX.MENU_SELECT);
          setButtonSelected('cancelGameConfirm');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    buttonSelected,
    player1Sats,
    player2Sats,
    socket,
    navigate,
    location,
    playSfx,
    prevWinner,
    loserSats,
    winnerSats,
  ]);

  useQrExpandState({
    dualControls: true,
    onExpandedChange: (expanded) => {
      if (typeof expanded.left === 'boolean') setPlayer1CardExpanded(expanded.left);
      if (typeof expanded.right === 'boolean') setPlayer2CardExpanded(expanded.right);
    },
    onBackdropVisibleChange: setQrBackdropVisible,
  });

  const p1PayLink =
    payLinks?.find((p) => /player\s*1/i.test(String(p.description ?? ''))) ??
    payLinks?.[0];
  const p2PayLink =
    payLinks?.find((p) => /player\s*2/i.test(String(p.description ?? ''))) ??
    payLinks?.[1];
  const minP1 = p1PayLink?.min ?? P2P_DEFAULT_MIN_DEPOSIT_SATS;
  const minP2 = p2PayLink?.min ?? P2P_DEFAULT_MIN_DEPOSIT_SATS;
  const fmt = (n: number) => n.toLocaleString();
  const totalPrize = player1Sats + player2Sats;
  const hostCut = Math.floor(totalPrize * HOST_FEE_RATIO);
  const devCut = Math.floor(totalPrize * DEVELOPER_FEE_RATIO);
  const designCut = Math.floor(totalPrize * DESIGNER_FEE_RATIO);
  const canStart = prevWinner
    ? winnerSats > 0 && loserSats >= winnerSats
    : player1Sats !== 0 && player2Sats !== 0;
  const mainMenuDisabled = player1Sats !== 0 || player2Sats !== 0;

  return (
    <>
      <GameSetupLayout
        title={gameMenuTitle}
        pageClass={`gamemenu-page ${isNostrMode ? 'is-nostr' : ''}`}
        mainMenuDisabled={mainMenuDisabled}
        canStart={canStart}
        onMainMenu={() => {
          playSfx(SFX.MENU_CONFIRM);
          if (player1Sats === 0 && player2Sats === 0) {
            setShowCancelOverlay(true);
            setButtonSelected('cancelGameAbort');
          } else {
            navigate('/');
          }
        }}
        onStart={() => {
          playSfx(SFX.MENU_CONFIRM);
          navigate('/game');
        }}
        loading={loading}
        showCancelOverlay={showCancelOverlay}
        statusMessage={statusMessage}
        onCancelAbort={() => {
          playSfx(SFX.MENU_CONFIRM);
          setShowCancelOverlay(false);
          setButtonSelected('mainMenuButton');
        }}
        onCancelConfirm={() => {
          playSfx(SFX.MENU_CONFIRM);
          socket?.emit('cancelp2p');
          navigate('/', { replace: true });
        }}
        selectedButton={buttonSelected}
      >
        {qrBackdropVisible && (
          <div className="qr-expand-backdrop" aria-hidden />
        )}
        {isNostrMode ? (
          <>
            <div id="player1card" className={player1CardExpanded ? 'expanded' : ''}>
              <div id="player1cardinfo" className="player-card-info">
                <div id="player1satsContainer" className={`player-sats ${highlightP1 ? 'highlight' : ''}`}>
                  <span id="nostrPlayer1sats">{fmt(player1Sats)}</span>{' '}
                  <span className="grey sats-label">sats</span>
                </div>
                <div className="condensed">
                  <div className="inline playerSquare white" />
                  <img className="inline playerImg" id="player1Img" src={player1Image || '/images/loading.gif'} alt="" />
                  <div id="nostrPlayer1info" className={`player1info inline ${highlightP1 ? 'highlight' : ''}`}>
                    {p1Name}
                  </div>
                </div>
                <div className="deposit-message">
                  Zap min <span id="nostrmindepP1">{fmt(nostrMinP1)}</span> sats
                  <br />
                  First 2 players to pay get the slot
                  <br />
                  Below the minimum is donation
                </div>
              </div>
            </div>

            <div className="nostrLine">
              <div>
                <div className="condensed">Zap</div>
                <div className="label">Seen on</div>
                <div className="label">nostr.wine</div>
              </div>
            </div>

            <div className="prizeinfocard nostr-center-card">
              <div id="gameCodeNostr">{nostrCode}</div>
              <div
                id="qrcodeContainerNostr"
                className={`qrcodeContainer ${player1CardExpanded || player2CardExpanded ? 'expanded' : ''}`}
              >
                <a
                  id="qrcodeLinkNostr"
                  href={nostrNote1 ? `https://next.nostrudel.ninja/#/n/${nostrNote1}` : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {nostrNote1 ? (
                    <QRCodeSVG
                      id="qrcodeNostr"
                      className="qrcode"
                      value={`nostr:${nostrNote1}`}
                      size={QR_CODE_CARD_SIZE}
                      level="M"
                      includeMargin={false}
                    />
                  ) : (
                    <span className="qrcode qrcode-placeholder" style={{ display: 'block', width: '9vw', height: '10vw', background: '#333' }} />
                  )}
                  <img
                    id="qrcodeNostrDecoration"
                    className={`qrcodeDecoration ${highlightP1 || highlightP2 ? '' : 'hide'}`}
                    src="/images/qr_lightning.gif"
                    alt=""
                  />
                </a>
              </div>
            </div>

            <div className="nostrLine right">
              <div>
                <div className="condensed">Me!</div>
                <div className="label">Event</div>
                <div className="label">note1XXX</div>
              </div>
            </div>

            <div id="player2card" className={player2CardExpanded ? 'expanded' : ''}>
              <div id="player2cardinfo" className="player-card-info">
                <div id="player2satsContainer" className={`player-sats ${highlightP2 ? 'highlight' : ''}`}>
                  <span className="grey sats-label">sats</span>
                  <span id="nostrPlayer2sats">{fmt(player2Sats)}</span>
                </div>
                <div className="condensed">
                  <div id="nostrPlayer2info" className={`player2info inline ${highlightP2 ? 'highlight' : ''}`}>
                    {p2Name}
                  </div>
                  <img className="inline playerImg" id="player2Img" src={player2Image || '/images/loading.gif'} alt="" />
                  <div className="inline playerSquare black" />
                </div>
                <div className="deposit-message">
                  Zap min <span id="nostrmindepP2">{fmt(nostrMinP2)}</span> sats
                  <br />
                  First 2 players to pay get the slot
                  <br />
                  Below the minimum is donation
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div id="player1card" className={player1CardExpanded ? 'expanded' : ''}>
              <div id="qrcodeContainer1" className="qrcodeContainer">
                <a
                  id="qrcode1Link"
                  href={p1PayLink?.lnurlp ? `lightning:${p1PayLink.lnurlp}` : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {p1PayLink?.lnurlp ? (
                    <QRCodeSVG
                      id="qrcode1"
                      className="qrcode"
                      value={p1PayLink.lnurlp}
                      size={QR_CODE_CARD_SIZE}
                      level="M"
                      includeMargin={false}
                    />
                  ) : (
                    <span className="qrcode qrcode-placeholder" style={{ display: 'block', width: '9vw', height: '10vw', background: '#333' }} />
                  )}
                  <img
                    id="qrcode1Decoration"
                    className={`qrcodeDecoration ${highlightP1 ? '' : 'hide'}`}
                    src="/images/qr_lightning.gif"
                    alt=""
                  />
                </a>
              </div>
              <div id="player1cardinfo" className="player-card-info">
                <div id="player1satsContainer" className={`player-sats ${highlightP1 ? 'highlight' : ''}`}>
                  <span id="player1sats">{fmt(player1Sats)}</span>{' '}
                  <span className="grey sats-label">sats</span>
                </div>
                <div className="condensed">
                  <div className="inline playerSquare white" />
                  <div id="player1info" className={`player1info inline ${highlightP1 ? 'highlight' : ''}`}>
                    {p1Name}
                  </div>
                </div>
                <div className="deposit-message">
                  Deposit between <b>{fmt(minP1)}</b> and <b>{fmt(SATS_DISPLAY_MAX)}</b> sats
                  <br />
                  Set player name on the payment note
                  <br />
                  LNURL compatible wallet required
                  <br />
                  Allows for multiple deposits
                </div>
              </div>
            </div>

            <div className="prizeinfocard">
              <div id="prizevaluesats" className="condensed">
                {fmt(totalPrize)}
              </div>
              <div id="prizeinfosats">Total Prize (sats)</div>
              <div id="splits">
                <span id="rules1">host 2% ({fmt(hostCut)} sats)</span> •{' '}
                <span id="rules2">developer 2% ({fmt(devCut)} sats)</span> •{' '}
                <span id="rules3">designer 1% ({fmt(designCut)} sats)</span>
              </div>
              <div id="leaderboard">
                <p id="leaderboard-inner">
                  <span id="leaderboardSats">{fmt(leaderboardThreshold)}</span> sats qualifies for highscore
                </p>
              </div>
            </div>

            <div id="player2card" className={player2CardExpanded ? 'expanded' : ''}>
              <div id="player2cardinfo" className="player-card-info">
                <div id="player2satsContainer" className={`player-sats ${highlightP2 ? 'highlight' : ''}`}>
                  <span className="grey sats-label">sats</span>
                  <span id="player2sats">{fmt(player2Sats)}</span>
                </div>
                <div className="condensed">
                  <div id="player2info" className={`player2info inline ${highlightP2 ? 'highlight' : ''}`}>
                    {p2Name}
                  </div>
                  <div className="inline playerSquare black" />
                </div>
                <div className="deposit-message">
                  Deposit between <b>{fmt(minP2)}</b> and <b>{fmt(SATS_DISPLAY_MAX)}</b> sats
                  <br />
                  Set player name on the payment note
                  <br />
                  LNURL compatible wallet required
                  <br />
                  Allows for multiple deposits
                </div>
              </div>
              <div id="qrcodeContainer2" className="qrcodeContainer">
                <a
                  id="qrcode2Link"
                  href={p2PayLink?.lnurlp ? `lightning:${p2PayLink.lnurlp}` : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {p2PayLink?.lnurlp ? (
                    <QRCodeSVG
                      id="qrcode2"
                      className="qrcode"
                      value={p2PayLink.lnurlp}
                      size={180}
                      level="M"
                      includeMargin={false}
                    />
                  ) : (
                    <span className="qrcode qrcode-placeholder" style={{ display: 'block', width: '9vw', height: '10vw', background: '#333' }} />
                  )}
                  <img
                    id="qrcode2Decoration"
                    className={`qrcodeDecoration ${highlightP2 ? '' : 'hide'}`}
                    src="/images/qr_lightning.gif"
                    alt=""
                  />
                </a>
              </div>
            </div>
          </>
        )}
      </GameSetupLayout>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </>
  );
}

function resolvePlayerName(
  player: SerializedGameInfo['players'][string] | undefined,
  fallback: string
): string {
  if (!player) return fallback;
  const direct = String(player.name ?? '').trim();
  if (direct.length > 1) return direct;

  const payments = (player as { payments?: unknown }).payments;
  const fromPayment = extractNameFromPayments(payments);
  if (fromPayment) return fromPayment;

  return direct || fallback;
}

function extractNameFromPayments(payments: unknown): string {
  if (!Array.isArray(payments)) return '';
  for (let i = payments.length - 1; i >= 0; i -= 1) {
    const payment = payments[i] as { note?: unknown } | null | undefined;
    const note = payment?.note;
    if (typeof note === 'string' && note.trim() !== '') {
      return note.trim();
    }
    if (Array.isArray(note)) {
      const joined = note.map((part) => String(part ?? '')).join('').trim();
      if (joined !== '') return joined;
    }
  }
  return '';
}
