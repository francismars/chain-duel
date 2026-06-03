import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/Button';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useSocket } from '@/hooks/useSocket';
import { SocketBoundaryParsers } from '@/shared/socket/socketBoundary';
import {
  ONLINE_HOME,
  onlineGameUrl,
  onlinePostGameUrl,
  onlineReplayUrl,
} from '@/shared/constants/onlineRoutes';
import { OnlineRoomState } from '@/types/socket';
import { onlinePingAccent } from '@/game/online/onlinePingAccent';
import { signNostrEvent, signOnlineSeatLinkChallenge } from '@/lib/nostr/signOnlineSeatLink';
import { getNwcUri, nwcPay } from '@/lib/nostr/nwcPay';
import { setNip46AuthUrlHandler, resolveSignerMode, recoverNip46UserPubkey } from '@/lib/nostr/signerSession';
import { npubEncode } from 'nostr-tools/nip19';
import { useNostrSession } from '@/contexts/NostrSessionContext';
import type { NostrLinkedProfile } from '@/types/schemas';
import {
  resolveLobbyPaymentModeForSeat,
  storeLobbyPaymentMode,
} from '@/lib/online/resolveLobbyPaymentMode';
import {
  buildOnlineRoomLobbyShareUrl,
  buildOnlineRoomInviteText,
} from '@/lib/online/buildOnlineRoomInvite';
import { publishSignedNostrEvent } from '@/lib/nostr/publishSignedNostrEvent';
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

function formatZapPayError(reason: string): string {
  switch (reason) {
    case 'pubkey_mismatch':
      return 'Zap signature pubkey does not match your linked identity. Sign out in Settings, sign in again with Nostr Connect, then retry.';
    case 'nostr_not_linked':
      return 'Nostr room link expired or missing. Tap Link & pay again.';
    case 'host_ln_unknown':
      return 'Could not resolve the host Lightning address from the room note.';
    case 'recipient_lnurl_no_zap':
      return 'Host Lightning address does not accept Nostr zaps.';
    case 'kind1_not_ready':
      return 'Room note is not ready yet. Wait a moment and try again.';
    case 'no_nostr_signer':
      return 'No Nostr signer available. Reconnect Nostr Connect in Settings.';
    case 'already_seated':
      return 'You already have a paid seat in this room.';
    case 'seats_full':
      return 'Both seats are already taken.';
    case 'not_loser':
      return 'That zap did not come from the losing player. Use the same identity or payment method as your buy-in.';
    case 'amount_too_low':
      return 'Zap amount is too low for double or nothing. Pay the exact rematch amount on the rematch note.';
    case 'rematch_use_rematch_note':
      return 'Zap the rematch note (published after both players agreed), not the original room note.';
    case 'rematch_not_requested':
      return 'Double or nothing is no longer waiting for payment.';
    case 'room_not_finished':
      return 'The room is not in postgame — rematch payment cannot be applied.';
    case 'no_session':
      return 'Lost connection to game server. Refresh the page and try again.';
    default:
      return reason.replace(/_/g, ' ');
  }
}

export default function OnlineRoomLobby() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const configReturnTo = `${location.pathname}${location.search}`;
  const nostrSession = useNostrSession();
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
  const paymentCardsRef = useRef<HTMLDivElement | null>(null);
  const paymentPanelRef = useRef<HTMLDivElement | null>(null);
  const [kind1PostEvent, setKind1PostEvent] = useState<Kind1PostLoaded | null>(null);
  const [kind1PostStatus, setKind1PostStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [kind1PostRetry, setKind1PostRetry] = useState(0);
  const [zapPayBusy, setZapPayBusy] = useState(false);
  const [pendingNostrAuthUrl, setPendingNostrAuthUrl] = useState<string | null>(null);
  const [seatZapInvoice, setSeatZapInvoice] = useState<{
    pr: string;
    lightningUri: string;
    buyinSats: number;
  } | null>(null);
  const [yourPingMs, setYourPingMs] = useState<number | null>(null);
  const [nostrLinkExpiresAt, setNostrLinkExpiresAt] = useState<number | null>(null);
  const [nostrLinkedProfile, setNostrLinkedProfile] = useState<NostrLinkedProfile | null>(null);
  const [nostrLinkBusy, setNostrLinkBusy] = useState(false);
  const [nostrPayError, setNostrPayError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [lightningPay, setLightningPay] = useState<{
    lnurl: string;
    lightningUri: string;
    buyin: number;
    expiresAt: number;
  } | null>(null);
  const [lightningBusy, setLightningBusy] = useState(false);
  const [nwcUri, setNwcUri] = useState<string | null>(() => getNwcUri());
  const [nwcBusy, setNwcBusy] = useState(false);
  const [nwcError, setNwcError] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<'anon' | 'nostr' | 'pin-zap' | null>(null);
  const [inviteCopyFeedback, setInviteCopyFeedback] = useState<'link' | 'text' | null>(null);
  const inviteCopyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [invitePostBusy, setInvitePostBusy] = useState(false);
  const [invitePostError, setInvitePostError] = useState<string | null>(null);
  const [invitePostOk, setInvitePostOk] = useState(false);
  const [cardNavIndex, setCardNavIndex] = useState(0);
  /** Pubkey from last successful kind-1 sign, until server confirms with `resOnlineNostrLinkOk`. */
  const pendingNostrLinkPubkeyRef = useRef<string | null>(null);
  const paymentModeRef = useRef(paymentMode);
  const rematchPendingRef = useRef(false);
  /** Last successful `requestOnlineKind1Post` for this room + note ref — avoids refetch when switching Kind1 tabs back to POST. */
  const kind1PostLoadedKeyRef = useRef<string | null>(null);
  const zapPayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;

  const clearZapPayTimeout = useCallback(() => {
    if (zapPayTimeoutRef.current) {
      window.clearTimeout(zapPayTimeoutRef.current);
      zapPayTimeoutRef.current = null;
    }
  }, []);

  const requestSeatZapPrepare = useCallback(() => {
    if (!socket || !roomId) {
      return;
    }
    clearZapPayTimeout();
    setNostrPayError(null);
    setPendingNostrAuthUrl(null);
    setSeatZapInvoice(null);
    setZapPayBusy(true);
    socket.emit('requestOnlineSeatZapPayPrepare', { roomId });
    zapPayTimeoutRef.current = window.setTimeout(() => {
      setZapPayBusy(false);
      setPendingNostrAuthUrl(null);
      if (paymentModeRef.current === 'nostr') {
        const hint =
          resolveSignerMode() === 'nip46'
            ? ' Open Primal and tap Allow on the zap signing prompt, then tap Retry.'
            : '';
        setNostrPayError(`Timed out preparing zap invoice.${hint}`);
      }
    }, 120_000);
  }, [socket, roomId, clearZapPayTimeout]);

  const requestSeatZapPrepareRef = useRef(requestSeatZapPrepare);
  requestSeatZapPrepareRef.current = requestSeatZapPrepare;

  useEffect(() => {
    setNip46AuthUrlHandler((url) => setPendingNostrAuthUrl(url));
    return () => setNip46AuthUrlHandler(null);
  }, []);

  useEffect(() => {
    return () => {
      clearZapPayTimeout();
    };
  }, [clearZapPayTimeout]);

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
        sessionID?: string;
      };
      const currentSid = sessionStorage.getItem('sessionID') ?? '';
      if (parsed.sessionID && currentSid && parsed.sessionID !== currentSid) {
        sessionStorage.removeItem(nostrLinkStorageKey);
        return;
      }
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
        const msg = formatZapPayError(parsed.reason);
        if (paymentModeRef.current === 'nostr' || rematchPendingRef.current) {
          setNostrPayError(msg);
        } else {
          setError(msg);
        }
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
      setNostrPayError(null);
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
              sessionID: sessionStorage.getItem('sessionID') ?? '',
            })
          );
        } catch {
          /* ignore quota */
        }
      }
      // Auto-start zap invoice immediately after signing — skip the PAY button click
      const mode = paymentModeRef.current;
      if (mode === 'nostr') {
        requestSeatZapPrepareRef.current();
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
      setNostrPayError(null);
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
        setNostrPayError(e instanceof Error ? e.message : 'Signing failed');
        setNostrLinkBusy(false);
      }
    };
    const onSession = (payload: { sessionID: string }) => {
      if (!payload?.sessionID) {
        return;
      }
      const prev = sessionStorage.getItem('sessionID');
      if (prev && prev !== payload.sessionID) {
        setNostrLinkExpiresAt(null);
        setNostrLinkedProfile(null);
        const storageKey = roomId ? `onlineLobbyNostrLink_${roomId}` : '';
        if (storageKey) {
          sessionStorage.removeItem(storageKey);
        }
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

    socket.on('onlineRoomUpdated', onUpdated);
    socket.on('resJoinOnlineRoom', onJoin);
    socket.on('resCreateOnlineRoom', onCreate);
    socket.on('onlinePinInvalid', onInvalid);
    socket.on('resOnlineNostrLinkOk', onNostrOk);
    socket.on('resOnlineNostrLinkChallenge', onNostrChallenge);
    socket.on('resOnlineKind1Post', onKind1Post);
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
      socket.off('resOnlineSeatLightning', onLightning);
      socket.off('resOnlineSeatLightningError', onLightningErr);
      socket.off('resOnlineSeatLightningCancelled', onLightningCancelled);
      socket.off('session', onSession);
      socket.off('connect', refreshLocalIdentity);
    };
  }, [roomId, socket, kind1]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const clearZapTimeout = () => {
      if (zapPayTimeoutRef.current) {
        window.clearTimeout(zapPayTimeoutRef.current);
        zapPayTimeoutRef.current = null;
      }
    };

    const onZapPayPrepare = async (payload: unknown) => {
      const parsed = SocketBoundaryParsers.resOnlineSeatZapPayPrepare(payload);
      if (!parsed || parsed.roomId !== roomIdRef.current) {
        return;
      }
      try {
        if (resolveSignerMode() === 'nip46') {
          await recoverNip46UserPubkey();
        }
        const signed = await signNostrEvent(parsed.unsignedZap);
        socket.emit('confirmOnlineSeatZapPay', {
          roomId: roomIdRef.current,
          event: signed as unknown as Record<string, unknown>,
        });
      } catch (e) {
        clearZapTimeout();
        setZapPayBusy(false);
        setPendingNostrAuthUrl(null);
        const msg = e instanceof Error ? e.message : 'sign_failed';
        if (paymentModeRef.current === 'nostr') {
          setNostrPayError(formatZapPayError(msg));
        } else {
          setError(msg);
        }
      }
    };

    const onZapPayInvoice = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.resOnlineSeatZapPayInvoice(payload);
      if (!parsed || parsed.roomId !== roomIdRef.current) {
        return;
      }
      clearZapTimeout();
      setZapPayBusy(false);
      setPendingNostrAuthUrl(null);
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
      clearZapTimeout();
      setZapPayBusy(false);
      setPendingNostrAuthUrl(null);
      const msg = formatZapPayError(parsed.reason);
      if (parsed.reason === 'nostr_not_linked' || parsed.reason === 'no_session') {
        setNostrLinkExpiresAt(null);
        setNostrLinkedProfile(null);
        if (nostrLinkStorageKey) {
          sessionStorage.removeItem(nostrLinkStorageKey);
        }
      }
      if (paymentModeRef.current === 'nostr') {
        setNostrPayError(msg);
      } else {
        setError(msg);
      }
    };

    socket.on('resOnlineSeatZapPayPrepare', onZapPayPrepare);
    socket.on('resOnlineSeatZapPayInvoice', onZapPayInvoice);
    socket.on('resOnlineSeatZapPayError', onZapPayError);
    return () => {
      socket.off('resOnlineSeatZapPayPrepare', onZapPayPrepare);
      socket.off('resOnlineSeatZapPayInvoice', onZapPayInvoice);
      socket.off('resOnlineSeatZapPayError', onZapPayError);
    };
  }, [socket, nostrLinkStorageKey]);

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

  const bothPlayersReady = useMemo(() => {
    if (!room || paidSeats < 2) return false;
    const s1 = room.seats['Player 1'];
    const s2 = room.seats['Player 2'];
    return s1?.status === 'paid' && s1.ready === true && s2?.status === 'paid' && s2.ready === true;
  }, [room, paidSeats]);

  const nostrLinkActive = useMemo(
    () => nostrLinkExpiresAt != null && nostrLinkExpiresAt > nowTick,
    [nostrLinkExpiresAt, nowTick]
  );

  const zapAutoPreparedRef = useRef(false);
  useEffect(() => {
    if (paymentMode !== 'nostr' || !nostrLinkActive || seatZapInvoice || zapPayBusy || !nostrSession.signedIn) {
      if (paymentMode !== 'nostr' || !nostrLinkActive) {
        zapAutoPreparedRef.current = false;
      }
      return;
    }
    if (zapAutoPreparedRef.current) {
      return;
    }
    zapAutoPreparedRef.current = true;
    requestSeatZapPrepareRef.current();
  }, [paymentMode, nostrLinkActive, seatZapInvoice, zapPayBusy, nostrSession.signedIn]);

  const isNip46Signer = resolveSignerMode() === 'nip46';

  paymentModeRef.current = paymentMode;

  const startNostrLinkFlow = () => {
    if (!socket || !roomId) {
      return;
    }
    setNostrPayError(null);
    setNostrLinkBusy(true);
    socket.emit('requestOnlineNostrLinkChallenge', { roomId });
  };

  const openConfigForNostr = () => {
    navigate('/config', { state: { returnTo: configReturnTo } });
  };

  const openConfigForNwc = () => {
    navigate('/config', { state: { returnTo: configReturnTo } });
  };

  const flashInviteCopy = (which: 'link' | 'text') => {
    if (inviteCopyResetRef.current) clearTimeout(inviteCopyResetRef.current);
    setInviteCopyFeedback(which);
    inviteCopyResetRef.current = setTimeout(() => {
      setInviteCopyFeedback(null);
      inviteCopyResetRef.current = null;
    }, 2200);
  };

  const copyLobbyLink = () => {
    if (!lobbyInviteUrl) return;
    void navigator.clipboard.writeText(lobbyInviteUrl).then(() => flashInviteCopy('link'));
  };

  const copyInviteText = () => {
    if (!lobbyInviteText) return;
    void navigator.clipboard.writeText(lobbyInviteText).then(() => flashInviteCopy('text'));
  };

  const postInviteOnNostr = async () => {
    if (!socket || !roomId) return;
    if (!nostrSession.signedIn) {
      openConfigForNostr();
      return;
    }
    if (!lobbyInviteText) return;
    setInvitePostBusy(true);
    setInvitePostError(null);
    setInvitePostOk(false);
    try {
      const signed = await signNostrEvent({
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: lobbyInviteText,
      });
      const result = await publishSignedNostrEvent(socket, signed);
      if (!result.ok) {
        setInvitePostError(result.reason);
        return;
      }
      setInvitePostOk(true);
    } catch (e) {
      setInvitePostError(e instanceof Error ? e.message : 'Could not publish note');
    } finally {
      setInvitePostBusy(false);
    }
  };

  useEffect(() => {
    if (paymentMode !== 'anon') return;
    const syncNwc = () => setNwcUri(getNwcUri());
    syncNwc();
    window.addEventListener('focus', syncNwc);
    return () => window.removeEventListener('focus', syncNwc);
  }, [paymentMode]);

  const openPendingNostrAuth = () => {
    if (!pendingNostrAuthUrl) {
      return;
    }
    window.open(pendingNostrAuthUrl, '_blank', 'noopener,noreferrer');
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
  const isMyP1Seat = mySeat?.role === 'Player 1';
  const isMyP2Seat = mySeat?.role === 'Player 2';
  const phaseLabel = (room?.phase ?? 'lobby').toUpperCase();
  const isSessionClosed = room?.phase === 'finished';
  const isPostgame = room?.phase === 'postgame';
  const isMatchEnded = isPostgame || isSessionClosed;
  const rematchPending = Boolean(room?.postGame?.rematchRequested);
  rematchPendingRef.current = rematchPending;
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
    if (rematchPending) {
      return null;
    }
    if (isPostgame) {
      return {
        cardMod: '',
        label: 'ROUND OVER',
        pin: 'MATCH ENDED',
        copy: 'Head to the victory screen to claim your prize, vote for double or nothing, or watch the replay.',
      };
    }
    if (!myReady) {
      return {
        cardMod: 'online-lobby-pin-card--ready',
        label: 'SEAT PAID',
        pin: 'READY UP',
        copy: `Use Mark as Ready on your player card when you're set to play.`,
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
    if (!bothPlayersReady) {
      return {
        cardMod: 'online-lobby-pin-card--ready',
        label: 'SEAT PAID',
        pin: "YOU'RE READY",
        copy: 'Waiting for your opponent to mark ready. Game starts when both are set.',
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
    isMatchEnded && !rematchPending
      ? {
          p1Name: snapshotP1Name,
          p2Name: snapshotP2Name,
          p1Score: Math.floor((room?.snapshot?.state as { score?: number[] } | undefined)?.score?.[0] ?? 0),
          p2Score: Math.floor((room?.snapshot?.state as { score?: number[] } | undefined)?.score?.[1] ?? 0),
          winner: room?.postGame?.winnerName ?? 'Winner',
          netPrize: Math.floor((room?.postGame?.winnerPoints ?? 0) * 0.95),
        }
      : null;
  const lobbySeatName = (seat: (typeof p1) | undefined, fallback: string) => {
    const trimmed = seat?.name?.trim();
    if (trimmed) return trimmed;
    if (seat?.status === 'paid') {
      if (seat.pubkey) {
        const hex = seat.pubkey.replace(/[^a-f0-9]/gi, '').slice(0, 6).toLowerCase();
        return hex ? `Anon${hex}` : 'Anonymous';
      }
      return 'Anonymous';
    }
    return fallback;
  };
  const p1NameDisplay = isMatchEnded
    ? p1?.name || snapshotP1Name
    : rematchPending
      ? p1?.name || snapshotP1Name
      : lobbySeatName(p1, 'Open seat');
  const p2NameDisplay = isMatchEnded
    ? p2?.name || snapshotP2Name
    : rematchPending
      ? p2?.name || snapshotP2Name
      : lobbySeatName(p2, 'Open seat');
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
  const isRematchLoserPay = rematchPending && amILoserToPay;
  const seatsFull = paidSeats >= 2;
  const isSpectatingFullRoom =
    !hasPaidMySeat && seatsFull && !isMatchEnded && !rematchPending && !isRematchLoserPay;
  const rematchPayMode = useMemo(
    () =>
      roomId && isRematchLoserPay
        ? resolveLobbyPaymentModeForSeat({ roomId, payMethod: mySeat?.payMethod })
        : null,
    [roomId, isRematchLoserPay, mySeat?.payMethod],
  );
  const lobbyPayAmount = isRematchLoserPay ? rematchAmount : (room?.buyin ?? 0);
  const showSeatPaymentPaths =
    !hasPaidMySeat && !isMatchEnded && !rematchPending && !seatsFull;
  const showInviteFinder =
    hasPaidMySeat && !paymentMode && !rematchPending && !isMatchEnded;
  const lobbyInviteUrl = roomId ? buildOnlineRoomLobbyShareUrl(roomId) : '';
  const lobbyInviteText = useMemo(() => {
    if (!room?.roomCode || !roomId) return '';
    return buildOnlineRoomInviteText({
      roomCode: room.roomCode,
      buyin: room.buyin,
      lobbyUrl: lobbyInviteUrl,
    });
  }, [room?.roomCode, room?.buyin, roomId, lobbyInviteUrl]);

  const rematchPayPrimedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isSpectatingFullRoom) {
      return;
    }
    setPaymentMode(null);
    setLightningPay(null);
    setSeatZapInvoice(null);
    setZapPayBusy(false);
    setLightningBusy(false);
  }, [isSpectatingFullRoom]);

  useEffect(() => {
    if (hasPaidMySeat && !isRematchLoserPay) {
      if (paymentModeRef.current && roomId) {
        storeLobbyPaymentMode(roomId, paymentModeRef.current);
      }
      setLightningPay(null);
      setSeatZapInvoice(null);
      setZapPayBusy(false);
      setPaymentMode(null);
    }
  }, [hasPaidMySeat, isRematchLoserPay, roomId]);

  useEffect(() => {
    if (!isRematchLoserPay || !rematchPayMode || !socket || !roomId) {
      if (!isRematchLoserPay) {
        rematchPayPrimedRef.current = null;
      }
      return;
    }
    const primeKey = `${roomId}:${rematchWaitingForSessionID}:${rematchPayMode}`;
    if (rematchPayPrimedRef.current === primeKey) {
      return;
    }
    rematchPayPrimedRef.current = primeKey;
    setLightningPay(null);
    setSeatZapInvoice(null);
    setZapPayBusy(false);
    setPaymentMode(rematchPayMode);
    if (rematchPayMode === 'anon') {
      setLightningBusy(true);
      socket.emit('requestOnlineSeatLightning', { roomId });
    } else if (rematchPayMode === 'nostr' && nostrSession.signedIn) {
      startNostrLinkFlow();
    }
  }, [
    isRematchLoserPay,
    rematchPayMode,
    socket,
    roomId,
    rematchWaitingForSessionID,
    nostrSession.signedIn,
  ]);

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
      if (e.key === 'Escape' && paymentMode !== null && !isRematchLoserPay) {
        setPaymentMode(null);
        // Return focus to the card that was active
        const active = paymentCardsRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
        active?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paymentMode]);

  // Sync cardNavIndex when paymentMode changes via mouse click
  useEffect(() => {
    if (paymentMode === null) return;
    const idx = ['anon', 'nostr', 'pin-zap'].indexOf(paymentMode);
    if (idx !== -1) setCardNavIndex(idx);
  }, [paymentMode]);

  // Global arrow-key / gamepad nav for the three payment cards.
  // Does NOT require a card to already have native browser focus.
  useEffect(() => {
    // Only active when the payment section is in the DOM
    const container = paymentCardsRef.current;
    if (!container) return;

    const onKey = (e: KeyboardEvent) => {
      // Don't hijack keys while typing in inputs
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const modes = ['anon', 'nostr', 'pin-zap'] as const;
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
  }, [cardNavIndex]);

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
    const uri = lightningPay?.lightningUri ?? seatZapInvoice?.lightningUri;
    if (!uri) return;
    window.location.href = uri;
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
    navigate(onlineGameUrl(roomId));
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
    if (rematchPending) return 'DOUBLE OR NOTHING';
    if (isPostgame) return 'ROUND OVER';
    if (paidSeats === 2 && bothPlayersReady) return 'BOTH READY';
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
          <h1 className="online-lobby-title">ONLINE ROOM</h1>
          {room?.phase && room.phase !== 'lobby' ? (
            <div className={`online-lobby-phase online-lobby-phase-${room.phase}`}>
              {phaseLabel}
            </div>
          ) : null}
        </div>
        <div className="online-lobby-header-meta">
          {room ? (
            <>
              <span className="online-lobby-header-code-label">Room code</span>
              <span className="online-lobby-header-code-group">
                <span className="online-lobby-header-code" title="Use this code to join or verify the Nostr note">
                  {room.roomCode}
                </span>
                <button
                  type="button"
                  className={[
                    'online-lobby-header-copy-emoji',
                    inviteCopyFeedback === 'link' ? 'online-lobby-header-copy-emoji--ok' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={!lobbyInviteUrl}
                  onClick={copyLobbyLink}
                  aria-label={inviteCopyFeedback === 'link' ? 'Room link copied' : 'Copy room link'}
                  title={inviteCopyFeedback === 'link' ? 'Copied' : lobbyInviteUrl || 'Copy room link'}
                >
                  {inviteCopyFeedback === 'link' ? '✓' : '🔗'}
                </button>
              </span>
              <span className="online-lobby-header-sep">·</span>
              <span className="online-lobby-header-buyin">
                {room.buyin.toLocaleString()} sats buy-in
              </span>
              <span className="online-lobby-header-sep">·</span>
              <span className="online-lobby-header-seats">{paidSeats}/2 paid</span>
              {yourPingMs != null ? (
                <>
                  <span className="online-lobby-header-sep">·</span>
                  <span
                    className={`online-lobby-ping-badge online-lobby-ping online-lobby-ping--${onlinePingAccent(yourPingMs)}`}
                    title="Your round-trip to server"
                  >
                    {yourPingMs}ms
                  </span>
                </>
              ) : null}
            </>
          ) : (
            <span className="online-lobby-header-loading">Connecting…</span>
          )}
        </div>
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
              {amILoserToPay ? 'DOUBLE OR NOTHING — YOUR TURN' : 'DOUBLE OR NOTHING — WAITING'}
            </p>
            <p className="online-lobby-don-banner-amount">
              {Math.floor(rematchAmount).toLocaleString()}
              <span className="online-lobby-don-banner-unit"> sats</span>
            </p>
            <p className="online-lobby-don-banner-desc">
              {amILoserToPay
                ? 'Pay below — same method as your buy-in.'
                : 'Waiting for opponent to pay. Stakes double once confirmed.'}
            </p>
          </div>
          {amILoserToPay ? null : (
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

        {isRematchLoserPay && (nostrPayError || error) ? (
          <p className="online-lobby-invite-error online-lobby-rematch-pay-error" role="alert">
            {nostrPayError || error}
          </p>
        ) : null}

        {/* Payment paths — initial seat claim or rematch loser */}
        {showSeatPaymentPaths ? (
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
                <span className="online-lobby-path-card-title">LIGHTNING ONLY</span>
                <span className="online-lobby-path-card-desc">No sign-in</span>
              </button>

              {/* Pay with Nostr — extension, Nostr Connect, or nsec via Settings */}
              <button
                type="button"
                className={['online-lobby-path-card', paymentMode === 'nostr' ? 'online-lobby-path-card--active' : ''].filter(Boolean).join(' ')}
                onClick={() => {
                  if (paymentMode === 'nostr') {
                    setPaymentMode(null);
                    return;
                  }
                  setPaymentMode('nostr');
                  if (nostrSession.signedIn && !nostrLinkActive && socket && roomId) {
                    startNostrLinkFlow();
                  }
                }}
                role="radio"
                aria-checked={paymentMode === 'nostr'}
                data-mode="nostr"
                tabIndex={cardNavIndex === 1 ? 0 : -1}
              >
                <svg className="online-lobby-path-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="8" cy="7" r="3.5" />
                  <path d="M2 21c0-4 2.7-6 6-6h.5" />
                  <path d="M17 11l-3 5h4l-3 5" />
                </svg>
                <span className="online-lobby-path-card-title">SIGN IN</span>
                <span className="online-lobby-path-card-desc">Zap here, no PIN</span>
              </button>

              {/* Zap with PIN — mobile device */}
              <button
                type="button"
                className={['online-lobby-path-card', paymentMode === 'pin-zap' ? 'online-lobby-path-card--active' : ''].filter(Boolean).join(' ')}
                onClick={() => setPaymentMode(paymentMode === 'pin-zap' ? null : 'pin-zap')}
                role="radio"
                aria-checked={paymentMode === 'pin-zap'}
                data-mode="pin-zap"
                tabIndex={cardNavIndex === 2 ? 0 : -1}
              >
                <svg className="online-lobby-path-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="5" y="2" width="14" height="20" rx="2" />
                  <path d="M12 18h.01" />
                </svg>
                <span className="online-lobby-path-card-title">ZAP FROM YOUR APP</span>
                <span className="online-lobby-path-card-desc">Open room note · PIN in comment</span>
              </button>
            </div>

          </div>
        ) : null}

        {/* Spectator — room full, or registration closed after match */}
        {isSpectatingFullRoom ? (
          <div className="online-lobby-pin-card">
            <p className="online-lobby-label">SPECTATING</p>
            <p className="online-lobby-pin">ROOM FULL</p>
            <p className="online-lobby-copy">
              Both seats are taken. Watch here — the match starts when both players mark ready.
            </p>
          </div>
        ) : null}

        {!hasPaidMySeat && !isRematchLoserPay && (isMatchEnded || rematchPending) ? (
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
                onClick={() => navigate(onlinePostGameUrl(roomId))}
              >
                VIEW POSTGAME DETAILS
              </Button>
              <Button
                type="button"
                className="online-lobby-action"
                onClick={() =>
                  navigate(onlineReplayUrl(roomId, room?.matchRound ?? 1))
                }
              >
                WATCH REPLAY
              </Button>
              <Button
                type="button"
                className="online-lobby-action"
                onClick={() => {
                  socket?.emit('leaveOnlineRoom', { roomId });
                  navigate(ONLINE_HOME);
                }}
              >
                EXIT ROOM
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* ── Zone 4: Kind1 Post ── */}
      {kind1 ? (
        <div className="online-lobby-kind1-section" ref={paymentPanelRef}>
          {kind1PostStatus === 'loading' && !paymentMode ? (
            <div className="online-lobby-kind1-loading" aria-label="Loading note from relays" role="status">
              <span className="online-lobby-kind1-loading-chain" aria-hidden="true">
                <span /><span /><span /><span /><span /><span /><span /><span />
              </span>
              <span className="online-lobby-kind1-loading-label">LOADING NOTE FROM RELAYS</span>
            </div>
          ) : kind1PostStatus === 'error' && !kind1PostEvent && !paymentMode ? (
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
          ) : kind1PostEvent || paymentMode ? (
            <div
              className={[
                'online-lobby-kind1-embedded',
                showInviteFinder ? 'online-lobby-kind1-embedded--invite-only' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {/* ── Left column: payment UI only (status lives in the banner above) ── */}
              {paymentMode === 'anon' ? (
                /* Anonymous Lightning invoice */
                <div className="online-lobby-kind1-qr-col online-lobby-kind1-qr-col--panel">
                  {!lightningPay ? (
                    /* Pre-invoice: description left + CTA top-right */
                    <div className="online-lobby-nostr-connected-top">
                      <div className="online-lobby-anon-desc">
                        <p className="online-lobby-sublabel">
                          {isRematchLoserPay ? 'LIGHTNING · REMATCH' : 'LIGHTNING SEAT'}
                        </p>
                        <p className="online-lobby-kind1-qr-hint">
                          {isRematchLoserPay
                            ? 'Get an invoice for the rematch amount, then scan, open in another wallet, or pay with NWC.'
                            : 'Get an invoice, then scan, open in another wallet app, or pay with NWC from Settings.'}
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
                          <p className="online-lobby-sublabel">
                            {isRematchLoserPay ? 'LIGHTNING · REMATCH' : 'LIGHTNING SEAT'}
                          </p>
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
                            Scan or copy the invoice, open your usual Lightning app, or use NWC. Anonymous seat — no
                            sign-in on this site.
                          </p>
                          <div className="online-lobby-pay-btns">
                            <Button
                              type="button"
                              className="online-lobby-action"
                              onClick={openLightningUri}
                            >
                              Open external wallet
                            </Button>
                            {nwcUri ? (
                              <Button
                                type="button"
                                className="online-lobby-action online-lobby-nwc-pay-btn"
                                disabled={nwcBusy}
                                onClick={() => void tryNwcPay(lightningPay.lightningUri.replace(/^lightning:/i, ''))}
                              >
                                {nwcBusy ? 'PAYING…' : 'PAY WITH NWC'}
                              </Button>
                            ) : null}
                          </div>
                          {!nwcUri ? (
                            <p className="online-lobby-pin-step-hint">
                              Optional:{' '}
                              <button type="button" className="online-lobby-text-btn" onClick={openConfigForNwc}>
                                add NWC in Settings
                              </button>
                              {' '}
                              to pay in one tap from Primal, Alby, etc.
                            </p>
                          ) : null}
                          {nwcError ? <p className="online-lobby-nwc-error">{nwcError}</p> : null}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : paymentMode === 'nostr' ? (
                <div className="online-lobby-kind1-qr-col online-lobby-kind1-qr-col--panel">
                  {!nostrSession.signedIn ? (
                    <div className="online-lobby-nostr-signin-prompt">
                      <div className="online-lobby-nostr-signin-text">
                        <p className="online-lobby-nostr-signin-title">LINK YOUR KEY IN SETTINGS</p>
                        <p className="online-lobby-nostr-signin-sub">
                          Extension, Nostr Connect, or nsec — then zap from this page (no PIN in comment).
                        </p>
                      </div>
                      <Button
                        type="button"
                        className="online-lobby-action online-lobby-nostr-signin-btn"
                        onClick={openConfigForNostr}
                      >
                        Open Settings
                      </Button>
                    </div>
                  ) : !(nostrLinkActive || seatZapInvoice) ? (
                    <div className="online-lobby-nostr-connected-prompt">
                      <div className="online-lobby-nostr-connected-top">
                        <div className="online-lobby-nc-profile-card">
                          {nostrSession.picture ? (
                            <img
                              className="online-lobby-nc-profile-avatar"
                              src={nostrSession.picture}
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
                                {nostrSession.displayName ?? midTruncate(nostrSession.npub ?? '', 14, 6)}
                              </span>
                              {nostrSession.npub ? (
                                <span className="online-lobby-nc-profile-npub" title={nostrSession.npub}>
                                  {midTruncate(nostrSession.npub, 12, 6)}
                                </span>
                              ) : null}
                            </span>
                            {nostrSession.nip05 ? (
                              <span className="online-lobby-nc-profile-nip05">
                                {nostrSession.nip05.replace(/^_@/, '@')}
                              </span>
                            ) : null}
                            {nostrSession.lud16 ? (
                              <span className="online-lobby-nc-profile-ln" title={`Lightning address: ${nostrSession.lud16}`}>
                                {nostrSession.lud16}
                              </span>
                            ) : (
                              <span className="online-lobby-nc-profile-ln online-lobby-nc-profile-ln--missing">
                                no LN address
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          type="button"
                          className="online-lobby-action online-lobby-nostr-zap-btn"
                          disabled={nostrLinkBusy || !socket}
                          onClick={startNostrLinkFlow}
                        >
                          {nostrLinkBusy
                            ? isNip46Signer
                              ? 'APPROVE IN APP…'
                              : 'SIGNING…'
                            : 'LINK & PAY'}
                        </Button>
                      </div>
                      <button
                        type="button"
                        className="online-lobby-text-btn online-lobby-nostr-switch-btn"
                        onClick={openConfigForNostr}
                      >
                        manage connection in settings
                      </button>
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
                          {seatZapInvoice
                            ? `ZAP INVOICE — ${seatZapInvoice.buyinSats.toLocaleString()} sats`
                            : zapPayBusy && isNip46Signer
                              ? 'APPROVE ZAP IN YOUR NOSTR APP…'
                              : zapPayBusy
                                ? 'SIGNING ZAP REQUEST…'
                                : 'PREPARING INVOICE…'}
                        </p>
                        {pendingNostrAuthUrl && zapPayBusy ? (
                          <div className="online-lobby-nip46-auth-banner" role="status">
                            <p className="online-lobby-nip46-auth-banner__text">
                              Your remote signer needs approval to sign the zap request.
                            </p>
                            <Button
                              type="button"
                              className="online-lobby-action online-lobby-nip46-auth-banner__btn"
                              onClick={openPendingNostrAuth}
                            >
                              Open approval page
                            </Button>
                          </div>
                        ) : null}
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
                  {nostrPayError ? (
                    <p className="online-lobby-nostr-sign-error" role="alert">{nostrPayError}</p>
                  ) : null}
                  {nostrPayError && nostrLinkActive && !zapPayBusy ? (
                    <Button
                      type="button"
                      className="online-lobby-action online-lobby-nostr-retry-btn"
                      onClick={requestSeatZapPrepare}
                    >
                      Retry zap invoice
                    </Button>
                  ) : null}
                </div>
              ) : paymentMode === 'pin-zap' ? (
                isRematchLoserPay ? (
                <div className="online-lobby-kind1-qr-col">
                  <ol className="online-lobby-pin-steps" aria-label="Steps to pay rematch from your app">
                    <li className="online-lobby-pin-step">
                      <span className="online-lobby-pin-step-num" aria-hidden>1</span>
                      <p className="online-lobby-sublabel">OPEN THE REMATCH NOTE</p>
                      <QRCodeSVG value={nostrUri} size={112} includeMargin className="online-lobby-qr online-lobby-qr--step" aria-label="Nostr rematch note URI" />
                      <div className="online-lobby-kind1-uri-line online-lobby-pin-step-uri">
                        <p className="online-lobby-kind1-uri-text" title={nostrUri}>{midTruncate(nostrUri, 18, 8)}</p>
                        <button type="button" className={['online-lobby-kind1-uri-copy-iconbtn', nostrUriCopied ? 'online-lobby-kind1-uri-copy-iconbtn--ok' : ''].filter(Boolean).join(' ')} onClick={() => { void navigator.clipboard.writeText(nostrUri).then(() => { if (nostrUriCopyResetRef.current) clearTimeout(nostrUriCopyResetRef.current); setNostrUriCopied(true); nostrUriCopyResetRef.current = setTimeout(() => { setNostrUriCopied(false); nostrUriCopyResetRef.current = null; }, 2200); }); }} aria-label={nostrUriCopied ? 'Copied' : 'Copy URI'} title={nostrUriCopied ? 'Copied' : 'Copy'}>
                          {nostrUriCopied ? (<svg width={14} height={14} viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>) : (<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>)}
                        </button>
                      </div>
                    </li>
                    <li className="online-lobby-pin-step">
                      <span className="online-lobby-pin-step-num" aria-hidden>2</span>
                      <p className="online-lobby-sublabel">ZAP THE NOTE</p>
                      <p className="online-lobby-pin-step-amount">{Math.floor(lobbyPayAmount).toLocaleString()} <span>sats</span></p>
                      <p className="online-lobby-pin-step-hint">Zap exactly this amount on the rematch note — no PIN needed.</p>
                    </li>
                  </ol>
                </div>
                ) : (
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
                      <p className="online-lobby-pin-step-amount">{Math.floor(lobbyPayAmount).toLocaleString()} <span>sats</span></p>
                      <p className="online-lobby-pin-step-hint">Include your PIN in the zap comment. The server matches it to your seat automatically.</p>
                    </li>
                  </ol>
                </div>
                )
              ) : !hasPaidMySeat && !isRematchLoserPay ? (
                <div className="online-lobby-kind1-qr-col online-lobby-kind1-qr-col--idle">
                  <p className="online-lobby-kind1-idle-cta">
                    {seatsFull
                      ? 'Both seats are taken — you’re watching as a spectator. The match starts when both players mark ready.'
                      : 'Pick how you want to pay above (Lightning, web sign-in, or via your Nostr client), or wait for the game to start to watch as a spectator.'}
                  </p>
                </div>
              ) : isRematchLoserPay && !rematchPayMode ? (
                <div className="online-lobby-kind1-qr-col online-lobby-kind1-qr-col--idle">
                  <p className="online-lobby-kind1-idle-cta">
                    Could not detect your original payment method. Zap exactly{' '}
                    {Math.floor(lobbyPayAmount).toLocaleString()} sats on the rematch note below.
                  </p>
                </div>
              ) : null}

              {showInviteFinder ? (
                <div className="online-lobby-invite-panel">
                  <p className="online-lobby-sublabel">FIND PLAYERS</p>
                  <p className="online-lobby-invite-lede">
                    {paidSeats < 2
                      ? 'You’re in — share this room so someone can take the open seat or watch as a spectator.'
                      : 'Both seats are filled. Share the link if you want spectators before the match starts.'}
                  </p>
                  <div className="online-lobby-invite-actions">
                    <Button
                      type="button"
                      className="online-lobby-action"
                      disabled={!lobbyInviteUrl}
                      onClick={copyLobbyLink}
                    >
                      {inviteCopyFeedback === 'link' ? 'LINK COPIED' : 'COPY ROOM LINK'}
                    </Button>
                    <Button
                      type="button"
                      className="online-lobby-action"
                      disabled={!lobbyInviteText}
                      onClick={copyInviteText}
                    >
                      {inviteCopyFeedback === 'text' ? 'TEXT COPIED' : 'COPY INVITE TEXT'}
                    </Button>
                    {nostrSession.signedIn ? (
                      <Button
                        type="button"
                        className="online-lobby-action online-lobby-invite-post-btn"
                        disabled={invitePostBusy || !lobbyInviteText}
                        onClick={() => void postInviteOnNostr()}
                      >
                        {invitePostBusy ? 'POSTING…' : invitePostOk ? 'POSTED' : 'POST ON NOSTR'}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        className="online-lobby-action"
                        onClick={openConfigForNostr}
                      >
                        SIGN IN TO POST
                      </Button>
                    )}
                  </div>
                  <p className="online-lobby-invite-preview-label">Invite preview</p>
                  <pre className="online-lobby-invite-preview">{lobbyInviteText}</pre>
                  {invitePostError ? (
                    <p className="online-lobby-invite-error" role="alert">{invitePostError}</p>
                  ) : null}
                  {invitePostOk ? (
                    <p className="online-lobby-invite-ok" role="status">Invite note published to your relays.</p>
                  ) : null}
                </div>
              ) : (
              <div className="online-lobby-kind1-content-col">
                {kind1PostStatus === 'loading' && !kind1PostEvent ? (
                  <div className="online-lobby-kind1-loading online-lobby-kind1-loading--inline" aria-label="Loading note from relays" role="status">
                    <span className="online-lobby-kind1-loading-chain" aria-hidden="true">
                      <span /><span /><span /><span /><span /><span /><span /><span />
                    </span>
                    <span className="online-lobby-kind1-loading-label">LOADING NOTE FROM RELAYS</span>
                  </div>
                ) : kind1PostEvent ? (
                <>
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

                {rematchPending && !amILoserToPay ? (
                  <p className="online-lobby-copy online-lobby-kind1-rematch-note">
                    Waiting for opponent to pay exactly {Math.floor(rematchAmount).toLocaleString()} sats.
                  </p>
                ) : null}

                {error && paymentMode !== 'nostr' ? (
                  <p className="online-lobby-inline-pay-error">{error}</p>
                ) : null}
                </>
                ) : null}

              </div>
              )}
            </div>
          ) : kind1PostStatus === 'loading' ? (
            <div className="online-lobby-kind1-loading" aria-label="Loading note from relays" role="status">
              <span className="online-lobby-kind1-loading-label">LOADING NOTE FROM RELAYS</span>
            </div>
          ) : null}
        </div>
      ) : error ? (
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
            onClick={() => navigate(ONLINE_HOME)}
          >
            ← Back to Online
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
              navigate(ONLINE_HOME);
            }}
          >
            LEAVE ROOM
          </Button>
        </div>
      ) : null}

      </div>{/* end .online-lobby-main */}

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay={true} />
    </div>
  );
}
