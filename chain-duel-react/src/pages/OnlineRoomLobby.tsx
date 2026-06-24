import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/Button';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useGamepad } from '@/hooks/useGamepad';
import { useMenuSfx } from '@/hooks/useMenuSfx';
import { useSocket } from '@/hooks/useSocket';
import { reportClientEvent } from '@/lib/telemetry/reportClientEvent';
import { SocketBoundaryParsers } from '@/shared/socket/socketBoundary';
import {
  ONLINE_HOME,
  onlineGameUrl,
  onlinePostGameUrl,
  onlineReplayUrl,
} from '@/shared/constants/onlineRoutes';
import { OnlineRoomState } from '@/types/socket';
import { onlinePingAccent } from '@/game/online/onlinePingAccent';
import {
  signNostrEvent,
  signOnlineSeatLinkChallenge,
} from '@/lib/nostr/signOnlineSeatLink';
import { getNwcUri, nwcPay } from '@/lib/nostr/nwcPay';
import {
  setNip46AuthUrlHandler,
  resolveSignerMode,
  recoverNip46UserPubkey,
} from '@/lib/nostr/signerSession';
import { npubEncode } from 'nostr-tools/nip19';
import { useNostrSession } from '@/contexts/NostrSessionContext';
import { setButtonGlow } from '@/shared/utils/buttonGlow';
import type { WindowTimeout } from '@/shared/utils/timer';
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
import { verifyNip05 } from '@/lib/nostr/fetchKind0Profile';
import { decodeBolt11ExpiresAt } from '@/lib/lightning/decodeBolt11ExpiresAt';
import '@/styles/pages/onlineRoomLobby.css';

const PAYMENT_MODES = ['anon', 'nostr', 'pin-zap'] as const;
const FINISHED_ACTION_COUNT = 3;
const LOBBY_INVOICE_QR_SIZE = 160;
const LOBBY_PIN_STEP_QR_SIZE = 96;

type LobbyNavFocus =
  | { type: 'payment'; index: number }
  | { type: 'ready' }
  | { type: 'leave' }
  | { type: 'finished'; index: number };

type PaymentPanelFocusSlot = 'copy' | 'primary' | 'bottom';

function stepLobbyNavVertical(
  prev: LobbyNavFocus,
  dir: 1 | -1,
  opts: {
    showReadyNav: boolean;
    showSeatPaymentPaths: boolean;
    showLeaveButton: boolean;
    lastPaymentIndex: number;
  }
): LobbyNavFocus | null {
  const stack: LobbyNavFocus[] = [];
  if (opts.showReadyNav) {
    stack.push({ type: 'ready' });
  }
  if (opts.showSeatPaymentPaths) {
    stack.push({
      type: 'payment',
      index: prev.type === 'payment' ? prev.index : opts.lastPaymentIndex,
    });
  }
  if (opts.showLeaveButton) {
    stack.push({ type: 'leave' });
  }
  if (stack.length === 0) {
    return null;
  }

  const curIdx = stack.findIndex((item) => {
    if (prev.type === 'payment') {
      return item.type === 'payment';
    }
    return item.type === prev.type;
  });
  const fromIdx = curIdx === -1 ? 0 : curIdx;
  const nextIdx = fromIdx + dir;
  if (nextIdx < 0 || nextIdx >= stack.length) {
    return null;
  }

  const next = stack[nextIdx];
  if (next.type === 'payment') {
    const index = prev.type === 'payment' ? prev.index : opts.lastPaymentIndex;
    return { type: 'payment', index };
  }
  return next;
}

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
  authorNip05?: string | null;
  authorLud16?: string | null;
};

/** Show first `head` + … + last `tail` chars of a string. */
function midTruncate(s: string, head = 16, tail = 8): string {
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

const LIGHTNING_EXPIRY_TEN_MIN_MS = 10 * 60 * 1000;
const LIGHTNING_EXPIRY_THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const DEFAULT_BOLT11_EXPIRY_MS = 60 * 60 * 1000;

function formatLightningExpiresIn(expiresAt: number, now: number): string {
  const msLeft = Math.max(0, expiresAt - now);
  if (msLeft <= 0) {
    return 'Expired';
  }

  if (msLeft >= LIGHTNING_EXPIRY_THREE_HOURS_MS) {
    const hours = Math.ceil(msLeft / (60 * 60 * 1000));
    return hours === 1 ? 'Expires in 1 hour' : `Expires in ${hours} hours`;
  }

  if (msLeft >= LIGHTNING_EXPIRY_TEN_MIN_MS) {
    const minutes = Math.ceil(msLeft / (60 * 1000));
    return minutes === 1
      ? 'Expires in 1 minute'
      : `Expires in ${minutes} minutes`;
  }

  const seconds = Math.ceil(msLeft / 1000);
  return seconds === 1
    ? 'Expires in 1 second'
    : `Expires in ${seconds} seconds`;
}

function kind1AuthorNpubFull(pubkey: string, npubDisplay: string): string {
  if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
    return npubDisplay;
  }
  try {
    return npubEncode(pubkey);
  } catch {
    return npubDisplay;
  }
}

function formatKind1PostTimestamp(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' });
  const month = d.toLocaleDateString('en-GB', { month: 'short' });
  const day = d.getDate();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${weekday} ${day} ${month} ${hours}:${minutes}`;
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
  const { playSelect, playConfirm } = useMenuSfx();
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
  const nostrUriCopyResetRef = useRef<WindowTimeout | null>(
    null
  );
  const [lightningUriCopied, setLightningUriCopied] = useState(false);
  const lightningUriCopyResetRef = useRef<WindowTimeout | null>(
    null
  );
  const [joinPinCopied, setJoinPinCopied] = useState(false);
  const joinPinCopyResetRef = useRef<WindowTimeout | null>(
    null
  );
  const paymentCardsRef = useRef<HTMLDivElement | null>(null);
  const paymentPanelRef = useRef<HTMLDivElement | null>(null);
  const [kind1PostEvent, setKind1PostEvent] = useState<Kind1PostLoaded | null>(
    null
  );
  const [kind1PostStatus, setKind1PostStatus] = useState<
    'idle' | 'loading' | 'error'
  >('idle');
  const [kind1PostRetry, setKind1PostRetry] = useState(0);
  const [kind1AuthorNip05, setKind1AuthorNip05] = useState<string | null>(null);
  const [kind1AuthorNip05Verified, setKind1AuthorNip05Verified] = useState<
    boolean | null
  >(null);
  const [kind1AuthorLud16, setKind1AuthorLud16] = useState<string | null>(null);
  const [zapPayBusy, setZapPayBusy] = useState(false);
  const [pendingNostrAuthUrl, setPendingNostrAuthUrl] = useState<string | null>(
    null
  );
  const [seatZapInvoice, setSeatZapInvoice] = useState<{
    pr: string;
    lightningUri: string;
    buyinSats: number;
    expiresAt: number;
  } | null>(null);
  const [yourPingMs, setYourPingMs] = useState<number | null>(null);
  const [nostrLinkExpiresAt, setNostrLinkExpiresAt] = useState<number | null>(
    null
  );
  const [nostrLinkedProfile, setNostrLinkedProfile] =
    useState<NostrLinkedProfile | null>(null);
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
  const [paymentMode, setPaymentMode] = useState<
    'anon' | 'nostr' | 'pin-zap' | null
  >(null);
  const [paymentPanelFocusIn, setPaymentPanelFocusIn] = useState(false);
  const paymentPanelFocusInRef = useRef(false);
  paymentPanelFocusInRef.current = paymentPanelFocusIn;
  const [paymentPanelFocusSlot, setPaymentPanelFocusSlot] =
    useState<PaymentPanelFocusSlot>('primary');
  const [inviteCopyFeedback, setInviteCopyFeedback] = useState<
    'link' | 'text' | 'share' | null
  >(null);
  const inviteCopyResetRef = useRef<WindowTimeout | null>(null);
  const [invitePostBusy, setInvitePostBusy] = useState(false);
  const [invitePostError, setInvitePostError] = useState<string | null>(null);
  const [invitePostOk, setInvitePostOk] = useState(false);
  const [lobbyNavFocus, setLobbyNavFocus] = useState<LobbyNavFocus>({
    type: 'leave',
  });
  const lobbyNavFocusRef = useRef<LobbyNavFocus>(lobbyNavFocus);
  lobbyNavFocusRef.current = lobbyNavFocus;
  const leaveBtnRef = useRef<HTMLButtonElement>(null);
  const lobbyGlowPopTargetRef = useRef<HTMLElement | null>(null);
  const lastPaymentNavIndexRef = useRef(0);
  const lobbyNavPrimedKeyRef = useRef('');
  /** Pubkey from last successful kind-1 sign, until server confirms with `resOnlineNostrLinkOk`. */
  const pendingNostrLinkPubkeyRef = useRef<string | null>(null);
  const paymentModeRef = useRef(paymentMode);
  const rematchPendingRef = useRef(false);
  const matchStartRetryRef = useRef(false);
  /** Cached kind1 post — avoids refetch when switching payment paths while note is already loaded. */
  const kind1PostCacheRef = useRef<{
    key: string;
    event: Kind1PostLoaded;
  } | null>(null);
  const zapPayTimeoutRef = useRef<WindowTimeout | null>(null);
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;

  useGamepad(true);

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
    return rematchPending ? rematchNote : (room?.nostrMeta?.note1 ?? '');
  }, [
    room?.postGame?.rematchRequested,
    room?.postGame?.rematchNote1,
    room?.nostrMeta?.note1,
  ]);

  const nostrLinkStorageKey = useMemo(
    () => (roomId ? `onlineLobbyNostrLink_${roomId}` : ''),
    [roomId]
  );

  useEffect(() => {
    const ms = lightningPay || seatZapInvoice ? 1000 : 4000;
    const id = window.setInterval(() => setNowTick(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [lightningPay, seatZapInvoice]);

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
          name:
            typeof parsed.name === 'string'
              ? parsed.name
              : `${parsed.pubkey.slice(0, 12)}…`,
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
        return;
      }
      // Strict validation can drop updates when the wire payload drifts; still
      // apply phase/snapshot so a started match is not missed in the lobby.
      if (!payload || typeof payload !== 'object') {
        return;
      }
      const raw = payload as {
        roomId?: unknown;
        phase?: unknown;
        snapshot?: unknown;
        seats?: unknown;
      };
      if (typeof raw.roomId !== 'string' || raw.roomId !== roomId) {
        return;
      }
      setRoom((prev) => {
        if (!prev) {
          return prev;
        }
        const phase =
          typeof raw.phase === 'string'
            ? (raw.phase as typeof prev.phase)
            : prev.phase;
        const snapshot =
          raw.snapshot && typeof raw.snapshot === 'object'
            ? (raw.snapshot as typeof prev.snapshot)
            : prev.snapshot;
        const seats =
          raw.seats && typeof raw.seats === 'object'
            ? (raw.seats as typeof prev.seats)
            : prev.seats;
        return { ...prev, phase, snapshot, seats };
      });
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
      setPendingNostrAuthUrl(null);
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
        setPendingNostrAuthUrl(null);
      }
    };
    const onSession = (payload: { sessionID: string }) => {
      if (!payload?.sessionID) {
        return;
      }
      const prev = sessionStorage.getItem('sessionID');
      const sessionChanged = Boolean(prev && prev !== payload.sessionID);
      if (sessionChanged) {
        setNostrLinkExpiresAt(null);
        setNostrLinkedProfile(null);
        const storageKey = roomId ? `onlineLobbyNostrLink_${roomId}` : '';
        if (storageKey) {
          sessionStorage.removeItem(storageKey);
        }
      }
      setCurrentSessionID(payload.sessionID);
      sessionStorage.setItem('sessionID', payload.sessionID);
      if (sessionChanged) {
        syncRoomPresence();
      }
    };
    const refreshLocalIdentity = () => {
      setCurrentSessionID(sessionStorage.getItem('sessionID') ?? '');
      setCurrentSocketID(socket.id ?? '');
    };
    const syncRoomPresence = () => {
      refreshLocalIdentity();
      socket.emit('getOnlineRoomState', { roomId });
      socket.emit('joinOnlineRoom', { roomId });
    };

    const onKind1Post = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.resOnlineKind1Post(payload);
      if (!parsed || parsed.roomId !== roomId) {
        return;
      }
      if (parsed.ok) {
        const loaded: Kind1PostLoaded = {
          eventId: parsed.eventId,
          tags: parsed.tags,
          pubpayZap: parsed.pubpayZap,
          content: parsed.content,
          created_at: parsed.created_at,
          pubkey: parsed.pubkey,
          npubDisplay: parsed.npubDisplay,
          authorName: parsed.authorName,
          authorPicture: parsed.authorPicture,
          authorNip05: parsed.authorNip05 ?? null,
          authorLud16: parsed.authorLud16 ?? null,
        };
        kind1PostCacheRef.current = {
          key: `${roomId}:${kind1}`,
          event: loaded,
        };
        setKind1PostEvent(loaded);
        setKind1PostStatus('idle');
      } else {
        kind1PostCacheRef.current = null;
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
    socket.on('connect', syncRoomPresence);
    syncRoomPresence();
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
      socket.off('connect', syncRoomPresence);
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
      const expiresAt =
        decodeBolt11ExpiresAt(parsed.pr) ??
        decodeBolt11ExpiresAt(parsed.lightningUri) ??
        Date.now() + DEFAULT_BOLT11_EXPIRY_MS;
      setSeatZapInvoice({
        pr: parsed.pr,
        lightningUri: parsed.lightningUri,
        buyinSats: parsed.buyinSats,
        expiresAt,
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
      if (
        parsed.reason === 'nostr_not_linked' ||
        parsed.reason === 'no_session'
      ) {
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
    return Object.values(room.seats).filter((seat) => seat.status === 'paid')
      .length;
  }, [room]);

  const bothPlayersReady = useMemo(() => {
    if (!room || paidSeats < 2) return false;
    const s1 = room.seats['Player 1'];
    const s2 = room.seats['Player 2'];
    return (
      s1?.status === 'paid' &&
      s1.ready === true &&
      s2?.status === 'paid' &&
      s2.ready === true
    );
  }, [room, paidSeats]);

  const nostrLinkActive = useMemo(
    () => nostrLinkExpiresAt != null && nostrLinkExpiresAt > nowTick,
    [nostrLinkExpiresAt, nowTick]
  );

  const zapAutoPreparedRef = useRef(false);
  useEffect(() => {
    if (
      paymentMode !== 'nostr' ||
      !nostrLinkActive ||
      seatZapInvoice ||
      zapPayBusy ||
      !nostrSession.signedIn
    ) {
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
  }, [
    paymentMode,
    nostrLinkActive,
    seatZapInvoice,
    zapPayBusy,
    nostrSession.signedIn,
  ]);

  const isNip46Signer = resolveSignerMode() === 'nip46';
  const needsNostrSignerApproval = Boolean(pendingNostrAuthUrl);
  const nostrSignerAvailable = Boolean(
    nostrSession.signerMode ?? resolveSignerMode()
  );
  const showNostrLinkManualPrompt =
    Boolean(nostrPayError) || !nostrSignerAvailable;
  const nostrLinkStatusLabel = !nostrLinkBusy
    ? 'Linking account…'
    : needsNostrSignerApproval
      ? 'Approve in your Nostr app…'
      : isNip46Signer
        ? 'Checking…'
        : 'Signing…';
  const nostrZapStatusLabel = zapPayBusy
    ? needsNostrSignerApproval
      ? 'Approve zap in your Nostr app…'
      : isNip46Signer
        ? 'Checking…'
        : 'Signing zap request…'
    : 'Preparing invoice…';

  paymentModeRef.current = paymentMode;

  const startNostrLinkFlow = useCallback(() => {
    if (!socket || !roomId) {
      return;
    }
    setNostrPayError(null);
    setPendingNostrAuthUrl(null);
    setNostrLinkBusy(true);
    socket.emit('requestOnlineNostrLinkChallenge', { roomId });
  }, [socket, roomId]);

  const nostrLinkAutoStartedRef = useRef(false);
  useEffect(() => {
    if (
      paymentMode !== 'nostr' ||
      !nostrSession.signedIn ||
      nostrLinkActive ||
      seatZapInvoice ||
      nostrLinkBusy ||
      !socket ||
      !roomId ||
      nostrPayError ||
      !nostrSignerAvailable
    ) {
      if (paymentMode !== 'nostr' || !nostrSession.signedIn) {
        nostrLinkAutoStartedRef.current = false;
      }
      return;
    }
    if (nostrLinkAutoStartedRef.current) {
      return;
    }
    nostrLinkAutoStartedRef.current = true;
    startNostrLinkFlow();
  }, [
    paymentMode,
    nostrSession.signedIn,
    nostrLinkActive,
    seatZapInvoice,
    nostrLinkBusy,
    socket,
    roomId,
    nostrPayError,
    nostrSignerAvailable,
    startNostrLinkFlow,
  ]);

  const openConfigForNostr = () => {
    navigate('/config', { state: { returnTo: configReturnTo } });
  };

  const openConfigForNwc = () => {
    navigate('/config', { state: { returnTo: configReturnTo } });
  };

  const nwcSettingsHint = nwcUri ? null : (
    <p className="online-lobby-pin-step-hint">
      <button
        type="button"
        className="online-lobby-text-btn online-lobby-pin-step-hint-link"
        onClick={openConfigForNwc}
      >
        add NWC in Settings
      </button>{' '}
      to pay in one tap from Primal, Alby, etc.
    </p>
  );

  const flashInviteCopy = (which: 'link' | 'text' | 'share') => {
    if (inviteCopyResetRef.current) window.clearTimeout(inviteCopyResetRef.current);
    setInviteCopyFeedback(which);
    inviteCopyResetRef.current = window.setTimeout(() => {
      setInviteCopyFeedback(null);
      inviteCopyResetRef.current = null;
    }, 2200);
  };

  const copyLobbyLink = () => {
    if (!lobbyInviteUrl) return;
    void navigator.clipboard
      .writeText(lobbyInviteUrl)
      .then(() => flashInviteCopy('link'));
  };

  const shareLobbyInvite = async () => {
    if (!lobbyInviteText || !lobbyInviteUrl) return;
    if (typeof navigator.share === 'function') {
      const payloads: ShareData[] = [
        { title: 'Chain Duel', text: lobbyInviteText, url: lobbyInviteUrl },
        { title: 'Chain Duel', text: lobbyInviteText },
      ];
      for (const data of payloads) {
        if (navigator.canShare && !navigator.canShare(data)) continue;
        try {
          await navigator.share(data);
          flashInviteCopy('share');
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return;
        }
      }
    }
    void navigator.clipboard
      .writeText(lobbyInviteText)
      .then(() => flashInviteCopy('text'));
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
      setInvitePostError(
        e instanceof Error ? e.message : 'Could not publish note'
      );
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
  const effectiveSessionID =
    currentSessionID || sessionStorage.getItem('sessionID') || '';
  const mySeat = seatEntries.find((seat) => {
    if (seat.status !== 'paid') {
      return false;
    }
    const matchesSession = Boolean(
      seat.sessionID && seat.sessionID === effectiveSessionID
    );
    const matchesSocket = Boolean(
      seat.socketID && seat.socketID === currentSocketID
    );
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
  const lobbyAbandonRef = useRef({ roomId: '', shouldReport: false });
  useEffect(() => {
    const unpaid = !mySeat || mySeat.status !== 'paid';
    const paidNotReady = mySeat?.status === 'paid' && !myReady;
    lobbyAbandonRef.current = {
      roomId,
      shouldReport: Boolean(
        roomId && !isMatchEnded && !rematchPending && (unpaid || paidNotReady)
      ),
    };
  }, [roomId, mySeat, myReady, isMatchEnded, rematchPending]);
  useEffect(() => {
    return () => {
      const { roomId: rid, shouldReport } = lobbyAbandonRef.current;
      if (!shouldReport || !rid) return;
      reportClientEvent(socket, 'client.funnel.abandon', {
        route: `/online/lobby?roomId=${rid}`,
      });
    };
  }, [socket]);
  rematchPendingRef.current = rematchPending;
  const rematchAmount = room?.postGame?.rematchRequiredAmount ?? 0;
  const rematchWaitingForSessionID = room?.postGame?.rematchWaitingForSessionID;
  const amILoserToPay = Boolean(
    rematchWaitingForSessionID &&
    rematchWaitingForSessionID === currentSessionID
  );
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
      copy:
        room?.phase === 'lobby'
          ? 'Both players are in. Syncing match start — if this lasts more than a few seconds, toggle UNREADY then MARK AS READY again.'
          : 'Both players are in. The game is about to start.',
    };
  })();
  const snapshotP1Name =
    (room?.snapshot?.state as { p1Name?: string } | undefined)?.p1Name ??
    'Player 1';
  const snapshotP2Name =
    (room?.snapshot?.state as { p2Name?: string } | undefined)?.p2Name ??
    'Player 2';
  const nostrUri = kind1 ? `nostr:${kind1}` : '';
  const p1 = room?.seats['Player 1'];
  const p2 = room?.seats['Player 2'];
  const p1AvatarSrc = isMatchEnded
    ? p1?.picture ||
      room?.postGame?.p1Picture ||
      (room?.postGame?.winnerRole === 'Player 1'
        ? room?.postGame?.winnerPicture
        : undefined)
    : p1?.picture;
  const p2AvatarSrc = isMatchEnded
    ? p2?.picture ||
      room?.postGame?.p2Picture ||
      (room?.postGame?.winnerRole === 'Player 2'
        ? room?.postGame?.winnerPicture
        : undefined)
    : p2?.picture;
  const finishedSummary =
    isMatchEnded && !rematchPending
      ? {
          p1Name: snapshotP1Name,
          p2Name: snapshotP2Name,
          p1Score: Math.floor(
            (room?.snapshot?.state as { score?: number[] } | undefined)
              ?.score?.[0] ?? 0
          ),
          p2Score: Math.floor(
            (room?.snapshot?.state as { score?: number[] } | undefined)
              ?.score?.[1] ?? 0
          ),
          winner: room?.postGame?.winnerName ?? 'Winner',
          netPrize: Math.floor((room?.postGame?.winnerPoints ?? 0) * 0.95),
        }
      : null;
  const lobbySeatName = (seat: typeof p1 | undefined, fallback: string) => {
    const trimmed = seat?.name?.trim();
    if (trimmed) return trimmed;
    if (seat?.status === 'paid') {
      if (seat.pubkey) {
        const hex = seat.pubkey
          .replace(/[^a-f0-9]/gi, '')
          .slice(0, 6)
          .toLowerCase();
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
  const p1IsReady =
    !isMatchEnded &&
    !rematchPending &&
    p1?.status === 'paid' &&
    p1.ready === true;
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
  const p2IsReady =
    !isMatchEnded &&
    !rematchPending &&
    p2?.status === 'paid' &&
    p2.ready === true;
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
    !hasPaidMySeat &&
    seatsFull &&
    !isMatchEnded &&
    !rematchPending &&
    !isRematchLoserPay;
  const rematchPayMode = useMemo(
    () =>
      roomId && isRematchLoserPay
        ? resolveLobbyPaymentModeForSeat({
            roomId,
            payMethod: mySeat?.payMethod,
          })
        : null,
    [roomId, isRematchLoserPay, mySeat?.payMethod]
  );
  const lobbyPayAmount = isRematchLoserPay ? rematchAmount : (room?.buyin ?? 0);
  const showSeatPaymentPaths =
    !hasPaidMySeat && !isMatchEnded && !rematchPending && !seatsFull;
  const showLeaveButton = !mySeat && !isMatchEnded && !rematchPending;
  const showReadyNav = Boolean(mySeat && !isMatchEnded && !rematchPending);
  const showFinishedNav = room?.phase === 'finished';

  const leaveRoom = useCallback(() => {
    if (!roomId) {
      return;
    }
    playSelect();
    socket?.emit('leaveOnlineRoom', { roomId });
    navigate(ONLINE_HOME);
  }, [navigate, playSelect, roomId, socket]);

  const resolvePaymentPanelBottomCta = useCallback(
    (panel: HTMLElement | null) => {
      if (!panel) {
        return null;
      }
      const scope =
        panel.querySelector('.online-lobby-kind1-qr-col--panel') ??
        panel
          .querySelector('.online-lobby-pin-steps')
          ?.closest('.online-lobby-kind1-qr-col');
      if (!scope) {
        return null;
      }
      const buttons = scope.querySelectorAll<HTMLButtonElement>(
        'button:not([disabled])'
      );
      for (let i = buttons.length - 1; i >= 0; i--) {
        const btn = buttons[i];
        if (btn.offsetParent !== null) {
          return btn;
        }
      }
      return null;
    },
    []
  );

  const resolvePaymentPanelCopyCta = useCallback(
    (panel: HTMLElement | null) => {
      if (!panel) {
        return null;
      }
      return panel.querySelector<HTMLButtonElement>(
        '.online-lobby-kind1-qr-col--panel .online-lobby-pin-step-uri-copy:not([disabled])'
      );
    },
    []
  );

  const resolvePaymentPanelPrimaryCta = useCallback(
    (panel: HTMLElement | null) => {
      if (!panel) {
        return null;
      }
      const walletBtn = panel.querySelector<HTMLButtonElement>(
        '.online-lobby-wallet-btn:not([disabled])'
      );
      if (walletBtn) {
        return walletBtn;
      }
      return panel.querySelector<HTMLButtonElement>(
        '.online-lobby-kind1-qr-col--panel .online-lobby-nostr-zap-btn:not([disabled])'
      );
    },
    []
  );

  const resolvePaymentPanelCta = useCallback(
    (panel: HTMLElement | null) => {
      if (!panel) {
        return null;
      }
      if (paymentPanelFocusSlot === 'copy') {
        return resolvePaymentPanelCopyCta(panel);
      }
      if (paymentPanelFocusSlot === 'bottom') {
        return resolvePaymentPanelBottomCta(panel);
      }
      return resolvePaymentPanelPrimaryCta(panel);
    },
    [
      paymentPanelFocusSlot,
      resolvePaymentPanelBottomCta,
      resolvePaymentPanelCopyCta,
      resolvePaymentPanelPrimaryCta,
    ]
  );

  const enterPaymentPanel = useCallback(
    (slot: PaymentPanelFocusSlot = 'primary') => {
      setPaymentPanelFocusSlot(slot);
      setPaymentPanelFocusIn(true);
    },
    []
  );

  const paymentPanelHasPrimaryControl = useCallback(() => {
    const panel = paymentPanelRef.current;
    if (!panel) {
      return false;
    }
    if (paymentModeRef.current === 'pin-zap') {
      return Boolean(
        panel.querySelector('.online-lobby-pin-steps button:not([disabled])')
      );
    }
    const col = panel.querySelector('.online-lobby-kind1-qr-col--panel');
    return Boolean(
      col?.querySelector(
        'button:not([disabled]), [href], input:not([disabled])'
      )
    );
  }, []);

  const onQrSplitCopyKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== 'ArrowDown' && e.key !== 's' && e.key !== 'S') {
        return;
      }
      const split = e.currentTarget.closest('.online-lobby-qr-split');
      if (!split) {
        return;
      }
      const walletBtn = split.querySelector<HTMLButtonElement>(
        '.online-lobby-pay-btns button.online-lobby-action:not([disabled])'
      );
      if (!walletBtn) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      enterPaymentPanel('primary');
    },
    [enterPaymentPanel]
  );

  const activatePaymentPanelPrimary = useCallback(() => {
    const panel = paymentPanelRef.current;
    if (!panel) {
      return false;
    }
    const mode = paymentModeRef.current;
    if (mode === 'anon' || mode === 'nostr') {
      const primary = panel.querySelector<HTMLButtonElement>(
        '.online-lobby-kind1-qr-col--panel button.online-lobby-nostr-zap-btn:not([disabled])'
      );
      if (primary) {
        primary.click();
        return true;
      }
    }
    if (mode === 'pin-zap') {
      enterPaymentPanel();
      return true;
    }
    return false;
  }, [enterPaymentPanel]);

  const selectPaymentNav = useCallback((index: number) => {
    playSelect();
    const clamped =
      ((index % PAYMENT_MODES.length) + PAYMENT_MODES.length) %
      PAYMENT_MODES.length;
    lastPaymentNavIndexRef.current = clamped;
    setLobbyNavFocus({ type: 'payment', index: clamped });
    setPaymentMode(PAYMENT_MODES[clamped]);
  }, [playSelect]);

  const triggerFinishedAction = useCallback(
    (index: number) => {
      if (!roomId) {
        return;
      }
      playConfirm();
      if (index === 0) {
        navigate(onlinePostGameUrl(roomId));
      } else if (index === 1) {
        navigate(onlineReplayUrl(roomId, room?.matchRound ?? 1));
      } else {
        leaveRoom();
      }
    },
    [leaveRoom, navigate, playConfirm, room?.matchRound, roomId]
  );

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

  // Default keyboard focus: Leave room; pre-highlight Sign in when Nostr session exists
  useEffect(() => {
    if (!roomId || !showLeaveButton || !showSeatPaymentPaths) {
      return;
    }

    const primeKey = `${roomId}:${nostrSession.signedIn ? 'in' : 'out'}`;
    if (lobbyNavPrimedKeyRef.current === primeKey) {
      return;
    }

    const isFirstForRoom = !lobbyNavPrimedKeyRef.current.startsWith(
      `${roomId}:`
    );
    lobbyNavPrimedKeyRef.current = primeKey;

    if (isFirstForRoom && !nostrSession.signedIn) {
      setLobbyNavFocus({ type: 'leave' });
      lastPaymentNavIndexRef.current = 0;
      setPaymentMode(null);
    }

    if (nostrSession.signedIn) {
      const nostrIndex = PAYMENT_MODES.indexOf('nostr');
      lastPaymentNavIndexRef.current = nostrIndex;
      setLobbyNavFocus({ type: 'payment', index: nostrIndex });
      setPaymentMode('nostr');
    }
  }, [roomId, showLeaveButton, showSeatPaymentPaths, nostrSession.signedIn]);

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
    startNostrLinkFlow,
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
        const idx = paymentMode ? PAYMENT_MODES.indexOf(paymentMode) : 0;
        setLobbyNavFocus({ type: 'payment', index: idx >= 0 ? idx : 0 });
        const cards =
          paymentCardsRef.current?.querySelectorAll<HTMLButtonElement>(
            '.online-lobby-path-card'
          );
        cards?.[idx >= 0 ? idx : 0]?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paymentMode, isRematchLoserPay]);

  // Keep focus target valid when lobby sections appear/disappear
  useEffect(() => {
    setLobbyNavFocus((prev) => {
      if (prev.type === 'payment' && showSeatPaymentPaths) {
        return prev;
      }
      if (prev.type === 'leave' && showLeaveButton) {
        return prev;
      }
      if (prev.type === 'ready' && showReadyNav) {
        return prev;
      }
      if (prev.type === 'finished' && showFinishedNav) {
        if (prev.index < FINISHED_ACTION_COUNT) {
          return prev;
        }
        return { type: 'finished', index: FINISHED_ACTION_COUNT - 1 };
      }
      if (showLeaveButton) {
        return { type: 'leave' };
      }
      if (showSeatPaymentPaths) {
        return {
          type: 'payment',
          index:
            prev.type === 'payment'
              ? prev.index
              : lastPaymentNavIndexRef.current,
        };
      }
      if (showReadyNav) {
        return { type: 'ready' };
      }
      if (showFinishedNav) {
        return { type: 'finished', index: 0 };
      }
      return prev;
    });
  }, [showFinishedNav, showLeaveButton, showReadyNav, showSeatPaymentPaths]);

  useEffect(() => {
    if (paymentMode === null) {
      setPaymentPanelFocusIn(false);
      setPaymentPanelFocusSlot('primary');
    }
  }, [paymentMode]);

  // Sync lobbyNavFocus when paymentMode changes via mouse click
  useEffect(() => {
    if (paymentMode === null) {
      return;
    }
    const idx = PAYMENT_MODES.indexOf(paymentMode);
    if (idx === -1) {
      return;
    }
    lastPaymentNavIndexRef.current = idx;
    setLobbyNavFocus({ type: 'payment', index: idx });
  }, [paymentMode]);

  // Keyboard / gamepad nav for payment cards, ready, leave, and finished actions
  useEffect(() => {
    if (isRematchLoserPay) {
      return;
    }

    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        return;
      }

      const key = e.key;
      const isEnter = key === 'Enter' || key === ' ';
      const isUp = key === 'ArrowUp' || key === 'w' || key === 'W';
      const isDown = key === 'ArrowDown' || key === 's' || key === 'S';
      const isLeft = key === 'ArrowLeft' || key === 'a' || key === 'A';
      const isRight = key === 'ArrowRight' || key === 'd' || key === 'D';
      if (!isEnter && !isUp && !isDown && !isLeft && !isRight) {
        return;
      }

      if (isLeft || isRight) {
        if (
          showFinishedNav &&
          (lobbyNavFocus.type === 'finished' || !showSeatPaymentPaths)
        ) {
          e.preventDefault();
          playSelect();
          setLobbyNavFocus((prev) => {
            const cur = prev.type === 'finished' ? prev.index : 0;
            const dir = isRight ? 1 : -1;
            const next =
              (cur + dir + FINISHED_ACTION_COUNT) % FINISHED_ACTION_COUNT;
            return { type: 'finished', index: next };
          });
          return;
        }
        if (!showSeatPaymentPaths || lobbyNavFocus.type !== 'payment') {
          return;
        }
        e.preventDefault();
        const dir = isRight ? 1 : -1;
        const next =
          (lobbyNavFocus.index + dir + PAYMENT_MODES.length) %
          PAYMENT_MODES.length;
        selectPaymentNav(next);
        return;
      }

      if (isUp || isDown) {
        if (showFinishedNav) {
          e.preventDefault();
          const dir = isDown ? 1 : -1;
          playSelect();
          setLobbyNavFocus((prev) => {
            const cur = prev.type === 'finished' ? prev.index : 0;
            const next = cur + dir;
            if (next < 0 || next >= FINISHED_ACTION_COUNT) {
              return prev.type === 'finished'
                ? prev
                : { type: 'finished', index: 0 };
            }
            return { type: 'finished', index: next };
          });
          return;
        }

        e.preventDefault();
        const dir = isDown ? 1 : -1;
        const prev = lobbyNavFocusRef.current;
        const focusInPaymentPanel = paymentPanelFocusInRef.current;

        if (
          focusInPaymentPanel &&
          prev.type === 'payment' &&
          paymentMode !== null
        ) {
          const panel = paymentPanelRef.current;
          const copy = resolvePaymentPanelCopyCta(panel);
          const primary = resolvePaymentPanelPrimaryCta(panel);
          const bottom = resolvePaymentPanelBottomCta(panel);
          const hasBottomStep = Boolean(bottom && bottom !== primary);

          if (isUp && paymentPanelFocusSlot === 'bottom' && hasBottomStep) {
            playSelect();
            setPaymentPanelFocusSlot('primary');
            return;
          }

          if (isUp && paymentPanelFocusSlot === 'primary' && copy) {
            playSelect();
            setPaymentPanelFocusSlot('copy');
            return;
          }

          if (isUp) {
            playSelect();
            setPaymentPanelFocusIn(false);
            setPaymentPanelFocusSlot('primary');
            setLobbyNavFocus({
              type: 'payment',
              index: lastPaymentNavIndexRef.current,
            });
            const cards =
              paymentCardsRef.current?.querySelectorAll<HTMLButtonElement>(
                '.online-lobby-path-card'
              );
            cards?.[lastPaymentNavIndexRef.current]?.focus({
              preventScroll: true,
            });
            return;
          }

          if (isDown && paymentPanelFocusSlot === 'copy' && primary) {
            playSelect();
            setPaymentPanelFocusSlot('primary');
            return;
          }

          if (isDown && paymentPanelFocusSlot === 'primary' && hasBottomStep) {
            playSelect();
            setPaymentPanelFocusSlot('bottom');
            return;
          }

          if (isDown) {
            playSelect();
            lastPaymentNavIndexRef.current = prev.index;
            setPaymentPanelFocusIn(false);
            setPaymentPanelFocusSlot('primary');
            setLobbyNavFocus({ type: 'leave' });
            return;
          }
        }

        if (
          isUp &&
          prev.type === 'leave' &&
          paymentMode !== null &&
          paymentPanelHasPrimaryControl()
        ) {
          playSelect();
          setLobbyNavFocus({
            type: 'payment',
            index: lastPaymentNavIndexRef.current,
          });
          enterPaymentPanel('bottom');
          return;
        }

        if (
          isDown &&
          prev.type === 'payment' &&
          paymentMode !== null &&
          !focusInPaymentPanel
        ) {
          if (paymentMode === 'pin-zap') {
            playSelect();
            lastPaymentNavIndexRef.current = prev.index;
            setLobbyNavFocus({ type: 'leave' });
            return;
          }
          if (paymentPanelHasPrimaryControl()) {
            playSelect();
            enterPaymentPanel();
            return;
          }
        }

        const next = stepLobbyNavVertical(prev, dir, {
          showReadyNav,
          showSeatPaymentPaths,
          showLeaveButton,
          lastPaymentIndex: lastPaymentNavIndexRef.current,
        });
        if (!next) {
          return;
        }

        if (prev.type === 'payment' && next.type !== 'payment') {
          lastPaymentNavIndexRef.current = prev.index;
        }

        if (next.type === 'payment' && prev.type !== 'payment') {
          selectPaymentNav(lastPaymentNavIndexRef.current);
          return;
        }

        playSelect();
        setLobbyNavFocus(next);
        return;
      }

      if (!isEnter) {
        return;
      }

      e.preventDefault();

      if (lobbyNavFocus.type === 'ready') {
        playConfirm();
        socket?.emit('onlineSetReady', { roomId, ready: !myReady });
        return;
      }
      if (lobbyNavFocus.type === 'leave') {
        leaveRoom();
        return;
      }
      if (lobbyNavFocus.type === 'finished') {
        triggerFinishedAction(lobbyNavFocus.index);
        return;
      }
      if (lobbyNavFocus.type === 'payment' && showSeatPaymentPaths) {
        const mode = PAYMENT_MODES[lobbyNavFocus.index];

        if (paymentPanelFocusInRef.current) {
          playConfirm();
          const panelCta = resolvePaymentPanelCta(paymentPanelRef.current);
          if (panelCta) {
            panelCta.click();
          } else {
            activatePaymentPanelPrimary();
          }
          return;
        }

        if (paymentMode !== mode) {
          selectPaymentNav(lobbyNavFocus.index);
          return;
        }

        if (!activatePaymentPanelPrimary()) {
          playConfirm();
          enterPaymentPanel();
        }
        return;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    isRematchLoserPay,
    leaveRoom,
    lobbyNavFocus,
    myReady,
    roomId,
    showFinishedNav,
    showLeaveButton,
    showReadyNav,
    showSeatPaymentPaths,
    socket,
    selectPaymentNav,
    activatePaymentPanelPrimary,
    enterPaymentPanel,
    paymentPanelHasPrimaryControl,
    paymentMode,
    paymentPanelFocusSlot,
    playConfirm,
    playSelect,
    resolvePaymentPanelBottomCta,
    resolvePaymentPanelCopyCta,
    resolvePaymentPanelPrimaryCta,
    resolvePaymentPanelCta,
    triggerFinishedAction,
  ]);

  const syncLobbyPrimaryButtonGlow = useCallback(() => {
    const panel = paymentPanelRef.current;
    const nav = lobbyNavFocusRef.current;
    const mode = paymentModeRef.current;

    setButtonGlow(leaveBtnRef.current, false);
    panel
      ?.querySelectorAll<HTMLButtonElement>(
        '.button.online-lobby-action, .online-lobby-kind1-qr-col--panel button, .online-lobby-pin-steps button'
      )
      .forEach((btn) => {
        setButtonGlow(btn, false);
      });
    document
      .querySelectorAll<HTMLButtonElement>(
        '.online-lobby-action-buttons .button.online-lobby-action'
      )
      .forEach((btn) => setButtonGlow(btn, false));
    document
      .querySelectorAll<HTMLButtonElement>('.online-lobby-seat-ready-btn')
      .forEach((btn) => {
        setButtonGlow(btn, false);
      });

    if (nav.type === 'leave') {
      setButtonGlow(leaveBtnRef.current, true);
      return;
    }

    if (nav.type === 'ready') {
      setButtonGlow(
        document.querySelector<HTMLButtonElement>(
          '.online-lobby-seat-ready-btn'
        ),
        true
      );
      return;
    }

    if (nav.type === 'finished') {
      const finishedBtns = document.querySelectorAll<HTMLButtonElement>(
        '.online-lobby-action-buttons .button.online-lobby-action'
      );
      setButtonGlow(finishedBtns[nav.index] ?? null, true);
      return;
    }

    if (
      nav.type === 'payment' &&
      mode !== null &&
      PAYMENT_MODES[nav.index] === mode &&
      paymentPanelFocusInRef.current
    ) {
      setButtonGlow(resolvePaymentPanelCta(panel), true);
    }
  }, [resolvePaymentPanelCta]);

  // Homepage-style glowing focus on leave + in-panel payment CTAs
  useEffect(() => {
    syncLobbyPrimaryButtonGlow();
  }, [
    lobbyNavFocus,
    paymentMode,
    paymentPanelFocusIn,
    paymentPanelFocusSlot,
    syncLobbyPrimaryButtonGlow,
  ]);

  const triggerLobbyBtnPop = useCallback((wrap: HTMLElement | null) => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !wrap || wrap === lobbyGlowPopTargetRef.current) {
      return;
    }
    lobbyGlowPopTargetRef.current = wrap;
    wrap.classList.remove('online-lobby-btn-pop-wrap--pop');
    void wrap.offsetWidth;
    wrap.classList.add('online-lobby-btn-pop-wrap--pop');
    const onEnd = () => {
      wrap.classList.remove('online-lobby-btn-pop-wrap--pop');
      wrap.removeEventListener('animationend', onEnd);
    };
    wrap.addEventListener('animationend', onEnd);
  }, []);

  // Pop animation when keyboard focus moves between primary lobby CTAs
  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      return;
    }

    const runPop = () => {
      let wrap: HTMLElement | null = null;
      if (lobbyNavFocusRef.current.type === 'leave') {
        wrap =
          leaveBtnRef.current?.closest('.online-lobby-btn-pop-wrap') ?? null;
      } else if (lobbyNavFocusRef.current.type === 'ready') {
        wrap =
          document
            .querySelector<HTMLButtonElement>('.online-lobby-seat-ready-btn')
            ?.closest('.online-lobby-btn-pop-wrap') ?? null;
      } else if (lobbyNavFocusRef.current.type === 'finished') {
        const finishedBtns = document.querySelectorAll<HTMLElement>(
          '.online-lobby-action-buttons .button.online-lobby-action'
        );
        const nav = lobbyNavFocusRef.current;
        wrap =
          finishedBtns[nav.index]?.closest('.online-lobby-btn-pop-wrap') ??
          null;
      } else if (
        lobbyNavFocusRef.current.type === 'payment' &&
        paymentModeRef.current &&
        paymentPanelFocusInRef.current
      ) {
        wrap =
          resolvePaymentPanelCta(paymentPanelRef.current)?.closest(
            '.online-lobby-btn-pop-wrap'
          ) ?? null;
      }
      triggerLobbyBtnPop(wrap);
    };

    runPop();
    let delayedPop: WindowTimeout | undefined;
    if (lobbyNavFocus.type === 'payment' && paymentMode) {
      delayedPop = window.setTimeout(runPop, 60);
    }
    return () => {
      if (delayedPop) {
        clearTimeout(delayedPop);
      }
    };
  }, [
    lobbyNavFocus,
    paymentMode,
    paymentPanelFocusIn,
    paymentPanelFocusSlot,
    lightningPay,
    seatZapInvoice,
    lightningBusy,
    nostrLinkBusy,
    resolvePaymentPanelCta,
    triggerLobbyBtnPop,
  ]);

  // Focus path cards on the payment-method row (panel CTAs only after explicit ↓ / Enter)
  useEffect(() => {
    if (lobbyNavFocus.type === 'payment' && !paymentPanelFocusIn) {
      lastPaymentNavIndexRef.current = lobbyNavFocus.index;
      const cards =
        paymentCardsRef.current?.querySelectorAll<HTMLButtonElement>(
          '.online-lobby-path-card'
        );
      cards?.[lobbyNavFocus.index]?.focus({ preventScroll: true });
    }
  }, [lobbyNavFocus, paymentPanelFocusIn]);

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
    const phase = room?.phase ?? room?.snapshot?.phase;
    if (!roomId || phase !== 'playing') {
      return;
    }
    navigate(onlineGameUrl(roomId));
  }, [navigate, room?.phase, room?.snapshot?.phase, roomId]);

  useEffect(() => {
    if (!socket || !roomId || !room || room.phase !== 'lobby') {
      matchStartRetryRef.current = false;
      return;
    }
    if (!bothPlayersReady || !mySeat) {
      matchStartRetryRef.current = false;
      return;
    }
    if (matchStartRetryRef.current) {
      return;
    }
    const t = window.setTimeout(() => {
      if (matchStartRetryRef.current) {
        return;
      }
      matchStartRetryRef.current = true;
      socket.emit('getOnlineRoomState', { roomId });
      socket.emit('joinOnlineRoom', { roomId });
      socket.emit('startOnlineGame', { roomId });
    }, 2500);
    return () => window.clearTimeout(t);
  }, [socket, roomId, room, bothPlayersReady, mySeat, room?.phase]);

  const retryKind1PostLoad = () => {
    kind1PostCacheRef.current = null;
    setKind1PostRetry((n) => n + 1);
  };

  useEffect(() => {
    if (!kind1 || !socket || !roomId) {
      return;
    }
    const fetchKey = `${roomId}:${kind1}`;
    const cached = kind1PostCacheRef.current;
    if (cached?.key === fetchKey) {
      setKind1PostEvent(cached.event);
      setKind1PostStatus('idle');
      return;
    }
    setKind1PostStatus('loading');
    setKind1PostEvent(null);
    socket.emit('requestOnlineKind1Post', { roomId });
  }, [kind1, kind1PostRetry, socket, roomId]);

  useEffect(() => {
    const nip05 = kind1PostEvent?.authorNip05?.trim() || null;
    setKind1AuthorNip05(nip05);
    setKind1AuthorLud16(kind1PostEvent?.authorLud16?.trim() || null);
    if (!nip05 || !kind1PostEvent?.pubkey) {
      setKind1AuthorNip05Verified(null);
      return;
    }

    let cancelled = false;
    setKind1AuthorNip05Verified(null);

    void (async () => {
      const verified = await verifyNip05(kind1PostEvent.pubkey, nip05);
      if (!cancelled) {
        setKind1AuthorNip05Verified(verified);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kind1PostEvent?.pubkey, kind1PostEvent?.authorNip05, kind1PostEvent?.authorLud16]);

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
              <div
                className={`online-lobby-phase online-lobby-phase-${room.phase}`}
              >
                {phaseLabel}
              </div>
            ) : null}
          </div>
          <div className="online-lobby-header-meta">
            {room ? (
              <>
                <span className="online-lobby-header-code-label">
                  Room code
                </span>
                <span className="online-lobby-header-code-group">
                  <span
                    className="online-lobby-header-code"
                    title="Use this code to join or verify the Nostr note"
                  >
                    {room.roomCode}
                  </span>
                  <button
                    type="button"
                    className={[
                      'online-lobby-header-copy-emoji',
                      inviteCopyFeedback === 'link'
                        ? 'online-lobby-header-copy-emoji--ok'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={!lobbyInviteUrl}
                    onClick={copyLobbyLink}
                    aria-label={
                      inviteCopyFeedback === 'link'
                        ? 'Room link copied'
                        : 'Copy room link'
                    }
                    title={
                      inviteCopyFeedback === 'link'
                        ? 'Copied'
                        : lobbyInviteUrl || 'Copy room link'
                    }
                  >
                    {inviteCopyFeedback === 'link' ? '✓' : '🔗'}
                  </button>
                </span>
                <span className="online-lobby-header-sep">·</span>
                <span className="online-lobby-header-buyin">
                  {room.buyin.toLocaleString()} sats buy-in
                </span>
                <span className="online-lobby-header-sep">·</span>
                <span className="online-lobby-header-seats">
                  {paidSeats}/2 paid
                </span>
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
              amILoserToPay
                ? 'online-lobby-don-banner--pay'
                : 'online-lobby-don-banner--wait',
            ].join(' ')}
          >
            <div className="online-lobby-don-banner-body">
              <p className="online-lobby-don-banner-label">
                {amILoserToPay
                  ? 'DOUBLE OR NOTHING — YOUR TURN'
                  : 'DOUBLE OR NOTHING — WAITING'}
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
              <p
                className="online-lobby-don-banner-waiting-dot"
                aria-label="Waiting"
              />
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
              seatHighlightLobby && isMyP1Seat && p1?.ready === true
                ? 'online-lobby-arena-seat--ready'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="online-lobby-arena-seat-header">
              {isMyP1Seat && !isMatchEnded && !rematchPending ? (
                <button
                  type="button"
                  className={`online-lobby-seat-ready-btn${myReady ? ' online-lobby-seat-ready-btn--active' : ''}`}
                  onClick={() =>
                    socket?.emit('onlineSetReady', { roomId, ready: !myReady })
                  }
                >
                  {myReady ? 'UNREADY' : 'MARK AS READY'}
                </button>
              ) : null}
              <span className="online-lobby-label">
                PLAYER 1
                {isMyP1Seat ? (
                  <span className="online-lobby-you-tag">YOU</span>
                ) : null}
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
                <div
                  className="online-lobby-arena-avatar online-lobby-arena-avatar--empty"
                  aria-hidden="true"
                />
              )}
              <p className="online-lobby-arena-seat-name">{p1NameDisplay}</p>
            </div>
            <p className="online-lobby-arena-seat-meta">
              {p1IsReady ? (
                <>
                  Paid ·{' '}
                  <span className="online-lobby-arena-seat-meta--ready">
                    Ready
                  </span>
                </>
              ) : (
                p1MetaDisplay
              )}
            </p>
          </div>

          {/* Center pillar */}
          <div className="online-lobby-arena-center">
            <span className="online-lobby-arena-vs" aria-hidden="true">
              VS
            </span>
            <span className="online-lobby-arena-state">{arenaCenterText}</span>
            {(room?.spectators.length ?? 0) > 0 ? (
              <span className="online-lobby-arena-spectators">
                {room?.spectators.length} watching
              </span>
            ) : null}
          </div>

          {/* P2 Seat */}
          <div
            className={[
              'online-lobby-arena-seat',
              'online-lobby-arena-seat--p2',
              isMyP2Seat ? 'online-lobby-arena-seat--mine' : '',
              seatHighlightLobby && isMyP2Seat && p2?.ready === true
                ? 'online-lobby-arena-seat--ready'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="online-lobby-arena-seat-header">
              <span className="online-lobby-label">
                PLAYER 2
                {isMyP2Seat ? (
                  <span className="online-lobby-you-tag">YOU</span>
                ) : null}
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
                  onClick={() =>
                    socket?.emit('onlineSetReady', { roomId, ready: !myReady })
                  }
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
                <div
                  className="online-lobby-arena-avatar online-lobby-arena-avatar--empty"
                  aria-hidden="true"
                />
              )}
              <p className="online-lobby-arena-seat-name">{p2NameDisplay}</p>
            </div>
            <p className="online-lobby-arena-seat-meta">
              {p2IsReady ? (
                <>
                  Paid ·{' '}
                  <span className="online-lobby-arena-seat-meta--ready">
                    Ready
                  </span>
                </>
              ) : (
                p2MetaDisplay
              )}
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
                {finishedSummary.p1Name} {finishedSummary.p1Score} –{' '}
                {finishedSummary.p2Score} {finishedSummary.p2Name}
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
            <p
              className="online-lobby-invite-error online-lobby-rematch-pay-error"
              role="alert"
            >
              {nostrPayError || error}
            </p>
          ) : null}

          {/* Spectator — room full, or registration closed after match */}
          {isSpectatingFullRoom ? (
            <div className="online-lobby-pin-card">
              <p className="online-lobby-label">SPECTATING</p>
              <p className="online-lobby-pin">ROOM FULL</p>
              <p className="online-lobby-copy">
                Both seats are taken. Watch here — the match starts when both
                players mark ready.
              </p>
            </div>
          ) : null}

          {!hasPaidMySeat &&
          !isRematchLoserPay &&
          (isMatchEnded || rematchPending) ? (
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
                  <p className="online-lobby-copy">
                    No open seats while rematch payment is pending.
                  </p>
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
                  onClick={leaveRoom}
                >
                  EXIT ROOM
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {/* ── Zone 4: Pay zone — payment paths + zap UI + room note ── */}
        {kind1 ? (
          <div className="online-lobby-pay-zone" ref={paymentPanelRef}>
            {kind1PostStatus === 'loading' && !paymentMode ? (
              <div
                className="online-lobby-kind1-loading"
                aria-label="Loading note from relays"
                role="status"
              >
                <span
                  className="online-lobby-kind1-loading-chain"
                  aria-hidden="true"
                >
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
                <span className="online-lobby-kind1-loading-label">
                  LOADING NOTE FROM RELAYS
                </span>
              </div>
            ) : kind1PostStatus === 'error' &&
              !kind1PostEvent &&
              !paymentMode ? (
              <div className="online-lobby-kind1-post-error">
                <svg
                  className="online-lobby-kind1-post-error-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="0.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <p className="online-lobby-kind1-post-error-msg">
                  Couldn't load this note from relays.
                </p>
                <p className="online-lobby-kind1-post-error-hint">
                  Check your connection or try again.
                </p>
                <Button
                  type="button"
                  className="online-lobby-action"
                  onClick={retryKind1PostLoad}
                >
                  Try again
                </Button>
              </div>
            ) : kind1PostEvent || paymentMode ? (
              <div
                className={[
                  'online-lobby-pay-zone-inner',
                  showInviteFinder ? 'online-lobby-pay-zone-inner--invite' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="online-lobby-pay-zone-main">
                  {showSeatPaymentPaths ? (
                    <div
                      className="online-lobby-payment-paths"
                      role="radiogroup"
                      aria-label="Choose a payment method"
                      ref={paymentCardsRef}
                    >
                      <button
                        type="button"
                        className={[
                          'online-lobby-path-card',
                          paymentMode === 'anon'
                            ? 'online-lobby-path-card--active'
                            : '',
                          lobbyNavFocus.type === 'payment' &&
                          lobbyNavFocus.index === 0
                            ? 'online-lobby-nav-selected'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() =>
                          setPaymentMode(paymentMode === 'anon' ? null : 'anon')
                        }
                        role="radio"
                        aria-checked={paymentMode === 'anon'}
                        data-mode="anon"
                        tabIndex={
                          lobbyNavFocus.type === 'payment' &&
                          lobbyNavFocus.index === 0
                            ? 0
                            : -1
                        }
                      >
                        <svg
                          className="online-lobby-path-card-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12L13 2Z" />
                        </svg>
                        <span className="online-lobby-path-card-title">
                          LIGHTNING ONLY
                        </span>
                        <span className="online-lobby-path-card-desc">
                          No sign-in
                        </span>
                      </button>
                      <button
                        type="button"
                        className={[
                          'online-lobby-path-card',
                          paymentMode === 'nostr'
                            ? 'online-lobby-path-card--active'
                            : '',
                          lobbyNavFocus.type === 'payment' &&
                          lobbyNavFocus.index === 1
                            ? 'online-lobby-nav-selected'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => {
                          if (paymentMode === 'nostr') {
                            setPaymentMode(null);
                            return;
                          }
                          setPaymentMode('nostr');
                        }}
                        role="radio"
                        aria-checked={paymentMode === 'nostr'}
                        data-mode="nostr"
                        tabIndex={
                          lobbyNavFocus.type === 'payment' &&
                          lobbyNavFocus.index === 1
                            ? 0
                            : -1
                        }
                      >
                        <svg
                          className="online-lobby-path-card-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <circle cx="8" cy="7" r="3.5" />
                          <path d="M2 21c0-4 2.7-6 6-6h.5" />
                          <path d="M17 11l-3 5h4l-3 5" />
                        </svg>
                        <span className="online-lobby-path-card-title">
                          NOSTR SIGN IN
                        </span>
                        <span className="online-lobby-path-card-desc">
                          Sign in · zap here
                        </span>
                      </button>
                      <button
                        type="button"
                        className={[
                          'online-lobby-path-card',
                          paymentMode === 'pin-zap'
                            ? 'online-lobby-path-card--active'
                            : '',
                          lobbyNavFocus.type === 'payment' &&
                          lobbyNavFocus.index === 2
                            ? 'online-lobby-nav-selected'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() =>
                          setPaymentMode(
                            paymentMode === 'pin-zap' ? null : 'pin-zap'
                          )
                        }
                        role="radio"
                        aria-checked={paymentMode === 'pin-zap'}
                        data-mode="pin-zap"
                        tabIndex={
                          lobbyNavFocus.type === 'payment' &&
                          lobbyNavFocus.index === 2
                            ? 0
                            : -1
                        }
                      >
                        <svg
                          className="online-lobby-path-card-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <rect x="5" y="2" width="14" height="20" rx="2" />
                          <path d="M12 18h.01" />
                        </svg>
                        <span className="online-lobby-path-card-title">
                          ZAP FROM YOUR APP
                        </span>
                        <span className="online-lobby-path-card-desc">
                          Open room note · PIN in comment
                        </span>
                      </button>
                    </div>
                  ) : null}
                  <div className="online-lobby-kind1-section online-lobby-kind1-section--nested">
                    <div
                      className={[
                        'online-lobby-kind1-embedded',
                        showInviteFinder
                          ? 'online-lobby-kind1-embedded--invite'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {/* ── Payment UI (status lives in the banner above) ── */}
                      {paymentMode === 'anon' ? (
                        /* Anonymous Lightning invoice */
                        <div className="online-lobby-kind1-qr-col online-lobby-kind1-qr-col--panel">
                          {!lightningPay ? (
                            <div className="online-lobby-qr-split online-lobby-qr-split--3col">
                              <div className="online-lobby-qr-split-block-col online-lobby-qr-split-block-col--meta">
                                <div className="online-lobby-anon-desc">
                                  <p className="online-lobby-sublabel">
                                    {isRematchLoserPay
                                      ? 'LIGHTNING · REMATCH'
                                      : 'LIGHTNING SEAT'}
                                  </p>
                                  <p className="online-lobby-kind1-qr-hint">
                                    {isRematchLoserPay
                                      ? 'Get an invoice for the rematch amount, then scan, open in another wallet, or pay with NWC.'
                                      : 'Get an invoice, then scan, open in another wallet app, or pay with NWC from Settings.'}
                                  </p>
                                </div>
                              </div>
                              <div
                                className="online-lobby-qr-split-block-col online-lobby-qr-split-block-col--uri online-lobby-qr-split-block-col--spacer"
                                aria-hidden="true"
                              />
                              <div className="online-lobby-qr-split-block-col online-lobby-qr-split-block-col--qr">
                                <div className="online-lobby-btn-pop-wrap">
                                  <Button
                                    type="button"
                                    className="online-lobby-action online-lobby-nostr-zap-btn"
                                    disabled={lightningBusy && !lightningPay}
                                    onClick={payAnonymouslyFromPost}
                                  >
                                    {lightningBusy && !lightningPay
                                      ? 'PREPARING…'
                                      : 'GET INVOICE'}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="online-lobby-qr-split online-lobby-qr-split--3col">
                              <div className="online-lobby-qr-split-block-col online-lobby-qr-split-block-col--meta">
                                <p className="online-lobby-sublabel online-lobby-qr-split-zap-label">
                                  Zapping as
                                </p>
                                <div className="online-lobby-nostr-linked-pill">
                                  <div className="online-lobby-nostr-linked-row">
                                    <div
                                      className="online-lobby-nostr-linked-avatar online-lobby-nostr-linked-avatar--anon"
                                      aria-hidden
                                    >
                                      <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.6"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12L13 2Z" />
                                      </svg>
                                    </div>
                                    <div className="online-lobby-nostr-linked-identity">
                                      <span className="online-lobby-nostr-linked-name">
                                        Anonymous
                                      </span>
                                      <span className="online-lobby-nostr-linked-npub">
                                        No sign-in
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="online-lobby-qr-split-block-col online-lobby-qr-split-block-col--uri">
                                <p className="online-lobby-sublabel online-lobby-qr-split-zap-label">
                                  {isRematchLoserPay
                                    ? 'LIGHTNING · REMATCH'
                                    : 'LIGHTNING SEAT'}
                                </p>
                                <p className="online-lobby-anon-amount">
                                  {lightningPay.buyin.toLocaleString()}{' '}
                                  <span>sats</span>
                                </p>
                                <p className="online-lobby-pin-step-hint online-lobby-qr-split-expiry">
                                  {formatLightningExpiresIn(
                                    lightningPay.expiresAt,
                                    nowTick
                                  )}
                                </p>
                                <div className="online-lobby-pin-step-uri-stack">
                                  <p
                                    className="online-lobby-kind1-uri-text"
                                    title={lightningPay.lightningUri}
                                  >
                                    {midTruncate(
                                      lightningPay.lightningUri,
                                      18,
                                      10
                                    )}
                                  </p>
                                  <button
                                    type="button"
                                    className="online-lobby-text-btn online-lobby-pin-step-uri-copy"
                                    onKeyDown={onQrSplitCopyKeyDown}
                                    onClick={() => {
                                      void navigator.clipboard
                                        .writeText(lightningPay.lightningUri)
                                        .then(() => {
                                          if (lightningUriCopyResetRef.current)
                                            clearTimeout(
                                              lightningUriCopyResetRef.current
                                            );
                                          setLightningUriCopied(true);
                                          lightningUriCopyResetRef.current =
                                            window.setTimeout(() => {
                                              setLightningUriCopied(false);
                                              lightningUriCopyResetRef.current =
                                                null;
                                            }, 2200);
                                        });
                                    }}
                                  >
                                    {lightningUriCopied ? 'Copied' : 'Copy'}
                                  </button>
                                </div>
                                <div className="online-lobby-pay-btns">
                                  <div className="online-lobby-btn-pop-wrap">
                                    <Button
                                      type="button"
                                      className="online-lobby-action online-lobby-wallet-btn"
                                      onClick={openLightningUri}
                                    >
                                      External wallet
                                    </Button>
                                  </div>
                                  {nwcUri ? (
                                    <Button
                                      type="button"
                                      className="online-lobby-action online-lobby-nwc-pay-btn"
                                      disabled={nwcBusy}
                                      onClick={() =>
                                        void tryNwcPay(
                                          lightningPay.lightningUri.replace(
                                            /^lightning:/i,
                                            ''
                                          )
                                        )
                                      }
                                    >
                                      {nwcBusy ? 'PAYING…' : 'PAY WITH NWC'}
                                    </Button>
                                  ) : null}
                                </div>
                                {nwcSettingsHint}
                                {nwcError ? (
                                  <p className="online-lobby-nwc-error">
                                    {nwcError}
                                  </p>
                                ) : null}
                              </div>
                              <div className="online-lobby-qr-split-block-col online-lobby-qr-split-block-col--qr">
                                <div className="online-lobby-qr-frame online-lobby-qr-frame--ready">
                                  <QRCodeSVG
                                    value={lightningPay.lightningUri}
                                    size={LOBBY_INVOICE_QR_SIZE}
                                    className="online-lobby-qr online-lobby-qr--flush"
                                    aria-label="Anonymous Lightning invoice QR code"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : paymentMode === 'nostr' ? (
                        <div className="online-lobby-kind1-qr-col online-lobby-kind1-qr-col--panel">
                          {!nostrSession.signedIn ? (
                            <div className="online-lobby-qr-split online-lobby-qr-split--3col">
                              <div className="online-lobby-qr-split-block-col online-lobby-qr-split-block-col--meta">
                                <div className="online-lobby-anon-desc">
                                  <p className="online-lobby-sublabel">
                                    NOSTR SEAT
                                  </p>
                                  <p className="online-lobby-kind1-qr-hint">
                                    Connect your key in Settings, then zap here
                                    to pay for your seat.
                                  </p>
                                </div>
                              </div>
                              <div
                                className="online-lobby-qr-split-block-col online-lobby-qr-split-block-col--uri online-lobby-qr-split-block-col--spacer"
                                aria-hidden="true"
                              />
                              <div className="online-lobby-qr-split-block-col online-lobby-qr-split-block-col--qr">
                                <div className="online-lobby-btn-pop-wrap">
                                  <Button
                                    type="button"
                                    className="online-lobby-action online-lobby-nostr-signin-btn"
                                    onClick={openConfigForNostr}
                                  >
                                    SIGN IN
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ) : !(nostrLinkActive || seatZapInvoice) ? (
                            <div className="online-lobby-nostr-connected-prompt">
                              <div className="online-lobby-nostr-connected-top">
                                <div className="online-lobby-nostr-linked-pill">
                                  <div className="online-lobby-nostr-linked-row">
                                    {nostrSession.picture ? (
                                      <img
                                        className="online-lobby-nostr-linked-avatar"
                                        src={nostrSession.picture}
                                        alt=""
                                        onError={(e) => {
                                          (
                                            e.target as HTMLImageElement
                                          ).style.display = 'none';
                                        }}
                                      />
                                    ) : (
                                      <div
                                        className="online-lobby-nostr-linked-avatar online-lobby-nostr-linked-avatar--placeholder"
                                        aria-hidden
                                      >
                                        <svg
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="1.4"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        >
                                          <circle cx="12" cy="8" r="4" />
                                          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                                        </svg>
                                      </div>
                                    )}
                                    <div className="online-lobby-nostr-linked-identity">
                                      <span className="online-lobby-nostr-linked-name">
                                        {nostrSession.displayName ??
                                          midTruncate(
                                            nostrSession.npub ?? '',
                                            14,
                                            6
                                          )}
                                      </span>
                                      {nostrSession.npub ? (
                                        <span
                                          className="online-lobby-nostr-linked-npub"
                                          title={nostrSession.npub}
                                        >
                                          {midTruncate(
                                            nostrSession.npub,
                                            12,
                                            6
                                          )}
                                        </span>
                                      ) : null}
                                      {nostrSession.lud16 ? (
                                        <span
                                          className="online-lobby-nostr-linked-status-label online-lobby-nostr-linked-status-label--pending"
                                          title={`Lightning address: ${nostrSession.lud16}`}
                                        >
                                          {nostrSession.lud16}
                                        </span>
                                      ) : (
                                        <span className="online-lobby-nostr-linked-status-label online-lobby-nostr-linked-status-label--missing">
                                          no LN address
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {nostrSession.nip05 ? (
                                    <span className="online-lobby-nostr-linked-rest">
                                      {nostrSession.nip05.replace(/^_@/, '@')}
                                    </span>
                                  ) : null}
                                </div>
                                {showNostrLinkManualPrompt ? (
                                  nostrSignerAvailable ? (
                                    <div className="online-lobby-btn-pop-wrap">
                                      <Button
                                        type="button"
                                        className="online-lobby-action online-lobby-nostr-zap-btn"
                                        disabled={nostrLinkBusy || !socket}
                                        onClick={() => {
                                          nostrLinkAutoStartedRef.current = false;
                                          startNostrLinkFlow();
                                        }}
                                      >
                                        LINK & PAY
                                      </Button>
                                    </div>
                                  ) : null
                                ) : (
                                  <p
                                    className="online-lobby-nostr-linking-status"
                                    role="status"
                                  >
                                    {nostrLinkStatusLabel}
                                  </p>
                                )}
                              </div>
                              <p className="online-lobby-nostr-switch-hint">
                                Manage connection in{' '}
                                <button
                                  type="button"
                                  className="online-lobby-text-btn online-lobby-pin-step-hint-link online-lobby-nostr-switch-btn"
                                  onClick={openConfigForNostr}
                                >
                                  Settings
                                </button>
                              </p>
                              {nostrPayError ? (
                                <p
                                  className="online-lobby-nostr-sign-error"
                                  role="alert"
                                >
                                  {nostrPayError}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <div className="online-lobby-qr-split online-lobby-qr-split--3col">
                              <div className="online-lobby-qr-split-block-col online-lobby-qr-split-block-col--meta">
                                <p className="online-lobby-sublabel online-lobby-qr-split-zap-label">
                                  Zapping as
                                </p>
                                {nostrLinkedProfile ? (
                                  <div className="online-lobby-nostr-linked-pill">
                                    <div className="online-lobby-nostr-linked-row">
                                      {nostrLinkedProfile.picture ? (
                                        <img
                                          className="online-lobby-nostr-linked-avatar"
                                          src={nostrLinkedProfile.picture}
                                          alt=""
                                          onError={(ev) => {
                                            (
                                              ev.target as HTMLImageElement
                                            ).style.display = 'none';
                                          }}
                                        />
                                      ) : null}
                                      <div className="online-lobby-nostr-linked-identity">
                                        <span className="online-lobby-nostr-linked-name">
                                          {nostrLinkedProfile.name ??
                                            'Nostr profile'}
                                        </span>
                                        <span className="online-lobby-nostr-linked-npub">
                                          {midTruncate(
                                            npubEncode(
                                              nostrLinkedProfile.pubkey
                                            ),
                                            12,
                                            6
                                          )}
                                        </span>
                                      </div>
                                    </div>
                                    <div
                                      className="online-lobby-nostr-linked-status"
                                      role="status"
                                    >
                                      {seatZapInvoice ? (
                                        <>
                                          <svg
                                            className="online-lobby-nostr-linked-check"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            aria-hidden
                                          >
                                            <polyline points="20 6 9 17 4 12" />
                                          </svg>
                                          <span className="online-lobby-nostr-linked-status-label">
                                            Zap request signed
                                          </span>
                                        </>
                                      ) : (
                                        <span className="online-lobby-nostr-linked-status-label online-lobby-nostr-linked-status-label--pending">
                                          {nostrZapStatusLabel}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ) : null}
                                {!seatZapInvoice && !nostrLinkedProfile ? (
                                  <p className="online-lobby-pin-step-hint online-lobby-qr-split-zap-status">
                                    {nostrZapStatusLabel}
                                  </p>
                                ) : null}
                                {pendingNostrAuthUrl && zapPayBusy ? (
                                  <div
                                    className="online-lobby-nip46-auth-banner"
                                    role="status"
                                  >
                                    <p className="online-lobby-nip46-auth-banner__text">
                                      Your remote signer needs approval to sign
                                      the zap request.
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
                              </div>
                              <div className="online-lobby-qr-split-block-col online-lobby-qr-split-block-col--uri">
                                <p className="online-lobby-sublabel online-lobby-qr-split-zap-label">
                                  Pay zap
                                </p>
                                {seatZapInvoice ? (
                                  <>
                                    <p className="online-lobby-anon-amount">
                                      {seatZapInvoice.buyinSats.toLocaleString()}{' '}
                                      <span>sats</span>
                                    </p>
                                    <p className="online-lobby-pin-step-hint online-lobby-qr-split-expiry">
                                      {formatLightningExpiresIn(
                                        seatZapInvoice.expiresAt,
                                        nowTick
                                      )}
                                    </p>
                                    <div className="online-lobby-pin-step-uri-stack">
                                      <p
                                        className="online-lobby-kind1-uri-text"
                                        title={seatZapInvoice.lightningUri}
                                      >
                                        {midTruncate(
                                          seatZapInvoice.lightningUri,
                                          18,
                                          10
                                        )}
                                      </p>
                                      <button
                                        type="button"
                                        className="online-lobby-text-btn online-lobby-pin-step-uri-copy"
                                        onKeyDown={onQrSplitCopyKeyDown}
                                        onClick={() => {
                                          void navigator.clipboard
                                            .writeText(
                                              seatZapInvoice.lightningUri
                                            )
                                            .then(() => {
                                              if (
                                                lightningUriCopyResetRef.current
                                              )
                                                clearTimeout(
                                                  lightningUriCopyResetRef.current
                                                );
                                              setLightningUriCopied(true);
                                              lightningUriCopyResetRef.current =
                                                window.setTimeout(() => {
                                                  setLightningUriCopied(false);
                                                  lightningUriCopyResetRef.current =
                                                    null;
                                                }, 2200);
                                            });
                                        }}
                                      >
                                        {lightningUriCopied ? 'Copied' : 'Copy'}
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <div
                                    className="online-lobby-uri-skeleton"
                                    aria-hidden
                                  />
                                )}
                                <div className="online-lobby-pay-btns">
                                  <div className="online-lobby-btn-pop-wrap">
                                    <Button
                                      type="button"
                                      className="online-lobby-action online-lobby-wallet-btn"
                                      disabled={!seatZapInvoice}
                                      onClick={openLightningUri}
                                    >
                                      External wallet
                                    </Button>
                                  </div>
                                  {nwcUri ? (
                                    <Button
                                      type="button"
                                      className="online-lobby-action online-lobby-nwc-pay-btn"
                                      disabled={!seatZapInvoice || nwcBusy}
                                      onClick={() =>
                                        seatZapInvoice &&
                                        void tryNwcPay(seatZapInvoice.pr)
                                      }
                                    >
                                      {nwcBusy ? 'PAYING…' : 'PAY WITH NWC'}
                                    </Button>
                                  ) : null}
                                </div>
                                {nwcSettingsHint}
                                {nwcError ? (
                                  <p className="online-lobby-nwc-error">
                                    {nwcError}
                                  </p>
                                ) : null}
                                {nostrPayError ? (
                                  <p
                                    className="online-lobby-nostr-sign-error"
                                    role="alert"
                                  >
                                    {nostrPayError}
                                  </p>
                                ) : null}
                                {nostrPayError &&
                                nostrLinkActive &&
                                !zapPayBusy ? (
                                  <Button
                                    type="button"
                                    className="online-lobby-action online-lobby-nostr-retry-btn"
                                    onClick={requestSeatZapPrepare}
                                  >
                                    Retry zap invoice
                                  </Button>
                                ) : null}
                              </div>
                              <div className="online-lobby-qr-split-block-col online-lobby-qr-split-block-col--qr">
                                <div
                                  className={[
                                    'online-lobby-qr-frame',
                                    !seatZapInvoice
                                      ? 'online-lobby-qr-frame--loading'
                                      : 'online-lobby-qr-frame--ready',
                                  ].join(' ')}
                                >
                                  {seatZapInvoice ? (
                                    <QRCodeSVG
                                      value={seatZapInvoice.lightningUri}
                                      size={LOBBY_INVOICE_QR_SIZE}
                                      className="online-lobby-qr online-lobby-qr--flush"
                                      aria-label="Zap invoice QR code"
                                    />
                                  ) : (
                                    <div
                                      className="online-lobby-qr-skeleton"
                                      aria-hidden
                                    >
                                      <svg
                                        className="online-lobby-qr-spinner"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.2"
                                        strokeLinecap="round"
                                      >
                                        <circle
                                          cx="12"
                                          cy="12"
                                          r="9"
                                          strokeOpacity="0.12"
                                        />
                                        <path d="M12 3a9 9 0 0 1 9 9" />
                                      </svg>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : paymentMode === 'pin-zap' ? (
                        isRematchLoserPay ? (
                          <div className="online-lobby-kind1-qr-col online-lobby-kind1-qr-col--panel">
                            <ol
                              className="online-lobby-pin-steps"
                              aria-label="Steps to pay rematch from your app"
                            >
                              <li className="online-lobby-pin-step online-lobby-pin-step--open-note">
                                <div className="online-lobby-pin-step-head">
                                  <span
                                    className="online-lobby-pin-step-num"
                                    aria-hidden
                                  >
                                    1
                                  </span>
                                  <p className="online-lobby-sublabel">
                                    OPEN THE REMATCH NOTE
                                  </p>
                                </div>
                                <div className="online-lobby-pin-step-open-row">
                                  <QRCodeSVG
                                    value={nostrUri}
                                    size={LOBBY_PIN_STEP_QR_SIZE}
                                    includeMargin
                                    className="online-lobby-qr online-lobby-qr--step"
                                    aria-label="Nostr rematch note URI"
                                  />
                                  <div className="online-lobby-pin-step-uri-stack">
                                    <p
                                      className="online-lobby-kind1-uri-text"
                                      title={nostrUri}
                                    >
                                      {midTruncate(nostrUri, 14, 6)}
                                    </p>
                                    <button
                                      type="button"
                                      className="online-lobby-text-btn online-lobby-pin-step-uri-copy"
                                      onClick={() => {
                                        void navigator.clipboard
                                          .writeText(nostrUri)
                                          .then(() => {
                                            if (nostrUriCopyResetRef.current)
                                              clearTimeout(
                                                nostrUriCopyResetRef.current
                                              );
                                            setNostrUriCopied(true);
                                            nostrUriCopyResetRef.current =
                                              window.setTimeout(() => {
                                                setNostrUriCopied(false);
                                                nostrUriCopyResetRef.current =
                                                  null;
                                              }, 2200);
                                          });
                                      }}
                                    >
                                      {nostrUriCopied ? 'Copied' : 'Copy'}
                                    </button>
                                  </div>
                                </div>
                              </li>
                              <li className="online-lobby-pin-step">
                                <div className="online-lobby-pin-step-head">
                                  <span
                                    className="online-lobby-pin-step-num"
                                    aria-hidden
                                  >
                                    2
                                  </span>
                                  <p className="online-lobby-sublabel">
                                    ZAP THE NOTE
                                  </p>
                                </div>
                                <p className="online-lobby-pin-step-amount">
                                  {Math.floor(lobbyPayAmount).toLocaleString()}{' '}
                                  <span>sats</span>
                                </p>
                                <p className="online-lobby-pin-step-hint">
                                  Zap exactly this amount on the rematch note —
                                  no PIN needed.
                                </p>
                              </li>
                            </ol>
                          </div>
                        ) : (
                          /* PIN — numbered 3-step instruction layout */
                          <div className="online-lobby-kind1-qr-col online-lobby-kind1-qr-col--panel">
                            <ol
                              className="online-lobby-pin-steps"
                              aria-label="Steps to pay with PIN"
                            >
                              {/* Step 1: Copy PIN */}
                              <li className="online-lobby-pin-step">
                                <div className="online-lobby-pin-step-head">
                                  <span
                                    className="online-lobby-pin-step-num"
                                    aria-hidden
                                  >
                                    1
                                  </span>
                                  <p className="online-lobby-sublabel">
                                    COPY YOUR PIN
                                  </p>
                                </div>
                                <p className="online-lobby-pin online-lobby-kind1-pin">
                                  {joinPin || '—'}
                                </p>
                                <p className="online-lobby-pin-step-hint">
                                  Paste in your zap comment to claim your seat.{' '}
                                  <button
                                    type="button"
                                    className="online-lobby-text-btn online-lobby-pin-step-uri-copy"
                                    disabled={!joinPin}
                                    onClick={() => {
                                      if (!joinPin) return;
                                      void navigator.clipboard
                                        .writeText(joinPin)
                                        .then(() => {
                                          if (joinPinCopyResetRef.current)
                                            clearTimeout(
                                              joinPinCopyResetRef.current
                                            );
                                          setJoinPinCopied(true);
                                          joinPinCopyResetRef.current =
                                            window.setTimeout(() => {
                                              setJoinPinCopied(false);
                                              joinPinCopyResetRef.current =
                                                null;
                                            }, 2200);
                                        });
                                    }}
                                  >
                                    {joinPinCopied ? 'Copied' : 'Copy'}
                                  </button>
                                </p>
                              </li>
                              {/* Step 2: Open the note */}
                              <li className="online-lobby-pin-step online-lobby-pin-step--open-note">
                                <div className="online-lobby-pin-step-head">
                                  <span
                                    className="online-lobby-pin-step-num"
                                    aria-hidden
                                  >
                                    2
                                  </span>
                                  <p className="online-lobby-sublabel">
                                    OPEN THE NOTE
                                  </p>
                                </div>
                                <div className="online-lobby-pin-step-open-row">
                                  <QRCodeSVG
                                    value={nostrUri}
                                    size={LOBBY_PIN_STEP_QR_SIZE}
                                    includeMargin
                                    className="online-lobby-qr online-lobby-qr--step"
                                    aria-label="Nostr note URI"
                                  />
                                  <div className="online-lobby-pin-step-uri-stack">
                                    <p
                                      className="online-lobby-kind1-uri-text"
                                      title={nostrUri}
                                    >
                                      {midTruncate(nostrUri, 14, 6)}
                                    </p>
                                    <button
                                      type="button"
                                      className="online-lobby-text-btn online-lobby-pin-step-uri-copy"
                                      onClick={() => {
                                        void navigator.clipboard
                                          .writeText(nostrUri)
                                          .then(() => {
                                            if (nostrUriCopyResetRef.current)
                                              clearTimeout(
                                                nostrUriCopyResetRef.current
                                              );
                                            setNostrUriCopied(true);
                                            nostrUriCopyResetRef.current =
                                              window.setTimeout(() => {
                                                setNostrUriCopied(false);
                                                nostrUriCopyResetRef.current =
                                                  null;
                                              }, 2200);
                                          });
                                      }}
                                    >
                                      {nostrUriCopied ? 'Copied' : 'Copy'}
                                    </button>
                                  </div>
                                </div>
                              </li>
                              {/* Step 3: Zap */}
                              <li className="online-lobby-pin-step">
                                <div className="online-lobby-pin-step-head">
                                  <span
                                    className="online-lobby-pin-step-num"
                                    aria-hidden
                                  >
                                    3
                                  </span>
                                  <p className="online-lobby-sublabel">
                                    ZAP THE NOTE
                                  </p>
                                </div>
                                <p className="online-lobby-pin-step-amount">
                                  {Math.floor(lobbyPayAmount).toLocaleString()}{' '}
                                  <span>sats</span>
                                </p>
                                <p className="online-lobby-pin-step-hint">
                                  Include your PIN in the zap comment.
                                </p>
                              </li>
                            </ol>
                          </div>
                        )
                      ) : !hasPaidMySeat && !isRematchLoserPay ? (
                        <div className="online-lobby-kind1-qr-col online-lobby-kind1-qr-col--idle">
                          <div className="online-lobby-kind1-idle-copy">
                            <p className="online-lobby-kind1-idle-cta-title">
                              {seatsFull
                                ? 'Spectating'
                                : 'Pick how you want to pay'}
                            </p>
                            <p className="online-lobby-kind1-idle-cta">
                              {seatsFull
                                ? 'Both seats are taken. The match starts when both players mark ready.'
                                : 'Choose Lightning, Nostr sign-in, or your Nostr app above.'}
                            </p>
                            {!seatsFull ? (
                              <p className="online-lobby-kind1-idle-cta online-lobby-kind1-idle-cta--muted">
                                Wait for the game to start to watch as a
                                spectator.
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ) : isRematchLoserPay && !rematchPayMode ? (
                        <div className="online-lobby-kind1-qr-col online-lobby-kind1-qr-col--idle">
                          <p className="online-lobby-kind1-idle-cta">
                            Could not detect your original payment method. Zap
                            exactly{' '}
                            {Math.floor(lobbyPayAmount).toLocaleString()} sats
                            on the rematch note below.
                          </p>
                        </div>
                      ) : null}

                      {showInviteFinder ? (
                        <div className="online-lobby-invite-panel">
                          <p className="online-lobby-sublabel">
                            {seatsFull ? 'SHARE ROOM' : 'FIND PLAYERS'}
                          </p>
                          <p className="online-lobby-invite-lede">
                            {seatsFull
                              ? 'Invite spectators — room link is in the header if you only need the URL.'
                              : 'Share to fill the open seat. Room link is in the header if you only need the URL.'}
                          </p>
                          <div className="online-lobby-invite-actions">
                            <Button
                              type="button"
                              className="online-lobby-action online-lobby-invite-share-btn"
                              disabled={!lobbyInviteText}
                              onClick={() => void shareLobbyInvite()}
                            >
                              {inviteCopyFeedback === 'share'
                                ? 'SHARED'
                                : inviteCopyFeedback === 'text'
                                  ? 'COPIED'
                                  : 'SHARE'}
                            </Button>
                            {nostrSession.signedIn ? (
                              <Button
                                type="button"
                                className="online-lobby-action online-lobby-invite-post-btn"
                                disabled={invitePostBusy || !lobbyInviteText}
                                onClick={() => void postInviteOnNostr()}
                              >
                                {invitePostBusy
                                  ? 'POSTING…'
                                  : invitePostOk
                                    ? 'POSTED'
                                    : 'POST ON NOSTR'}
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                className="online-lobby-action"
                                onClick={openConfigForNostr}
                              >
                                SIGN IN TO POST ON NOSTR
                              </Button>
                            )}
                          </div>
                          <details className="online-lobby-invite-preview-details">
                            <summary>Invite preview</summary>
                            <pre className="online-lobby-invite-preview">
                              {lobbyInviteText}
                            </pre>
                          </details>
                          {invitePostError ? (
                            <p
                              className="online-lobby-invite-error"
                              role="alert"
                            >
                              {invitePostError}
                            </p>
                          ) : null}
                          {invitePostOk ? (
                            <p className="online-lobby-invite-ok" role="status">
                              Invite note published to your relays.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="online-lobby-pay-zone-note">
                  <div className="online-lobby-kind1-content-col">
                    {kind1PostStatus === 'loading' && !kind1PostEvent ? (
                      <div
                        className="online-lobby-kind1-loading online-lobby-kind1-loading--inline"
                        aria-label="Loading note from relays"
                        role="status"
                      >
                        <span
                          className="online-lobby-kind1-loading-chain"
                          aria-hidden="true"
                        >
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                        </span>
                        <span className="online-lobby-kind1-loading-label">
                          LOADING NOTE FROM RELAYS
                        </span>
                      </div>
                    ) : kind1PostEvent ? (
                      <>
                        <div className="online-lobby-kind1-embed-card">
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
                              <span className="online-lobby-kind1-author-name">
                                {kind1PostEvent.authorName}
                              </span>
                              {kind1AuthorNip05 ? (
                                <span
                                  className="online-lobby-kind1-author-nip05"
                                  title={kind1AuthorNip05}
                                >
                                  {kind1AuthorNip05Verified === true ? (
                                    <svg
                                      className="online-lobby-kind1-author-nip05-check"
                                      width={8}
                                      height={8}
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.6"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      aria-hidden
                                    >
                                      <path d="M20 6L9 17l-5-5" />
                                    </svg>
                                  ) : null}
                                  {kind1AuthorNip05.replace(/^_@/, '@')}
                                </span>
                              ) : null}
                              {kind1AuthorLud16 ? (
                                <span
                                  className="online-lobby-kind1-author-lud16"
                                  title={`Lightning address: ${kind1AuthorLud16}`}
                                >
                                  <svg
                                    className="online-lobby-kind1-author-lud16-bolt"
                                    width={8}
                                    height={8}
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    aria-hidden
                                  >
                                    <path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12L13 2Z" />
                                  </svg>
                                  {kind1AuthorLud16}
                                </span>
                              ) : null}
                              <span
                                className="online-lobby-kind1-author-npub"
                                title={kind1AuthorNpubFull(
                                  kind1PostEvent.pubkey,
                                  kind1PostEvent.npubDisplay
                                )}
                              >
                                {midTruncate(
                                  kind1AuthorNpubFull(
                                    kind1PostEvent.pubkey,
                                    kind1PostEvent.npubDisplay
                                  ),
                                  12,
                                  8
                                )}
                              </span>
                            </div>
                          </div>
                          <div className="online-lobby-kind1-embedded-body">
                            {kind1PostEvent.content}
                          </div>
                          <span className="online-lobby-kind1-embedded-meta online-lobby-kind1-timestamp">
                            {formatKind1PostTimestamp(
                              kind1PostEvent.created_at
                            )}
                          </span>
                        </div>

                        {kind1PostEvent.pubpayZap.isPubpay ? (
                          <div className="online-lobby-pubpay-zap-meta">
                            <p className="online-lobby-copy">
                              {kind1PostEvent.pubpayZap.zapMinSats != null &&
                              kind1PostEvent.pubpayZap.zapMaxSats != null
                                ? `Pubpay zap range: ${kind1PostEvent.pubpayZap.zapMinSats}${
                                    kind1PostEvent.pubpayZap.zapMinSats ===
                                    kind1PostEvent.pubpayZap.zapMaxSats
                                      ? ''
                                      : `–${kind1PostEvent.pubpayZap.zapMaxSats}`
                                  } sats`
                                : 'Zap terms from host'}
                              {kind1PostEvent.pubpayZap.zapUses
                                ? ` · Uses: ${kind1PostEvent.pubpayZap.zapUses}`
                                : ''}
                            </p>
                            {room?.buyin != null ? (
                              <p className="online-lobby-copy">
                                Room buy-in: <b>{room.buyin} sats</b>
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        {rematchPending && !amILoserToPay ? (
                          <p className="online-lobby-copy online-lobby-kind1-rematch-note">
                            Waiting for opponent to pay exactly{' '}
                            {Math.floor(rematchAmount).toLocaleString()} sats.
                          </p>
                        ) : null}

                        {error && paymentMode !== 'nostr' ? (
                          <p className="online-lobby-inline-pay-error">
                            {error}
                          </p>
                        ) : null}
                      </>
                    ) : kind1PostStatus === 'loading' ? (
                      <div
                        className="online-lobby-kind1-loading online-lobby-kind1-loading--inline"
                        aria-label="Loading note from relays"
                        role="status"
                      >
                        <span
                          className="online-lobby-kind1-loading-chain"
                          aria-hidden="true"
                        >
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                        </span>
                        <span className="online-lobby-kind1-loading-label">
                          LOADING NOTE FROM RELAYS
                        </span>
                      </div>
                    ) : kind1PostStatus === 'error' ? (
                      <div className="online-lobby-kind1-post-error online-lobby-kind1-post-error--inline">
                        <p className="online-lobby-kind1-post-error-msg">
                          Couldn't load this note from relays.
                        </p>
                        <p className="online-lobby-kind1-post-error-hint">
                          Check your connection or try again.
                        </p>
                        <Button
                          type="button"
                          className="online-lobby-action"
                          onClick={retryKind1PostLoad}
                        >
                          Try again
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : kind1PostStatus === 'loading' ? (
              <div
                className="online-lobby-kind1-loading"
                aria-label="Loading note from relays"
                role="status"
              >
                <span className="online-lobby-kind1-loading-label">
                  LOADING NOTE FROM RELAYS
                </span>
              </div>
            ) : null}
          </div>
        ) : error ? (
          <div className="online-lobby-pay-zone online-lobby-kind1-section--room-error">
            <svg
              className="online-lobby-room-error-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="online-lobby-room-error-title">
              {error === 'room_not_found'
                ? 'Room not found'
                : 'Connection error'}
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
          <div className="online-lobby-pay-zone online-lobby-kind1-section--pending">
            {rematchPending ? 'Publishing rematch Kind1…' : 'Publishing Kind1…'}
          </div>
        )}

        {/* Leave Room — shown below the kind1 section when seat not yet claimed */}
        {!mySeat && !isMatchEnded && !rematchPending ? (
          <div className="online-lobby-leave-row">
            <div className="online-lobby-btn-pop-wrap">
              <Button
                ref={leaveBtnRef}
                type="button"
                className="online-lobby-action online-lobby-leave-btn"
                onClick={leaveRoom}
              >
                LEAVE ROOM
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      {/* end .online-lobby-main */}

      <BackgroundAudio
        src="/sound/chain_duel_produced_menu.m4a"
        autoplay={true}
      />
    </div>
  );
}
