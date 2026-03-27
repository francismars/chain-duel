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
import { STORED_NOSTR_PUBKEY_KEY, getStoredSignerMode } from '@/lib/nostr/signerSession';
import { getNwcUri, nwcPay } from '@/lib/nostr/nwcPay';
import { fetchLatestKind0Profile } from '@/lib/nostr/fetchKind0Profile';
import { npubEncode } from 'nostr-tools/nip19';
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

/** Show first `head` + … + last `tail` chars of a string. */
function midTruncate(s: string, head = 16, tail = 8): string {
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

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
  const [nostrUriQrOpen, setNostrUriQrOpen] = useState(false);
  const [nostrUriCopied, setNostrUriCopied] = useState(false);
  const nostrUriCopyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalDialogRef = useRef<HTMLDivElement | null>(null);
  const paymentCardsRef = useRef<HTMLDivElement | null>(null);
  const paymentPanelRef = useRef<HTMLDivElement | null>(null);
  const [kind1PostEvent, setKind1PostEvent] = useState<Kind1PostLoaded | null>(null);
  const [kind1PostStatus, setKind1PostStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [kind1PostRetry, setKind1PostRetry] = useState(0);
  const [, setZapPayBusy] = useState(false);
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
  const [nostrLinkError, setNostrLinkError] = useState<string | null>(null);
  const [nostrLinkSourceMode, setNostrLinkSourceMode] = useState<'extension' | 'nip46' | 'nsec' | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [lightningPay, setLightningPay] = useState<{
    lnurl: string;
    lightningUri: string;
    buyin: number;
    expiresAt: number;
  } | null>(null);
  const [lightningBusy, setLightningBusy] = useState(false);
  const [nwcUri] = useState<string | null>(() => getNwcUri());
  const [nwcBusy, setNwcBusy] = useState(false);
  const [nwcError, setNwcError] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<'anon' | 'nostr-connect' | 'nostr-pay' | 'pin-zap' | null>(null);
  const [cardNavIndex, setCardNavIndex] = useState(0);
  /** Nostr session from Config page (NIP-46 / extension / nsec) persisted in localStorage. */
  const [persistedNostr, setPersistedNostr] = useState<{
    pubkey: string;
    npub: string;
    mode: 'extension' | 'nip46' | 'nsec';
    displayName: string | null;
    picture: string | null;
    nip05: string | null;
    lud16: string | null;
  } | null>(null);
  /** Pubkey from last successful kind-1 sign, until server confirms with `resOnlineNostrLinkOk`. */
  const pendingNostrLinkPubkeyRef = useRef<string | null>(null);
  const paymentModeRef = useRef(paymentMode);
  /** Last successful `requestOnlineKind1Post` for this room + note ref — avoids refetch when switching Kind1 tabs back to POST. */
  const kind1PostLoadedKeyRef = useRef<string | null>(null);

  const kind1 = useMemo(() => {
    const rematchPending = Boolean(room?.postGame?.rematchRequested);
    const rematchNote = room?.postGame?.rematchNote1 ?? '';
    return rematchPending ? rematchNote : room?.nostrMeta?.note1 ?? '';
  }, [room?.postGame?.rematchRequested, room?.postGame?.rematchNote1, room?.nostrMeta?.note1]);

  const nostrLinkStorageKey = useMemo(
    () => (roomId ? `onlineLobbyNostrLink_${roomId}` : ''),
    [roomId]
  );

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 4000);
    return () => window.clearInterval(id);
  }, []);

  // Read persisted Nostr session from localStorage (set by Config page after sign-in).
  // Also listen for storage changes so the chip updates if the user signs in another tab.
  useEffect(() => {
    const loadSession = () => {
      const pubkey = localStorage.getItem(STORED_NOSTR_PUBKEY_KEY) ?? '';
      const mode = getStoredSignerMode();
      if (!pubkey || !mode) {
        setPersistedNostr(null);
        return;
      }
      let npub = '';
      try { npub = npubEncode(pubkey); } catch { npub = pubkey; }
      setPersistedNostr({ pubkey, npub, mode, displayName: null, picture: null, nip05: null, lud16: null });
      // Fetch kind-0 profile in the background to populate the card.
      void fetchLatestKind0Profile(pubkey).then((profile) => {
        if (!profile) return;
        setPersistedNostr((prev) =>
          prev?.pubkey === pubkey
            ? {
                ...prev,
                displayName: profile.displayTitle ?? prev.displayName,
                picture: profile.picture ?? null,
                nip05: profile.nip05 ?? null,
                lud16: profile.lud16 ?? null,
              }
            : prev
        );
      });
    };

    loadSession();
    window.addEventListener('storage', loadSession);
    return () => window.removeEventListener('storage', loadSession);
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

    // Focus first focusable element inside the modal
    const dialog = modalDialogRef.current;
    if (dialog) {
      const first = dialog.querySelector<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNostrModalOpen(false);
        return;
      }
      // Focus trap: keep Tab inside the modal
      if (e.key === 'Tab' && dialog) {
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
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
      // Auto-start zap invoice immediately after signing — skip the PAY button click
      const mode = paymentModeRef.current;
      if (mode === 'nostr-pay' || mode === 'nostr-connect') {
        setSeatZapInvoice(null);
        setZapPayBusy(true);
        socket.emit('requestOnlineSeatZapPayPrepare', { roomId });
      }
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
      setNostrLinkError(null);
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
        setNostrLinkError(e instanceof Error ? e.message : 'Signing failed');
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
        kind1PostLoadedKeyRef.current = `${roomId}:${kind1}`;
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
        kind1PostLoadedKeyRef.current = null;
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
  }, [roomId, socket, kind1]);

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

  paymentModeRef.current = paymentMode;

  const startNostrLinkFlow = () => {
    if (!socket || !roomId) {
      return;
    }
    setNostrLinkError(null);
    setNostrLinkBusy(true);
    setNostrLinkSourceMode(persistedNostr?.mode ?? 'extension');
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
  const rematchAmount = room?.postGame?.rematchRequiredAmount ?? 0;
  const rematchWaitingForSessionID = room?.postGame?.rematchWaitingForSessionID;
  const amILoserToPay = Boolean(rematchWaitingForSessionID && rematchWaitingForSessionID === currentSessionID);
  /** Seat grid: emphasize your row in lobby; stronger when you are ready to start. */
  const seatHighlightLobby = !isSessionClosed && !rematchPending;

  const mySeatPinState = (() => {
    if (!mySeat) return null;
    if (isSessionClosed) {
      return {
        cardMod: '',
        label: 'SESSION CLOSED',
        pin: 'SESSION OVER',
        copy: 'The session has ended. View the match result or replay from this room.',
      };
    }
    if (isPostgame) {
      return {
        cardMod: '',
        label: 'ROUND OVER',
        pin: 'MATCH ENDED',
        copy: 'Head to the victory screen to claim your prize, vote for double or nothing, or watch the replay.',
      };
    }
    if (rematchPending && amILoserToPay) {
      return {
        cardMod: 'online-lobby-pin-card--action',
        label: 'ACTION REQUIRED',
        pin: 'ZAP TO CONTINUE',
        copy: `Zap exactly ${Math.floor(rematchAmount).toLocaleString()} sats on the Kind1 post below to lock in the double or nothing.`,
      };
    }
    if (rematchPending) {
      return {
        cardMod: 'online-lobby-pin-card--waiting',
        label: 'DOUBLE OR NOTHING',
        pin: 'WAITING FOR ZAP',
        copy: 'Opponent must zap the Kind1 post to confirm. The room will advance once payment is detected.',
      };
    }
    if (!myReady) {
      return {
        cardMod: 'online-lobby-pin-card--ready',
        label: 'SEAT PAID',
        pin: 'READY UP',
        copy: `You're in as ${myRoleLabel}. Hit Mark as Ready below when you're set to play.`,
      };
    }
    if (paidSeats < 2) {
      return {
        cardMod: 'online-lobby-pin-card--ready',
        label: 'SEAT PAID',
        pin: "YOU'RE READY",
        copy: 'Waiting for the second player to pay and mark ready. Game starts when both are set.',
      };
    }
    return {
      cardMod: 'online-lobby-pin-card--go',
      label: 'SEAT PAID',
      pin: 'BOTH READY',
      copy: 'Both players are in. The game is about to start.',
    };
  })();
  const snapshotP1Name =
    (room?.snapshot?.state as { p1Name?: string } | undefined)?.p1Name ?? 'Player 1';
  const snapshotP2Name =
    (room?.snapshot?.state as { p2Name?: string } | undefined)?.p2Name ?? 'Player 2';
  const nostrUri = kind1 ? `nostr:${kind1}` : '';
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
  const p1IsReady = !isMatchEnded && !rematchPending && p1?.status === 'paid' && p1.ready === true;
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
  const p2IsReady = !isMatchEnded && !rematchPending && p2?.status === 'paid' && p2.ready === true;
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

  useEffect(() => {
    if (hasPaidMySeat) {
      setLightningPay(null);
      setSeatZapInvoice(null);
      setZapPayBusy(false);
      setPaymentMode(null);
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

  // Escape clears active payment panel when modal is not open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !nostrModalOpen && paymentMode !== null) {
        setPaymentMode(null);
        // Return focus to the card that was active
        const active = paymentCardsRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
        active?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nostrModalOpen, paymentMode]);

  // Sync cardNavIndex when paymentMode changes via mouse click
  useEffect(() => {
    if (paymentMode === null) return;
    const idx = ['anon', 'nostr-connect', 'nostr-pay', 'pin-zap'].indexOf(paymentMode);
    if (idx !== -1) setCardNavIndex(idx);
  }, [paymentMode]);

  // Global arrow-key / gamepad nav for the three payment cards.
  // Does NOT require a card to already have native browser focus.
  useEffect(() => {
    // Only active when the payment section is in the DOM
    const container = paymentCardsRef.current;
    if (!container) return;

    const onKey = (e: KeyboardEvent) => {
      if (nostrModalOpen) return;
      // Don't hijack keys while typing in inputs
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const modes = ['anon', 'nostr-connect', 'nostr-pay', 'pin-zap'] as const;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const next = (cardNavIndex + dir + modes.length) % modes.length;
        setCardNavIndex(next);
        setPaymentMode(modes[next]);
        const cards = container.querySelectorAll<HTMLButtonElement>('.online-lobby-path-card');
        cards[next]?.focus({ preventScroll: true });
      } else if (e.key === 'Enter' || e.key === ' ') {
        const cards = container.querySelectorAll<HTMLButtonElement>('.online-lobby-path-card');
        const card = cards[cardNavIndex];
        if (card && document.activeElement !== card) {
          e.preventDefault();
          card.click();
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardNavIndex, nostrModalOpen]);

  // Move focus into the panel when a payment card is activated
  useEffect(() => {
    if (!paymentMode) return;
    const panel = paymentPanelRef.current;
    if (!panel) return;
    // Small delay so the panel has rendered before we query it
    const id = setTimeout(() => {
      const first = panel.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    }, 50);
    return () => clearTimeout(id);
  }, [paymentMode]);

  const payAnonymouslyFromPost = () => {
    if (!socket || !roomId) {
      return;
    }
    setSeatZapInvoice(null);
    setError('');
    setLightningBusy(true);
    socket.emit('requestOnlineSeatLightning', { roomId });
  };

  const openLightningUri = () => {
    if (!seatZapInvoice) return;
    window.location.href = seatZapInvoice.lightningUri;
  };

  const tryNwcPay = async (bolt11: string) => {
    if (nwcBusy) return;
    setNwcBusy(true);
    setNwcError(null);
    try {
      await nwcPay(bolt11);
    } catch (e) {
      setNwcError(e instanceof Error ? e.message : 'Payment failed');
    } finally {
      setNwcBusy(false);
    }
  };

  useEffect(() => {
    if (!roomId || room?.phase !== 'playing') {
      return;
    }
    navigate(`/network/game?roomId=${encodeURIComponent(roomId)}`);
  }, [navigate, room?.phase, roomId]);

  useEffect(() => {
    if (!kind1 || !socket || !roomId) {
      return;
    }
    const fetchKey = `${roomId}:${kind1}`;
    if (kind1PostLoadedKeyRef.current === fetchKey) {
      return;
    }
    setKind1PostStatus('loading');
    setKind1PostEvent(null);
    socket.emit('requestOnlineKind1Post', { roomId });
  }, [kind1, kind1PostRetry, socket, roomId]);

  useEffect(() => {
    setNostrUriQrOpen(false);
  }, [kind1]);

  useEffect(() => {
    if (!nostrUriQrOpen) {
      setNostrUriCopied(false);
      if (nostrUriCopyResetRef.current) {
        clearTimeout(nostrUriCopyResetRef.current);
        nostrUriCopyResetRef.current = null;
      }
    }
  }, [nostrUriQrOpen]);

  const arenaCenterText = (() => {
    if (isSessionClosed) return 'SESSION CLOSED';
    if (isPostgame) return 'ROUND OVER';
    if (rematchPending) return 'DOUBLE OR NOTHING';
    if (paidSeats === 2 && myReady) return 'BOTH READY';
    if (paidSeats === 2) return 'BOTH PAID';
    if (paidSeats === 1) return '1 OF 2 PAID';
    return 'AWAITING PLAYERS';
  })();

  if (!roomId) {
    return (
      <div className="online-lobby-page online-lobby-page-missing">
        <p className="online-lobby-error">Missing room id.</p>
      </div>
    );
  }


  return (
    <div className="online-lobby-page">
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      {/* ── Main centering wrapper (Zones 1–4 + modal) ── */}
      <div className="online-lobby-main">

      <Sponsorship id="sponsorship-online-lobby" />

      {/* ── Zone 1: Page Header ── */}
      <div className="online-lobby-header">
        <div className="online-lobby-header-title-row">
          <h1 className="online-lobby-title">NETWORK ROOM</h1>
          {room?.phase && room.phase !== 'lobby' ? (
            <div className={`online-lobby-phase online-lobby-phase-${room.phase}`}>
              {phaseLabel}
            </div>
          ) : null}
        </div>
        <div className="online-lobby-header-meta">
          {room ? (
            <>
              <span className="online-lobby-header-code">{room.roomCode}</span>
              {roomEmojis ? (
                <span className="online-lobby-header-emojis">{roomEmojis}</span>
              ) : (
                <span className="online-lobby-header-emojis online-lobby-header-emojis--pending">Publishing…</span>
              )}
              <span className="online-lobby-header-sep">·</span>
              <span className="online-lobby-header-buyin">
                {room.buyin.toLocaleString()} sats buy-in
              </span>
              <span className="online-lobby-header-sep">·</span>
              <span className="online-lobby-header-seats">{paidSeats}/2 paid</span>
              {yourPingMs != null ? (
                <span
                  className={`online-lobby-ping-badge online-lobby-ping online-lobby-ping--${onlinePingAccent(yourPingMs)}`}
                  title="Your round-trip to server"
                >
                  {yourPingMs}ms
                </span>
              ) : null}
            </>
          ) : (
            <span className="online-lobby-header-loading">Connecting…</span>
          )}
        </div>
        {roomEmojis ? (
          <p className="online-lobby-header-emoji-confirm">
            Confirm the emoji ID before sending your zap.
          </p>
        ) : null}
      </div>

      {/* DoN Banner */}
      {rematchPending ? (
        <div
          className={[
            'online-lobby-don-banner',
            amILoserToPay ? 'online-lobby-don-banner--pay' : 'online-lobby-don-banner--wait',
          ].join(' ')}
        >
          <div className="online-lobby-don-banner-body">
            <p className="online-lobby-don-banner-label">
              {amILoserToPay ? 'DOUBLE OR NOTHING — YOUR TURN TO PAY' : 'DOUBLE OR NOTHING — WAITING FOR OPPONENT'}
            </p>
            <p className="online-lobby-don-banner-amount">
              {Math.floor(rematchAmount).toLocaleString()}
              <span className="online-lobby-don-banner-unit"> sats</span>
            </p>
            <p className="online-lobby-don-banner-desc">
              {amILoserToPay
                ? 'Zap that exact amount on the Kind1 post below to confirm the rematch. Stakes will double once received.'
                : 'Waiting for opponent to zap the Kind1 post. Stakes will double once their payment is confirmed.'}
            </p>
          </div>
          {amILoserToPay ? (
            <p className="online-lobby-don-banner-cta">Scroll to Kind1 below ↓</p>
          ) : (
            <p className="online-lobby-don-banner-waiting-dot" aria-label="Waiting" />
          )}
        </div>
      ) : null}

      {/* ── Zone 2: Arena ── */}
      <div className="online-lobby-arena-zone">
        {/* P1 Seat */}
        <div
          className={[
            'online-lobby-arena-seat',
            'online-lobby-arena-seat--p1',
            isMyP1Seat ? 'online-lobby-arena-seat--mine' : '',
            seatHighlightLobby && isMyP1Seat && p1?.ready === true ? 'online-lobby-arena-seat--ready' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="online-lobby-arena-seat-header">
            {isMyP1Seat && !isMatchEnded && !rematchPending ? (
              <button
                type="button"
                className={`online-lobby-seat-ready-btn${myReady ? ' online-lobby-seat-ready-btn--active' : ''}`}
                onClick={() => socket?.emit('onlineSetReady', { roomId, ready: !myReady })}
              >
                {myReady ? 'UNREADY' : 'MARK AS READY'}
              </button>
            ) : null}
            <span className="online-lobby-label">
              PLAYER 1{isMyP1Seat ? <span className="online-lobby-you-tag">YOU</span> : null}
            </span>
            {p1?.status === 'paid' && typeof p1.pingMs === 'number' ? (
              <span
                className={`online-lobby-ping-badge online-lobby-ping online-lobby-ping--${onlinePingAccent(p1.pingMs)}`}
                title="Player 1 round-trip to server"
              >
                {p1.pingMs}ms
              </span>
            ) : null}
          </div>
          <div className="online-lobby-arena-seat-identity">
            {isMatchEnded || p1?.status === 'paid' ? (
              <img
                className="online-lobby-arena-avatar"
                src={p1AvatarSrc || '/images/loading.gif'}
                alt={p1?.name || 'Player 1'}
              />
            ) : (
              <div className="online-lobby-arena-avatar online-lobby-arena-avatar--empty" aria-hidden="true" />
            )}
            <p className="online-lobby-arena-seat-name">{p1NameDisplay}</p>
          </div>
          <p className="online-lobby-arena-seat-meta">
            {p1IsReady ? (
              <>Paid · <span className="online-lobby-arena-seat-meta--ready">Ready</span></>
            ) : p1MetaDisplay}
          </p>
        </div>

        {/* Center pillar */}
        <div className="online-lobby-arena-center">
          <span className="online-lobby-arena-vs" aria-hidden="true">VS</span>
          <span className="online-lobby-arena-state">{arenaCenterText}</span>
          {(room?.spectators.length ?? 0) > 0 ? (
            <span className="online-lobby-arena-spectators">{room?.spectators.length} watching</span>
          ) : null}
        </div>

        {/* P2 Seat */}
        <div
          className={[
            'online-lobby-arena-seat',
            'online-lobby-arena-seat--p2',
            isMyP2Seat ? 'online-lobby-arena-seat--mine' : '',
            seatHighlightLobby && isMyP2Seat && p2?.ready === true ? 'online-lobby-arena-seat--ready' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="online-lobby-arena-seat-header">
            <span className="online-lobby-label">
              PLAYER 2{isMyP2Seat ? <span className="online-lobby-you-tag">YOU</span> : null}
            </span>
            {p2?.status === 'paid' && typeof p2.pingMs === 'number' ? (
              <span
                className={`online-lobby-ping-badge online-lobby-ping online-lobby-ping--${onlinePingAccent(p2.pingMs)}`}
                title="Player 2 round-trip to server"
              >
                {p2.pingMs}ms
              </span>
            ) : null}
            {isMyP2Seat && !isMatchEnded && !rematchPending ? (
              <button
                type="button"
                className={`online-lobby-seat-ready-btn${myReady ? ' online-lobby-seat-ready-btn--active' : ''}`}
                onClick={() => socket?.emit('onlineSetReady', { roomId, ready: !myReady })}
              >
                {myReady ? 'UNREADY' : 'MARK AS READY'}
              </button>
            ) : null}
          </div>
          <div className="online-lobby-arena-seat-identity">
            {isMatchEnded || p2?.status === 'paid' ? (
              <img
                className="online-lobby-arena-avatar"
                src={p2AvatarSrc || '/images/loading.gif'}
                alt={p2?.name || 'Player 2'}
              />
            ) : (
              <div className="online-lobby-arena-avatar online-lobby-arena-avatar--empty" aria-hidden="true" />
            )}
            <p className="online-lobby-arena-seat-name">{p2NameDisplay}</p>
          </div>
          <p className="online-lobby-arena-seat-meta">
            {p2IsReady ? (
              <>Paid · <span className="online-lobby-arena-seat-meta--ready">Ready</span></>
            ) : p2MetaDisplay}
          </p>
        </div>
      </div>

      {/* ── Zone 3: Action Zone ── */}
      <div className="online-lobby-action-zone">

        {/* Finished match summary */}
        {finishedSummary ? (
          <div className="online-lobby-finished-card">
            <p className="online-lobby-label">MATCH RESULT</p>
            <p className="online-lobby-finished-main">
              {finishedSummary.p1Name} {finishedSummary.p1Score} – {finishedSummary.p2Score}{' '}
              {finishedSummary.p2Name}
            </p>
            <p className="online-lobby-copy">
              Winner: <b>{finishedSummary.winner}</b> · Net prize:{' '}
              <b>{finishedSummary.netPrize.toLocaleString()} sats</b>
            </p>
          </div>
        ) : null}

        {/* Paid seat status card */}
        {mySeatPinState ? (
          <div className={`online-lobby-pin-card ${mySeatPinState.cardMod}`}>
            <div className="online-lobby-pin-card-title-group">
              <p className="online-lobby-label">{mySeatPinState.label}</p>
              <p className="online-lobby-pin">{mySeatPinState.pin}</p>
            </div>
            <p className="online-lobby-copy">{mySeatPinState.copy}</p>
          </div>
        ) : null}

        {/* Payment paths — seat not yet claimed, game not ended, no rematch in progress */}
        {!hasPaidMySeat && !isMatchEnded && !rematchPending ? (
          <div className="online-lobby-claim">
            <div className="online-lobby-payment-paths" role="radiogroup" aria-label="Choose a payment method" ref={paymentCardsRef}>
              {/* Anonymous — lightning bolt */}
              <button
                type="button"
                className={['online-lobby-path-card', paymentMode === 'anon' ? 'online-lobby-path-card--active' : ''].filter(Boolean).join(' ')}
                onClick={() => setPaymentMode(paymentMode === 'anon' ? null : 'anon')}
                role="radio"
                aria-checked={paymentMode === 'anon'}
                data-mode="anon"
                tabIndex={cardNavIndex === 0 ? 0 : -1}
              >
                <svg className="online-lobby-path-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12L13 2Z" />
                </svg>
                <span className="online-lobby-path-card-title">ANONYMOUS</span>
                <span className="online-lobby-path-card-desc">Lightning invoice — no identity required</span>
              </button>

              {/* Nostr Connect — signature / pen (sign remotely) */}
              <button
                type="button"
                className={['online-lobby-path-card', paymentMode === 'nostr-connect' ? 'online-lobby-path-card--active' : ''].filter(Boolean).join(' ')}
                onClick={() => setPaymentMode(paymentMode === 'nostr-connect' ? null : 'nostr-connect')}
                role="radio"
                aria-checked={paymentMode === 'nostr-connect'}
                data-mode="nostr-connect"
                tabIndex={cardNavIndex === 1 ? 0 : -1}
              >
                <svg className="online-lobby-path-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {/* Desktop monitor (landscape) */}
                  <rect x="1" y="4" width="16" height="11" rx="1" />
                  <line x1="4" y1="18" x2="14" y2="18" />
                  {/* Mobile phone (portrait) in front */}
                  <rect x="15" y="10" width="8" height="13" rx="1" />
                  <line x1="18" y1="21" x2="20" y2="21" strokeWidth="1" />
                </svg>
                <span className="online-lobby-path-card-title">NOSTR CONNECT</span>
                <span className="online-lobby-path-card-desc">Pair with Primal, Amber · sign from mobile</span>
              </button>

              {/* Extension + Pay — person with lightning */}
              <button
                type="button"
                className={['online-lobby-path-card', paymentMode === 'nostr-pay' ? 'online-lobby-path-card--active' : ''].filter(Boolean).join(' ')}
                onClick={() => {
                  if (paymentMode === 'nostr-pay') {
                    setPaymentMode(null);
                    return;
                  }
                  setPaymentMode('nostr-pay');
                  if (persistedNostr?.mode === 'extension' && !nostrLinkActive && socket && roomId) {
                    startNostrLinkFlow();
                  }
                }}
                role="radio"
                aria-checked={paymentMode === 'nostr-pay'}
                data-mode="nostr-pay"
                tabIndex={cardNavIndex === 2 ? 0 : -1}
              >
                <svg className="online-lobby-path-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="8" cy="7" r="3.5" />
                  <path d="M2 21c0-4 2.7-6 6-6h.5" />
                  <path d="M17 11l-3 5h4l-3 5" />
                </svg>
                <span className="online-lobby-path-card-title">SIGN IN WITH EXTENSION</span>
                <span className="online-lobby-path-card-desc">Alby, nos2x, or any NIP-07 browser extension</span>
              </button>

              {/* Zap with PIN — mobile device */}
              <button
                type="button"
                className={['online-lobby-path-card', paymentMode === 'pin-zap' ? 'online-lobby-path-card--active' : ''].filter(Boolean).join(' ')}
                onClick={() => setPaymentMode(paymentMode === 'pin-zap' ? null : 'pin-zap')}
                role="radio"
                aria-checked={paymentMode === 'pin-zap'}
                data-mode="pin-zap"
                tabIndex={cardNavIndex === 3 ? 0 : -1}
              >
                <svg className="online-lobby-path-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="5" y="2" width="14" height="20" rx="2" />
                  <path d="M12 18h.01" />
                </svg>
                <span className="online-lobby-path-card-title">PAY FROM MOBILE CLIENT</span>
                <span className="online-lobby-path-card-desc">No extension needed · include PIN in zap comment · any client</span>
              </button>
            </div>

          </div>
        ) : null}

        {/* Spectator / closed seat message */}
        {!hasPaidMySeat && (isMatchEnded || rematchPending) ? (
          <div className="online-lobby-pin-card">
            {isMatchEnded ? (
              <>
                <p className="online-lobby-label">REGISTRATION</p>
                <p className="online-lobby-pin">CLOSED</p>
                <p className="online-lobby-copy">
                  {isSessionClosed
                    ? 'Session closed. View results or replay from this room.'
                    : 'Round ended — seats stay closed until rematch or next lobby.'}
                </p>
              </>
            ) : (
              <>
                <p className="online-lobby-label">SEAT STATUS</p>
                <p className="online-lobby-pin">LOCKED FOR REMATCH</p>
                <p className="online-lobby-copy">No open seats while rematch payment is pending.</p>
              </>
            )}
          </div>
        ) : null}

        {/* Primary action buttons */}
        <div className="online-lobby-action-buttons">
          {room?.phase === 'finished' ? (
            <>
              <Button
                type="button"
                className="online-lobby-action"
                onClick={() => navigate(`/network/postgame?roomId=${encodeURIComponent(roomId)}`)}
              >
                VIEW POSTGAME DETAILS
              </Button>
              <Button
                type="button"
                className="online-lobby-action"
                onClick={() =>
                  navigate(
                    `/network/game?roomId=${encodeURIComponent(roomId)}&replay=1&round=${encodeURIComponent(
                      String(room?.matchRound ?? 1)
                    )}`
                  )
                }
              >
                WATCH REPLAY
              </Button>
              <Button
                type="button"
                className="online-lobby-action"
                onClick={() => {
                  socket?.emit('leaveOnlineRoom', { roomId });
                  navigate('/network');
                }}
              >
                EXIT ROOM
              </Button>
            </>
          ) : mySeat && rematchPending ? (
            <Button
              type="button"
              className="online-lobby-action online-lobby-ready-btn"
              disabled
            >
              {amILoserToPay
                ? 'ZAP KIND1 TO CONFIRM DOUBLE OR NOTHING'
                : 'WAITING FOR OPPONENT TO ZAP'}
            </Button>
          ) : null}
        </div>
      </div>

      {/* ── Zone 4: Kind1 Post ── */}
      {kind1 ? (
        <div className="online-lobby-kind1-section" ref={paymentPanelRef}>
          {kind1PostStatus === 'loading' ? (
            <div className="online-lobby-kind1-loading" aria-label="Loading note from relays" role="status">
              <span className="online-lobby-kind1-loading-chain" aria-hidden="true">
                <span /><span /><span /><span /><span /><span /><span /><span />
              </span>
              <span className="online-lobby-kind1-loading-label">LOADING NOTE FROM RELAYS</span>
            </div>
          ) : kind1PostStatus === 'error' ? (
            <div className="online-lobby-kind1-post-error">
              <svg className="online-lobby-kind1-post-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <p className="online-lobby-kind1-post-error-msg">
                Couldn't load this note from relays.
              </p>
              <p className="online-lobby-kind1-post-error-hint">Check your connection or try again.</p>
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
              {/* ── Left column: switches based on active payment mode ── */}
              {paymentMode === 'anon' ? (
                /* Anonymous Lightning invoice */
                <div className="online-lobby-kind1-qr-col online-lobby-kind1-qr-col--panel">
                  {!lightningPay ? (
                    /* Pre-invoice: description left + CTA top-right */
                    <div className="online-lobby-nostr-connected-top">
                      <div className="online-lobby-anon-desc">
                        <p className="online-lobby-sublabel">ANONYMOUS ZAP</p>
                        <p className="online-lobby-kind1-qr-hint">
                          Generates a Lightning invoice — no identity required. Pay from any wallet.
                        </p>
                      </div>
                      <Button
                        type="button"
                        className="online-lobby-action online-lobby-nostr-zap-btn"
                        disabled={lightningBusy && !lightningPay}
                        onClick={payAnonymouslyFromPost}
                      >
                        {lightningBusy && !lightningPay ? 'PREPARING…' : 'GET INVOICE'}
                      </Button>
                    </div>
                  ) : (
                    /* QR + structured details side by side */
                    <div className="online-lobby-qr-split">
                      <QRCodeSVG value={lightningPay.lightningUri} size={160} includeMargin className="online-lobby-qr online-lobby-qr--step" aria-label="Anonymous Lightning invoice QR code" />
                      <div className="online-lobby-qr-split-details">
                        {/* ── Invoice block ── */}
                        <div className="online-lobby-qr-split-block">
                          <p className="online-lobby-sublabel">ANONYMOUS ZAP</p>
                          <p className="online-lobby-anon-amount">
                            {lightningPay.buyin.toLocaleString()} <span>sats</span>
                          </p>
                          <p className="online-lobby-pin-step-hint">
                            Expires {new Date(lightningPay.expiresAt).toLocaleTimeString()}
                          </p>
                          <div className="online-lobby-kind1-uri-line">
                            <p className="online-lobby-kind1-uri-text" title={lightningPay.lightningUri}>{lightningPay.lightningUri}</p>
                            <button type="button" className="online-lobby-kind1-uri-copy-iconbtn" onClick={() => void navigator.clipboard.writeText(lightningPay.lightningUri)} aria-label="Copy invoice" title="Copy">
                              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                            </button>
                          </div>
                        </div>
                        {/* ── Context note ── */}
                        <div className="online-lobby-qr-split-block online-lobby-qr-split-block--divided">
                          <p className="online-lobby-pin-step-hint">
                            Paying this invoice sends an anonymous zap to the room note. No Nostr account or identity required — pays directly via Lightning.
                          </p>
                          {nwcUri ? (
                            <>
                              <Button
                                type="button"
                                className="online-lobby-action online-lobby-nwc-pay-btn"
                                disabled={nwcBusy}
                                onClick={() => void tryNwcPay(lightningPay.lightningUri.replace(/^lightning:/i, ''))}
                              >
                                {nwcBusy ? 'PAYING…' : 'PAY WITH WALLET'}
                              </Button>
                              {nwcError ? <p className="online-lobby-nwc-error">{nwcError}</p> : null}
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : paymentMode === 'nostr-connect' ? (
                /* Nostr Connect (NIP-46 mobile signer — Primal, Amber, etc.) */
                <div className="online-lobby-kind1-qr-col online-lobby-kind1-qr-col--panel">
                  {!(nostrLinkActive && nostrLinkSourceMode === 'nip46') ? (
                    persistedNostr?.mode === 'nip46' ? (
                      /* NIP-46 session active — profile card + ZAP button */
                      <div className="online-lobby-nostr-connected-prompt">
                        <div className="online-lobby-nostr-connected-top">
                          {/* Profile card */}
                          <div className="online-lobby-nc-profile-card">
                            {persistedNostr.picture ? (
                              <img
                                className="online-lobby-nc-profile-avatar"
                                src={persistedNostr.picture}
                                alt=""
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            ) : (
                              <div className="online-lobby-nc-profile-avatar online-lobby-nc-profile-avatar--placeholder" aria-hidden>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="8" r="4" />
                                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                                </svg>
                              </div>
                            )}
                            <div className="online-lobby-nc-profile-info">
                              <span className="online-lobby-nc-profile-name-row">
                                <span className="online-lobby-nc-profile-name">
                                  {persistedNostr.displayName ?? midTruncate(persistedNostr.npub, 14, 6)}
                                </span>
                                <span className="online-lobby-nc-profile-npub" title={persistedNostr.npub}>
                                  {midTruncate(persistedNostr.npub, 12, 6)}
                                </span>
                              </span>
                              {persistedNostr.nip05 ? (
                                <span className="online-lobby-nc-profile-nip05">
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  {persistedNostr.nip05.replace(/^_@/, '@')}
                                </span>
                              ) : null}
                              {persistedNostr.lud16 ? (
                                <span className="online-lobby-nc-profile-ln" title={`Lightning address: ${persistedNostr.lud16}`}>
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                    <path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12L13 2Z" />
                                  </svg>
                                  {persistedNostr.lud16}
                                </span>
                              ) : (
                                <span className="online-lobby-nc-profile-ln online-lobby-nc-profile-ln--missing" title="No Lightning address found on profile — payouts may not be available">
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                    <path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12L13 2Z" />
                                  </svg>
                                  no LN address
                                </span>
                              )}
                            </div>
                          </div>
                          {/* ZAP button — top right */}
                          <Button
                            type="button"
                            className="online-lobby-action online-lobby-nostr-zap-btn"
                            disabled={nostrLinkBusy || !socket}
                            onClick={startNostrLinkFlow}
                          >
                            {nostrLinkBusy
                              ? (persistedNostr.mode === 'nip46' ? 'APPROVE IN APP…' : 'SIGNING…')
                              : `ZAP WITH ${persistedNostr.displayName ?? midTruncate(persistedNostr.npub, 8, 4)}`}
                          </Button>
                        </div>
                        <button
                          type="button"
                          className="online-lobby-text-btn online-lobby-nostr-switch-btn"
                          onClick={() => navigate('/config')}
                        >
                          manage connection in settings
                        </button>
                        {nostrLinkError ? (
                          <p className="online-lobby-nostr-sign-error" role="alert">{nostrLinkError}</p>
                        ) : null}
                      </div>
                    ) : (
                      /* No NIP-46 session — prompt to pair from Settings */
                      <div className="online-lobby-nostr-signin-prompt">
                        <svg className="online-lobby-nostr-signin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <rect x="3" y="2" width="11" height="18" rx="2" />
                          <line x1="6.5" y1="18" x2="10.5" y2="18" />
                          <path d="M17 8a5 5 0 0 1 0 8" />
                          <path d="M20 5.5a9 9 0 0 1 0 13" />
                        </svg>
                        <div className="online-lobby-nostr-signin-text">
                          <p className="online-lobby-nostr-signin-title">NOSTR CONNECT</p>
                          <p className="online-lobby-nostr-signin-sub">Pair with Primal or Amber from Settings → Nostr, then return here to zap.</p>
                        </div>
                        <Button
                          type="button"
                          className="online-lobby-action online-lobby-nostr-signin-btn"
                          onClick={() => navigate('/config')}
                        >
                          Open Settings
                        </Button>
                      </div>
                    )
                  ) : (
                    /* QR split — skeleton while preparing, live when invoice arrives */
                    <div className="online-lobby-qr-split">
                      <div className={['online-lobby-qr-frame', !seatZapInvoice ? 'online-lobby-qr-frame--loading' : 'online-lobby-qr-frame--ready'].join(' ')}>
                        {seatZapInvoice ? (
                          <QRCodeSVG value={seatZapInvoice.lightningUri} size={160} includeMargin className="online-lobby-qr" aria-label="Zap invoice QR code" />
                        ) : (
                          <div className="online-lobby-qr-skeleton" aria-hidden>
                            <svg className="online-lobby-qr-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                              <circle cx="12" cy="12" r="9" strokeOpacity="0.12" />
                              <path d="M12 3a9 9 0 0 1 9 9" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="online-lobby-qr-split-details">
                        {nostrLinkedProfile ? (
                          <div className="online-lobby-nostr-linked-pill">
                            <div className="online-lobby-nostr-linked-row">
                              <svg className="online-lobby-nostr-linked-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Linked">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              {nostrLinkedProfile.picture ? (
                                <img className="online-lobby-nostr-linked-avatar" src={nostrLinkedProfile.picture} alt="" onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }} />
                              ) : null}
                              <div className="online-lobby-nostr-linked-identity">
                                <span className="online-lobby-nostr-linked-name">{nostrLinkedProfile.name ?? 'Nostr profile'}</span>
                                <span className="online-lobby-nostr-linked-npub">{midTruncate(npubEncode(nostrLinkedProfile.pubkey), 12, 6)}</span>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        <p className="online-lobby-sublabel">
                          {seatZapInvoice ? `ZAP INVOICE — ${seatZapInvoice.buyinSats.toLocaleString()} sats` : 'PREPARING INVOICE…'}
                        </p>
                        <div className="online-lobby-kind1-uri-line">
                          {seatZapInvoice ? (
                            <>
                              <p className="online-lobby-kind1-uri-text" title={seatZapInvoice.lightningUri}>{seatZapInvoice.lightningUri}</p>
                              <button type="button" className="online-lobby-kind1-uri-copy-iconbtn" onClick={() => void navigator.clipboard.writeText(seatZapInvoice.lightningUri)} aria-label="Copy" title="Copy">
                                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                              </button>
                            </>
                          ) : (
                            <div className="online-lobby-uri-skeleton" aria-hidden />
                          )}
                        </div>
                        <div className="online-lobby-pay-btns">
                          <Button type="button" className="online-lobby-action" disabled={!seatZapInvoice} onClick={openLightningUri}>Launch external wallet</Button>
                          {nwcUri ? (
                            <Button type="button" className="online-lobby-action online-lobby-nwc-pay-btn" disabled={!seatZapInvoice || nwcBusy} onClick={() => seatZapInvoice && void tryNwcPay(seatZapInvoice.pr)}>
                              {nwcBusy ? 'PAYING…' : 'PAY WITH NWC'}
                            </Button>
                          ) : null}
                        </div>
                        {nwcError ? <p className="online-lobby-nwc-error">{nwcError}</p> : null}
                      </div>
                    </div>
                  )}
                </div>
              ) : paymentMode === 'nostr-pay' ? (
                /* Sign in with browser extension — lobby generates zap invoice */
                <div className="online-lobby-kind1-qr-col online-lobby-kind1-qr-col--panel">
                  {!(nostrLinkActive && nostrLinkSourceMode !== 'nip46') ? (
                    <div className="online-lobby-nostr-signin-prompt">
                      <div className="online-lobby-nostr-signin-text">
                        <p className="online-lobby-nostr-signin-title">SIGN IN WITH EXTENSION</p>
                        <p className="online-lobby-nostr-signin-sub">
                          {nostrLinkBusy
                            ? 'Approve the signing request in your extension…'
                            : 'Connect with Alby, nos2x, or any NIP-07 browser extension.'}
                        </p>
                      </div>
                      {nostrLinkBusy ? (
                        <span className="online-lobby-nostr-signing-indicator">SIGNING…</span>
                      ) : (
                        <Button type="button" className="online-lobby-action online-lobby-nostr-signin-btn" onClick={openNostrModal}>Sign in</Button>
                      )}
                    </div>
                  ) : (
                    /* QR split — skeleton while preparing, live when invoice arrives */
                    <div className="online-lobby-qr-split">
                      <div className={['online-lobby-qr-frame', !seatZapInvoice ? 'online-lobby-qr-frame--loading' : 'online-lobby-qr-frame--ready'].join(' ')}>
                        {seatZapInvoice ? (
                          <QRCodeSVG value={seatZapInvoice.lightningUri} size={160} includeMargin className="online-lobby-qr" aria-label="Zap invoice QR code" />
                        ) : (
                          <div className="online-lobby-qr-skeleton" aria-hidden>
                            <svg className="online-lobby-qr-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                              <circle cx="12" cy="12" r="9" strokeOpacity="0.12" />
                              <path d="M12 3a9 9 0 0 1 9 9" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="online-lobby-qr-split-details">
                        {nostrLinkedProfile ? (
                          <div className="online-lobby-nostr-linked-pill">
                            <div className="online-lobby-nostr-linked-row">
                              <svg className="online-lobby-nostr-linked-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Linked">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              {nostrLinkedProfile.picture ? (
                                <img className="online-lobby-nostr-linked-avatar" src={nostrLinkedProfile.picture} alt="" onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }} />
                              ) : null}
                              <div className="online-lobby-nostr-linked-identity">
                                <span className="online-lobby-nostr-linked-name">{nostrLinkedProfile.name ?? 'Nostr profile'}</span>
                                <span className="online-lobby-nostr-linked-npub">{midTruncate(npubEncode(nostrLinkedProfile.pubkey), 12, 6)}</span>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        <p className="online-lobby-sublabel">
                          {seatZapInvoice ? `ZAP INVOICE — ${seatZapInvoice.buyinSats.toLocaleString()} sats` : 'PREPARING INVOICE…'}
                        </p>
                        <div className="online-lobby-kind1-uri-line">
                          {seatZapInvoice ? (
                            <>
                              <p className="online-lobby-kind1-uri-text" title={seatZapInvoice.lightningUri}>{seatZapInvoice.lightningUri}</p>
                              <button type="button" className="online-lobby-kind1-uri-copy-iconbtn" onClick={() => void navigator.clipboard.writeText(seatZapInvoice.lightningUri)} aria-label="Copy" title="Copy">
                                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                              </button>
                            </>
                          ) : (
                            <div className="online-lobby-uri-skeleton" aria-hidden />
                          )}
                        </div>
                        <div className="online-lobby-pay-btns">
                          <Button type="button" className="online-lobby-action" disabled={!seatZapInvoice} onClick={openLightningUri}>Launch external wallet</Button>
                          {nwcUri ? (
                            <Button type="button" className="online-lobby-action online-lobby-nwc-pay-btn" disabled={!seatZapInvoice || nwcBusy} onClick={() => seatZapInvoice && void tryNwcPay(seatZapInvoice.pr)}>
                              {nwcBusy ? 'PAYING…' : 'PAY WITH NWC'}
                            </Button>
                          ) : null}
                        </div>
                        {nwcError ? <p className="online-lobby-nwc-error">{nwcError}</p> : null}
                      </div>
                    </div>
                  )}
                </div>
              ) : paymentMode === 'pin-zap' ? (
                /* PIN — numbered 3-step instruction layout */
                <div className="online-lobby-kind1-qr-col">
                  <ol className="online-lobby-pin-steps" aria-label="Steps to pay with PIN">
                    {/* Step 1: Copy PIN */}
                    <li className="online-lobby-pin-step">
                      <span className="online-lobby-pin-step-num" aria-hidden>1</span>
                      <p className="online-lobby-sublabel">COPY YOUR PIN</p>
                      <p className="online-lobby-pin online-lobby-kind1-pin">{joinPin || '—'}</p>
                      <p className="online-lobby-pin-step-hint">Paste this in your zap comment so the server identifies your seat.</p>
                    </li>
                    {/* Step 2: Open the note */}
                    <li className="online-lobby-pin-step">
                      <span className="online-lobby-pin-step-num" aria-hidden>2</span>
                      <p className="online-lobby-sublabel">OPEN THE NOTE</p>
                      <QRCodeSVG value={nostrUri} size={112} includeMargin className="online-lobby-qr online-lobby-qr--step" aria-label="Nostr note URI" />
                      <div className="online-lobby-kind1-uri-line online-lobby-pin-step-uri">
                        <p className="online-lobby-kind1-uri-text" title={nostrUri}>{midTruncate(nostrUri, 18, 8)}</p>
                        <button type="button" className={['online-lobby-kind1-uri-copy-iconbtn', nostrUriCopied ? 'online-lobby-kind1-uri-copy-iconbtn--ok' : ''].filter(Boolean).join(' ')} onClick={() => { void navigator.clipboard.writeText(nostrUri).then(() => { if (nostrUriCopyResetRef.current) clearTimeout(nostrUriCopyResetRef.current); setNostrUriCopied(true); nostrUriCopyResetRef.current = setTimeout(() => { setNostrUriCopied(false); nostrUriCopyResetRef.current = null; }, 2200); }); }} aria-label={nostrUriCopied ? 'Copied' : 'Copy URI'} title={nostrUriCopied ? 'Copied' : 'Copy'}>
                          {nostrUriCopied ? (<svg width={14} height={14} viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>) : (<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>)}
                        </button>
                      </div>
                    </li>
                    {/* Step 3: Zap */}
                    <li className="online-lobby-pin-step">
                      <span className="online-lobby-pin-step-num" aria-hidden>3</span>
                      <p className="online-lobby-sublabel">ZAP THE NOTE</p>
                      <p className="online-lobby-pin-step-amount">{(room?.buyin ?? 0).toLocaleString()} <span>sats</span></p>
                      <p className="online-lobby-pin-step-hint">Include your PIN in the zap comment. The server matches it to your seat automatically.</p>
                    </li>
                  </ol>
                </div>
              ) : (
                /* Default: nostrUri QR — 2-col: QR | hint + URI */
                <div className="online-lobby-kind1-qr-col">
                  <div className="online-lobby-qr-split">
                    <QRCodeSVG value={nostrUri} size={160} includeMargin className="online-lobby-qr" aria-label="Nostr note URI" />
                    <div className="online-lobby-qr-split-details">
                      <p className="online-lobby-kind1-qr-hint">Scan to open the room note in your Nostr client. Choose a payment path above to claim your seat.</p>
                      <div className="online-lobby-kind1-uri-line">
                        <p className="online-lobby-kind1-uri-text" title={nostrUri}>{nostrUri}</p>
                        <button type="button" className={['online-lobby-kind1-uri-copy-iconbtn', nostrUriCopied ? 'online-lobby-kind1-uri-copy-iconbtn--ok' : ''].filter(Boolean).join(' ')} onClick={() => { void navigator.clipboard.writeText(nostrUri).then(() => { if (nostrUriCopyResetRef.current) clearTimeout(nostrUriCopyResetRef.current); setNostrUriCopied(true); nostrUriCopyResetRef.current = setTimeout(() => { setNostrUriCopied(false); nostrUriCopyResetRef.current = null; }, 2200); }); }} aria-label={nostrUriCopied ? 'Copied' : 'Copy URI'} title={nostrUriCopied ? 'Copied' : 'Copy'}>
                          {nostrUriCopied ? (<svg width={14} height={14} viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>) : (<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>)}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Right: author + content ── */}
              <div className="online-lobby-kind1-content-col">
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
                    <div className="online-lobby-kind1-author-name-row">
                      <span className="online-lobby-kind1-author-name">{kind1PostEvent.authorName}</span>
                      <span className="online-lobby-kind1-author-npub" title={kind1PostEvent.npubDisplay}>
                        {kind1PostEvent.npubDisplay}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="online-lobby-kind1-embedded-body">{kind1PostEvent.content}</div>
                <span className="online-lobby-kind1-embedded-meta online-lobby-kind1-timestamp">
                  {new Date(kind1PostEvent.created_at * 1000).toLocaleString()}
                </span>

                {kind1PostEvent.pubpayZap.isPubpay ? (
                  <div className="online-lobby-pubpay-zap-meta">
                    <p className="online-lobby-copy">
                      {kind1PostEvent.pubpayZap.zapMinSats != null &&
                      kind1PostEvent.pubpayZap.zapMaxSats != null
                        ? `Pubpay zap range: ${kind1PostEvent.pubpayZap.zapMinSats}${
                            kind1PostEvent.pubpayZap.zapMinSats === kind1PostEvent.pubpayZap.zapMaxSats
                              ? ''
                              : `–${kind1PostEvent.pubpayZap.zapMaxSats}`
                          } sats`
                        : 'Zap terms from host'}
                      {kind1PostEvent.pubpayZap.zapUses ? ` · Uses: ${kind1PostEvent.pubpayZap.zapUses}` : ''}
                      {room?.buyin != null ? <> · Room buy-in: <b>{room.buyin} sats</b></> : null}
                    </p>
                  </div>
                ) : null}

                {rematchPending ? (
                  <p className="online-lobby-copy online-lobby-kind1-rematch-note">
                    {amILoserToPay
                      ? `Zap exactly ${Math.floor(rematchAmount).toLocaleString()} sats on this post to confirm the rematch.`
                      : `Waiting for opponent to zap exactly ${Math.floor(rematchAmount).toLocaleString()} sats on this post.`}
                  </p>
                ) : null}

                {error && !nostrModalOpen ? (
                  <p className="online-lobby-inline-pay-error">{error}</p>
                ) : null}

              </div>
            </div>
          ) : null}
        </div>
      ) : error && !nostrModalOpen ? (
        <div className="online-lobby-kind1-section online-lobby-kind1-section--room-error">
          <svg className="online-lobby-room-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="online-lobby-room-error-title">
            {error === 'room_not_found' ? 'Room not found' : 'Connection error'}
          </p>
          <p className="online-lobby-room-error-detail">{error}</p>
          <Button
            type="button"
            className="online-lobby-action"
            onClick={() => navigate('/network')}
          >
            ← Back to Network
          </Button>
        </div>
      ) : (
        <div className="online-lobby-kind1-section online-lobby-kind1-section--pending">
          {rematchPending ? 'Publishing rematch Kind1…' : 'Publishing Kind1…'}
        </div>
      )}

      {/* Leave Room — shown below the kind1 section when seat not yet claimed */}
      {!mySeat && !isMatchEnded && !rematchPending ? (
        <div className="online-lobby-leave-row">
          <Button
            type="button"
            className="online-lobby-action online-lobby-leave-btn"
            onClick={() => {
              socket?.emit('leaveOnlineRoom', { roomId });
              navigate('/network');
            }}
          >
            LEAVE ROOM
          </Button>
        </div>
      ) : null}

      {/* Nostr sign-in modal */}
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
            ref={modalDialogRef}
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
              Link this session to a pubkey, then zap the Kind1{' '}
              <strong>without</strong> putting the PIN in the comment.
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
                        {' '}· {nostrLinkedProfile.name}
                      </span>
                    ) : null}
                    {' · '}expires {new Date(nostrLinkExpiresAt ?? 0).toLocaleTimeString()}
                  </span>
                </span>
              ) : nostrLinkBusy ? (
                <span className="online-lobby-modal-status-busy">Signing…</span>
              ) : (
                <span className="online-lobby-modal-status-idle">Not linked yet</span>
              )}
            </p>
            <p className="online-lobby-modal-nip07-hint">
              Uses your browser NIP-07 extension (Alby, nos2x, etc.). For mobile signers use the Nostr Connect tab.
            </p>
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

      </div>{/* end .online-lobby-main */}

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay={true} />
    </div>
  );
}
