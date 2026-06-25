import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSocket } from '@/hooks/useSocket';
import { SocketBoundaryParsers } from '@/shared/socket/socketBoundary';
import { ONLINE_HOME } from '@/shared/constants/onlineRoutes';
import type { OnlineRoomState } from '@/types/socket';
import OnlineRoomLobby from '@/pages/OnlineRoomLobby';
import OnlineGame from '@/pages/OnlineGame';
import OnlinePostGame from '@/pages/OnlinePostGame';
import './game.css';

/** Brief lobby beat so the first seated player sees both-paid before the canvas. */
const ARENA_HANDOFF_MS = 2400;

function countPaidSeats(room: OnlineRoomState | null): number {
  if (!room?.seats) {
    return 0;
  }
  return Object.values(room.seats).filter((seat) => seat.status === 'paid')
    .length;
}

type ShellView = 'waiting' | 'arena' | 'replay' | 'results';

function resolveTargetView(
  room: OnlineRoomState | null,
  replayMode: boolean
): ShellView {
  if (replayMode) {
    return 'replay';
  }
  const phase = room?.phase;
  if (phase === 'postgame' || phase === 'finished') {
    if (room?.postGame?.rematchRequested) {
      return 'waiting';
    }
    return 'results';
  }
  if (phase === 'playing') {
    return 'arena';
  }
  if (phase === 'lobby' && countPaidSeats(room) >= 2) {
    return 'arena';
  }
  return 'waiting';
}

export default function OnlineRoom() {
  const { roomCode: roomCodeParam } = useParams<{ roomCode: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { socket } = useSocket({ autoConnect: true });
  const roomCode = (roomCodeParam ?? '').trim().toUpperCase();
  const replayMode = searchParams.get('replay') === '1';
  const [roomId, setRoomId] = useState('');
  const [room, setRoom] = useState<OnlineRoomState | null>(null);
  const [joinError, setJoinError] = useState('');
  const joinedRef = useRef(false);
  const [shellView, setShellView] = useState<ShellView>('waiting');
  const [arenaHandoff, setArenaHandoff] = useState(false);
  const shellViewRef = useRef<ShellView>('waiting');
  const handoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootstrappedRef = useRef(false);

  const syncRoom = useCallback((next: OnlineRoomState) => {
    setRoom(next);
    setRoomId(next.roomId);
    setJoinError('');
  }, []);

  const shouldSpectateOnJoin = useCallback((state: OnlineRoomState | null) => {
    if (!state) {
      return false;
    }
    if (state.phase === 'playing' || state.phase === 'postgame') {
      return true;
    }
    return countPaidSeats(state) >= 2;
  }, []);

  const emitJoin = useCallback(
    (spectate: boolean) => {
      if (!socket || !roomCode) {
        return;
      }
      if (spectate) {
        socket.emit('spectateOnlineRoomByCode', { roomCode });
      } else {
        socket.emit('joinOnlineRoomByCode', { roomCode });
      }
    },
    [roomCode, socket]
  );

  const targetView = useMemo(
    () => resolveTargetView(room, replayMode),
    [replayMode, room]
  );

  useEffect(() => {
    if (!roomCode) {
      navigate(ONLINE_HOME, { replace: true });
    }
  }, [navigate, roomCode]);

  useEffect(() => {
    if (!socket || !roomCode) {
      return;
    }
    joinedRef.current = false;
    bootstrappedRef.current = false;

    const onJoin = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.joinOnlineRoom(payload);
      if (!parsed || parsed.roomCode.toUpperCase() !== roomCode) {
        return;
      }
      joinedRef.current = true;
      if (parsed.room) {
        syncRoom(parsed.room);
      } else {
        setRoomId(parsed.roomId);
      }
    };

    const onUpdated = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.onlineRoomUpdated(payload);
      if (!parsed || parsed.roomCode.toUpperCase() !== roomCode) {
        return;
      }
      syncRoom(parsed);
      if (!joinedRef.current) {
        joinedRef.current = true;
        if (shouldSpectateOnJoin(parsed)) {
          emitJoin(true);
        }
      }
    };

    const onInvalid = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.onlinePinInvalid(payload);
      if (!parsed) {
        return;
      }
      if (parsed.reason === 'room_not_found') {
        setJoinError('Room not found.');
      }
    };

    const onConnect = () => {
      emitJoin(false);
    };

    emitJoin(false);
    socket.on('connect', onConnect);
    socket.on('resJoinOnlineRoom', onJoin);
    socket.on('onlineRoomUpdated', onUpdated);
    socket.on('onlinePinInvalid', onInvalid);

    return () => {
      socket.off('connect', onConnect);
      socket.off('resJoinOnlineRoom', onJoin);
      socket.off('onlineRoomUpdated', onUpdated);
      socket.off('onlinePinInvalid', onInvalid);
    };
  }, [emitJoin, roomCode, shouldSpectateOnJoin, socket, syncRoom]);

  useEffect(() => {
    const clearHandoffTimer = () => {
      if (handoffTimerRef.current) {
        clearTimeout(handoffTimerRef.current);
        handoffTimerRef.current = null;
      }
    };

    if (!bootstrappedRef.current) {
      bootstrappedRef.current = true;
      shellViewRef.current = targetView;
      setShellView(targetView);
      setArenaHandoff(false);
      return clearHandoffTimer;
    }

    const prev = shellViewRef.current;
    if (targetView === prev) {
      return clearHandoffTimer;
    }

    if (targetView === 'arena' && prev === 'waiting') {
      setArenaHandoff(true);
      clearHandoffTimer();
      handoffTimerRef.current = setTimeout(() => {
        handoffTimerRef.current = null;
        shellViewRef.current = 'arena';
        setShellView('arena');
        setArenaHandoff(false);
      }, ARENA_HANDOFF_MS);
      return clearHandoffTimer;
    }

    clearHandoffTimer();
    shellViewRef.current = targetView;
    setShellView(targetView);
    setArenaHandoff(false);
    return clearHandoffTimer;
  }, [targetView]);

  useEffect(() => {
    const gameplay = shellView === 'arena' || shellView === 'replay';
    document.body.classList.toggle('game-page', gameplay);
    return () => {
      document.body.classList.remove('game-page');
    };
  }, [shellView]);

  if (!roomCode) {
    return null;
  }

  if (joinError) {
    return (
      <div className="online-room-shell-error">
        <p>{joinError}</p>
        <button type="button" onClick={() => navigate(ONLINE_HOME)}>
          Back to rooms
        </button>
      </div>
    );
  }

  if (!roomId) {
    return (
      <div className="overlay" id="loading">
        <img src="/images/loading.gif" alt="Loading" />
      </div>
    );
  }

  return (
    <div className="online-room-shell" data-view={shellView}>
      {shellView === 'waiting' || arenaHandoff ? (
        <OnlineRoomLobby
          embedded
          roomCode={roomCode}
          roomId={roomId}
          externalRoom={room}
          arenaHandoff={arenaHandoff}
        />
      ) : null}
      {shellView === 'arena' || shellView === 'replay' ? (
        <OnlineGame embedded roomCode={roomCode} roomId={roomId} />
      ) : null}
      {shellView === 'results' ? (
        <OnlinePostGame embedded roomCode={roomCode} roomId={roomId} />
      ) : null}
    </div>
  );
}
