import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSocket } from '@/hooks/useSocket';
import { SocketBoundaryParsers } from '@/shared/socket/socketBoundary';
import { ONLINE_HOME } from '@/shared/constants/onlineRoutes';
import type { OnlineRoomState } from '@/types/socket';
import OnlineRoomLobby from '@/pages/OnlineRoomLobby';
import OnlineGame from '@/pages/OnlineGame';
import OnlinePostGame from '@/pages/OnlinePostGame';
import { OnlineJoinErrorPage } from '@/pages/OnlineJoinErrorPage';
import { OnlineVictoryReveal } from '@/components/online/OnlineVictoryReveal';
import { OnlineMatchIntroReveal } from '@/components/online/OnlineMatchIntroReveal';
import {
  countPaidSeats,
  matchIntroDedupKey,
  shouldShowMatchIntro,
} from '@/lib/online/shouldShowMatchIntro';
import './game.css';

/** Pause on the arena after match end before post-game (reveal anim ~2.5s + read time). */
const VICTORY_HANDOFF_MS = 5000;

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
  const replayMode = searchParams.has('replay');
  const bootstrapRoomId = (searchParams.get('roomId') ?? '').trim();
  const bootstrapMatchRoundRaw = Number(
    searchParams.get('round') ?? searchParams.get('matchRound') ?? ''
  );
  const bootstrapMatchRound =
    Number.isFinite(bootstrapMatchRoundRaw) && bootstrapMatchRoundRaw >= 1
      ? Math.floor(bootstrapMatchRoundRaw)
      : undefined;
  const [roomId, setRoomId] = useState(bootstrapRoomId);
  const [room, setRoom] = useState<OnlineRoomState | null>(null);
  const [joinError, setJoinError] = useState('');
  const joinedRef = useRef(false);
  const [shellView, setShellView] = useState<ShellView>('waiting');
  const [matchIntroActive, setMatchIntroActive] = useState(false);
  const shellViewRef = useRef<ShellView>('waiting');
  const handoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootstrappedRef = useRef(false);
  const bootstrapFallbackRef = useRef(false);
  const introShownKeysRef = useRef(new Set<string>());
  const [viewerSessionID, setViewerSessionID] = useState(
    () => sessionStorage.getItem('sessionID') ?? ''
  );
  const [viewerSocketID, setViewerSocketID] = useState('');

  const [postGameReady, setPostGameReady] = useState(false);
  const [victoryHandoff, setVictoryHandoff] = useState(false);
  const roomRef = useRef(room);
  roomRef.current = room;

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

  const emitBootstrap = useCallback(() => {
    if (!socket || !roomCode) {
      return;
    }
    if (bootstrapRoomId) {
      socket.emit('getOnlineRoomState', {
        roomId: bootstrapRoomId,
        ...(bootstrapMatchRound != null ? { matchRound: bootstrapMatchRound } : {}),
      });
      return;
    }
    emitJoin(false);
  }, [bootstrapMatchRound, bootstrapRoomId, emitJoin, roomCode, socket]);

  const targetView = useMemo(
    () => resolveTargetView(room, replayMode),
    [replayMode, room]
  );

  const handleMatchIntroComplete = useCallback(() => {
    setMatchIntroActive(false);
  }, []);

  useEffect(() => {
    if (!roomCode) {
      navigate(ONLINE_HOME, { replace: true });
    }
  }, [navigate, roomCode]);

  useEffect(() => {
    if (!socket) {
      return;
    }
    const refreshIdentity = () => {
      setViewerSocketID(socket.id ?? '');
      const stored = sessionStorage.getItem('sessionID');
      if (stored) {
        setViewerSessionID(stored);
      }
    };
    const onSession = (payload: { sessionID: string }) => {
      if (!payload?.sessionID) {
        return;
      }
      sessionStorage.setItem('sessionID', payload.sessionID);
      setViewerSessionID(payload.sessionID);
      setViewerSocketID(socket.id ?? '');
    };
    refreshIdentity();
    socket.on('connect', refreshIdentity);
    socket.on('session', onSession);
    return () => {
      socket.off('connect', refreshIdentity);
      socket.off('session', onSession);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket || !roomCode) {
      return;
    }

    const cachedRoom = roomRef.current;
    const haveFinishedRoomForCode =
      !replayMode &&
      cachedRoom != null &&
      cachedRoom.roomCode.toUpperCase() === roomCode &&
      (cachedRoom.phase === 'postgame' || cachedRoom.phase === 'finished');

    if (!haveFinishedRoomForCode) {
      joinedRef.current = false;
      bootstrappedRef.current = false;
      bootstrapFallbackRef.current = false;
      if (bootstrapRoomId) {
        setRoomId(bootstrapRoomId);
      }
    } else {
      joinedRef.current = true;
      setJoinError('');
    }

    const refreshCachedRoom = () => {
      const live = roomRef.current;
      if (
        live?.roomId &&
        live.roomCode.toUpperCase() === roomCode &&
        (live.phase === 'postgame' || live.phase === 'finished')
      ) {
        socket.emit('getOnlineRoomState', { roomId: live.roomId });
      }
    };

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
      if (!joinedRef.current && !replayMode) {
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
      if (
        parsed.reason === 'room_not_found' &&
        bootstrapRoomId &&
        !bootstrapFallbackRef.current &&
        !replayMode
      ) {
        bootstrapFallbackRef.current = true;
        emitJoin(false);
        return;
      }
      if (parsed.reason === 'room_not_found') {
        const live = roomRef.current;
        if (
          live &&
          live.roomCode.toUpperCase() === roomCode &&
          (live.phase === 'postgame' || live.phase === 'finished')
        ) {
          return;
        }
        setJoinError('Room not found.');
      }
    };

    const onConnect = () => {
      if (haveFinishedRoomForCode) {
        refreshCachedRoom();
        return;
      }
      emitBootstrap();
    };

    if (!haveFinishedRoomForCode) {
      emitBootstrap();
    } else {
      refreshCachedRoom();
    }
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
  }, [
    bootstrapMatchRound,
    bootstrapRoomId,
    emitBootstrap,
    emitJoin,
    replayMode,
    roomCode,
    shouldSpectateOnJoin,
    socket,
    syncRoom,
  ]);

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
      return clearHandoffTimer;
    }

    const prev = shellViewRef.current;
    if (targetView === prev) {
      return clearHandoffTimer;
    }

    if (targetView === 'results' && prev === 'arena') {
      setVictoryHandoff(true);
      clearHandoffTimer();
      handoffTimerRef.current = setTimeout(() => {
        handoffTimerRef.current = null;
        shellViewRef.current = 'results';
        setShellView('results');
        setVictoryHandoff(false);
      }, VICTORY_HANDOFF_MS);
      return clearHandoffTimer;
    }

    if (targetView !== 'results') {
      setVictoryHandoff(false);
    }

    clearHandoffTimer();
    shellViewRef.current = targetView;
    setShellView(targetView);
    return clearHandoffTimer;
  }, [targetView]);

  useEffect(() => {
    if (!room || replayMode) {
      setMatchIntroActive(false);
      return;
    }
    if (countPaidSeats(room) < 2) {
      setMatchIntroActive(false);
      return;
    }
    if (
      !shouldShowMatchIntro({
        room,
        replayMode,
        alreadyShownKeys: introShownKeysRef.current,
      })
    ) {
      return;
    }
    const key = matchIntroDedupKey(room);
    introShownKeysRef.current.add(key);
    setMatchIntroActive(true);
    if (shellViewRef.current !== 'arena' && targetView === 'arena') {
      shellViewRef.current = 'arena';
      setShellView('arena');
    }
  }, [room, replayMode, targetView]);

  useEffect(() => {
    const gameplay =
      shellView === 'arena' || shellView === 'replay' || matchIntroActive;
    document.body.classList.toggle('game-page', gameplay);
    return () => {
      document.body.classList.remove('game-page');
    };
  }, [matchIntroActive, shellView]);

  useEffect(() => {
    if (shellView !== 'results') {
      setPostGameReady(false);
    }
  }, [shellView]);

  const showLoadingOverlay =
    !roomId || !room || (shellView === 'results' && !postGameReady);
  const prefetchPostGame = targetView === 'results' && Boolean(room);

  if (!roomCode) {
    return null;
  }

  if (joinError) {
    return (
      <OnlineJoinErrorPage
        title={
          joinError.toLowerCase().includes('not found')
            ? 'Room not found'
            : 'Could not join room'
        }
        detail={joinError}
        roomCode={roomCode}
        onBack={() => navigate(ONLINE_HOME)}
      />
    );
  }

  return (
    <>
      {showLoadingOverlay ? (
        <div className="overlay" id="loading">
          <img src="/images/loading.gif" alt="Loading" />
        </div>
      ) : null}
      <div className="online-room-shell" data-view={shellView}>
        {!showLoadingOverlay && shellView === 'waiting' ? (
          <OnlineRoomLobby
            embedded
            roomCode={roomCode}
            roomId={roomId}
            externalRoom={room}
          />
        ) : null}
        {!showLoadingOverlay &&
        (shellView === 'arena' || shellView === 'replay') ? (
          <OnlineGame
            embedded
            roomCode={roomCode}
            roomId={roomId}
            victoryHandoff={victoryHandoff}
            matchIntroActive={matchIntroActive}
          />
        ) : null}
        {matchIntroActive && room ? (
          <OnlineMatchIntroReveal
            room={room}
            sessionID={viewerSessionID}
            socketID={viewerSocketID}
            onComplete={handleMatchIntroComplete}
          />
        ) : null}
        {victoryHandoff && room ? <OnlineVictoryReveal room={room} /> : null}
        {prefetchPostGame ? (
          <div className={shellView === 'results' ? undefined : 'hide'}>
            <OnlinePostGame
              embedded
              roomCode={roomCode}
              roomId={roomId}
              onReadyChange={setPostGameReady}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
