import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useSocket } from '@/hooks/useSocket';
import { SocketBoundaryParsers } from '@/shared/socket/socketBoundary';
import { OnlineRoomSnapshot } from '@/types/socket';
import { useGamepad } from '@/hooks/useGamepad';
import { PixiGameRenderer } from '@/game/render/pixiRenderer';
import { startMempoolFeed, type BitcoinDetails } from '@/game/io/mempool';
import type { GameState } from '@/game/engine/types';
import './game.css';
import '@/styles/pages/onlineGame.css';

export default function OnlineGame() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { socket } = useSocket({ autoConnect: true });
  const roomId = searchParams.get('roomId') ?? '';
  const [snapshot, setSnapshot] = useState<OnlineRoomSnapshot | null>(null);
  const snapshotRef = useRef<OnlineRoomSnapshot | null>(null);
  const rendererRef = useRef<PixiGameRenderer | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [bitcoin, setBitcoin] = useState<BitcoinDetails>({
    height: '000000',
    timeAgo: '0 secs ago',
    size: '0.00 Mb',
    txCount: '0000',
    miner: 'Miner',
    medianFee: '00 sat/vb',
  });
  const [roomInfo, setRoomInfo] = useState<{
    hostSessionID?: string;
    roomCode?: string;
    phase?: string;
    buyin?: number;
    p1Name?: string;
    p2Name?: string;
    p1Picture?: string;
    p2Picture?: string;
    p1Paid?: number;
    p2Paid?: number;
  } | null>(null);

  useGamepad(true);

  useEffect(() => {
    if (roomId) return;
    navigate('/online');
  }, [navigate, roomId]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (!hostRef.current) return;
    const renderer = new PixiGameRenderer();
    rendererRef.current = renderer;
    let detachResize: (() => void) | undefined;
    void renderer.mount(hostRef.current).then(() => {
      renderer.resize();
      const onResize = () => renderer.resize();
      window.addEventListener('resize', onResize);
      detachResize = () => window.removeEventListener('resize', onResize);
    });
    let raf = 0;
    const frame = () => {
      if (snapshotRef.current?.state && rendererRef.current) {
        rendererRef.current.render(snapshotRef.current.state as GameState);
      }
      raf = window.requestAnimationFrame(frame);
    };
    raf = window.requestAnimationFrame(frame);
    return () => {
      if (detachResize) detachResize();
      window.cancelAnimationFrame(raf);
      renderer.destroy();
    };
  }, []);

  useEffect(() => {
    if (!socket || !roomId) {
      return;
    }
    const onSnapshot = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.onlineRoomSnapshot(payload);
      if (parsed && parsed.roomId === roomId) {
        setSnapshot(parsed.snapshot);
      }
    };
    const onUpdated = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.onlineRoomUpdated(payload);
      if (parsed && parsed.roomId === roomId) {
        setSnapshot(parsed.snapshot);
        const p1 = parsed.seats['Player 1'];
        const p2 = parsed.seats['Player 2'];
        setRoomInfo({
          hostSessionID: parsed.hostSessionID,
          roomCode: parsed.roomCode,
          phase: parsed.phase,
          buyin: parsed.buyin,
          p1Name: p1?.name ?? 'Player 1',
          p2Name: p2?.name ?? 'Player 2',
          p1Picture: p1?.picture,
          p2Picture: p2?.picture,
          p1Paid: p1?.paidAmount,
          p2Paid: p2?.paidAmount,
        });
      }
    };
    socket.on('onlineRoomSnapshot', onSnapshot);
    socket.on('onlineRoomUpdated', onUpdated);
    socket.emit('spectateOnlineRoom', { roomId });
    socket.emit('getOnlineRoomState', { roomId });
    return () => {
      socket.off('onlineRoomSnapshot', onSnapshot);
      socket.off('onlineRoomUpdated', onUpdated);
    };
  }, [roomId, socket]);

  useEffect(() => {
    const stopFeed = startMempoolFeed({
      onInit: (details) => {
        setBitcoin((prev) => ({
          height: details.height || prev.height,
          timeAgo: details.timeAgo || prev.timeAgo,
          size: details.size || prev.size,
          txCount: details.txCount || prev.txCount,
          miner: details.miner || prev.miner,
          medianFee: details.medianFee || prev.medianFee,
        }));
      },
      onNewBlock: (_block, details) => {
        setBitcoin(details);
      },
    });
    return () => stopFeed();
  }, []);

  useEffect(() => {
    if (!socket || !roomId) {
      return;
    }
    const keyToInput = (key: string) => {
      switch (key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          return { up: true };
        case 'ArrowDown':
        case 's':
        case 'S':
          return { down: true };
        case 'ArrowLeft':
        case 'a':
        case 'A':
          return { left: true };
        case 'ArrowRight':
        case 'd':
        case 'D':
          return { right: true };
        default:
          return null;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (snapshotRef.current?.state?.gameEnded) {
        navigate(`/online/postgame?roomId=${encodeURIComponent(roomId)}`);
        return;
      }
      const input = keyToInput(event.key);
      if (!input) {
        return;
      }
      socket.emit('roomInput', { roomId, input });
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const input = keyToInput(event.key);
      if (!input) {
        return;
      }
      socket.emit('roomInput', {
        roomId,
        input: { up: false, down: false, left: false, right: false },
      });
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [navigate, roomId, socket]);

  const canAttemptContinue = Boolean(snapshot?.state?.gameEnded);

  return (
    <>
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      <div id="gameContainer" className="flex full game">
        <div>
          <div className="flex players">
            <div id="player1info" className="condensed">
              <div className="inline playerSquare white" />
              <img
                className={`inline playerImg ${roomInfo?.p1Picture ? '' : 'hide'}`}
                src={roomInfo?.p1Picture || '/images/loading.gif'}
                alt=""
              />
              <div className="inline" id="player1name">
                {roomInfo?.p1Name || 'Player 1'}
              </div>
            </div>
            <div id="gameInfo" className="outline condensed">
              ONLINE {roomInfo?.roomCode ? `· ${roomInfo.roomCode}` : ''}
            </div>
            <div id="player2info" className="condensed">
              <div className="inline" id="player2name">
                {roomInfo?.p2Name || 'Player 2'}
              </div>
              <img
                className={`inline playerImg ${roomInfo?.p2Picture ? '' : 'hide'}`}
                src={roomInfo?.p2Picture || '/images/loading.gif'}
                alt=""
              />
              <div className="inline playerSquare black" />
            </div>
          </div>

          <div className="gameState">
            <div id="capturing">
              <div id="capturingP1">
                <span className="capturingAmount">
                  {snapshot?.hud.captureP1 ?? '2%'}
                </span>{' '}
                capture
              </div>
              <div id="capturingP2">
                capture{' '}
                <span className="capturingAmount">
                  {snapshot?.hud.captureP2 ?? '2%'}
                </span>
              </div>
            </div>

            <div id="distributions">
              <div id="initialDistribution" className="distributionBarOutter">
                <div className="distributionTitle">Initial Distribution</div>
                <div
                  id="initialDistributionP1"
                  className="distributionBar"
                  style={{ width: `${snapshot?.hud.initialWidthP1 ?? 50}%` }}
                />
                <div
                  id="initialDistributionP2"
                  className="distributionBar"
                  style={{ width: `${snapshot?.hud.initialWidthP2 ?? 50}%` }}
                />
              </div>
              <div id="currentDistribution" className="distributionBarOutter">
                <div className="distributionTitle">Current Distribution</div>
                <div
                  id="currentDistributionP1"
                  className="distributionBar"
                  style={{ width: `${snapshot?.hud.currentWidthP1 ?? 50}%` }}
                />
                <div
                  id="currentDistributionP2"
                  className="distributionBar"
                  style={{ width: `${snapshot?.hud.currentWidthP2 ?? 50}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex points">
            <div className="player-sats player-sats-p1">
              <span id="p1Points" className="condensed">
                {Math.floor(snapshot?.hud.p1Points ?? roomInfo?.p1Paid ?? roomInfo?.buyin ?? 0).toLocaleString()}
              </span>{' '}
              <span className="grey">sats</span>
            </div>
            <Sponsorship id="sponsorshipGame" showLabel={false} />
            <div className="player-sats player-sats-p2">
              <span className="grey">sats</span>{' '}
              <span id="p2Points" className="condensed">
                {Math.floor(snapshot?.hud.p2Points ?? roomInfo?.p2Paid ?? roomInfo?.buyin ?? 0).toLocaleString()}
              </span>
            </div>
          </div>

          <div id="gameCanvas">
            <div
              id="gameCanvasHost"
              ref={hostRef}
              onClick={() => {
                if (canAttemptContinue) {
                  navigate(`/online/postgame?roomId=${encodeURIComponent(roomId)}`);
                }
              }}
            />
          </div>

          <div id="bitcoinDetails">
            <div className="detail">
              <div className="label">Latest Block</div>
              <div className="value">{bitcoin.height}</div>
            </div>
            <div className="detail">
              <div className="label">Found</div>
              <div className="value">{bitcoin.timeAgo}</div>
            </div>
            <div className="detail">
              <div className="label">Size</div>
              <div className="value">{bitcoin.size}</div>
            </div>
            <div className="detail">
              <div className="label">TX count</div>
              <div className="value">{bitcoin.txCount}</div>
            </div>
            <div className="detail">
              <div className="label">Median fee</div>
              <div className="value">{bitcoin.medianFee}</div>
            </div>
          </div>

        </div>
      </div>

      <div className={`overlay ${snapshot ? 'hide' : ''}`} id="loading">
        <img src="/images/loading.gif" alt="Loading" />
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay={true} />
    </>
  );
}
