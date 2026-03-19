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
    let cancelled = false;
    let detachResize: (() => void) | undefined;
    void renderer.mount(hostRef.current).then(() => {
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
        rendererRef.current.render(renderState);
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
  }, []);

  useEffect(() => {
    if (!socket || !roomId) {
      return;
    }
    const onSnapshot = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.onlineRoomSnapshot(payload);
      if (parsed && parsed.roomId === roomId) {
        setSnapshot((prev) => {
          const merged = mergeOnlineSnapshot(prev, parsed.snapshot);
          ingestOnlinePointChanges(merged, pointAnimationsRef.current, prevPointCountByKeyRef.current);
          return merged;
        });
      }
    };
    const onUpdated = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.onlineRoomUpdated(payload);
      if (parsed && parsed.roomId === roomId) {
        setSnapshot((prev) => {
          const merged = mergeOnlineSnapshot(prev, parsed.snapshot);
          ingestOnlinePointChanges(merged, pointAnimationsRef.current, prevPointCountByKeyRef.current);
          return merged;
        });
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
