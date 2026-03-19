import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useSocket } from '@/hooks/useSocket';
import { SocketBoundaryParsers } from '@/shared/socket/socketBoundary';
import { OnlineRoomListItem } from '@/types/socket';
import '@/styles/pages/onlineRooms.css';

export default function OnlineRooms() {
  const navigate = useNavigate();
  const { socket } = useSocket({ autoConnect: true });
  const [rooms, setRooms] = useState<OnlineRoomListItem[]>([]);
  const [buyin, setBuyin] = useState('100');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const creatingRoomRef = useRef(false);
  const pendingRoomIdRef = useRef<string | null>(null);

  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => b.createdAt - a.createdAt),
    [rooms]
  );

  const formatPhase = (phase: OnlineRoomListItem['phase']) => {
    switch (phase) {
      case 'playing':
        return 'LIVE';
      case 'finished':
        return 'FINISHED';
      case 'cancelled':
        return 'CANCELLED';
      default:
        return 'LOBBY';
    }
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
    socket.on('resCreateOnlineRoom', onCreate);
    socket.on('resJoinOnlineRoom', onJoin);
    socket.on('onlinePinInvalid', onInvalid);
    socket.on('onlineRoomUpdated', onRoomUpdated);
    socket.emit('listOnlineRooms');
    return () => {
      socket.off('resListOnlineRooms', onList);
      socket.off('resCreateOnlineRoom', onCreate);
      socket.off('resJoinOnlineRoom', onJoin);
      socket.off('onlinePinInvalid', onInvalid);
      socket.off('onlineRoomUpdated', onRoomUpdated);
    };
  }, [navigate, socket]);

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

  return (
    <div className="online-rooms-page">
      <Sponsorship id="sponsorship-online-rooms" />

      <h1 id="online-title">ONLINE ARENA</h1>
      <p id="online-subtitle">Create a room, share the code, and claim seats with PIN-in-zap.</p>

      <div className="online-layout">
        <section className="online-panel">
          <h2 className="online-panel-title">CREATE ROOM</h2>
          <p className="online-panel-copy">Choose a buy-in and open a public room.</p>
          <div className="online-input-row">
            <input
              className="online-input"
              value={buyin}
              onChange={(event) => setBuyin(event.target.value)}
              placeholder="Buy-in sats"
              inputMode="numeric"
            />
            <Button
              className="online-action"
              onClick={() => {
                const buyinNum = Number.parseInt(buyin, 10);
                setError('');
                setCreatingRoom(true);
                creatingRoomRef.current = true;
                pendingRoomIdRef.current = null;
                socket?.emit('createOnlineRoom', {
                  buyin: Number.isFinite(buyinNum) ? buyinNum : 100,
                });
              }}
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
          <h3>LIVE ROOMS</h3>
        </div>

        <div className="online-room-list">
          {sortedRooms.length === 0 ? (
            <p className="online-empty">No open rooms yet. Create one to start the arena.</p>
          ) : null}
          {sortedRooms.map((room) => (
            <div key={room.roomId} className="online-room-card">
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
                </p>
              </div>
              <div className="online-room-actions">
                <Button
                  className="online-action"
                  onClick={() => {
                    if (room.phase === 'playing') {
                      socket?.emit('spectateOnlineRoom', { roomId: room.roomId });
                      navigate(`/online/game?roomId=${encodeURIComponent(room.roomId)}`);
                      return;
                    }
                    socket?.emit('joinOnlineRoom', { roomId: room.roomId });
                  }}
                >
                  {room.phase === 'playing' ? 'WATCH LIVE' : 'ENTER ROOM'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="online-footer-controls">
        <Button className="online-back" onClick={() => navigate('/')}>
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
