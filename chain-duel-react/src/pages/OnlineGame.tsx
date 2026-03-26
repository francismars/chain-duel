import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useSocket } from '@/hooks/useSocket';
import { SocketBoundaryParsers } from '@/shared/socket/socketBoundary';
import type { OnlineReplayBlockEvent, OnlineRoomSnapshot } from '@/types/socket';
import { useGamepad } from '@/hooks/useGamepad';
import { GameAudioSystem } from '@/game/audio/gameAudio';
import { PixiGameRenderer } from '@/game/render/pixiRenderer';
import { expandOnlineReplayWire } from '@/replay/expandOnlineReplayWire';
import { normalizeOnlineRoomSnapshot } from '@/game/online/normalizeOnlineSnapshot';
import { onlinePingAccent } from '@/game/online/onlinePingAccent';
import { startMempoolFeed, type BitcoinDetails } from '@/game/io/mempool';
import type { GameState } from '@/game/engine/types';
import './game.css';
import '@/styles/pages/onlineGame.css';

const REPLAY_SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4, 8, 16, 32, 64] as const;

export default function OnlineGame() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { socket } = useSocket({ autoConnect: true });
  const roomId = searchParams.get('roomId') ?? '';
  const replayMode = searchParams.get('replay') === '1';
  const replayMatchRound = (() => {
    const r = searchParams.get('round');
    if (!r) {
      return undefined;
    }
    const n = Number.parseInt(r, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  })();
  const [snapshot, setSnapshot] = useState<OnlineRoomSnapshot | null>(null);
  const snapshotRef = useRef<OnlineRoomSnapshot | null>(null);
  const rendererRef = useRef<PixiGameRenderer | null>(null);
  const [hostEl, setHostEl] = useState<HTMLDivElement | null>(null);
  const pointAnimationsRef = useRef<OnlinePointAnim[]>([]);
  const prevPointCountByKeyRef = useRef<Map<string, number>>(new Map());
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
    p1SessionID?: string;
    p2SessionID?: string;
    p1SocketID?: string;
    p2SocketID?: string;
    p1PingMs?: number;
    p2PingMs?: number;
  } | null>(null);
  const [currentSessionID, setCurrentSessionID] = useState(
    () => sessionStorage.getItem('sessionID') ?? ''
  );
  const [currentSocketID, setCurrentSocketID] = useState('');
  const [replayFrames, setReplayFrames] = useState<OnlineRoomSnapshot[]>([]);
  const [replayTickMs, setReplayTickMs] = useState(100);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [replayLoaded, setReplayLoaded] = useState(false);
  const [replayError, setReplayError] = useState('');
  /** Server-recorded mempool block cosmetics, keyed by replay frame index. */
  const [replayBlockEvents, setReplayBlockEvents] = useState<OnlineReplayBlockEvent[]>([]);
  /** Set to true while the speed picker dropdown is open so the global key handler yields to it. */
  const replaySpeedOpenRef = useRef(false);
  const audioRef = useRef<GameAudioSystem | null>(null);
  if (!audioRef.current) {
    audioRef.current = new GameAudioSystem();
  }
  const [canvasHighlight, setCanvasHighlight] = useState(false);
  const [footerHighlight, setFooterHighlight] = useState(false);
  const keysHeldRef = useRef({
    up: false,
    down: false,
    left: false,
    right: false,
  });
  const replayViewRef = useRef(replayMode);
  replayViewRef.current = replayMode;

  useGamepad(true);

  useEffect(() => {
    if (roomId) return;
    navigate('/network');
  }, [navigate, roomId]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (!hostEl) return;
    const renderer = new PixiGameRenderer();
    rendererRef.current = renderer;
    let cancelled = false;
    let detachResize: (() => void) | undefined;
    void renderer.mount(hostEl).then(() => {
      if (cancelled) {
        renderer.destroy();
        return;
      }
      renderer.resize();
      const onResize = () => renderer.resize();
      window.addEventListener('resize', onResize);
      detachResize = () => window.removeEventListener('resize', onResize);
    });
    let raf = 0;
    const frame = () => {
      if (snapshotRef.current?.state && rendererRef.current) {
        const raw = snapshotRef.current.state as GameState;
        const renderState =
          raw.meta?.modeLabel === 'ONLINE'
            ? withOnlinePointAnimations(raw, pointAnimationsRef.current)
            : raw;
        rendererRef.current.render(renderState, { replayView: replayViewRef.current });
      }
      raf = window.requestAnimationFrame(frame);
    };
    raf = window.requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      if (detachResize) detachResize();
      window.cancelAnimationFrame(raf);
      renderer.destroy();
    };
  }, [hostEl]);

  useEffect(() => {
    if (!socket || !roomId) {
      return;
    }
    const refreshLocalIdentity = () => {
      setCurrentSessionID(sessionStorage.getItem('sessionID') ?? '');
      setCurrentSocketID(socket.id ?? '');
    };
    const onSession = (payload: { sessionID: string }) => {
      if (!payload?.sessionID) {
        return;
      }
      setCurrentSessionID(payload.sessionID);
      sessionStorage.setItem('sessionID', payload.sessionID);
      setCurrentSocketID(socket.id ?? '');
    };
    const requestRoomSync = () => {
      socket.emit('spectateOnlineRoom', { roomId });
      socket.emit(
        'getOnlineRoomState',
        replayMode && replayMatchRound != null
          ? { roomId, matchRound: replayMatchRound }
          : { roomId }
      );
      if (replayMode) {
        socket.emit(
          'getOnlineReplay',
          replayMatchRound != null ? { roomId, matchRound: replayMatchRound } : { roomId }
        );
      }
    };
    const onSnapshot = (payload: unknown) => {
      if (replayMode) {
        return;
      }
      const parsed = SocketBoundaryParsers.onlineRoomSnapshot(payload) ?? coerceOnlineRoomSnapshotEvent(payload);
      if (parsed && parsed.roomId === roomId) {
        setSnapshot((prev) => {
          const snap = normalizeOnlineRoomSnapshot(parsed.snapshot);
          const merged = mergeOnlineSnapshot(prev, snap);
          ingestOnlinePointChanges(merged, pointAnimationsRef.current, prevPointCountByKeyRef.current);
          return merged;
        });
      }
    };
    const onUpdated = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.onlineRoomUpdated(payload) ?? coerceOnlineRoomUpdated(payload);
      if (parsed && parsed.roomId === roomId) {
        if (!replayMode) {
          setSnapshot((prev) => {
            const snap = normalizeOnlineRoomSnapshot(parsed.snapshot);
            const merged = mergeOnlineSnapshot(prev, snap);
            ingestOnlinePointChanges(merged, pointAnimationsRef.current, prevPointCountByKeyRef.current);
            return merged;
          });
        }
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
          p1SessionID: p1?.sessionID,
          p2SessionID: p2?.sessionID,
          p1SocketID: p1?.socketID,
          p2SocketID: p2?.socketID,
          p1PingMs: typeof p1?.pingMs === 'number' ? p1.pingMs : undefined,
          p2PingMs: typeof p2?.pingMs === 'number' ? p2.pingMs : undefined,
        });
      }
    };
    const onReplay = (payload: unknown) => {
      if (!replayMode) {
        return;
      }
      const parsed = SocketBoundaryParsers.onlineReplay(payload);
      if (!parsed || parsed.roomId !== roomId) {
        return;
      }
      void (async () => {
        try {
          const frames = await expandOnlineReplayWire(parsed);
          setReplayTickMs(Math.max(10, parsed.tickMs));
          setReplayFrames(frames);
          setReplayBlockEvents(parsed.blockEvents ?? []);
          setReplayIndex(0);
          setReplayPlaying(false);
          setReplayLoaded(true);
          setReplayError(frames.length === 0 ? 'Replay has no frames.' : '');
          const first = frames[0] ?? null;
          if (first) {
            setSnapshot(first);
          }
        } catch {
          setReplayLoaded(true);
          setReplayBlockEvents([]);
          setReplayError('Failed to decode replay.');
        }
      })();
    };
    const onInvalid = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.onlinePinInvalid(payload);
      if (!parsed || !replayMode) {
        return;
      }
      if (parsed.reason === 'replay_unavailable') {
        setReplayLoaded(true);
        setReplayError('Replay not available for this room yet.');
      }
    };
    socket.on('onlineRoomSnapshot', onSnapshot);
    socket.on('onlineRoomUpdated', onUpdated);
    socket.on('resOnlineReplay', onReplay);
    socket.on('onlinePinInvalid', onInvalid);
    socket.on('session', onSession);
    socket.on('connect', refreshLocalIdentity);
    socket.on('connect', requestRoomSync);
    refreshLocalIdentity();
    requestRoomSync();
    // Recovery for late socket readiness: keep requesting until first snapshot lands.
    const resyncInterval = window.setInterval(() => {
      if (replayMode) {
        if (replayLoaded) {
          window.clearInterval(resyncInterval);
        } else {
          requestRoomSync();
        }
        return;
      }
      if (snapshotRef.current) {
        window.clearInterval(resyncInterval);
        return;
      }
      requestRoomSync();
    }, 1200);
    return () => {
      window.clearInterval(resyncInterval);
      socket.off('onlineRoomSnapshot', onSnapshot);
      socket.off('onlineRoomUpdated', onUpdated);
      socket.off('resOnlineReplay', onReplay);
      socket.off('onlinePinInvalid', onInvalid);
      socket.off('session', onSession);
      socket.off('connect', refreshLocalIdentity);
      socket.off('connect', requestRoomSync);
    };
  }, [replayLoaded, replayMatchRound, replayMode, roomId, socket]);

  useEffect(() => {
    if (!replayMode || !replayPlaying || replayFrames.length === 0) {
      return;
    }
    // Fixed step + fractional accumulator so 16x/32x/64x actually advance faster than the old
    // Math.max(15, tick/speed) cap (which topped out around ~6–7× when tickMs was ~100).
    const intervalMs = 16;
    let acc = 0;
    const timer = window.setInterval(() => {
      acc += (replaySpeed * intervalMs) / replayTickMs;
      const steps = Math.floor(acc);
      if (steps < 1) {
        return;
      }
      acc -= steps;
      setReplayIndex((prev) => {
        const next = Math.min(prev + steps, replayFrames.length - 1);
        if (next >= replayFrames.length - 1) {
          setReplayPlaying(false);
        }
        const frame = replayFrames[next];
        if (frame) {
          setSnapshot(frame);
        }
        return next;
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [replayFrames, replayMode, replayPlaying, replaySpeed, replayTickMs]);

  useEffect(() => {
    if (!replayMode || replayFrames.length === 0) {
      return;
    }
    const hits = replayBlockEvents.filter((e) => e.frameIndex === replayIndex);
    if (hits.length === 0) {
      return;
    }
    audioRef.current?.playBlockFound();
    setCanvasHighlight(true);
    setFooterHighlight(true);
    const t1 = window.setTimeout(() => setCanvasHighlight(false), 1000);
    const t2 = window.setTimeout(() => setFooterHighlight(false), 2000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [replayBlockEvents, replayIndex, replayFrames.length, replayMode]);

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
    if (!socket || replayMode || !roomId) {
      return;
    }
    const measure = () => {
      const t0 = Date.now();
      socket.emit('pingLatency', () => {
        const ms = Date.now() - t0;
        socket.emit('reportOnlineRoomPing', { roomId, latencyMs: ms });
      });
    };
    measure();
    const id = window.setInterval(measure, 2500);
    return () => window.clearInterval(id);
  }, [socket, replayMode, roomId]);

  useEffect(() => {
    if (!socket || replayMode || !roomId) {
      return;
    }
    const onBitcoinBlock = (payload: {
      roomId: string;
      blockHeight: number;
      medianFeeSatPerVb: number;
    }) => {
      if (payload.roomId !== roomId) {
        return;
      }
      audioRef.current?.playBlockFound();
      setCanvasHighlight(true);
      setFooterHighlight(true);
      window.setTimeout(() => setCanvasHighlight(false), 1000);
      window.setTimeout(() => setFooterHighlight(false), 2000);
    };
    socket.on('onlineBitcoinBlock', onBitcoinBlock);
    return () => {
      socket.off('onlineBitcoinBlock', onBitcoinBlock);
    };
  }, [socket, replayMode, roomId]);

  useEffect(() => {
    if (!socket || !roomId) {
      return;
    }

    const axisForKey = (key: string): 'up' | 'down' | 'left' | 'right' | null => {
      switch (key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          return 'up';
        case 'ArrowDown':
        case 's':
        case 'S':
          return 'down';
        case 'ArrowLeft':
        case 'a':
        case 'A':
          return 'left';
        case 'ArrowRight':
        case 'd':
        case 'D':
          return 'right';
        default:
          return null;
      }
    };

    const emitHeldInput = () => {
      const k = keysHeldRef.current;
      socket.emit('roomInput', {
        roomId,
        input: { up: k.up, down: k.down, left: k.left, right: k.right },
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!replayMode && snapshotRef.current?.state?.gameEnded) {
        navigate(`/network/postgame?roomId=${encodeURIComponent(roomId)}`);
        return;
      }
      if (replayMode) {
        return;
      }
      const axis = axisForKey(event.key);
      if (!axis) {
        return;
      }
      if (
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown' ||
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight'
      ) {
        event.preventDefault();
      }
      keysHeldRef.current[axis] = true;
      emitHeldInput();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (replayMode) {
        return;
      }
      const axis = axisForKey(event.key);
      if (!axis) {
        return;
      }
      if (
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown' ||
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight'
      ) {
        event.preventDefault();
      }
      keysHeldRef.current[axis] = false;
      emitHeldInput();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [navigate, replayMode, roomId, socket]);

  // ── Replay keyboard navigation ──────────────────────────────────────────
  useEffect(() => {
    if (!replayMode) return;

    const SCRUB = Math.max(1, Math.round(replayFrames.length * 0.03)); // ~3 % of total

    const onKey = (event: KeyboardEvent) => {
      // Let speed picker handle its own keys when the dropdown is open
      if (replaySpeedOpenRef.current) return;
      // Let native range slider handle its own keys when focused
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT') return;

      switch (event.key) {
        case ' ':
        case 'Enter': {
          event.preventDefault();
          if (!replayFrames.length) break;
          setReplayPlaying((prev) => {
            if (prev) return false;
            // restart from top if at end
            if (replayIndex >= replayFrames.length - 1) {
              setReplayIndex(0);
              setSnapshot(replayFrames[0] ?? null);
            }
            return true;
          });
          break;
        }
        case 'ArrowLeft': {
          event.preventDefault();
          setReplayPlaying(false);
          const prev = Math.max(0, replayIndex - SCRUB);
          setReplayIndex(prev);
          if (replayFrames[prev]) setSnapshot(replayFrames[prev]);
          break;
        }
        case 'ArrowRight': {
          event.preventDefault();
          const next = Math.min(replayFrames.length - 1, replayIndex + SCRUB);
          setReplayIndex(next);
          if (replayFrames[next]) setSnapshot(replayFrames[next]);
          break;
        }
        case 'ArrowUp': {
          event.preventDefault();
          setReplaySpeed((prev) => {
            const idx = (REPLAY_SPEEDS as readonly number[]).indexOf(prev);
            return idx < REPLAY_SPEEDS.length - 1 ? REPLAY_SPEEDS[idx + 1] : prev;
          });
          break;
        }
        case 'ArrowDown': {
          event.preventDefault();
          setReplaySpeed((prev) => {
            const idx = (REPLAY_SPEEDS as readonly number[]).indexOf(prev);
            return idx > 0 ? REPLAY_SPEEDS[idx - 1] : prev;
          });
          break;
        }
        case 'r':
        case 'R': {
          event.preventDefault();
          setReplayPlaying(false);
          setReplayIndex(0);
          if (replayFrames[0]) setSnapshot(replayFrames[0]);
          break;
        }
        case 'v':
        case 'V': {
          event.preventDefault();
          setReplayPlaying(false);
          navigate(`/network/postgame?roomId=${encodeURIComponent(roomId)}`);
          break;
        }
        case 'Escape': {
          setReplayPlaying(false);
          navigate('/network');
          break;
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [replayMode, replayFrames, replayIndex, navigate, roomId, setSnapshot]);

  const canAttemptContinue = Boolean(snapshot?.state?.gameEnded);
  const effectiveSessionID = currentSessionID || sessionStorage.getItem('sessionID') || '';
  const isP1 =
    (roomInfo?.p1SessionID && roomInfo.p1SessionID === effectiveSessionID) ||
    (roomInfo?.p1SocketID && roomInfo.p1SocketID === currentSocketID);
  const isP2 =
    (roomInfo?.p2SessionID && roomInfo.p2SessionID === effectiveSessionID) ||
    (roomInfo?.p2SocketID && roomInfo.p2SocketID === currentSocketID);
  const replayDurationSec = replayFrames.length > 0 ? (replayFrames.length * replayTickMs) / 1000 : 0;
  const replayPositionSec = replayFrames.length > 0 ? (replayIndex * replayTickMs) / 1000 : 0;

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
              {isP1 ? <span className="online-game-you-tag">YOU</span> : null}
            </div>
            <div id="gameInfo" className="outline condensed">
              MAINNET{roomInfo?.roomCode ? ` · ${roomInfo.roomCode}` : ''}
              {replayMode ? ' · REPLAY MODE' : ''}
            </div>
            <div id="player2info" className="condensed">
              {isP2 ? <span className="online-game-you-tag">YOU</span> : null}
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
                {!replayMode && roomInfo?.p1PingMs != null ? (
                  <span
                    className={`online-game-ping-badge online-game-ping online-game-ping--${onlinePingAccent(
                      roomInfo.p1PingMs
                    )}`}
                    title="Player 1 round-trip to server"
                  >
                    {roomInfo.p1PingMs}ms
                  </span>
                ) : null}
              </div>
              <div id="capturingP2">
                {!replayMode && roomInfo?.p2PingMs != null ? (
                  <span
                    className={`online-game-ping-badge online-game-ping-badge--mirror online-game-ping online-game-ping--${onlinePingAccent(
                      roomInfo.p2PingMs
                    )}`}
                    title="Player 2 round-trip to server"
                  >
                    {roomInfo.p2PingMs}ms
                  </span>
                ) : null}
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

          <div id="gameCanvas" className={canvasHighlight ? 'highlight' : ''}>
            <div
              id="gameCanvasHost"
              ref={setHostEl}
              onClick={() => {
                if (!replayMode && canAttemptContinue) {
                  navigate(`/network/postgame?roomId=${encodeURIComponent(roomId)}`);
                }
              }}
            />
          </div>
          {replayMode ? (
            <div className="online-replay-controls">
              <input
                className="online-replay-slider"
                type="range"
                min={0}
                max={Math.max(0, replayFrames.length - 1)}
                value={Math.min(replayIndex, Math.max(0, replayFrames.length - 1))}
                onChange={(event) => {
                  const idx = Number(event.target.value);
                  setReplayPlaying(false);
                  setReplayIndex(idx);
                  const frame = replayFrames[idx];
                  if (frame) {
                    setSnapshot(frame);
                  }
                }}
                disabled={!replayFrames.length}
              />
              <div className="online-replay-toprow">
                <button
                  type="button"
                  className="online-replay-btn"
                  onClick={() => {
                    if (!replayFrames.length) return;
                    if (replayPlaying) {
                      setReplayPlaying(false);
                      return;
                    }
                    const last = replayFrames.length - 1;
                    if (last >= 0 && replayIndex >= last) {
                      setReplayIndex(0);
                      setSnapshot(replayFrames[0] ?? null);
                    }
                    setReplayPlaying(true);
                  }}
                  disabled={!replayFrames.length}
                >
                  <span className="online-replay-btn__icon" aria-hidden>
                    {replayPlaying ? <ReplayIconPause /> : <ReplayIconPlay />}
                  </span>
                  <span className="online-replay-btn__label">{replayPlaying ? 'PAUSE' : 'PLAY'}</span>
                </button>
                <button
                  type="button"
                  className="online-replay-btn"
                  onClick={() => {
                    if (!replayFrames.length) return;
                    setReplayPlaying(false);
                    setReplayIndex(0);
                    setSnapshot(replayFrames[0] ?? null);
                  }}
                  disabled={!replayFrames.length}
                >
                  <span className="online-replay-btn__icon" aria-hidden>
                    <ReplayIconRestart />
                  </span>
                  <span className="online-replay-btn__label">RESTART</span>
                </button>
                <button
                  type="button"
                  className="online-replay-btn"
                  onClick={() => {
                    setReplayPlaying(false);
                    navigate(`/network/postgame?roomId=${encodeURIComponent(roomId)}`);
                  }}
                >
                  <span className="online-replay-btn__icon" aria-hidden>
                    <ReplayIconBackToRoom />
                  </span>
                  <span className="online-replay-btn__label">VICTORY SCREEN</span>
                </button>
                <button
                  type="button"
                  className="online-replay-btn"
                  onClick={() => {
                    setReplayPlaying(false);
                    navigate('/network');
                  }}
                >
                  <span className="online-replay-btn__icon" aria-hidden>
                    <ReplayIconExitRoom />
                  </span>
                  <span className="online-replay-btn__label">EXIT ROOM</span>
                </button>
                <div className="online-replay-trailing">
                  <ReplaySpeedPicker
                    value={replaySpeed}
                    onChange={setReplaySpeed}
                    onOpenChange={(o) => { replaySpeedOpenRef.current = o; }}
                  />
                  <div className="online-replay-time" aria-label="Replay position">
                    {formatSeconds(replayPositionSec)} / {formatSeconds(replayDurationSec)}
                  </div>
                </div>
              </div>
              {replayError ? <div className="online-replay-error">{replayError}</div> : null}
            </div>
          ) : null}

          <div id="bitcoinDetails" className={footerHighlight ? 'highlight' : ''}>
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

      <div className={`overlay ${snapshot || (replayMode && replayLoaded) ? 'hide' : ''}`} id="loading">
        <img src="/images/loading.gif" alt="Loading" />
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay={true} />
    </>
  );
}

function coerceOnlineRoomSnapshotEvent(payload: unknown):
  | { roomId: string; snapshot: OnlineRoomSnapshot }
  | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const candidate = payload as { roomId?: unknown; snapshot?: unknown };
  if (typeof candidate.roomId !== 'string') {
    return null;
  }
  if (!candidate.snapshot || typeof candidate.snapshot !== 'object') {
    return null;
  }
  return {
    roomId: candidate.roomId,
    snapshot: candidate.snapshot as OnlineRoomSnapshot,
  };
}

function coerceOnlineRoomUpdated(payload: unknown):
  | {
      roomId: string;
      roomCode?: string;
      hostSessionID?: string;
      phase?: string;
      buyin?: number;
      snapshot: OnlineRoomSnapshot;
      seats: Record<
        string,
        {
          name?: string;
          picture?: string;
          paidAmount?: number;
          sessionID?: string;
          socketID?: string;
          pingMs?: number;
        }
      >;
    }
  | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const candidate = payload as {
    roomId?: unknown;
    roomCode?: unknown;
    hostSessionID?: unknown;
    phase?: unknown;
    buyin?: unknown;
    snapshot?: unknown;
    seats?: unknown;
  };
  if (typeof candidate.roomId !== 'string') {
    return null;
  }
  if (!candidate.snapshot || typeof candidate.snapshot !== 'object') {
    return null;
  }
  const seats =
    candidate.seats && typeof candidate.seats === 'object'
      ? (candidate.seats as Record<string, {
          name?: string;
          picture?: string;
          paidAmount?: number;
          sessionID?: string;
          socketID?: string;
          pingMs?: number;
        }>)
      : {};
  return {
    roomId: candidate.roomId,
    roomCode: typeof candidate.roomCode === 'string' ? candidate.roomCode : undefined,
    hostSessionID: typeof candidate.hostSessionID === 'string' ? candidate.hostSessionID : undefined,
    phase: typeof candidate.phase === 'string' ? candidate.phase : undefined,
    buyin: typeof candidate.buyin === 'number' ? candidate.buyin : undefined,
    snapshot: candidate.snapshot as OnlineRoomSnapshot,
    seats,
  };
}

function mergeOnlineSnapshot(prev: OnlineRoomSnapshot | null, next: OnlineRoomSnapshot): OnlineRoomSnapshot {
  if (!prev?.state || !next?.state) {
    return next;
  }
  const prevPointChanges = getPointChanges(prev.state);
  const nextPointChanges = getPointChanges(next.state);
  if (prevPointChanges.length === 0 || nextPointChanges.length === 0) {
    return next;
  }

  const prevByKey = new Map<string, Array<PointChangeLike>>();
  for (const change of prevPointChanges) {
    const key = pointChangeKey(change);
    const bucket = prevByKey.get(key);
    if (bucket) {
      bucket.push(change);
    } else {
      prevByKey.set(key, [change]);
    }
  }

  const mergedPointChanges = nextPointChanges.map((incoming) => {
    const key = pointChangeKey(incoming);
    const bucket = prevByKey.get(key);
    const previous = bucket?.shift();
    if (!previous) {
      return incoming;
    }
    return {
      ...incoming,
      // Never move a popup backwards between snapshots.
      p1YOffsetPx: Math.min(incoming.p1YOffsetPx ?? 0, previous.p1YOffsetPx ?? 0),
      p2YOffsetPx: Math.min(incoming.p2YOffsetPx ?? 0, previous.p2YOffsetPx ?? 0),
      alpha: Math.min(incoming.alpha ?? 1, previous.alpha ?? 1),
    };
  });

  return {
    ...next,
    state: {
      ...(next.state as Record<string, unknown>),
      pointChanges: mergedPointChanges,
    },
  };
}

function pointChangeKey(change: PointChangeLike): string {
  const player = change?.player ?? '';
  const value = change?.value ?? 0;
  const p1 = Array.isArray(change?.p1Pos) ? `${change.p1Pos[0]}:${change.p1Pos[1]}` : 'x:y';
  const p2 = Array.isArray(change?.p2Pos) ? `${change.p2Pos[0]}:${change.p2Pos[1]}` : 'x:y';
  return `${player}|${value}|${p1}|${p2}`;
}

type OnlinePointAnim = {
  key: string;
  player: 'P1' | 'P2';
  value: number;
  p1Pos: [number, number];
  p2Pos: [number, number];
  startedAtMs: number;
};

const ONLINE_POINT_ANIM_MS = 650;
const ONLINE_POINT_RISE_PX = 52;

function ingestOnlinePointChanges(
  snapshot: OnlineRoomSnapshot,
  pointAnimations: OnlinePointAnim[],
  prevPointCountByKey: Map<string, number>
) {
  const state = snapshot.state as Record<string, unknown> | null;
  const modeLabel = (state?.meta as { modeLabel?: string } | undefined)?.modeLabel;
  if (modeLabel !== 'ONLINE') {
    return;
  }
  const incoming = getPointChanges(snapshot.state);
  const nextCountByKey = new Map<string, number>();
  for (const change of incoming) {
    const key = pointChangeKey(change);
    nextCountByKey.set(key, (nextCountByKey.get(key) ?? 0) + 1);
  }

  for (const [key, nextCount] of nextCountByKey.entries()) {
    const prevCount = prevPointCountByKey.get(key) ?? 0;
    const toSpawn = Math.max(0, nextCount - prevCount);
    if (toSpawn <= 0) {
      continue;
    }
    const source = incoming.find((change) => pointChangeKey(change) === key);
    if (!source) {
      continue;
    }
    for (let i = 0; i < toSpawn; i += 1) {
      pointAnimations.push({
        key,
        player: source.player,
        value: source.value,
        p1Pos: source.p1Pos,
        p2Pos: source.p2Pos,
        startedAtMs: performance.now(),
      });
    }
  }
  prevPointCountByKey.clear();
  for (const [key, count] of nextCountByKey.entries()) {
    prevPointCountByKey.set(key, count);
  }
}

type PointChangeLike = {
  player: 'P1' | 'P2';
  value: number;
  p1Pos: [number, number];
  p2Pos: [number, number];
  p1YOffsetPx?: number;
  p2YOffsetPx?: number;
  alpha?: number;
};

function isPointChangeLike(value: unknown): value is PointChangeLike {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<PointChangeLike>;
  return (
    (v.player === 'P1' || v.player === 'P2') &&
    typeof v.value === 'number' &&
    Array.isArray(v.p1Pos) &&
    v.p1Pos.length === 2 &&
    Array.isArray(v.p2Pos) &&
    v.p2Pos.length === 2
  );
}

function getPointChanges(state: unknown): PointChangeLike[] {
  if (!state || typeof state !== 'object') return [];
  const raw = (state as { pointChanges?: unknown }).pointChanges;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isPointChangeLike);
}

function withOnlinePointAnimations(
  baseState: GameState,
  pointAnimations: OnlinePointAnim[]
): GameState {
  const now = performance.now();
  const liveAnimations = pointAnimations
    .map((anim) => {
      const t = (now - anim.startedAtMs) / ONLINE_POINT_ANIM_MS;
      if (t >= 1) {
        return null;
      }
      const yOffset = -Math.round(ONLINE_POINT_RISE_PX * t);
      return {
        player: anim.player,
        value: anim.value,
        p1Pos: anim.p1Pos,
        p2Pos: anim.p2Pos,
        p1YOffsetPx: yOffset,
        p2YOffsetPx: yOffset,
        alpha: 1 - t,
      };
    })
    .filter((anim): anim is NonNullable<typeof anim> => anim !== null);

  pointAnimations.length = 0;
  pointAnimations.push(
    ...liveAnimations.map((anim) => ({
      key: pointChangeKey(anim),
      player: anim.player,
      value: anim.value,
      p1Pos: anim.p1Pos,
      p2Pos: anim.p2Pos,
      startedAtMs: now - (1 - anim.alpha) * ONLINE_POINT_ANIM_MS,
    }))
  );

  return {
    ...baseState,
    pointChanges: liveAnimations,
  };
}

function ReplayIconPlay() {
  return (
    <svg className="online-replay-btn__svg" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M8 5v14l11-7L8 5z" />
    </svg>
  );
}

function ReplayIconPause() {
  return (
    <svg className="online-replay-btn__svg" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"
      />
    </svg>
  );
}

function ReplayIconRestart() {
  return (
    <svg
      className="online-replay-btn__svg online-replay-btn__svg--stroke"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path d="M1 4v6h6" />
      <path d="M3.51 15a9 9 0 1 0 2.13 -9.36L6 10" />
    </svg>
  );
}

function ReplayIconBackToRoom() {
  return (
    <svg
      className="online-replay-btn__svg online-replay-btn__svg--stroke"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function ReplayIconExitRoom() {
  return (
    <svg
      className="online-replay-btn__svg online-replay-btn__svg--stroke"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

function ReplaySpeedPicker({
  value,
  onChange,
  onOpenChange,
}: {
  value: number;
  onChange: (s: number) => void;
  onOpenChange: (o: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(2); // default: 1x
  const containerRef = useRef<HTMLDivElement>(null);

  const currentIdx = (REPLAY_SPEEDS as readonly number[]).indexOf(value);

  function openList() {
    const idx = currentIdx >= 0 ? currentIdx : 2;
    setFocusIdx(idx);
    setOpen(true);
    onOpenChange(true);
  }

  function closeList() {
    setOpen(false);
    onOpenChange(false);
  }

  function selectIdx(idx: number) {
    onChange(REPLAY_SPEEDS[idx]);
    closeList();
    containerRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) closeList();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        openList();
      }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    switch (e.key) {
      case 'Escape':
        closeList();
        break;
      case 'ArrowUp':
        setFocusIdx((p) => Math.max(0, p - 1));
        break;
      case 'ArrowDown':
        setFocusIdx((p) => Math.min(REPLAY_SPEEDS.length - 1, p + 1));
        break;
      case 'Enter':
      case ' ':
        selectIdx(focusIdx);
        break;
    }
  }

  return (
    <div className="online-replay-speed" ref={containerRef} onKeyDown={onKeyDown}>
      <span className="online-replay-speed-label" aria-hidden>
        SPEED
      </span>
      <div
        className={`online-replay-speed-picker${open ? ' online-replay-speed-picker--open' : ''}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Playback speed: ${value}x`}
        tabIndex={0}
        onClick={() => (open ? closeList() : openList())}
      >
        <span className="online-replay-speed-value">{value}x</span>
        <svg className="online-replay-speed-chevron" viewBox="0 0 10 6" aria-hidden>
          <path fill="currentColor" fillOpacity="0.85" d="M0 0h10L5 6z" />
        </svg>

        {open && (
          <div className="online-replay-speed-list" role="listbox" aria-label="Playback speed">
            {REPLAY_SPEEDS.map((speed, idx) => (
              <button
                key={speed}
                type="button"
                role="option"
                aria-selected={speed === value}
                tabIndex={-1}
                className={[
                  'online-replay-speed-option',
                  speed === value ? 'online-replay-speed-option--active' : '',
                  idx === focusIdx ? 'online-replay-speed-option--focused' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={(e) => {
                  e.stopPropagation();
                  selectIdx(idx);
                }}
                onMouseEnter={() => setFocusIdx(idx)}
              >
                {speed}x
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatSeconds(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
