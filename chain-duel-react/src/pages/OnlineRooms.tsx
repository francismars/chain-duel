import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useGamepad } from '@/hooks/useGamepad';
import { useSocket } from '@/hooks/useSocket';
import { SocketBoundaryParsers } from '@/shared/socket/socketBoundary';
import { OnlineRoomListItem } from '@/types/socket';
import '@/styles/pages/onlineRooms.css';

type NavFocus =
  | { type: 'amount' }
  | { type: 'create' }
  | { type: 'room'; index: number }
  | { type: 'back' };

type OnlineTab = 'live' | 'history';

const BUYIN_MIN = 10;
const BUYIN_MAX = 1_000_000;
const BUYIN_STEP = 10;
const BUYIN_STEP_FAST = 50;

export default function OnlineRooms() {
  const navigate = useNavigate();
  const { socket } = useSocket({ autoConnect: true });
  const [rooms, setRooms] = useState<OnlineRoomListItem[]>([]);
  /** Server-merged: archive index + finished rooms still in RAM (`listOnlineHistory`). */
  const [historyRooms, setHistoryRooms] = useState<OnlineRoomListItem[]>([]);
  const [onlineTab, setOnlineTab] = useState<OnlineTab>('live');
  const [buyin, setBuyin] = useState('100');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [navFocus, setNavFocus] = useState<NavFocus>({ type: 'amount' });
  const creatingRoomRef = useRef(false);
  const pendingRoomIdRef = useRef<string | null>(null);
  const keyRepeatRef = useRef<Record<string, number>>({});

  useGamepad(true);

  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => b.createdAt - a.createdAt),
    [rooms]
  );

  const sortedHistoryRooms = useMemo(
    () =>
      [...historyRooms].sort(
        (a, b) => (b.finishedAt ?? b.createdAt) - (a.finishedAt ?? a.createdAt)
      ),
    [historyRooms]
  );

  const displayedRooms = useMemo(() => {
    if (onlineTab === 'live') {
      return sortedRooms.filter((r) => r.phase !== 'finished');
    }
    return sortedHistoryRooms;
  }, [sortedHistoryRooms, onlineTab, sortedRooms]);

  const formatPhase = (phase: OnlineRoomListItem['phase']) => {
    switch (phase) {
      case 'playing':
        return 'LIVE';
      case 'postgame':
        return 'POSTGAME';
      case 'finished':
        return 'FINISHED';
      case 'cancelled':
        return 'CANCELLED';
      default:
        return 'LOBBY';
    }
  };

  const parseBuyin = () => {
    const parsed = Number.parseInt(buyin, 10);
    if (!Number.isFinite(parsed)) return 100;
    return Math.max(BUYIN_MIN, Math.min(BUYIN_MAX, parsed));
  };

  const updateBuyinBy = (delta: number) => {
    const current = parseBuyin();
    const next = Math.max(BUYIN_MIN, Math.min(BUYIN_MAX, current + delta));
    setBuyin(String(next));
  };

  const createRoom = () => {
    setError('');
    setCreatingRoom(true);
    creatingRoomRef.current = true;
    pendingRoomIdRef.current = null;
    socket?.emit('createOnlineRoom', {
      buyin: parseBuyin(),
    });
  };

  const activateRoom = (room: OnlineRoomListItem) => {
    if (room.phase === 'playing') {
      socket?.emit('spectateOnlineRoom', { roomId: room.roomId });
      navigate(`/online/game?roomId=${encodeURIComponent(room.roomId)}`);
      return;
    }
    socket?.emit('joinOnlineRoom', { roomId: room.roomId });
    navigate(`/online/lobby?roomId=${encodeURIComponent(room.roomId)}`);
  };

  const openHistoryPostGame = (roomId: string) => {
    navigate(`/online/postgame?roomId=${encodeURIComponent(roomId)}`);
  };

  const openHistoryReplay = (roomId: string, matchRound?: number) => {
    const roundQ =
      matchRound != null ? `&round=${encodeURIComponent(String(matchRound))}` : '';
    navigate(`/online/game?roomId=${encodeURIComponent(roomId)}&replay=1${roundQ}`);
  };

  useEffect(() => {
    if (!socket) {
      return;
    }
    const onList = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.listOnlineRooms(payload);
      if (parsed) {
        setRooms(parsed.rooms);
      }
    };
    const onHistory = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.onlineHistory(payload);
      if (parsed) {
        setHistoryRooms(parsed.rooms);
      }
    };
    const onCreate = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.createOnlineRoom(payload);
      if (!parsed) {
        return;
      }
      if (parsed.nostrMeta) {
        setCreatingRoom(false);
        creatingRoomRef.current = false;
        pendingRoomIdRef.current = null;
        navigate(`/online/lobby?roomId=${encodeURIComponent(parsed.roomId)}`);
        return;
      }
      pendingRoomIdRef.current = parsed.roomId;
      socket?.emit('getOnlineRoomState', { roomId: parsed.roomId });
    };
    const onJoin = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.joinOnlineRoom(payload);
      if (!parsed) {
        return;
      }
      navigate(`/online/lobby?roomId=${encodeURIComponent(parsed.roomId)}`);
    };
    const onInvalid = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.onlinePinInvalid(payload);
      setError(parsed?.reason ?? 'Unable to join room');
      setCreatingRoom(false);
      creatingRoomRef.current = false;
      pendingRoomIdRef.current = null;
    };
    const onRoomUpdated = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.onlineRoomUpdated(payload);
      if (!parsed || !creatingRoomRef.current || !pendingRoomIdRef.current) {
        return;
      }
      if (parsed.roomId !== pendingRoomIdRef.current) {
        return;
      }
      if (!parsed.nostrMeta?.note1) {
        return;
      }
      setCreatingRoom(false);
      creatingRoomRef.current = false;
      pendingRoomIdRef.current = null;
      navigate(`/online/lobby?roomId=${encodeURIComponent(parsed.roomId)}`);
    };

    socket.on('resListOnlineRooms', onList);
    socket.on('resOnlineHistory', onHistory);
    socket.on('resCreateOnlineRoom', onCreate);
    socket.on('resJoinOnlineRoom', onJoin);
    socket.on('onlinePinInvalid', onInvalid);
    socket.on('onlineRoomUpdated', onRoomUpdated);
    socket.emit('listOnlineRooms');
    socket.emit('listOnlineHistory');
    return () => {
      socket.off('resListOnlineRooms', onList);
      socket.off('resOnlineHistory', onHistory);
      socket.off('resCreateOnlineRoom', onCreate);
      socket.off('resJoinOnlineRoom', onJoin);
      socket.off('onlinePinInvalid', onInvalid);
      socket.off('onlineRoomUpdated', onRoomUpdated);
    };
  }, [navigate, socket]);

  useEffect(() => {
    if (!socket || onlineTab !== 'history') {
      return;
    }
    socket.emit('listOnlineHistory');
  }, [onlineTab, socket]);

  useEffect(() => {
    setNavFocus((prev) => {
      if (prev.type !== 'room') {
        return prev;
      }
      if (displayedRooms.length === 0) {
        return { type: 'create' };
      }
      if (prev.index >= displayedRooms.length) {
        return { type: 'room', index: displayedRooms.length - 1 };
      }
      return prev;
    });
  }, [displayedRooms.length, onlineTab]);

  useEffect(() => {
    if (!creatingRoom) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCreatingRoom(false);
      creatingRoomRef.current = false;
      pendingRoomIdRef.current = null;
      setError('Kind1 is taking too long to publish. Please try again.');
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [creatingRoom]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (creatingRoom) {
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      const activeIsTextInput =
        active?.tagName === 'INPUT' && !(active as HTMLInputElement).readOnly;
      // Keep join-by-code keyboard/mouse oriented for now.
      if (activeIsTextInput && active?.classList.contains('online-input')) {
        return;
      }

      const key = event.key;
      const isEnter = key === 'Enter' || key === ' ';
      const isUp = key === 'ArrowUp' || key === 'w' || key === 'W';
      const isDown = key === 'ArrowDown' || key === 's' || key === 'S';
      const isLeft = key === 'ArrowLeft' || key === 'a' || key === 'A';
      const isRight = key === 'ArrowRight' || key === 'd' || key === 'D';
      if (!isEnter && !isUp && !isDown && !isLeft && !isRight) {
        return;
      }
      event.preventDefault();

      if (isLeft || isRight) {
        if (navFocus.type === 'amount') {
          const now = performance.now();
          const last = keyRepeatRef.current[key] ?? 0;
          keyRepeatRef.current[key] = now;
          const step = now - last < 140 ? BUYIN_STEP_FAST : BUYIN_STEP;
          updateBuyinBy(isRight ? step : -step);
        }
        return;
      }

      if (isUp) {
        setNavFocus((prev) => {
          if (prev.type === 'back') {
            if (displayedRooms.length > 0) {
              return { type: 'room', index: displayedRooms.length - 1 };
            }
            return { type: 'create' };
          }
          if (prev.type === 'room') {
            if (prev.index > 0) {
              return { type: 'room', index: prev.index - 1 };
            }
            return { type: 'create' };
          }
          if (prev.type === 'create') {
            return { type: 'amount' };
          }
          return prev;
        });
        return;
      }

      if (isDown) {
        setNavFocus((prev) => {
          if (prev.type === 'amount') {
            return { type: 'create' };
          }
          if (prev.type === 'create') {
            if (displayedRooms.length > 0) {
              return { type: 'room', index: 0 };
            }
            return { type: 'back' };
          }
          if (prev.type === 'room') {
            if (prev.index < displayedRooms.length - 1) {
              return { type: 'room', index: prev.index + 1 };
            }
            return { type: 'back' };
          }
          return prev;
        });
        return;
      }

      if (isEnter) {
        if (navFocus.type === 'create') {
          createRoom();
          return;
        }
        if (navFocus.type === 'room') {
          const room = displayedRooms[navFocus.index];
          if (room) {
            if (onlineTab === 'history') {
              openHistoryPostGame(room.roomId);
            } else {
              activateRoom(room);
            }
          }
          return;
        }
        if (navFocus.type === 'back') {
          navigate('/');
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keyRepeatRef.current[event.key] = 0;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [creatingRoom, displayedRooms, navFocus, navigate, onlineTab, socket, buyin]);

  return (
    <div className="online-rooms-page">
      <Sponsorship id="sponsorship-online-rooms" />

      <h1 id="online-title">ONLINE ARENA</h1>
      <p id="online-subtitle">Create a room, share the code, and claim seats with PIN-in-zap.</p>

      <div className="online-layout">
        <section className="online-panel">
          <h2 className="online-panel-title">CREATE ROOM</h2>
          <p className="online-panel-copy">Choose a buy-in and open a public room.</p>
          <p className={`online-controller-hint ${navFocus.type === 'amount' ? 'online-selected' : ''}`}>
            Buy-in: {parseBuyin()} sats (←/→ change)
          </p>
          <div className="online-input-row">
            <input
              className="online-input"
              value={buyin}
              onChange={(event) => setBuyin(event.target.value)}
              placeholder="Buy-in sats"
              inputMode="numeric"
            />
            <Button
              className={`online-action ${navFocus.type === 'create' ? 'online-selected' : ''}`}
              onClick={createRoom}
            >
              CREATE
            </Button>
          </div>
        </section>

        <section className="online-panel">
          <h2 className="online-panel-title">JOIN BY CODE</h2>
          <p className="online-panel-copy">Enter room code from host screen.</p>
          <div className="online-input-row">
            <input
              className="online-input"
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
              placeholder="Room code"
              maxLength={6}
            />
            <Button
              className="online-action"
              onClick={() => {
                socket?.emit('joinOnlineRoomByCode', { roomCode: roomCode.trim() });
              }}
            >
              JOIN
            </Button>
          </div>
        </section>
      </div>

      {error ? <p className="online-error">{error}</p> : null}

      <section className="online-room-list-panel">
        <div className="online-room-list-head">
          <h3>{onlineTab === 'live' ? 'LIVE ROOMS' : 'MATCH HISTORY'}</h3>
          <div className="online-tab-row" role="tablist" aria-label="Online room list">
            <button
              type="button"
              role="tab"
              aria-selected={onlineTab === 'live'}
              className={`online-tab ${onlineTab === 'live' ? 'online-tab-active' : ''}`}
              onClick={() => setOnlineTab('live')}
            >
              Active
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={onlineTab === 'history'}
              className={`online-tab ${onlineTab === 'history' ? 'online-tab-active' : ''}`}
              onClick={() => setOnlineTab('history')}
            >
              Finished
            </button>
          </div>
        </div>

        <div className="online-room-list">
          {displayedRooms.length === 0 ? (
            <p className="online-empty">
              {onlineTab === 'live'
                ? 'No open rooms yet. Create one to start the arena.'
                : 'No finished matches on this server yet.'}
            </p>
          ) : null}
          {displayedRooms.map((room, index) => (
            <div
              key={`${room.roomId}-${room.matchRound ?? 'live'}-${room.finishedAt ?? room.createdAt}`}
              className={`online-room-card ${
                navFocus.type === 'room' && navFocus.index === index ? 'online-selected' : ''
              }`}
            >
              <div className="online-room-main">
                <p className="online-room-code">{room.roomCode}</p>
                <p className="online-room-meta">
                  <span>{room.buyin} sats</span>
                  <span>
                    {room.playersPaid}/{room.seatsTotal} seats
                  </span>
                  <span>{room.spectators} spectators</span>
                  <span className={`online-phase online-phase-${room.phase}`}>
                    {formatPhase(room.phase)}
                  </span>
                  {room.archived ? <span className="online-archived">ARCHIVED</span> : null}
                </p>
                {onlineTab === 'history' && room.result ? (
                  <p className="online-history-result">
                    {room.result.winnerName} won · {room.result.p1Score}–{room.result.p2Score} ·{' '}
                    {room.result.netPrize} sats net
                  </p>
                ) : null}
              </div>
              <div className="online-room-actions">
                {onlineTab === 'live' ? (
                  <Button
                    className="online-action"
                    onClick={() => activateRoom(room)}
                  >
                    {room.phase === 'playing' ? 'WATCH LIVE' : 'ENTER ROOM'}
                  </Button>
                ) : (
                  <div className="online-history-actions">
                    <Button
                      className="online-action"
                      onClick={() => openHistoryPostGame(room.roomId)}
                    >
                      RESULTS
                    </Button>
                    <Button
                      className="online-action"
                      onClick={() => openHistoryReplay(room.roomId, room.matchRound)}
                      disabled={!room.replay?.available}
                    >
                      REPLAY
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="online-footer-controls">
        <Button
          className={`online-back ${navFocus.type === 'back' ? 'online-selected' : ''}`}
          onClick={() => navigate('/')}
        >
          BACK
        </Button>
        <p className="online-controls-hint">Keyboard/Gamepad: arrows + Enter</p>
      </div>

      {creatingRoom ? (
        <div className="online-loading-overlay">
          <div className="online-loading-card">
            <p className="online-loading-title">Creating Nostr event...</p>
            <p className="online-loading-copy">
              Waiting for backend confirmation so lobby can show QR immediately.
            </p>
          </div>
        </div>
      ) : null}

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay={true} />
    </div>
  );
}
