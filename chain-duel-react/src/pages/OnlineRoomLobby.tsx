import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/Button';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useSocket } from '@/hooks/useSocket';
import { SocketBoundaryParsers } from '@/shared/socket/socketBoundary';
import { OnlineRoomState } from '@/types/socket';
import { onlinePingAccent } from '@/game/online/onlinePingAccent';
import { signNostrEvent, signOnlineSeatLinkChallenge } from '@/lib/nostr/signOnlineSeatLink';
import type { NostrLinkedProfile } from '@/types/schemas';
import '@/styles/pages/onlineRoomLobby.css';

type Kind1PostLoaded = {
  eventId: string;
  tags: string[][];
  pubpayZap: {
    isPubpay: boolean;
    zapMinSats?: number;
    zapMaxSats?: number;
    zapUses?: string;
  };
  content: string;
  created_at: number;
  pubkey: string;
  npubDisplay: string;
  authorName: string;
  authorPicture?: string | null;
};

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
  const [kind1View, setKind1View] = useState<'njump' | 'nostr' | 'pubpay' | 'post'>('post');
  const [kind1PostEvent, setKind1PostEvent] = useState<Kind1PostLoaded | null>(null);
  const [kind1PostStatus, setKind1PostStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [kind1PostRetry, setKind1PostRetry] = useState(0);
  const [zapPayBusy, setZapPayBusy] = useState(false);
  const [seatZapInvoice, setSeatZapInvoice] = useState<{
    pr: string;
    lightningUri: string;
    buyinSats: number;
  } | null>(null);
  const [yourPingMs, setYourPingMs] = useState<number | null>(null);
  const [nostrLinkExpiresAt, setNostrLinkExpiresAt] = useState<number | null>(null);
  const [nostrLinkedProfile, setNostrLinkedProfile] = useState<NostrLinkedProfile | null>(null);
  const [nostrModalOpen, setNostrModalOpen] = useState(false);
  const [nostrLinkBusy, setNostrLinkBusy] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [seatPayMode, setSeatPayMode] = useState<'nostr' | 'lightning'>(() =>
    sessionStorage.getItem('onlineLobbySeatPayMode') === 'lightning' ? 'lightning' : 'nostr'
  );
  const [lightningPay, setLightningPay] = useState<{
    lnurl: string;
    lightningUri: string;
    buyin: number;
    expiresAt: number;
  } | null>(null);
  const [lightningBusy, setLightningBusy] = useState(false);
  /** Pubkey from last successful kind-1 sign, until server confirms with `resOnlineNostrLinkOk`. */
  const pendingNostrLinkPubkeyRef = useRef<string | null>(null);

  const nostrLinkStorageKey = useMemo(
    () => (roomId ? `onlineLobbyNostrLink_${roomId}` : ''),
    [roomId]
  );

  useEffect(() => {
    sessionStorage.setItem('onlineLobbySeatPayMode', seatPayMode);
  }, [seatPayMode]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 4000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!nostrLinkStorageKey) {
      return;
    }
    try {
      const raw = sessionStorage.getItem(nostrLinkStorageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as {
        expiresAt: number;
        pubkey: string;
        name: string;
        picture: string | null;
      };
      if (
        typeof parsed.expiresAt === 'number' &&
        parsed.expiresAt > Date.now() &&
        typeof parsed.pubkey === 'string'
      ) {
        setNostrLinkExpiresAt(parsed.expiresAt);
        setNostrLinkedProfile({
          pubkey: parsed.pubkey,
          name: typeof parsed.name === 'string' ? parsed.name : `${parsed.pubkey.slice(0, 12)}…`,
          picture: typeof parsed.picture === 'string' ? parsed.picture : null,
        });
      } else {
        sessionStorage.removeItem(nostrLinkStorageKey);
      }
    } catch {
      sessionStorage.removeItem(nostrLinkStorageKey);
    }
  }, [nostrLinkStorageKey]);

  useEffect(() => {
    if (!nostrLinkStorageKey) {
      return;
    }
    if (nostrLinkExpiresAt != null && nostrLinkExpiresAt <= nowTick) {
      setNostrLinkedProfile(null);
      sessionStorage.removeItem(nostrLinkStorageKey);
    }
  }, [nostrLinkExpiresAt, nowTick, nostrLinkStorageKey]);

  useEffect(() => {
    if (!nostrModalOpen) {
      return;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNostrModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [nostrModalOpen]);

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
        pendingNostrLinkPubkeyRef.current = null;
        setNostrLinkBusy(false);
        setLightningBusy(false);
        setError(parsed.reason);
      }
    };
    const onLightning = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.resOnlineSeatLightning(payload);
      if (parsed) {
        setLightningPay(parsed);
        setLightningBusy(false);
        setError('');
      }
    };
    const onLightningErr = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.resOnlineSeatLightningError(payload);
      if (parsed) {
        setLightningBusy(false);
        setError(parsed.reason);
      }
    };
    const onLightningCancelled = () => {
      setLightningPay(null);
      setLightningBusy(false);
    };
    const onNostrOk = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.resOnlineNostrLinkOk(payload);
      if (!parsed) {
        return;
      }
      setNostrLinkExpiresAt(parsed.expiresAt);
      setNostrLinkBusy(false);
      setError('');
      setNostrModalOpen(false);
      pendingNostrLinkPubkeyRef.current = null;
      const storageKey = roomId ? `onlineLobbyNostrLink_${roomId}` : '';
      const profileFromServer = parsed.profile;
      const profile: NostrLinkedProfile | null = profileFromServer
        ? {
            pubkey: profileFromServer.pubkey,
            name: profileFromServer.name,
            picture: profileFromServer.picture ?? null,
          }
        : null;
      if (profile && storageKey) {
        setNostrLinkedProfile(profile);
        try {
          sessionStorage.setItem(
            storageKey,
            JSON.stringify({
              expiresAt: parsed.expiresAt,
              pubkey: profile.pubkey,
              name: profile.name,
              picture: profile.picture,
            })
          );
        } catch {
          /* ignore quota */
        }
      }
      setKind1View('post');
    };
    const onNostrChallenge = async (payload: unknown) => {
      const parsed = SocketBoundaryParsers.resOnlineNostrLinkChallenge(payload);
      if (!parsed) {
        return;
      }
      if (parsed.roomId !== roomId) {
        setNostrLinkBusy(false);
        return;
      }
      setNostrLinkBusy(true);
      setError('');
      try {
        const signed = await signOnlineSeatLinkChallenge({
          challenge: parsed.challenge,
        });
        pendingNostrLinkPubkeyRef.current = signed.pubkey;
        socket.emit('confirmOnlineNostrLink', {
          roomId,
          event: signed as unknown as Record<string, unknown>,
        });
      } catch (e) {
        pendingNostrLinkPubkeyRef.current = null;
        const msg = e instanceof Error ? e.message : 'nostr_sign_failed';
        setError(msg);
        setNostrLinkBusy(false);
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

    const onKind1Post = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.resOnlineKind1Post(payload);
      if (!parsed || parsed.roomId !== roomId) {
        return;
      }
      if (parsed.ok) {
        setKind1PostEvent({
          eventId: parsed.eventId,
          tags: parsed.tags,
          pubpayZap: parsed.pubpayZap,
          content: parsed.content,
          created_at: parsed.created_at,
          pubkey: parsed.pubkey,
          npubDisplay: parsed.npubDisplay,
          authorName: parsed.authorName,
          authorPicture: parsed.authorPicture,
        });
        setKind1PostStatus('idle');
      } else {
        setKind1PostEvent(null);
        setKind1PostStatus('error');
      }
    };

    const onZapPayPrepare = async (payload: unknown) => {
      const parsed = SocketBoundaryParsers.resOnlineSeatZapPayPrepare(payload);
      if (!parsed || parsed.roomId !== roomId) {
        return;
      }
      try {
        const signed = await signNostrEvent(parsed.unsignedZap);
        socket.emit('confirmOnlineSeatZapPay', {
          roomId,
          event: signed as unknown as Record<string, unknown>,
        });
      } catch (e) {
        setZapPayBusy(false);
        const msg = e instanceof Error ? e.message : 'sign_failed';
        setError(msg);
      }
    };

    const onZapPayInvoice = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.resOnlineSeatZapPayInvoice(payload);
      if (!parsed || parsed.roomId !== roomId) {
        return;
      }
      setZapPayBusy(false);
      setSeatZapInvoice({
        pr: parsed.pr,
        lightningUri: parsed.lightningUri,
        buyinSats: parsed.buyinSats,
      });
    };

    const onZapPayError = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.resOnlineSeatZapPayError(payload);
      if (!parsed) {
        return;
      }
      setZapPayBusy(false);
      setError(parsed.reason);
    };

    socket.on('onlineRoomUpdated', onUpdated);
    socket.on('resJoinOnlineRoom', onJoin);
    socket.on('resCreateOnlineRoom', onCreate);
    socket.on('onlinePinInvalid', onInvalid);
    socket.on('resOnlineNostrLinkOk', onNostrOk);
    socket.on('resOnlineNostrLinkChallenge', onNostrChallenge);
    socket.on('resOnlineKind1Post', onKind1Post);
    socket.on('resOnlineSeatZapPayPrepare', onZapPayPrepare);
    socket.on('resOnlineSeatZapPayInvoice', onZapPayInvoice);
    socket.on('resOnlineSeatZapPayError', onZapPayError);
    socket.on('resOnlineSeatLightning', onLightning);
    socket.on('resOnlineSeatLightningError', onLightningErr);
    socket.on('resOnlineSeatLightningCancelled', onLightningCancelled);
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
      socket.off('resOnlineNostrLinkOk', onNostrOk);
      socket.off('resOnlineNostrLinkChallenge', onNostrChallenge);
      socket.off('resOnlineKind1Post', onKind1Post);
      socket.off('resOnlineSeatZapPayPrepare', onZapPayPrepare);
      socket.off('resOnlineSeatZapPayInvoice', onZapPayInvoice);
      socket.off('resOnlineSeatZapPayError', onZapPayError);
      socket.off('resOnlineSeatLightning', onLightning);
      socket.off('resOnlineSeatLightningError', onLightningErr);
      socket.off('resOnlineSeatLightningCancelled', onLightningCancelled);
      socket.off('session', onSession);
      socket.off('connect', refreshLocalIdentity);
    };
  }, [roomId, socket]);

  useEffect(() => {
    if (!socket || !roomId) {
      return;
    }
    const measure = () => {
      const t0 = Date.now();
      socket.emit('pingLatency', () => {
        const ms = Date.now() - t0;
        setYourPingMs(ms);
        socket.emit('reportOnlineRoomPing', { roomId, latencyMs: ms });
      });
    };
    measure();
    const id = window.setInterval(measure, 2500);
    return () => window.clearInterval(id);
  }, [roomId, socket]);

  const paidSeats = useMemo(() => {
    if (!room) {
      return 0;
    }
    return Object.values(room.seats).filter((seat) => seat.status === 'paid').length;
  }, [room]);

  const nostrLinkActive = useMemo(
    () => nostrLinkExpiresAt != null && nostrLinkExpiresAt > nowTick,
    [nostrLinkExpiresAt, nowTick]
  );

  const startNostrLinkFlow = () => {
    if (!socket || !roomId) {
      return;
    }
    setError('');
    setNostrLinkBusy(true);
    socket.emit('requestOnlineNostrLinkChallenge', { roomId });
  };

  const openNostrModal = () => {
    setError('');
    setNostrModalOpen(true);
  };

  const closeNostrModal = () => {
    setNostrModalOpen(false);
  };

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
  const myRoleLabel = mySeat?.role ?? 'Spectator';
  const isMyP1Seat = mySeat?.role === 'Player 1';
  const isMyP2Seat = mySeat?.role === 'Player 2';
  const phaseLabel = (room?.phase ?? 'lobby').toUpperCase();
  const isSessionClosed = room?.phase === 'finished';
  const isPostgame = room?.phase === 'postgame';
  const isMatchEnded = isPostgame || isSessionClosed;
  const rematchPending = Boolean(room?.postGame?.rematchRequested);
  const rematchNote = room?.postGame?.rematchNote1 ?? '';
  const rematchAmount = room?.postGame?.rematchRequiredAmount ?? 0;
  const rematchWaitingForSessionID = room?.postGame?.rematchWaitingForSessionID;
  const amILoserToPay = Boolean(rematchWaitingForSessionID && rematchWaitingForSessionID === currentSessionID);
  /** Seat grid: emphasize your row in lobby; stronger when you are ready to start. */
  const seatHighlightLobby = !isSessionClosed && !rematchPending;
  const snapshotP1Name =
    (room?.snapshot?.state as { p1Name?: string } | undefined)?.p1Name ?? 'Player 1';
  const snapshotP2Name =
    (room?.snapshot?.state as { p2Name?: string } | undefined)?.p2Name ?? 'Player 2';
  const kind1 = rematchPending ? rematchNote : room?.nostrMeta?.note1 ?? '';
  const njumpUrl = kind1 ? `https://njump.me/${kind1}` : '';
  const nostrUri = kind1 ? `nostr:${kind1}` : '';
  const pubpayUrl = kind1 ? `https://pubpay.me/note/${kind1}` : '';
  const roomEmojis = room?.nostrMeta?.emojis ?? '';
  const p1 = room?.seats['Player 1'];
  const p2 = room?.seats['Player 2'];
  const p1AvatarSrc = isMatchEnded
    ? p1?.picture ||
      room?.postGame?.p1Picture ||
      (room?.postGame?.winnerRole === 'Player 1' ? room?.postGame?.winnerPicture : undefined)
    : p1?.picture;
  const p2AvatarSrc = isMatchEnded
    ? p2?.picture ||
      room?.postGame?.p2Picture ||
      (room?.postGame?.winnerRole === 'Player 2' ? room?.postGame?.winnerPicture : undefined)
    : p2?.picture;
  const finishedSummary =
    isMatchEnded
      ? {
          p1Name: snapshotP1Name,
          p2Name: snapshotP2Name,
          p1Score: Math.floor((room?.snapshot?.state as { score?: number[] } | undefined)?.score?.[0] ?? 0),
          p2Score: Math.floor((room?.snapshot?.state as { score?: number[] } | undefined)?.score?.[1] ?? 0),
          winner: room?.postGame?.winnerName ?? 'Winner',
          netPrize: Math.floor((room?.postGame?.winnerPoints ?? 0) * 0.95),
        }
      : null;
  const p1NameDisplay = isMatchEnded
    ? p1?.name || snapshotP1Name
    : rematchPending
      ? p1?.name || snapshotP1Name
      : p1?.name || 'Open seat';
  const p2NameDisplay = isMatchEnded
    ? p2?.name || snapshotP2Name
    : rematchPending
      ? p2?.name || snapshotP2Name
      : p2?.name || 'Open seat';
  const p1MetaDisplay = isMatchEnded
    ? room?.postGame?.winnerRole === 'Player 1'
      ? 'Winner'
      : 'Played'
    : rematchPending
      ? 'Locked for rematch'
      : p1?.status === 'paid'
        ? p1.ready
          ? 'Paid · Ready'
          : p1.disconnectedAt
            ? 'Paid · Offline'
            : 'Paid · Not ready'
        : 'Waiting payment';
  const p2MetaDisplay = isMatchEnded
    ? room?.postGame?.winnerRole === 'Player 2'
      ? 'Winner'
      : 'Played'
    : rematchPending
      ? 'Locked for rematch'
      : p2?.status === 'paid'
        ? p2.ready
          ? 'Paid · Ready'
          : p2.disconnectedAt
            ? 'Paid · Offline'
            : 'Paid · Not ready'
        : 'Waiting payment';

  const hasPaidMySeat = Boolean(mySeat);

  const showKind1QrPanel =
    Boolean(kind1) &&
    (rematchPending || hasPaidMySeat || seatPayMode === 'nostr' || nostrLinkActive);

  useEffect(() => {
    if (hasPaidMySeat) {
      setLightningPay(null);
      setSeatZapInvoice(null);
      setZapPayBusy(false);
    }
  }, [hasPaidMySeat]);

  useEffect(() => {
    if (!nostrLinkActive || !socket) {
      return;
    }
    socket.emit('cancelOnlineSeatLightning');
    setLightningPay(null);
    setLightningBusy(false);
  }, [nostrLinkActive, socket]);

  const switchSeatPayMode = (mode: 'nostr' | 'lightning') => {
    if (mode === 'nostr' && seatPayMode === 'lightning' && socket) {
      socket.emit('cancelOnlineSeatLightning');
      setLightningPay(null);
      setLightningBusy(false);
    }
    setSeatPayMode(mode);
  };

  const startSeatZapPay = () => {
    if (!socket || !roomId || !nostrLinkActive) {
      return;
    }
    setSeatZapInvoice(null);
    setError('');
    setZapPayBusy(true);
    socket.emit('requestOnlineSeatZapPayPrepare', { roomId });
  };

  const payAnonymouslyFromPost = () => {
    if (!socket || !roomId) {
      return;
    }
    setSeatZapInvoice(null);
    setError('');
    if (seatPayMode === 'lightning') {
      setLightningBusy(true);
      socket.emit('requestOnlineSeatLightning', { roomId });
    } else {
      switchSeatPayMode('lightning');
    }
  };

  const tryWeblnPaySeatZap = async () => {
    if (!seatZapInvoice) {
      return;
    }
    const win = window as Window & {
      webln?: { enable?: () => Promise<void>; sendPayment?: (p: string) => Promise<unknown> };
    };
    if (!win.webln?.enable || !win.webln.sendPayment) {
      return;
    }
    try {
      await win.webln.enable();
      await win.webln.sendPayment(seatZapInvoice.pr);
    } catch {
      /* user cancelled or wallet unsupported */
    }
  };

  useEffect(() => {
    if (!socket || !roomId) {
      return;
    }
    if (seatPayMode !== 'lightning') {
      return;
    }
    if (nostrLinkActive) {
      return;
    }
    if (hasPaidMySeat) {
      return;
    }
    if (rematchPending || isMatchEnded || room?.phase !== 'lobby') {
      return;
    }
    setLightningBusy(true);
    setError('');
    socket.emit('requestOnlineSeatLightning', { roomId });
  }, [
    socket,
    roomId,
    seatPayMode,
    nostrLinkActive,
    hasPaidMySeat,
    rematchPending,
    isMatchEnded,
    room?.phase,
  ]);

  useEffect(() => {
    if (!roomId || room?.phase !== 'playing') {
      return;
    }
    navigate(`/online/game?roomId=${encodeURIComponent(roomId)}`);
  }, [navigate, room?.phase, roomId]);

  useEffect(() => {
    if (kind1View !== 'post' || !kind1 || !socket || !roomId) {
      return;
    }
    setKind1PostStatus('loading');
    setKind1PostEvent(null);
    socket.emit('requestOnlineKind1Post', { roomId });
  }, [kind1View, kind1, kind1PostRetry, socket, roomId]);

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

      <h1 id="online-lobby-title">MAINNET LOBBY</h1>
      <p id="online-lobby-subtitle">
        {room?.phase === 'finished'
          ? 'Session finished — winner closed payout. View details or replay from this room.'
          : room?.phase === 'postgame'
            ? 'Match ended. Open victory screen for payout, Double or Nothing, or replay.'
            : rematchPending
              ? amILoserToPay
                ? `Double or Nothing is active. Scan and zap exactly ${Math.floor(rematchAmount)} sats to continue.`
                : `Double or Nothing is active. Waiting for loser to zap exactly ${Math.floor(rematchAmount)} sats.`
              : 'Claim your seat with a Nostr zap, or pay with Lightning (anonymous) below.'}
      </p>

      <div className="online-lobby-top">
        <section className="online-lobby-panel online-lobby-panel-main">
          <div className="online-lobby-meta-row">
            <div>
              <p className="online-lobby-label">ROOM CODE</p>
              <div className="online-lobby-code-row">
                <span className="online-lobby-code">{room?.roomCode ?? '...'}</span>
                <div className="online-lobby-emoji-box">
                  <p className="online-lobby-emoji-box-title">EMOJI ID</p>
                  <p
                    className={
                      roomEmojis
                        ? 'online-lobby-code-emojis'
                        : 'online-lobby-code-emojis online-lobby-code-emojis--pending'
                    }
                  >
                    {roomEmojis || 'Publishing...'}
                  </p>
                </div>
              </div>
              <p className="online-lobby-copy online-lobby-code-confirm">
                Confirm this emoji id before sending your zap.
              </p>
            </div>
            <div className={`online-lobby-phase online-lobby-phase-${room?.phase ?? 'lobby'}`}>
              {phaseLabel}
            </div>
          </div>

          <div className="online-lobby-buyin">
            Buy-in: <b>{room?.buyin ?? 0} sats</b> · Seats paid: <b>{paidSeats}/2</b>
          </div>

          {finishedSummary ? (
            <div className="online-lobby-finished-card">
              <p className="online-lobby-label">MATCH RESULT</p>
              <p className="online-lobby-finished-main">
                {finishedSummary.p1Name} {finishedSummary.p1Score} - {finishedSummary.p2Score}{' '}
                {finishedSummary.p2Name}
              </p>
              <p className="online-lobby-copy">
                Winner: <b>{finishedSummary.winner}</b> · Net prize: <b>{finishedSummary.netPrize} sats</b>
              </p>
            </div>
          ) : null}

          {mySeat ? (
            <div className="online-lobby-pin-card">
              <p className="online-lobby-label">SEAT STATUS</p>
              <p className="online-lobby-pin">SEAT CLAIMED</p>
              <p className="online-lobby-copy">
                {isSessionClosed
                  ? 'Session closed — registration is closed for this room.'
                  : isPostgame
                    ? 'Round ended — use postgame actions below (payout / Double or Nothing / replay).'
                    : rematchPending
                      ? 'Rematch locked to the same players. Waiting for rematch payment.'
                      : `You are ${myRoleLabel}. Set ready when you are prepared to start.`}
              </p>
            </div>
          ) : (
            <div className="online-lobby-pin-card">
              {isMatchEnded ? (
                <>
                  <p className="online-lobby-label">REGISTRATION</p>
                  <p className="online-lobby-pin">CLOSED</p>
                  <p className="online-lobby-copy">
                    {isSessionClosed
                      ? 'Session closed. View results/replay from this room.'
                      : 'Round ended — new seats stay closed until rematch or next lobby.'}
                  </p>
                </>
              ) : rematchPending ? (
                <>
                  <p className="online-lobby-label">SEAT STATUS</p>
                  <p className="online-lobby-pin">LOCKED FOR REMATCH</p>
                  <p className="online-lobby-copy">No open seats while rematch payment is pending.</p>
                </>
              ) : (
                <>
                  <p className="online-lobby-label">CLAIM SEAT</p>
                  {!nostrLinkActive ? (
                    <div className="online-lobby-seat-mode-row" role="group" aria-label="Seat payment method">
                      <button
                        type="button"
                        className={`online-lobby-join-mode-btn ${seatPayMode === 'nostr' ? 'online-lobby-join-mode-btn--active' : ''}`}
                        onClick={() => switchSeatPayMode('nostr')}
                      >
                        NOSTR ZAP
                      </button>
                      <button
                        type="button"
                        className={`online-lobby-join-mode-btn ${seatPayMode === 'lightning' ? 'online-lobby-join-mode-btn--active' : ''}`}
                        onClick={() => switchSeatPayMode('lightning')}
                      >
                        LIGHTNING (ANON)
                      </button>
                    </div>
                  ) : null}
                  {seatPayMode === 'lightning' && !nostrLinkActive ? (
                    <>
                      <p className="online-lobby-sublabel">LIGHTNING DEPOSIT</p>
                      <p className="online-lobby-copy">
                        Pay this invoice with your Lightning wallet — scan the QR or copy the link. Send the exact
                        amount shown. You don’t need a PIN or a Nostr account; keep this page open until your seat
                        updates.
                      </p>
                      {lightningBusy && !lightningPay ? (
                        <p className="online-lobby-copy online-lobby-lightning-status">Preparing invoice…</p>
                      ) : null}
                      {lightningPay ? (
                        <div className="online-lobby-lightning-pay">
                          <QRCodeSVG
                            value={lightningPay.lightningUri}
                            size={180}
                            includeMargin
                            className="online-lobby-qr"
                          />
                          <p className="online-lobby-lightning-uri">{lightningPay.lightningUri}</p>
                          <div className="online-lobby-lightning-actions">
                            <Button
                              type="button"
                              className="online-lobby-action"
                              onClick={() => {
                                void navigator.clipboard.writeText(lightningPay.lightningUri);
                              }}
                            >
                              Copy link
                            </Button>
                            <Button
                              type="button"
                              className="online-lobby-action"
                              onClick={() => {
                                if (!socket || !roomId) {
                                  return;
                                }
                                setLightningBusy(true);
                                setError('');
                                socket.emit('requestOnlineSeatLightning', { roomId });
                              }}
                            >
                              New invoice
                            </Button>
                          </div>
                          <p className="online-lobby-copy">
                            Pay exactly <b>{lightningPay.buyin} sats</b>. This link expires at{' '}
                            {new Date(lightningPay.expiresAt).toLocaleTimeString()}.
                          </p>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {!nostrLinkActive ? (
                        <>
                          <p className="online-lobby-sublabel">PIN</p>
                          <p className="online-lobby-pin">{joinPin || 'WAITING...'}</p>
                          <p className="online-lobby-copy">
                            Paste this PIN in the zap comment (shared screens / arcades).
                          </p>
                          <div className="online-lobby-claim-nostr-row">
                            <div className="online-lobby-or-divider" aria-hidden="true">
                              <span className="online-lobby-or-line" />
                              <span className="online-lobby-or-text">or</span>
                              <span className="online-lobby-or-line" />
                            </div>
                            <Button type="button" className="online-lobby-signin-nostr-btn" onClick={openNostrModal}>
                              Sign in with Nostr
                            </Button>
                          </div>
                        </>
                      ) : null}
                      {nostrLinkActive ? (
                        <div className="online-lobby-nostr-linked-pill">
                          <div className="online-lobby-nostr-linked-row">
                            {nostrLinkedProfile?.picture ? (
                              <img
                                className="online-lobby-nostr-linked-avatar"
                                src={nostrLinkedProfile.picture}
                                alt=""
                                onError={(ev) => {
                                  (ev.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : null}
                            <span className="online-lobby-nostr-linked-name">
                              {nostrLinkedProfile?.name ?? 'Nostr profile'}
                            </span>
                            <span className="online-lobby-nostr-linked-rest">
                              — zap without PIN · expires{' '}
                              {new Date(nostrLinkExpiresAt ?? 0).toLocaleTimeString()}{' '}
                              <button type="button" className="online-lobby-text-btn" onClick={openNostrModal}>
                                Update
                              </button>
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          <div className="online-lobby-actions-row">
          </div>
        </section>

        <section className="online-lobby-panel online-lobby-panel-qr">
          {!showKind1QrPanel ? (
            <>
              <p className="online-lobby-label">NOSTR KIND1</p>
              <p className="online-lobby-copy online-lobby-lightning-aside-copy">
                You’re paying with Lightning on the left. Switch “Claim seat” to <strong>Nostr zap</strong> if you
                want the Kind1 QR codes and PIN / linked pubkey flow instead.
              </p>
            </>
          ) : (
            <>
          <p className="online-lobby-label">{rematchPending ? 'DOUBLE OR NOTHING KIND1' : 'ROOM KIND1'}</p>
          <div className="online-lobby-kind1-views">
            <Button
              className={`online-lobby-action ${kind1View === 'nostr' ? 'online-lobby-kind1-view-active' : ''}`}
              onClick={() => setKind1View('nostr')}
            >
              NOSTR URI
            </Button>
            <Button
              className={`online-lobby-action ${kind1View === 'njump' ? 'online-lobby-kind1-view-active' : ''}`}
              onClick={() => setKind1View('njump')}
            >
              NJUMP LINK
            </Button>
            <Button
              className={`online-lobby-action ${kind1View === 'pubpay' ? 'online-lobby-kind1-view-active' : ''}`}
              onClick={() => setKind1View('pubpay')}
            >
              PUBPAY.ME
            </Button>
            <Button
              className={`online-lobby-action ${kind1View === 'post' ? 'online-lobby-kind1-view-active' : ''}`}
              onClick={() => setKind1View('post')}
            >
              POST
            </Button>
          </div>
          {kind1 ? (
            <>
              {kind1View === 'post' ? (
                <>
                  {kind1PostStatus === 'loading' ? (
                    <p className="online-lobby-copy online-lobby-kind1-post-status">Loading note from relays…</p>
                  ) : kind1PostStatus === 'error' ? (
                    <div className="online-lobby-kind1-post-error">
                      <p className="online-lobby-copy">
                        Couldn’t load this note from relays. Check your connection or try again.
                      </p>
                      <Button
                        type="button"
                        className="online-lobby-action"
                        onClick={() => setKind1PostRetry((n) => n + 1)}
                      >
                        Try again
                      </Button>
                    </div>
                  ) : kind1PostEvent ? (
                    <div className="online-lobby-kind1-embedded">
                      <div className="online-lobby-kind1-author">
                        {kind1PostEvent.authorPicture ? (
                          <img
                            className="online-lobby-kind1-author-avatar"
                            src={kind1PostEvent.authorPicture}
                            alt=""
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div
                            className="online-lobby-kind1-author-avatar online-lobby-kind1-author-avatar--placeholder"
                            aria-hidden
                          />
                        )}
                        <div className="online-lobby-kind1-author-text">
                          <span className="online-lobby-kind1-author-name">{kind1PostEvent.authorName}</span>
                          <span
                            className="online-lobby-kind1-author-npub"
                            title={kind1PostEvent.npubDisplay}
                          >
                            {kind1PostEvent.npubDisplay}
                          </span>
                        </div>
                      </div>
                      <p className="online-lobby-kind1-embedded-meta">
                        {new Date(kind1PostEvent.created_at * 1000).toLocaleString()}
                      </p>
                      <div className="online-lobby-kind1-embedded-body">{kind1PostEvent.content}</div>
                      {kind1PostEvent.pubpayZap.isPubpay ? (
                        <div className="online-lobby-pubpay-zap-meta">
                          <p className="online-lobby-label">PAYMENT (FROM NOTE TAGS)</p>
                          <p className="online-lobby-copy">
                            {kind1PostEvent.pubpayZap.zapMinSats != null &&
                            kind1PostEvent.pubpayZap.zapMaxSats != null
                              ? `Pubpay zap range: ${kind1PostEvent.pubpayZap.zapMinSats}${
                                  kind1PostEvent.pubpayZap.zapMinSats === kind1PostEvent.pubpayZap.zapMaxSats
                                    ? ''
                                    : `–${kind1PostEvent.pubpayZap.zapMaxSats}`
                                } sats`
                              : 'Zap terms from host'}
                            {kind1PostEvent.pubpayZap.zapUses
                              ? ` · Uses: ${kind1PostEvent.pubpayZap.zapUses}`
                              : ''}
                            {room?.buyin != null ? (
                              <>
                                {' '}
                                · Room buy-in: <b>{room.buyin} sats</b>
                              </>
                            ) : null}
                          </p>
                        </div>
                      ) : null}
                      {!hasPaidMySeat &&
                      room?.phase === 'lobby' &&
                      !rematchPending &&
                      !isMatchEnded ? (
                        <div className="online-lobby-post-pay-row">
                          {nostrLinkActive ? (
                            <Button
                              type="button"
                              className="online-lobby-action online-lobby-post-pay-btn"
                              disabled={zapPayBusy || !socket}
                              onClick={startSeatZapPay}
                            >
                              {zapPayBusy ? 'PREPARING…' : 'PAY'}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              className="online-lobby-action online-lobby-post-pay-btn"
                              disabled={lightningBusy && !lightningPay}
                              onClick={payAnonymouslyFromPost}
                            >
                              {lightningBusy && !lightningPay ? 'PREPARING…' : 'PAY anonymously'}
                            </Button>
                          )}
                          <p className="online-lobby-copy online-lobby-post-pay-hint">
                            {nostrLinkActive
                              ? 'Prepares a zap request (server + your extension), then shows a Lightning invoice. Pay it with your wallet; the room detects the zap like a normal Nostr zap.'
                              : 'Uses the same anonymous Lightning invoice flow as the Lightning tab — no Nostr sign-in.'}
                          </p>
                        </div>
                      ) : null}
                      {seatZapInvoice ? (
                        <div className="online-lobby-seat-zap-invoice">
                          <p className="online-lobby-sublabel">ZAP INVOICE ({seatZapInvoice.buyinSats} sats)</p>
                          <QRCodeSVG
                            value={seatZapInvoice.lightningUri}
                            size={180}
                            includeMargin
                            className="online-lobby-qr"
                          />
                          <p className="online-lobby-lightning-uri">{seatZapInvoice.lightningUri}</p>
                          <div className="online-lobby-lightning-actions">
                            <Button
                              type="button"
                              className="online-lobby-action"
                              onClick={() => {
                                void navigator.clipboard.writeText(seatZapInvoice.lightningUri);
                              }}
                            >
                              Copy
                            </Button>
                            <Button
                              type="button"
                              className="online-lobby-action"
                              onClick={() => void tryWeblnPaySeatZap()}
                            >
                              Pay in browser wallet
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      {seatPayMode === 'lightning' && !nostrLinkActive && lightningPay ? (
                        <div className="online-lobby-post-inline-lightning">
                          <p className="online-lobby-sublabel">ANONYMOUS LIGHTNING</p>
                          <QRCodeSVG
                            value={lightningPay.lightningUri}
                            size={180}
                            includeMargin
                            className="online-lobby-qr"
                          />
                          <p className="online-lobby-lightning-uri">{lightningPay.lightningUri}</p>
                          <div className="online-lobby-lightning-actions">
                            <Button
                              type="button"
                              className="online-lobby-action"
                              onClick={() => {
                                void navigator.clipboard.writeText(lightningPay.lightningUri);
                              }}
                            >
                              Copy link
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : kind1View === 'njump' ? (
                <>
                  <QRCodeSVG value={njumpUrl} size={210} includeMargin className="online-lobby-qr" />
                  <a
                    className="online-lobby-kind1"
                    href={njumpUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {kind1}
                  </a>
                </>
              ) : kind1View === 'pubpay' ? (
                <>
                  <QRCodeSVG value={pubpayUrl} size={210} includeMargin className="online-lobby-qr" />
                  <a
                    className="online-lobby-kind1"
                    href={pubpayUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {pubpayUrl}
                  </a>
                </>
              ) : (
                <>
                  <QRCodeSVG value={nostrUri} size={210} includeMargin className="online-lobby-qr" />
                  <div className="online-lobby-kind1">{nostrUri}</div>
                </>
              )}
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
            </>
          )}
        </section>
      </div>

      {nostrModalOpen ? (
        <div
          className="online-lobby-modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeNostrModal();
            }
          }}
        >
          <div
            className="online-lobby-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="online-lobby-nostr-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="online-lobby-modal-header">
              <h2 id="online-lobby-nostr-modal-title" className="online-lobby-modal-title">
                Sign in with Nostr
              </h2>
              <button
                type="button"
                className="online-lobby-modal-close"
                onClick={closeNostrModal}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="online-lobby-modal-lead">
              Link this session to a pubkey, then zap the Kind1 <strong>without</strong> putting the PIN in the
              comment.
            </p>
            <p className="online-lobby-modal-status">
              {nostrLinkActive ? (
                <span className="online-lobby-modal-status-linked">
                  {nostrLinkedProfile?.picture ? (
                    <img
                      className="online-lobby-modal-nostr-avatar"
                      src={nostrLinkedProfile.picture}
                      alt=""
                      onError={(ev) => {
                        (ev.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : null}
                  <span className="online-lobby-modal-nostr-inline">
                    <span className="online-lobby-modal-status-ok">Linked</span>
                    {nostrLinkedProfile?.name ? (
                      <span className="online-lobby-modal-nostr-display-name">
                        {' '}
                        · {nostrLinkedProfile.name}
                      </span>
                    ) : null}
                    {' · '}
                    expires {new Date(nostrLinkExpiresAt ?? 0).toLocaleTimeString()}
                  </span>
                </span>
              ) : nostrLinkBusy ? (
                <span className="online-lobby-modal-status-busy">Signing…</span>
              ) : (
                <span className="online-lobby-modal-status-idle">Not linked yet</span>
              )}
            </p>
            <p className="online-lobby-modal-nip07-hint">Uses your browser NIP-07 extension (Alby, nos2x, etc.).</p>
            <div className="online-lobby-nostr-actions online-lobby-modal-actions">
              <Button
                type="button"
                className="online-lobby-action"
                disabled={nostrLinkBusy || !socket}
                onClick={startNostrLinkFlow}
              >
                {nostrLinkActive ? 'Re-link pubkey' : 'Sign & link pubkey'}
              </Button>
            </div>
            {error ? <p className="online-lobby-modal-error">Error: {error}</p> : null}
          </div>
        </div>
      ) : null}

      {error && !nostrModalOpen ? <p className="online-lobby-error">Error: {error}</p> : null}

      <section className="online-lobby-panel online-lobby-status">
        <h3>ROOM STATUS</h3>
        <div className="online-lobby-status-grid">
          <div
            className={[
              'online-lobby-seat',
              isMyP1Seat ? 'online-lobby-seat-mine' : '',
              seatHighlightLobby && isMyP1Seat && p1?.ready === true ? 'online-lobby-seat-mine-ready' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <p className="online-lobby-label">
              PLAYER 1 {isMyP1Seat ? <span className="online-lobby-you-tag">YOU</span> : null}
              {p1?.status === 'paid' && typeof p1.pingMs === 'number' ? (
                <span
                  className={`online-lobby-ping-badge online-lobby-ping online-lobby-ping--${onlinePingAccent(
                    p1.pingMs
                  )}`}
                  title="Player 1 round-trip to server"
                >
                  {p1.pingMs}ms
                </span>
              ) : null}
            </p>
            <div className="online-lobby-seat-identity">
              {isMatchEnded || p1?.status === 'paid' ? (
                <img
                  className="online-lobby-seat-avatar"
                  src={p1AvatarSrc || '/images/loading.gif'}
                  alt={p1?.name || 'Player 1'}
                />
              ) : (
                <div className="online-lobby-seat-avatar online-lobby-seat-avatar-empty" />
              )}
              <p className="online-lobby-seat-name">{p1NameDisplay}</p>
            </div>
            <p className="online-lobby-seat-meta">{p1MetaDisplay}</p>
          </div>
          <div
            className={[
              'online-lobby-seat',
              isMyP2Seat ? 'online-lobby-seat-mine' : '',
              seatHighlightLobby && isMyP2Seat && p2?.ready === true ? 'online-lobby-seat-mine-ready' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <p className="online-lobby-label">
              PLAYER 2 {isMyP2Seat ? <span className="online-lobby-you-tag">YOU</span> : null}
              {p2?.status === 'paid' && typeof p2.pingMs === 'number' ? (
                <span
                  className={`online-lobby-ping-badge online-lobby-ping online-lobby-ping--${onlinePingAccent(
                    p2.pingMs
                  )}`}
                  title="Player 2 round-trip to server"
                >
                  {p2.pingMs}ms
                </span>
              ) : null}
            </p>
            <div className="online-lobby-seat-identity">
              {isMatchEnded || p2?.status === 'paid' ? (
                <img
                  className="online-lobby-seat-avatar"
                  src={p2AvatarSrc || '/images/loading.gif'}
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

      <div
        className={[
          'online-lobby-my-role',
          `online-lobby-my-role-${mySeat ? 'player' : 'spectator'}`,
          seatHighlightLobby && mySeat && myReady ? 'online-lobby-my-role-ready' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span className="online-lobby-my-role-text">
          YOU ARE: {myRoleLabel.toUpperCase()}
        </span>
        {yourPingMs != null ? (
          <span
            className={`online-lobby-ping-badge online-lobby-ping online-lobby-ping--${onlinePingAccent(
              yourPingMs
            )}`}
            title="Your round-trip to server"
          >
            {yourPingMs}ms
          </span>
        ) : null}
      </div>

      <div className="online-lobby-bottom-actions">
        {room?.phase === 'postgame' || room?.phase === 'finished' ? (
          <>
            <Button
              className="online-lobby-action online-lobby-arena"
              onClick={() => navigate(`/online/postgame?roomId=${encodeURIComponent(roomId)}`)}
            >
              VIEW POSTGAME DETAILS
            </Button>
            <Button
              className="online-lobby-action online-lobby-arena"
              onClick={() =>
                navigate(
                  `/online/game?roomId=${encodeURIComponent(roomId)}&replay=1&round=${encodeURIComponent(
                    String(room?.matchRound ?? 1)
                  )}`
                )
              }
            >
              WATCH REPLAY
            </Button>
            <Button
              className="online-lobby-action"
              onClick={() => {
                socket?.emit('leaveOnlineRoom', { roomId });
                navigate('/online');
              }}
            >
              EXIT ROOM
            </Button>
          </>
        ) : mySeat ? (
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
