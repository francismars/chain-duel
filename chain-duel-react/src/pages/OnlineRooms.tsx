import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useGamepad } from '@/hooks/useGamepad';
import { useSocket } from '@/hooks/useSocket';
import { SocketBoundaryParsers } from '@/shared/socket/socketBoundary';
import { OnlineRoomListItem, PlayerRole } from '@/types/socket';
import '@/styles/pages/onlineRooms.css';
import '@/styles/pages/onlinePostGame.css'; // shared card structure for history rows

type NavFocus =
  | { type: 'tab'; index: number }      // tab row: 0=Active 1=Finished 2=HoF
  | { type: 'create' }                  // stepper box
  | { type: 'preset'; index: number }   // 1K/10K/100K quick amounts
  | { type: 'join' }
  | { type: 'switch' }                  // mode toggle (Join by code / Create a room)
  | { type: 'room'; index: number }
  | { type: 'back' };

const PRESET_AMOUNTS = [1000, 10000, 100_000] as const;

const TAB_ORDER: OnlineTab[] = ['live', 'history', 'hof'];

type OnlineMode = 'create' | 'join';
type OnlineTab = 'live' | 'history' | 'hof';

const BUYIN_MIN = 10;
const BUYIN_MAX = 1_000_000;
const BUYIN_STEP = 10;
const BUYIN_STEP_FAST = 50;

const PLACEHOLDER_AVATAR = '/images/loading.gif';

/** Minimum buy-in (sats) to qualify as a Hall-of-Fame match. */
const HOF_BUYIN_THRESHOLD = 1_000;

function isHallOfFame(room: OnlineRoomListItem): boolean {
  return (
    room.buyin >= HOF_BUYIN_THRESHOLD ||
    (room.result?.netPrize != null && room.result.netPrize >= HOF_BUYIN_THRESHOLD * 0.9)
  );
}

function HistoryMatchupBlock({ result }: { result: NonNullable<OnlineRoomListItem['result']> }) {
  const winP1 =
    result.winnerRole === PlayerRole.Player1 ||
    (result.winnerRole == null && result.winnerName === result.p1Name);
  const winP2 =
    result.winnerRole === PlayerRole.Player2 ||
    (result.winnerRole == null && result.winnerName === result.p2Name);
  return (
    <div className="online-postgame-round-main">
      <div className="online-postgame-round-matchup" role="group" aria-label="Score">
        {/* P1 */}
        <div
          className={[
            'online-postgame-player',
            'online-postgame-player--p1',
            winP1 ? 'online-postgame-player--round-winner' : 'online-postgame-player--round-loser',
          ].join(' ')}
        >
          <div className="online-postgame-player-identity">
            <img
              className="online-postgame-round-avatar"
              src={result.p1Picture || PLACEHOLDER_AVATAR}
              alt={result.p1Name}
            />
            <span className="online-postgame-player-name">{result.p1Name}</span>
          </div>
          <span className="online-postgame-player-pts">
            {result.p1Score.toLocaleString()}
            <span className="online-postgame-player-denom">sats</span>
          </span>
        </div>

        {/* VS */}
        <div className="online-postgame-round-vs-pillar" aria-hidden="true">
          <span className="online-postgame-round-vs-label">vs</span>
        </div>

        {/* P2 */}
        <div
          className={[
            'online-postgame-player',
            'online-postgame-player--p2',
            winP2 ? 'online-postgame-player--round-winner' : 'online-postgame-player--round-loser',
          ].join(' ')}
        >
          <div className="online-postgame-player-identity">
            <img
              className="online-postgame-round-avatar"
              src={result.p2Picture || PLACEHOLDER_AVATAR}
              alt={result.p2Name}
            />
            <span className="online-postgame-player-name">{result.p2Name}</span>
          </div>
          <span className="online-postgame-player-pts">
            {result.p2Score.toLocaleString()}
            <span className="online-postgame-player-denom">sats</span>
          </span>
        </div>
      </div>

      {/* Winner line */}
      <p className="online-postgame-round-winner">
        <span className="online-postgame-round-winner-crown" aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="online-postgame-crown-svg"
          >
            <path d="M1 15h18V9L15 12L10 2L5 12L1 9Z" />
            <circle cx="10" cy="2" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="1" cy="9" r="0.9" fill="currentColor" stroke="none" />
            <circle cx="19" cy="9" r="0.9" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <span className="online-postgame-round-winner-body">
          <span className="online-postgame-round-winner-kicker">Winner</span>
          <span className="online-postgame-round-winner-text">
            <strong>{result.winnerName}</strong>
            <span className="online-postgame-round-winner-sep" aria-hidden="true">·</span>
            <span className="online-postgame-round-winner-prize">
              {result.netPrize.toLocaleString()} sats net
            </span>
          </span>
        </span>
      </p>
    </div>
  );
}

export default function OnlineRooms() {
  const navigate = useNavigate();
  const { socket } = useSocket({ autoConnect: true });
  const [rooms, setRooms] = useState<OnlineRoomListItem[]>([]);
  /** Server-merged: archive index + finished rooms still in RAM (`listOnlineHistory`). */
  const [historyRooms, setHistoryRooms] = useState<OnlineRoomListItem[]>([]);
  const [onlineTab, setOnlineTab] = useState<OnlineTab>(() => {
    const saved = sessionStorage.getItem('onlineRoomsTab');
    if (saved === 'history' || saved === 'hof') return saved;
    return 'live';
  });
  const [onlineMode, setOnlineMode] = useState<OnlineMode>('create');
  const [buyin, setBuyin] = useState('100');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [navFocus, setNavFocus] = useState<NavFocus>(() => {
    const saved = sessionStorage.getItem('onlineRoomsTab') as OnlineTab | null;
    const tab: OnlineTab = saved === 'history' || saved === 'hof' ? saved : 'live';
    return { type: 'tab', index: TAB_ORDER.indexOf(tab) };
  });
  const creatingRoomRef = useRef(false);
  const pendingRoomIdRef = useRef<string | null>(null);
  const keyRepeatRef = useRef<Record<string, number>>({});

  useGamepad(true);

  // Persist selected tab across in-network navigation; cleared on back-to-menu
  useEffect(() => {
    sessionStorage.setItem('onlineRoomsTab', onlineTab);
  }, [onlineTab]);

  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => b.createdAt - a.createdAt),
    [rooms]
  );

  const liveRoomCount = useMemo(
    () => sortedRooms.filter((r) => r.phase !== 'finished').length,
    [sortedRooms]
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
    if (onlineTab === 'hof') {
      return [...sortedHistoryRooms]
        .filter(isHallOfFame)
        .sort((a, b) => b.buyin - a.buyin);
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
    if (!socket || (onlineTab !== 'history' && onlineTab !== 'hof')) {
      return;
    }
    socket.emit('listOnlineHistory');
  }, [onlineTab, socket]);

  useEffect(() => {
    setNavFocus((prev) => {
      if (prev.type !== 'room') return prev;
      if (displayedRooms.length === 0) return { type: 'tab', index: TAB_ORDER.indexOf(onlineTab) };
      if (prev.index >= displayedRooms.length) return { type: 'room', index: displayedRooms.length - 1 };
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
      if (creatingRoom) return;

      const active = document.activeElement as HTMLElement | null;
      const activeIsTextInput =
        active?.tagName === 'INPUT' && !(active as HTMLInputElement).readOnly;
      // Skip global nav when typing in the room code or buy-in inputs.
      if (activeIsTextInput && (
        active?.classList.contains('online-input') ||
        active?.classList.contains('online-buyin-value')
      )) {
        return;
      }

      const key = event.key;
      const isEnter = key === 'Enter' || key === ' ';
      const isUp    = key === 'ArrowUp'    || key === 'w' || key === 'W';
      const isDown  = key === 'ArrowDown'  || key === 's' || key === 'S';
      const isLeft  = key === 'ArrowLeft'  || key === 'a' || key === 'A';
      const isRight = key === 'ArrowRight' || key === 'd' || key === 'D';
      if (!isEnter && !isUp && !isDown && !isLeft && !isRight) return;
      event.preventDefault();

      // ── Left / Right ────────────────────────────────────────────
      if (isLeft || isRight) {
        if (navFocus.type === 'tab' || navFocus.type === 'room') {
          // Switch between tabs (also reachable from room list)
          const curIdx = navFocus.type === 'tab' ? navFocus.index : TAB_ORDER.indexOf(onlineTab);
          const next = isRight
            ? (curIdx + 1) % TAB_ORDER.length
            : (curIdx - 1 + TAB_ORDER.length) % TAB_ORDER.length;
          setOnlineTab(TAB_ORDER[next]);
          setNavFocus({ type: 'tab', index: next });
        } else if (navFocus.type === 'create') {
          // Adjust buy-in with repeat acceleration
          const now = performance.now();
          const last = keyRepeatRef.current[key] ?? 0;
          keyRepeatRef.current[key] = now;
          const step = now - last < 140 ? BUYIN_STEP_FAST : BUYIN_STEP;
          updateBuyinBy(isRight ? step : -step);
        } else if (navFocus.type === 'preset') {
          // Move between preset buttons (clamped)
          const next = isRight
            ? Math.min(navFocus.index + 1, PRESET_AMOUNTS.length - 1)
            : Math.max(navFocus.index - 1, 0);
          setNavFocus({ type: 'preset', index: next });
        }
        return;
      }

      // ── Up ──────────────────────────────────────────────────────
      if (isUp) {
        setNavFocus((prev) => {
          if (prev.type === 'back') {
            if (displayedRooms.length > 0) return { type: 'room', index: displayedRooms.length - 1 };
            return { type: 'switch' };
          }
          if (prev.type === 'room') {
            if (prev.index > 0) return { type: 'room', index: prev.index - 1 };
            return { type: 'switch' };
          }
          if (prev.type === 'switch') {
            return onlineMode === 'join' ? { type: 'join' } : { type: 'preset', index: PRESET_AMOUNTS.length - 1 };
          }
          if (prev.type === 'preset') return { type: 'create' };
          if (prev.type === 'create' || prev.type === 'join') {
            return { type: 'tab', index: TAB_ORDER.indexOf(onlineTab) };
          }
          // already at tab row — stay
          return prev;
        });
        return;
      }

      // ── Down ─────────────────────────────────────────────────────
      if (isDown) {
        setNavFocus((prev) => {
          if (prev.type === 'tab') {
            return onlineMode === 'join' ? { type: 'join' } : { type: 'create' };
          }
          if (prev.type === 'create') {
            return { type: 'preset', index: 0 };
          }
          if (prev.type === 'preset' || prev.type === 'join') {
            return { type: 'switch' };
          }
          if (prev.type === 'switch') {
            if (displayedRooms.length > 0) return { type: 'room', index: 0 };
            return { type: 'back' };
          }
          if (prev.type === 'room') {
            if (prev.index < displayedRooms.length - 1) return { type: 'room', index: prev.index + 1 };
            return { type: 'back' };
          }
          // already at back — stay
          return prev;
        });
        return;
      }

      // ── Enter / Space ────────────────────────────────────────────
      if (isEnter) {
        if (navFocus.type === 'tab') {
          // Tab is already active via Left/Right; Enter navigates into the list
          setNavFocus(
            displayedRooms.length > 0
              ? { type: 'room', index: 0 }
              : onlineMode === 'join' ? { type: 'join' } : { type: 'create' }
          );
          return;
        }
        if (navFocus.type === 'create') { createRoom(); return; }
        if (navFocus.type === 'switch') {
          const next: OnlineMode = onlineMode === 'create' ? 'join' : 'create';
          setOnlineMode(next);
          setNavFocus({ type: next });
          setError('');
          return;
        }
        if (navFocus.type === 'preset') {
          setBuyin(String(PRESET_AMOUNTS[navFocus.index]));
          setNavFocus({ type: 'create' }); // return to stepper so next Enter = create
          return;
        }
        if (navFocus.type === 'join') {
          socket?.emit('joinOnlineRoomByCode', { roomCode: roomCode.trim() });
          return;
        }
        if (navFocus.type === 'room') {
          const room = displayedRooms[navFocus.index];
          if (room) {
            if (onlineTab === 'history' || onlineTab === 'hof') openHistoryPostGame(room.roomId);
            else activateRoom(room);
          }
          return;
        }
        if (navFocus.type === 'back') { sessionStorage.removeItem('onlineRoomsTab'); navigate('/'); }
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
  }, [creatingRoom, displayedRooms, navFocus, navigate, onlineTab, onlineMode, socket, buyin, roomCode]);

  return (
    <div className="online-rooms-page">
      <Sponsorship id="sponsorship-online-rooms" />
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      <h1 id="online-title">NETWORK</h1>
      <p id="online-subtitle">Create a room, share the code, and claim your seat.</p>

      <div className="online-rooms-body">
      <section className="online-room-list-panel">
        <div className="online-room-list-head">
          <h3>
            {onlineTab === 'live' ? 'LIVE ROOMS' : onlineTab === 'hof' ? 'HALL OF FAME' : 'MATCH HISTORY'}
          </h3>
          <div className="online-tab-row" role="tablist" aria-label="Online room list">
            <button
              type="button"
              role="tab"
              aria-selected={onlineTab === 'live'}
              className={[
                'online-tab online-tab--live',
                onlineTab === 'live' ? 'online-tab-active' : '',
                navFocus.type === 'tab' && navFocus.index === 0 ? 'online-selected' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => { setOnlineTab('live'); setNavFocus({ type: 'tab', index: 0 }); }}
            >
              <span
                className={`online-tab-dot ${liveRoomCount > 0 ? 'online-tab-dot--active' : ''}`}
                aria-hidden="true"
              />
              Active
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={onlineTab === 'history'}
              className={[
                'online-tab online-tab--history',
                onlineTab === 'history' ? 'online-tab-active' : '',
                navFocus.type === 'tab' && navFocus.index === 1 ? 'online-selected' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => { setOnlineTab('history'); setNavFocus({ type: 'tab', index: 1 }); }}
            >
              <svg viewBox="0 0 10 14" fill="currentColor" aria-hidden="true" className="online-tab-history-icon">
                <path d="M1 1h8v3.5L6 7l3 2.5V13H1v-3.5L4 7 1 4.5V1zm1.2 1v2.8l2.8 2 2.8-2V2H2.2zm0 10v-2.8l2.8-2 2.8 2V12H2.2z"/>
              </svg>
              Finished
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={onlineTab === 'hof'}
              aria-label="Hall of Fame — high-stakes matches"
              className={[
                'online-tab online-tab--hof',
                onlineTab === 'hof' ? 'online-tab-active' : '',
                navFocus.type === 'tab' && navFocus.index === 2 ? 'online-selected' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => { setOnlineTab('hof'); setNavFocus({ type: 'tab', index: 2 }); }}
            >
              <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" className="online-tab-hof-icon">
                <path d="M6 1l1.2 2.4L10 3.9l-2 1.95.47 2.75L6 7.4l-2.47 1.2.47-2.75L2 3.9l2.8-.5L6 1z"/>
              </svg>
              Hall of Fame
            </button>
          </div>
        </div>

        <div className="online-room-list" key={onlineTab}>
          {displayedRooms.length === 0 ? (
            <div className="online-empty">
              <svg
                className="online-empty-icon"
                viewBox="0 0 96 40"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {/* Left seat */}
                <circle cx="18" cy="13" r="7" />
                <path d="M7 38 C7 28 29 28 29 38" />
                {/* Centre dashed divider */}
                <line x1="36" y1="19" x2="60" y2="19" strokeDasharray="3 3" strokeWidth="0.9" />
                <text x="48" y="23.5" textAnchor="middle" fontSize="6" stroke="none" fill="currentColor" letterSpacing="1" fontFamily="inherit">VS</text>
                {/* Right seat */}
                <circle cx="78" cy="13" r="7" />
                <path d="M67 38 C67 28 89 28 89 38" />
              </svg>
              <p className="online-empty-title">
                {onlineTab === 'live'
                  ? 'No open rooms'
                  : onlineTab === 'hof'
                  ? 'No hall of fame matches yet'
                  : 'No finished matches'}
              </p>
              <p className="online-empty-hint">
                {onlineTab === 'live'
                  ? 'Create a room to open the arena.'
                  : onlineTab === 'hof'
                  ? `Games with a ${HOF_BUYIN_THRESHOLD.toLocaleString()}+ sat buy-in will appear here.`
                  : 'Completed matches will appear here.'}
              </p>
            </div>
          ) : null}
          {displayedRooms.map((room, index) => (
            <div
              key={`${room.roomId}-${room.matchRound ?? 'live'}-${room.finishedAt ?? room.createdAt}`}
              className={[
                'online-room-card',
                onlineTab !== 'live' ? 'online-room-card--history' : '',
                isHallOfFame(room) && onlineTab !== 'hof' ? 'online-room-card--hof' : '',
                onlineTab === 'hof' ? 'online-room-card--hof-view' : '',
                navFocus.type === 'room' && navFocus.index === index ? 'online-selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {onlineTab !== 'live' ? (
                /* ── History / HoF: postgame-style 3-col grid ── */
                <div className="online-postgame-round-row-inner">
                  {/* Badge col: code + buyin + date */}
                  <div className="online-postgame-round-badge-col">
                    <span className="online-postgame-round-index online-history-room-code">
                      {isHallOfFame(room) ? (
                        <svg viewBox="0 0 10 10" fill="currentColor" className="online-hof-crown" aria-label="Hall of Fame" role="img">
                          <path d="M5 1l1 2 2-.5-1.2 2 .7 2.5H2.5L3.2 4.5 2 2.5l2 .5L5 1z"/>
                        </svg>
                      ) : null}
                      {room.roomCode}
                    </span>
                    <span className="online-postgame-round-chip online-postgame-round-chip--open">
                      {room.buyin.toLocaleString()} sats
                    </span>
                    {room.archived ? (
                      <span className="online-postgame-round-chip">ARCHIVED</span>
                    ) : null}
                    {room.finishedAt ? (
                      <time className="online-postgame-round-time">
                        {new Date(room.finishedAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    ) : null}
                  </div>

                  {/* Matchup */}
                  {room.result ? <HistoryMatchupBlock result={room.result} /> : null}

                  {/* Actions */}
                  <div className="online-postgame-round-action-col online-history-action-col">
                    <Button
                      className="online-postgame-round-replay-btn"
                      onClick={() => openHistoryPostGame(room.roomId)}
                    >
                      <span className="online-postgame-round-replay-label">RESULTS</span>
                    </Button>
                    <Button
                      className="online-postgame-round-replay-btn"
                      onClick={() => openHistoryReplay(room.roomId, room.matchRound)}
                      disabled={!room.replay?.available}
                    >
                      <span className="online-postgame-round-replay-icon" aria-hidden="true" />
                      <span className="online-postgame-round-replay-label">REPLAY</span>
                    </Button>
                  </div>
                </div>
              ) : (
                /* ── Live: existing layout ── */
                <>
                  <div className="online-room-main">
                    <p className="online-room-code">{room.roomCode}</p>
                    <p className="online-room-meta">
                      <span>{room.buyin.toLocaleString()} sats</span>
                      <span>{room.playersPaid}/{room.seatsTotal} seats</span>
                      <span>{room.spectators} spectators</span>
                      <span className={`online-phase online-phase-${room.phase}`}>
                        {formatPhase(room.phase)}
                      </span>
                    </p>
                  </div>
                  <div className="online-room-actions">
                    <Button
                      className="online-action"
                      onClick={() => activateRoom(room)}
                    >
                      {room.phase === 'playing' ? 'WATCH LIVE' : 'ENTER ROOM'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="online-rooms-side">
      {/* ── Action card ── */}
      <div className="online-action-card">
        <div className="online-action-card-body">
          {/* key forces remount → entrance animation on every mode switch */}
          <p key={`label-${onlineMode}`} className="online-action-label">
            {onlineMode === 'create' ? 'BUY-IN' : 'ROOM CODE'}
          </p>

          {onlineMode === 'create' ? (
            <div key="field-create" className="online-buyin-field">
              <div className={`online-buyin-stepper${navFocus.type === 'create' ? ' online-selected' : ''}`}>
                <button type="button" className="online-buyin-btn" onClick={() => updateBuyinBy(-BUYIN_STEP)} aria-label="Decrease buy-in">−</button>
                <div className="online-buyin-center">
                  <input
                    className="online-buyin-value"
                    type="text"
                    inputMode="numeric"
                    value={buyin}
                    onChange={(e) => setBuyin(e.target.value.replace(/[^0-9]/g, ''))}
                    onBlur={() => setBuyin(String(parseBuyin()))}
                    aria-label="Buy-in amount in sats"
                  />
                  <span className="online-buyin-unit">sats</span>
                </div>
                <button type="button" className="online-buyin-btn" onClick={() => updateBuyinBy(BUYIN_STEP)} aria-label="Increase buy-in">+</button>
              </div>
              <div className="online-buyin-presets" aria-label="Quick buy-in amounts">
                {PRESET_AMOUNTS.map((amount, presetIdx) => (
                  <button
                    key={amount}
                    type="button"
                    className={[
                      'online-buyin-preset',
                      parseBuyin() === amount ? 'online-buyin-preset--active' : '',
                      navFocus.type === 'preset' && navFocus.index === presetIdx ? 'online-selected' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => { setBuyin(String(amount)); setNavFocus({ type: 'create' }); }}
                    aria-label={`Set buy-in to ${amount.toLocaleString()} sats`}
                  >
                    {amount / 1000}K
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <input
              key="field-join"
              className={`online-input online-code-input${navFocus.type === 'join' ? ' online-selected' : ''}`}
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); socket?.emit('joinOnlineRoomByCode', { roomCode: roomCode.trim() }); }
              }}
              placeholder="ENTER CODE"
              maxLength={6}
              autoComplete="off"
              aria-label="Room code"
            />
          )}

          <Button
            type="button"
            className="online-create-btn"
            onClick={onlineMode === 'create' ? createRoom : () => socket?.emit('joinOnlineRoomByCode', { roomCode: roomCode.trim() })}
            disabled={onlineMode === 'create' && creatingRoom}
          >
            <span key={`btn-${onlineMode}`} className="online-create-btn-label">
              {onlineMode === 'create' ? (creatingRoom ? 'CREATING…' : 'CREATE ROOM') : 'JOIN ROOM'}
            </span>
          </Button>
        </div>

        <div className="online-action-card-footer">
          {error ? <span className="online-inline-error">{error}</span> : null}
          <button
            type="button"
            className={`online-action-switch${navFocus.type === 'switch' ? ' online-selected' : ''}`}
            onClick={() => {
              const next: OnlineMode = onlineMode === 'create' ? 'join' : 'create';
              setOnlineMode(next);
              setNavFocus({ type: next });
              setError('');
            }}
          >
            <span key={`switch-${onlineMode}`} className="online-action-switch-label">
              {onlineMode === 'create' ? 'Join by code →' : '← Create a room'}
            </span>
          </button>
        </div>
      </div>

      <div className="online-footer-controls">
        <Button
          className={`online-back ${navFocus.type === 'back' ? 'online-selected' : ''}`}
          onClick={() => { sessionStorage.removeItem('onlineRoomsTab'); navigate('/'); }}
        >
          BACK
        </Button>
      </div>

      </div>{/* .online-rooms-side */}
      </div>{/* .online-rooms-body */}

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay={true} />
    </div>
  );
}
