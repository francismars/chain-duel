import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/Button';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useSocket } from '@/hooks/useSocket';
import { SocketBoundaryParsers } from '@/shared/socket/socketBoundary';
import { OnlineRoomState } from '@/types/socket';
import '@/styles/pages/onlineRoomLobby.css';

export default function OnlineRoomLobby() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { socket } = useSocket({ autoConnect: true });
  const [room, setRoom] = useState<OnlineRoomState | null>(null);
  const [joinPin, setJoinPin] = useState<string>('');
  const [pinExpiresAt, setPinExpiresAt] = useState<number>(0);
  const [error, setError] = useState('');
  const roomId = searchParams.get('roomId') ?? '';
  const sessionID = sessionStorage.getItem('sessionID') ?? '';

  useEffect(() => {
    if (!socket || !roomId) {
      return;
    }
    const onUpdated = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.onlineRoomUpdated(payload);
      if (parsed && parsed.roomId === roomId) {
        setRoom(parsed);
      }
    };
    const onJoin = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.joinOnlineRoom(payload);
      if (!parsed || parsed.roomId !== roomId) {
        return;
      }
      setJoinPin(parsed.joinPin);
      setPinExpiresAt(parsed.pinExpiresAt);
      setRoom(parsed.room);
    };
    const onCreate = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.createOnlineRoom(payload);
      if (!parsed || parsed.roomId !== roomId) {
        return;
      }
      setJoinPin(parsed.joinPin);
      setPinExpiresAt(parsed.pinExpiresAt);
      setRoom(parsed.room);
    };
    const onInvalid = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.onlinePinInvalid(payload);
      if (parsed) {
        setError(parsed.reason);
      }
    };

    socket.on('onlineRoomUpdated', onUpdated);
    socket.on('resJoinOnlineRoom', onJoin);
    socket.on('resCreateOnlineRoom', onCreate);
    socket.on('onlinePinInvalid', onInvalid);
    socket.emit('getOnlineRoomState', { roomId });
    socket.emit('joinOnlineRoom', { roomId });
    return () => {
      socket.off('onlineRoomUpdated', onUpdated);
      socket.off('resJoinOnlineRoom', onJoin);
      socket.off('resCreateOnlineRoom', onCreate);
      socket.off('onlinePinInvalid', onInvalid);
    };
  }, [roomId, socket]);

  const paidSeats = useMemo(() => {
    if (!room) {
      return 0;
    }
    return Object.values(room.seats).filter((seat) => seat.status === 'paid').length;
  }, [room]);

  const isHost = room?.hostSessionID === sessionID;
  const phaseLabel = (room?.phase ?? 'lobby').toUpperCase();
  const kind1 = room?.nostrMeta?.note1 ?? '';
  const roomEmojis = room?.nostrMeta?.emojis ?? '';
  const p1 = room?.seats['Player 1'];
  const p2 = room?.seats['Player 2'];

  if (!roomId) {
    return (
      <div className="online-lobby-page online-lobby-page-missing">
        <p className="online-lobby-error">Missing room id.</p>
      </div>
    );
  }

  return (
    <div className="online-lobby-page">
      <Sponsorship id="sponsorship-online-lobby" />

      <h1 id="online-lobby-title">ONLINE LOBBY</h1>
      <p id="online-lobby-subtitle">Claim your seat with PIN-in-zap and launch the duel.</p>

      <div className="online-lobby-top">
        <section className="online-lobby-panel online-lobby-panel-main">
          <div className="online-lobby-meta-row">
            <div>
              <p className="online-lobby-label">ROOM CODE</p>
              <p className="online-lobby-code">{room?.roomCode ?? '...'}</p>
            </div>
            <div className={`online-lobby-phase online-lobby-phase-${room?.phase ?? 'lobby'}`}>
              {phaseLabel}
            </div>
          </div>

          <div className="online-lobby-buyin">
            Buy-in: <b>{room?.buyin ?? 0} sats</b> · Seats paid: <b>{paidSeats}/2</b>
          </div>

          <div className="online-lobby-emojis-card">
            <p className="online-lobby-label">ROOM EMOJIS</p>
            <p className="online-lobby-emojis">
              {roomEmojis || 'Publishing...'}
            </p>
            <p className="online-lobby-copy">
              Confirm this emoji id before sending your zap.
            </p>
          </div>

          <div className="online-lobby-pin-card">
            <p className="online-lobby-label">YOUR PIN</p>
            <p className="online-lobby-pin">{joinPin || 'WAITING...'}</p>
            <p className="online-lobby-copy">Paste this PIN in the zap comment.</p>
            <p className="online-lobby-expiry">
              Expires:{' '}
              {pinExpiresAt ? new Date(pinExpiresAt).toLocaleTimeString() : 'Waiting...'}
            </p>
          </div>

          <div className="online-lobby-actions-row">
            <Button
              className="online-lobby-action"
              onClick={() => {
                if (roomId) {
                  socket?.emit('joinOnlineRoom', { roomId });
                }
              }}
            >
              REFRESH PIN
            </Button>
            {isHost ? (
              <Button
                className={`online-lobby-action ${paidSeats < 2 ? 'disabled' : ''}`}
                onClick={() => {
                  socket?.emit('startOnlineGame', { roomId });
                }}
                disabled={paidSeats < 2}
              >
                START MATCH
              </Button>
            ) : null}
          </div>
        </section>

        <section className="online-lobby-panel online-lobby-panel-qr">
          <p className="online-lobby-label">ROOM KIND1</p>
          {kind1 ? (
            <>
              <QRCodeSVG value={`https://njump.me/${kind1}`} size={210} includeMargin className="online-lobby-qr" />
              <a
                className="online-lobby-kind1"
                href={`https://njump.me/${kind1}`}
                target="_blank"
                rel="noreferrer"
              >
                {kind1}
              </a>
            </>
          ) : (
            <div className="online-lobby-kind1-pending">Publishing Kind1...</div>
          )}
        </section>
      </div>

      {error ? <p className="online-lobby-error">Error: {error}</p> : null}

      <section className="online-lobby-panel online-lobby-status">
        <h3>ROOM STATUS</h3>
        <div className="online-lobby-status-grid">
          <div className="online-lobby-seat">
            <p className="online-lobby-label">PLAYER 1</p>
            <div className="online-lobby-seat-identity">
              {p1?.status === 'paid' ? (
                <img
                  className="online-lobby-seat-avatar"
                  src={p1.picture || '/images/loading.gif'}
                  alt={p1?.name || 'Player 1'}
                />
              ) : (
                <div className="online-lobby-seat-avatar online-lobby-seat-avatar-empty" />
              )}
              <p className="online-lobby-seat-name">{p1?.name ?? 'Open seat'}</p>
            </div>
            <p className="online-lobby-seat-meta">{p1?.status === 'paid' ? 'Paid' : 'Waiting payment'}</p>
          </div>
          <div className="online-lobby-seat">
            <p className="online-lobby-label">PLAYER 2</p>
            <div className="online-lobby-seat-identity">
              {p2?.status === 'paid' ? (
                <img
                  className="online-lobby-seat-avatar"
                  src={p2.picture || '/images/loading.gif'}
                  alt={p2?.name || 'Player 2'}
                />
              ) : (
                <div className="online-lobby-seat-avatar online-lobby-seat-avatar-empty" />
              )}
              <p className="online-lobby-seat-name">{p2?.name ?? 'Open seat'}</p>
            </div>
            <p className="online-lobby-seat-meta">{p2?.status === 'paid' ? 'Paid' : 'Waiting payment'}</p>
          </div>
          <div className="online-lobby-seat">
            <p className="online-lobby-label">SPECTATORS</p>
            <p className="online-lobby-seat-name">{room?.spectators.length ?? 0}</p>
            <p className="online-lobby-seat-meta">Watching lobby</p>
          </div>
        </div>
      </section>

      <div className="online-lobby-bottom-actions">
        <Button
          className="online-lobby-action online-lobby-arena"
          onClick={() => navigate(`/online/game?roomId=${encodeURIComponent(roomId)}`)}
        >
          ENTER ARENA
        </Button>
        <Button
          className="online-lobby-action"
          onClick={() => {
            if (isHost) {
              socket?.emit('cancelOnlineRoom', { roomId });
            } else {
              socket?.emit('leaveOnlineRoom', { roomId });
            }
            navigate('/online');
          }}
        >
          {isHost ? 'CANCEL ROOM' : 'LEAVE ROOM'}
        </Button>
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay={true} />
    </div>
  );
}
