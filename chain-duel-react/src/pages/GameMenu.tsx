// P2P game menu page – two players LNURL setup
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { GameSetupLayout } from '@/components/layout/GameSetupLayout';
import { useSocket } from '@/hooks/useSocket';
import { useGamepad } from '@/hooks/useGamepad';
import { useAudio, SFX } from '@/contexts/AudioContext';
import type { LNURLP, SerializedGameInfo } from '@/types/socket';
import { parseMenuResponse } from '@/lib/menuAdapters';
import './gamemenu.css';

type ButtonSelected =
  | 'mainMenuButton'
  | 'startgame'
  | 'cancelGameAbort'
  | 'cancelGameConfirm';

export default function GameMenu() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const useNostr = searchParams.get('nostr') === 'true';
  const { socket, connected } = useSocket();
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

  const mainMenuButtonRef = useRef<HTMLButtonElement>(null);
  const startGameButtonRef = useRef<HTMLButtonElement>(null);
  const cancelGameAbortRef = useRef<HTMLButtonElement>(null);
  const cancelGameConfirmRef = useRef<HTMLButtonElement>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandKeyUpTimeRef = useRef<{ left?: number; right?: number }>({});
  const backdropTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useGamepad(true);

  useEffect(() => {
    if (!socket || !connected) return;
    const hostLNAddress = localStorage.getItem('hostLNAddress');
    const hostInfo = hostLNAddress ? { LNAddress: hostLNAddress } : undefined;
    // Ensure listeners are attached before requesting menu infos.
    const emitTimer = setTimeout(() => {
      if (useNostr) {
        socket.emit('getGameMenuInfosNostr', hostInfo);
      } else {
        socket.emit('getGameMenuInfos', hostInfo);
      }
    }, 0);
    const fallback = setTimeout(() => setLoading(false), 12000);
    return () => {
      clearTimeout(emitTimer);
      clearTimeout(fallback);
    };
  }, [socket, connected, useNostr]);

  useEffect(() => {
    if (!socket) return;
    const handler = (body: unknown) => {
      const parsed = parseMenuResponse(body);
      if (parsed.hasLnurlw) {
        navigate('/postgame', { replace: true });
        return;
      }
      const links = parsed.payLinks;
      setPayLinks(links.length > 0 ? links : null);
      if (parsed.modeMeta?.mode) {
        setGameMenuTitle(parsed.modeMeta.mode);
      }
      if (parsed.nostrMeta) {
        setNostrCode(parsed.nostrMeta.emojis);
        setNostrNote1(parsed.nostrMeta.note1);
        setNostrMinP1(parsed.nostrMeta.min);
        setNostrMinP2(parsed.nostrMeta.min);
      }
      setStatusMessage(
        links.length > 0 ? '' : 'Waiting for payment links from backend...'
      );
      setLoading(false);
    };
    socket.on('resGetGameMenuInfos', handler);
    return () => {
      socket.off('resGetGameMenuInfos', handler);
    };
  }, [socket, navigate]);

  useEffect(() => {
    if (!socket) return;
    const handler = (body: SerializedGameInfo) => {
      if (body.winners && body.winners.length > 0) {
        const latestWinner = body.winners.slice(-1)[0];
        setPrevWinner(latestWinner);
        const donMultiple = 2 ** body.winners.length;
        setGameMenuTitle(`P2P*${donMultiple}`);
      }
      const players = body.players ?? {};
      const p1 = players['Player 1'];
      const p2 = players['Player 2'];
      if (p1) {
        if (p1.name != null && p1.name.trim() !== '') setP1Name(p1.name.trim());
        if (p1.value !== undefined) {
          setPlayer1Sats(p1.value);
          if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
          setHighlightP1(true);
          highlightTimeoutRef.current = setTimeout(() => setHighlightP1(false), 1200);
        }
      }
      if (p2) {
        if (p2.name != null && p2.name.trim() !== '') setP2Name(p2.name.trim());
        if (p2.value !== undefined) {
          setPlayer2Sats(p2.value);
          if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
          setHighlightP2(true);
          highlightTimeoutRef.current = setTimeout(() => setHighlightP2(false), 1200);
        }
      }

      if (prevWinner) {
        const loser = prevWinner === 'Player 1' ? 'Player 2' : 'Player 1';
        const winnerValue = players[prevWinner]?.value ?? 0;
        const loserValue = players[loser]?.value ?? 0;
        setWinnerSats(winnerValue);
        setLoserSats(loserValue);
      }
    };
    socket.on('updatePayments', handler);
    return () => {
      socket.off('updatePayments', handler);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, [socket, prevWinner]);

  useEffect(() => {
    if (!socket) return;
    const handler = ({ sessionID }: { sessionID: string; userID: string }) => {
      sessionStorage.setItem('sessionID', sessionID);
    };
    socket.on('session', handler);
    return () => {
      socket.off('session', handler);
    };
  }, [socket]);

  useEffect(() => {
    [mainMenuButtonRef, startGameButtonRef, cancelGameAbortRef, cancelGameConfirmRef].forEach((ref, i) => {
      const key = (['mainMenuButton', 'startgame', 'cancelGameAbort', 'cancelGameConfirm'] as const)[i];
      if (ref.current) {
        ref.current.style.animationDuration = buttonSelected === key ? '2s' : '0s';
      }
    });
  }, [buttonSelected]);

  useEffect(() => {
    const canStartNow = prevWinner ? loserSats >= winnerSats : player1Sats !== 0 && player2Sats !== 0;
    if (canStartNow) {
      setButtonSelected('startgame');
    }
  }, [player1Sats, player2Sats, prevWinner, loserSats, winnerSats]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const canStartNow = prevWinner ? loserSats >= winnerSats : player1Sats !== 0 && player2Sats !== 0;
      if (e.key === 'Enter' || e.key === ' ') {
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
    const EXPAND_DEBOUNCE_MS = 180;
    const SCALE_DOWN_MS = 250;
    const handleKeyDownExpand = (e: KeyboardEvent) => {
      const now = Date.now();
      if (e.code === 'ControlLeft') {
        if (now - (expandKeyUpTimeRef.current.left ?? 0) < EXPAND_DEBOUNCE_MS) return;
        if (backdropTimeoutRef.current) clearTimeout(backdropTimeoutRef.current);
        setPlayer1CardExpanded(true);
        setQrBackdropVisible(true);
      }
      if (e.code === 'ControlRight') {
        if (now - (expandKeyUpTimeRef.current.right ?? 0) < EXPAND_DEBOUNCE_MS) return;
        if (backdropTimeoutRef.current) clearTimeout(backdropTimeoutRef.current);
        setPlayer2CardExpanded(true);
        setQrBackdropVisible(true);
      }
    };
    const handleKeyUpExpand = (e: KeyboardEvent) => {
      const now = Date.now();
      if (e.code === 'ControlLeft') {
        expandKeyUpTimeRef.current.left = now;
        setPlayer1CardExpanded(false);
        backdropTimeoutRef.current = setTimeout(() => setQrBackdropVisible(false), SCALE_DOWN_MS);
      }
      if (e.code === 'ControlRight') {
        expandKeyUpTimeRef.current.right = now;
        setPlayer2CardExpanded(false);
        backdropTimeoutRef.current = setTimeout(() => setQrBackdropVisible(false), SCALE_DOWN_MS);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keydown', handleKeyDownExpand);
    window.addEventListener('keyup', handleKeyUpExpand);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keydown', handleKeyDownExpand);
      window.removeEventListener('keyup', handleKeyUpExpand);
      if (backdropTimeoutRef.current) clearTimeout(backdropTimeoutRef.current);
    };
  }, [buttonSelected, player1Sats, player2Sats, socket, navigate, playSfx, prevWinner, loserSats, winnerSats]);

  const p1PayLink = payLinks?.find((p) => p.description === 'Player 1');
  const p2PayLink = payLinks?.find((p) => p.description === 'Player 2');
  const minP1 = p1PayLink?.min ?? 10000;
  const minP2 = p2PayLink?.min ?? 10000;
  const fmt = (n: number) => n.toLocaleString();
  const totalPrize = player1Sats + player2Sats;
  const hostCut = Math.floor(totalPrize * 0.02);
  const devCut = Math.floor(totalPrize * 0.02);
  const designCut = Math.floor(totalPrize * 0.01);
  const canStart = prevWinner ? loserSats >= winnerSats : player1Sats !== 0 && player2Sats !== 0;
  const mainMenuDisabled = player1Sats !== 0 || player2Sats !== 0;

  return (
    <>
      <GameSetupLayout
        title={gameMenuTitle}
        pageClass="gamemenu-page"
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
        mainMenuButtonRef={mainMenuButtonRef}
        startGameButtonRef={startGameButtonRef}
        cancelGameAbortRef={cancelGameAbortRef}
        cancelGameConfirmRef={cancelGameConfirmRef}
      >
        {qrBackdropVisible && (
          <div className="qr-expand-backdrop" aria-hidden />
        )}
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
                  size={180}
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
              Deposit between <b>{fmt(useNostr ? nostrMinP1 : minP1)}</b> and <b>10,000,000</b> sats
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
              <span id="leaderboardSats">{fmt(totalPrize + 1)}</span> sats qualifies for highscore
            </p>
          </div>
        </div>

        {useNostr && nostrNote1 && (
          <div className="prizeinfocard">
            <div className="label">NOSTR GAME EVENT</div>
            <div id="qrcodeContainerNostr" className="qrcodeContainer">
              <a
                id="qrcodeLinkNostr"
                href={`https://next.nostrudel.ninja/#/n/${nostrNote1}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <QRCodeSVG
                  id="qrcodeNostr"
                  className="qrcode"
                  value={`nostr:${nostrNote1}`}
                  size={180}
                  level="M"
                  includeMargin={false}
                />
              </a>
            </div>
            <div id="gameCodeNostr" className="condensed">
              {nostrCode}
            </div>
          </div>
        )}

        <div id="player2card" className={player2CardExpanded ? 'expanded' : ''}>
          <div id="player2cardinfo" className="player-card-info">
            <div id="player2satsContainer" className={`player-sats ${highlightP2 ? 'highlight' : ''}`}>
              <span id="player2sats">{fmt(player2Sats)}</span>
              <span className="grey sats-label">sats</span>
            </div>
            <div className="condensed">
              <div id="player2info" className={`player2info inline ${highlightP2 ? 'highlight' : ''}`}>
                {p2Name}
              </div>
              <div className="inline playerSquare black" />
            </div>
            <div className="deposit-message">
              Deposit between <b>{fmt(useNostr ? nostrMinP2 : minP2)}</b> and <b>10,000,000</b> sats
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
      </GameSetupLayout>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </>
  );
}
