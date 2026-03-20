// Practice menu page – practice mode setup
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { GameSetupLayout } from '@/components/layout/GameSetupLayout';
import { useSocket } from '@/hooks/useSocket';
import { useGamepad } from '@/hooks/useGamepad';
import { useAudio, SFX } from '@/contexts/AudioContext';
import type { LNURLP, PlayerInfo, SerializedGameInfo } from '@/types/socket';
import { useMenuSocketInfo } from '@/features/setup-menu/hooks/useMenuSocketInfo';
import type { MenuParseResult } from '@/lib/menuAdapters';
import { useSessionPersistence } from '@/shared/hooks/useSessionPersistence';
import { useQrExpandState } from '@/features/setup-menu/hooks/useQrExpandState';
import {
  HIGHLIGHT_FLASH_TIMEOUT_MS,
  SETUP_MENU_KEY_GRACE_MS,
} from '@/shared/constants/timeouts';
import {
  PRACTICE_MIN_DEPOSIT_SATS,
  SATS_DISPLAY_MAX,
} from '@/shared/constants/payment';
import { QR_CODE_PANEL_SIZE } from '@/shared/constants/ui';
import './practicemenu.css';

type ButtonSelected =
  | 'mainMenuButton'
  | 'startgame'
  | 'cancelGameAbort'
  | 'cancelGameConfirm';

export default function PracticeMenu() {
  const navigate = useNavigate();
  const { socket, connected } = useSocket();
  const { playSfx } = useAudio();
  const [loading, setLoading] = useState(true);
  const [payLinks, setPayLinks] = useState<LNURLP[] | null>(null);
  const [player1Sats, setPlayer1Sats] = useState(0);
  const [p1Name, setP1Name] = useState('Player 1');
  const [buttonSelected, setButtonSelected] = useState<ButtonSelected>('mainMenuButton');
  const [showCancelOverlay, setShowCancelOverlay] = useState(false);
  const [playerCardExpanded, setPlayerCardExpanded] = useState(false);
  const [qrBackdropVisible, setQrBackdropVisible] = useState(false);
  const [highlightP1, setHighlightP1] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const lastKnownP1SatsRef = useRef(0);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setupMenuKeyGraceUntilRef = useRef(0);

  useGamepad(true);

  useEffect(() => {
    setupMenuKeyGraceUntilRef.current = performance.now() + SETUP_MENU_KEY_GRACE_MS;
  }, []);

  const handleMenuParsed = useCallback(
    (parsed: MenuParseResult) => {
      if (parsed.hasLnurlw) {
        navigate('/postgame', { replace: true });
        return;
      }
      if (parsed.payLinks.length > 0) {
        setPayLinks(parsed.payLinks);
        setStatusMessage('');
      } else {
        setPayLinks(null);
        setStatusMessage('Waiting for payment links from backend...');
      }
      setLoading(false);
    },
    [navigate]
  );

  const handleMenuLoadingTimeout = useCallback(() => {
    setLoading(false);
  }, []);

  useMenuSocketInfo({
    socket,
    connected,
    requestEvent: 'getPracticeMenuInfos',
    responseEvent: 'resGetPracticeMenuInfos',
    onParsed: handleMenuParsed,
    onLoadingTimeout: handleMenuLoadingTimeout,
  });

  // Handle updatePayments
  useEffect(() => {
    if (!socket) return;
    const handler = (body: SerializedGameInfo) => {
      const players = body.players ?? {};
      const p1 = players['Player 1'];
      if (p1) {
        setP1Name((prev) => resolvePracticeName(p1, prev || 'Player 1'));
        if (p1.value !== undefined) {
          const nextSats = Number(p1.value);
          const didValueChange = nextSats !== lastKnownP1SatsRef.current;
          setPlayer1Sats(nextSats);
          if (didValueChange) {
            lastKnownP1SatsRef.current = nextSats;
            if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
            setHighlightP1(true);
            highlightTimeoutRef.current = setTimeout(
              () => setHighlightP1(false),
              HIGHLIGHT_FLASH_TIMEOUT_MS
            );
          }
        }
      }
    };
    socket.on('updatePayments', handler);
    return () => {
      socket.off('updatePayments', handler);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, [socket]);

  useSessionPersistence(socket);

  useEffect(() => {
    if (player1Sats >= PRACTICE_MIN_DEPOSIT_SATS) {
      setButtonSelected('startgame');
    }
  }, [player1Sats]);

  // Keyboard and gamepad
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (
          buttonSelected === 'mainMenuButton' &&
          performance.now() < setupMenuKeyGraceUntilRef.current
        ) {
          return;
        }
        playSfx(SFX.MENU_CONFIRM);
        if (buttonSelected === 'startgame') {
          if (player1Sats >= PRACTICE_MIN_DEPOSIT_SATS) {
            navigate('/game');
          }
        } else if (buttonSelected === 'mainMenuButton') {
          if (player1Sats === 0) {
            setShowCancelOverlay(true);
            setButtonSelected('cancelGameAbort');
          } else {
            navigate('/');
          }
        } else if (buttonSelected === 'cancelGameAbort') {
          setShowCancelOverlay(false);
          setButtonSelected('mainMenuButton');
        } else if (buttonSelected === 'cancelGameConfirm' && player1Sats === 0) {
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
  }, [buttonSelected, player1Sats, socket, navigate, playSfx]);

  useQrExpandState({
    dualControls: false,
    onExpandedChange: (expanded) => setPlayerCardExpanded(Boolean(expanded.left)),
    onBackdropVisibleChange: setQrBackdropVisible,
  });

  const player1PayLink = payLinks?.find((p) => p.description === 'Player 1');
  const minDeposit = player1PayLink?.min ?? 250;
  const minDepositFormatted = typeof minDeposit === 'number'
    ? minDeposit.toLocaleString()
    : String(minDeposit);
  const lnurlp = player1PayLink?.lnurlp ?? '';
  const canStart = player1Sats >= PRACTICE_MIN_DEPOSIT_SATS;
  const mainMenuDisabled = player1Sats >= PRACTICE_MIN_DEPOSIT_SATS;

  return (
    <>
      <GameSetupLayout
        title="PRACTICE"
        pageClass="practice-page"
        mainMenuDisabled={mainMenuDisabled}
        canStart={canStart}
        onMainMenu={() => {
          playSfx(SFX.MENU_CONFIRM);
          if (player1Sats === 0) {
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
          <div
            className="qr-expand-backdrop"
            aria-hidden
          />
        )}
        <div
          id="player1card"
          className={playerCardExpanded ? 'expanded' : ''}
        >
          <div id="player1cardinfo" className="player-card-info">
            <div
              id="player1satsContainer"
              className={`player-sats ${highlightP1 ? 'highlight' : ''}`}
            >
              <span id="player1sats">{player1Sats.toLocaleString()}</span>
            </div>
            <span className="grey sats-label">sats</span>
            <div className="condensed">
              <div className="inline playerSquare white" />
              <div
                id="player1info"
                className={`inline ${highlightP1 ? 'highlight' : ''}`}
              >
                {p1Name}
              </div>
            </div>
          </div>

          <div id="qrcodeContainer1" className="qrcodeContainer">
            <a
              id="qrcode1Link"
              href={lnurlp ? `lightning:${lnurlp}` : undefined}
              target="_blank"
              rel="noopener noreferrer"
            >
              {lnurlp ? (
                <QRCodeCanvas
                  id="qrcode1"
                  className="qrcode"
                  value={lnurlp}
                  size={QR_CODE_PANEL_SIZE}
                  level="M"
                  includeMargin={false}
                />
              ) : (
                <span className="qrcode qrcode-placeholder" />
              )}
              <img
                id="qrcode1Decoration"
                className={`qrcodeDecoration ${highlightP1 ? '' : 'hide'}`}
                src="/images/qr_lightning.gif"
                alt=""
              />
            </a>
          </div>
          <div className="player-card-info">
            <div className="practice-teaser">
              <h1 className="condensed">
                <span id="mindepP1">{minDepositFormatted}</span> sats per
                practice
              </h1>
              <h3 className="condensed">Winners get their sats back</h3>
            </div>
            <div className="deposit-message">
              Deposit between <b><span id="mindepP1_">{minDepositFormatted}</span></b> and{' '}
              <b>{SATS_DISPLAY_MAX.toLocaleString()}</b> sats
              <br />
              Set player name on the payment note
              <br />
              LNURL compatible wallet required
              <br />
              Allows for multiple deposits
            </div>
          </div>
        </div>
      </GameSetupLayout>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </>
  );
}

function resolvePracticeName(player: PlayerInfo | undefined, fallback: string) {
  if (!player) return fallback;
  const direct = String(player.name ?? '').trim();
  if (direct) return direct;
  if (!Array.isArray(player.payments)) return fallback;
  for (let i = player.payments.length - 1; i >= 0; i -= 1) {
    const note = player.payments[i]?.note;
    if (typeof note === 'string' && note.trim() !== '') return note.trim();
  }
  return fallback;
}
