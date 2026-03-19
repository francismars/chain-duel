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
  const [error, setError] = useState('');
  const roomId = searchParams.get('roomId') ?? '';
  const [currentSessionID, setCurrentSessionID] = useState(
    () => sessionStorage.getItem('sessionID') ?? ''
  );
  const [currentSocketID, setCurrentSocketID] = useState('');

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
      setRoom(parsed.room);
    };
    const onCreate = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.createOnlineRoom(payload);
      if (!parsed || parsed.roomId !== roomId) {
        return;
      }
      setJoinPin(parsed.joinPin);
      setRoom(parsed.room);
    };
    const onInvalid = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.onlinePinInvalid(payload);
      if (parsed) {
        setError(parsed.reason);
      }
    };
    const onSession = (payload: { sessionID: string }) => {
      if (!payload?.sessionID) {
        return;
      }
      setCurrentSessionID(payload.sessionID);
      sessionStorage.setItem('sessionID', payload.sessionID);
    };
    const refreshLocalIdentity = () => {
      setCurrentSessionID(sessionStorage.getItem('sessionID') ?? '');
      setCurrentSocketID(socket.id ?? '');
    };

    socket.on('onlineRoomUpdated', onUpdated);
    socket.on('resJoinOnlineRoom', onJoin);
    socket.on('resCreateOnlineRoom', onCreate);
    socket.on('onlinePinInvalid', onInvalid);
    socket.on('session', onSession);
    socket.on('connect', refreshLocalIdentity);
    refreshLocalIdentity();
    socket.emit('getOnlineRoomState', { roomId });
    socket.emit('joinOnlineRoom', { roomId });
    return () => {
      socket.off('onlineRoomUpdated', onUpdated);
      socket.off('resJoinOnlineRoom', onJoin);
      socket.off('resCreateOnlineRoom', onCreate);
      socket.off('onlinePinInvalid', onInvalid);
      socket.off('session', onSession);
      socket.off('connect', refreshLocalIdentity);
    };
  }, [roomId, socket]);

  const paidSeats = useMemo(() => {
    if (!room) {
      return 0;
    }
    return Object.values(room.seats).filter((seat) => seat.status === 'paid').length;
  }, [room]);

  const seatEntries = room ? Object.values(room.seats) : [];
  const effectiveSessionID = currentSessionID || sessionStorage.getItem('sessionID') || '';
  const mySeat = seatEntries.find((seat) => {
    if (seat.status !== 'paid') {
      return false;
    }
    const matchesSession = Boolean(seat.sessionID && seat.sessionID === effectiveSessionID);
    const matchesSocket = Boolean(seat.socketID && seat.socketID === currentSocketID);
    return matchesSession || matchesSocket;
  });
  const myReady = mySeat?.ready === true;
  const phaseLabel = (room?.phase ?? 'lobby').toUpperCase();
  const rematchPending = Boolean(room?.postGame?.rematchRequested);
  const rematchNote = room?.postGame?.rematchNote1 ?? '';
  const rematchAmount = room?.postGame?.rematchRequiredAmount ?? 0;
  const rematchWaitingForSessionID = room?.postGame?.rematchWaitingForSessionID;
  const amILoserToPay = Boolean(rematchWaitingForSessionID && rematchWaitingForSessionID === currentSessionID);
  const snapshotP1Name =
    (room?.snapshot?.state as { p1Name?: string } | undefined)?.p1Name ?? 'Player 1';
  const snapshotP2Name =
    (room?.snapshot?.state as { p2Name?: string } | undefined)?.p2Name ?? 'Player 2';
  const kind1 = rematchPending ? rematchNote : room?.nostrMeta?.note1 ?? '';
  const roomEmojis = room?.nostrMeta?.emojis ?? '';
  const p1 = room?.seats['Player 1'];
  const p2 = room?.seats['Player 2'];
  const p1NameDisplay = rematchPending
    ? p1?.name || snapshotP1Name
    : p1?.name || 'Open seat';
  const p2NameDisplay = rematchPending
    ? p2?.name || snapshotP2Name
    : p2?.name || 'Open seat';
  const p1MetaDisplay = rematchPending
    ? 'Locked for rematch'
    : p1?.status === 'paid'
      ? p1.ready
        ? 'Paid · Ready'
        : p1.disconnectedAt
          ? 'Paid · Offline'
          : 'Paid · Not ready'
      : 'Waiting payment';
  const p2MetaDisplay = rematchPending
    ? 'Locked for rematch'
    : p2?.status === 'paid'
      ? p2.ready
        ? 'Paid · Ready'
        : p2.disconnectedAt
          ? 'Paid · Offline'
          : 'Paid · Not ready'
      : 'Waiting payment';

  useEffect(() => {
    if (!roomId || room?.phase !== 'playing') {
      return;
    }
    navigate(`/online/game?roomId=${encodeURIComponent(roomId)}`);
  }, [navigate, room?.phase, roomId]);

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
      <p id="online-lobby-subtitle">
        {rematchPending
          ? amILoserToPay
            ? `Double or Nothing is active. Scan and zap exactly ${Math.floor(rematchAmount)} sats to continue.`
            : `Double or Nothing is active. Waiting for loser to zap exactly ${Math.floor(rematchAmount)} sats.`
          : 'Claim your seat with PIN-in-zap and launch the duel.'}
      </p>

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

          {mySeat ? (
            <div className="online-lobby-pin-card">
              <p className="online-lobby-label">SEAT STATUS</p>
              <p className="online-lobby-pin">SEAT CLAIMED</p>
              <p className="online-lobby-copy">
                {rematchPending
                  ? 'Rematch locked to the same players. Waiting for rematch payment.'
                  : 'You are registered in this room. Set ready when you are prepared to start.'}
              </p>
            </div>
          ) : (
            <div className="online-lobby-pin-card">
              {rematchPending ? (
                <>
                  <p className="online-lobby-label">SEAT STATUS</p>
                  <p className="online-lobby-pin">LOCKED FOR REMATCH</p>
                  <p className="online-lobby-copy">No open seats while rematch payment is pending.</p>
                </>
              ) : (
                <>
                  <p className="online-lobby-label">YOUR PIN</p>
                  <p className="online-lobby-pin">{joinPin || 'WAITING...'}</p>
                  <p className="online-lobby-copy">Paste this PIN in the zap comment.</p>
                </>
              )}
            </div>
          )}

          <div className="online-lobby-actions-row">
          </div>
        </section>

        <section className="online-lobby-panel online-lobby-panel-qr">
          <p className="online-lobby-label">{rematchPending ? 'DOUBLE OR NOTHING KIND1' : 'ROOM KIND1'}</p>
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
              {rematchPending ? (
                <p className="online-lobby-copy">
                  {amILoserToPay
                    ? `You must zap exactly ${Math.floor(rematchAmount)} sats on this post to start rematch.`
                    : `Waiting for loser to zap exactly ${Math.floor(rematchAmount)} sats on this post.`}
                </p>
              ) : null}
            </>
          ) : (
            <div className="online-lobby-kind1-pending">
              {rematchPending ? 'Publishing rematch Kind1...' : 'Publishing Kind1...'}
            </div>
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
              <p className="online-lobby-seat-name">{p1NameDisplay}</p>
            </div>
            <p className="online-lobby-seat-meta">{p1MetaDisplay}</p>
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
              <p className="online-lobby-seat-name">{p2NameDisplay}</p>
            </div>
            <p className="online-lobby-seat-meta">{p2MetaDisplay}</p>
          </div>
          <div className="online-lobby-seat">
            <p className="online-lobby-label">SPECTATORS</p>
            <p className="online-lobby-seat-name">{room?.spectators.length ?? 0}</p>
            <p className="online-lobby-seat-meta">Watching lobby</p>
          </div>
        </div>
      </section>

      <div className="online-lobby-bottom-actions">
        {mySeat ? (
          <Button
            className="online-lobby-action online-lobby-arena"
            disabled={rematchPending}
            onClick={() => {
              if (rematchPending) {
                return;
              }
              socket?.emit('onlineSetReady', { roomId, ready: !myReady });
            }}
          >
            {rematchPending ? 'WAITING FOR REMATCH PAYMENT' : myReady ? 'UNREADY' : 'MARK AS READY'}
          </Button>
        ) : (
          <Button
            className="online-lobby-action"
            onClick={() => {
              socket?.emit('leaveOnlineRoom', { roomId });
              navigate('/online');
            }}
          >
            LEAVE ROOM
          </Button>
        )}
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay={true} />
    </div>
  );
}
