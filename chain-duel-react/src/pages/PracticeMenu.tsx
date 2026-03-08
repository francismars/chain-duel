// Practice menu page – practice mode setup
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { GameSetupLayout } from '@/components/layout/GameSetupLayout';
import { useSocket } from '@/hooks/useSocket';
import { useGamepad } from '@/hooks/useGamepad';
import { useAudio, SFX } from '@/contexts/AudioContext';
import type { LNURLP, SerializedGameInfo } from '@/types/socket';
import { parseMenuResponse } from '@/lib/menuAdapters';
import './practicemenu.css';

const MINDEPOSIT = 150;

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

  const mainMenuButtonRef = useRef<HTMLButtonElement>(null);
  const startGameButtonRef = useRef<HTMLButtonElement>(null);
  const cancelGameAbortRef = useRef<HTMLButtonElement>(null);
  const cancelGameConfirmRef = useRef<HTMLButtonElement>(null);
  const expandKeyUpTimeRef = useRef<number>(0);
  const backdropTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useGamepad(true);

  // Request practice menu infos when socket is connected
  useEffect(() => {
    if (!socket || !connected) return;
    const hostLNAddress = localStorage.getItem('hostLNAddress');
    const hostInfo = hostLNAddress ? { LNAddress: hostLNAddress } : undefined;
    // Ensure listeners are attached before requesting menu infos.
    const emitTimer = setTimeout(() => {
      socket.emit('getPracticeMenuInfos', hostInfo);
    }, 0);
    const fallback = setTimeout(() => setLoading(false), 12000);
    return () => {
      clearTimeout(emitTimer);
      clearTimeout(fallback);
    };
  }, [socket, connected]);

  // Handle resGetPracticeMenuInfos
  useEffect(() => {
    if (!socket) return;
    const handler = (body: unknown) => {
      const parsed = parseMenuResponse(body);
      if (parsed.hasLnurlw) {
        navigate('/postgame', { replace: true });
        return;
      }
      if (parsed.payLinks.length > 0) {
        setPayLinks(parsed.payLinks);
        setStatusMessage('');
        setLoading(false);
      } else {
        setPayLinks(null);
        setStatusMessage('Waiting for payment links from backend...');
        setLoading(false);
      }
    };
    socket.on('resGetPracticeMenuInfos', handler);
    return () => {
      socket.off('resGetPracticeMenuInfos', handler);
    };
  }, [socket, navigate]);

  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle updatePayments
  useEffect(() => {
    if (!socket) return;
    const handler = (body: SerializedGameInfo) => {
      const players = body.players ?? {};
      const p1 = players['Player 1'];
      if (p1) {
        if (p1.name != null && p1.name.trim() !== '') {
          setP1Name(p1.name.trim());
        }
        if (p1.value !== undefined) {
          setPlayer1Sats(p1.value);
          if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
          setHighlightP1(true);
          highlightTimeoutRef.current = setTimeout(() => setHighlightP1(false), 1200);
        }
      }
    };
    socket.on('updatePayments', handler);
    return () => {
      socket.off('updatePayments', handler);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, [socket]);

  // Session persistence
  useEffect(() => {
    if (!socket) return;
    const handler = ({
      sessionID,
    }: { sessionID: string; userID: string }) => {
      sessionStorage.setItem('sessionID', sessionID);
    };
    socket.on('session', handler);
    return () => {
      socket.off('session', handler);
    };
  }, [socket]);

  // Button animation based on selection
  useEffect(() => {
    if (mainMenuButtonRef.current) {
      mainMenuButtonRef.current.style.animationDuration =
        buttonSelected === 'mainMenuButton' ? '2s' : '0s';
    }
    if (startGameButtonRef.current) {
      startGameButtonRef.current.style.animationDuration =
        buttonSelected === 'startgame' ? '2s' : '0s';
    }
    if (cancelGameAbortRef.current) {
      cancelGameAbortRef.current.style.animationDuration =
        buttonSelected === 'cancelGameAbort' ? '2s' : '0s';
    }
    if (cancelGameConfirmRef.current) {
      cancelGameConfirmRef.current.style.animationDuration =
        buttonSelected === 'cancelGameConfirm' ? '2s' : '0s';
    }
  }, [buttonSelected]);

  // Auto-select READY TO START when deposit meets minimum
  useEffect(() => {
    if (player1Sats >= MINDEPOSIT) {
      setButtonSelected('startgame');
    }
  }, [player1Sats]);

  // Keyboard and gamepad
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        playSfx(SFX.MENU_CONFIRM);
        if (buttonSelected === 'startgame') {
          if (player1Sats !== 0) {
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
    const EXPAND_DEBOUNCE_MS = 180;
    const SCALE_DOWN_MS = 250;
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ControlLeft') {
        expandKeyUpTimeRef.current = Date.now();
        setPlayerCardExpanded(false);
        if (backdropTimeoutRef.current) clearTimeout(backdropTimeoutRef.current);
        backdropTimeoutRef.current = setTimeout(() => setQrBackdropVisible(false), SCALE_DOWN_MS);
      }
    };
    const handleKeyDownControl = (e: KeyboardEvent) => {
      if (e.code === 'ControlLeft') {
        if (Date.now() - expandKeyUpTimeRef.current < EXPAND_DEBOUNCE_MS) return;
        if (backdropTimeoutRef.current) clearTimeout(backdropTimeoutRef.current);
        setPlayerCardExpanded(true);
        setQrBackdropVisible(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keydown', handleKeyDownControl);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keydown', handleKeyDownControl);
      window.removeEventListener('keyup', handleKeyUp);
      if (backdropTimeoutRef.current) clearTimeout(backdropTimeoutRef.current);
    };
  }, [buttonSelected, player1Sats, socket, navigate, playSfx]);

  const player1PayLink = payLinks?.find((p) => p.description === 'Player 1');
  const minDeposit = player1PayLink?.min ?? 250;
  const minDepositFormatted = typeof minDeposit === 'number'
    ? minDeposit.toLocaleString()
    : String(minDeposit);
  const lnurlp = player1PayLink?.lnurlp ?? '';
  const canStart = player1Sats >= MINDEPOSIT;
  const mainMenuDisabled = player1Sats >= MINDEPOSIT;

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
        mainMenuButtonRef={mainMenuButtonRef}
        startGameButtonRef={startGameButtonRef}
        cancelGameAbortRef={cancelGameAbortRef}
        cancelGameConfirmRef={cancelGameConfirmRef}
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
              <span className="grey sats-label">sats</span>
            </div>
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
                <QRCodeSVG
                  id="qrcode1"
                  className="qrcode"
                  value={lnurlp}
                  size={200}
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
              <b>10,000,000</b> sats
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
