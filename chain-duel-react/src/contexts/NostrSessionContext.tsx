import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { npubEncode } from 'nostr-tools/nip19';
import type { AppNostrProfile } from '@/types/schemas';
import type { StoredSignerMode } from '@/lib/nostr/signerSession';
import {
  SIGNER_MODE_KEY,
  STORED_NOSTR_PUBKEY_KEY,
  clearSignerSession,
  getStoredSignerMode,
  setNip46AuthUrlHandler,
} from '@/lib/nostr/signerSession';
import { linkAppNostrSession } from '@/lib/nostr/linkAppNostrSession';
import { useSocket } from '@/hooks/useSocket';
import { SocketBoundaryParsers } from '@/shared/socket/socketBoundary';

export type NostrSessionState = {
  signedIn: boolean;
  pubkey: string | null;
  npub: string | null;
  displayName: string | null;
  picture: string | null;
  nip05: string | null;
  lud16: string | null;
  lud06: string | null;
  signerMode: StoredSignerMode | null;
  expiresAt: number | null;
  linking: boolean;
  linkError: string | null;
};

type NostrSessionContextValue = NostrSessionState & {
  refresh: () => void;
  signOut: () => void;
  linkToServer: (signerMode: StoredSignerMode) => Promise<void>;
  applyLocalSigner: (pubkey: string, mode: StoredSignerMode) => void;
  pendingNip46AuthUrl: string | null;
  clearPendingNip46AuthUrl: () => void;
};

const NostrSessionContext = createContext<NostrSessionContextValue | null>(null);

function profileFromPayload(profile: AppNostrProfile | undefined, pubkey: string) {
  return {
    displayName: profile?.name ?? null,
    picture: profile?.picture ?? null,
    nip05: profile?.nip05 ?? null,
    lud16: profile?.lud16 ?? null,
    lud06: profile?.lud06 ?? null,
    pubkey,
    npub: (() => {
      try {
        return npubEncode(pubkey);
      } catch {
        return pubkey;
      }
    })(),
  };
}

export function NostrSessionProvider({ children }: { children: ReactNode }) {
  const { socket } = useSocket({ autoConnect: true });
  const [pendingNip46AuthUrl, setPendingNip46AuthUrl] = useState<string | null>(null);
  const [state, setState] = useState<NostrSessionState>(() => ({
    signedIn: false,
    pubkey: null,
    npub: null,
    displayName: null,
    picture: null,
    nip05: null,
    lud16: null,
    lud06: null,
    signerMode: getStoredSignerMode(),
    expiresAt: null,
    linking: false,
    linkError: null,
  }));

  const applySessionPayload = useCallback((payload: unknown) => {
    const parsed = SocketBoundaryParsers.resAppNostrSession(payload);
    if (!parsed) {
      return;
    }
    if (!parsed.ok || !parsed.pubkey) {
      setState((prev) => ({
        ...prev,
        signedIn: false,
        pubkey: null,
        npub: null,
        displayName: null,
        picture: null,
        nip05: null,
        lud16: null,
        lud06: null,
        signerMode: null,
        expiresAt: null,
        linking: false,
      }));
      localStorage.removeItem(STORED_NOSTR_PUBKEY_KEY);
      return;
    }
    const pk = parsed.pubkey.toLowerCase();
    const enriched = profileFromPayload(parsed.profile, pk);
    if (parsed.signerMode) {
      localStorage.setItem(SIGNER_MODE_KEY, parsed.signerMode);
    }
    localStorage.setItem(STORED_NOSTR_PUBKEY_KEY, pk);
    setState({
      signedIn: true,
      pubkey: pk,
      npub: enriched.npub,
      displayName: enriched.displayName,
      picture: enriched.picture,
      nip05: enriched.nip05,
      lud16: enriched.lud16,
      lud06: enriched.lud06,
      signerMode: parsed.signerMode ?? getStoredSignerMode(),
      expiresAt: parsed.expiresAt ?? null,
      linking: false,
      linkError: null,
    });
  }, []);

  useEffect(() => {
    setNip46AuthUrlHandler((url) => setPendingNip46AuthUrl(url));
    return () => setNip46AuthUrlHandler(null);
  }, []);

  const clearPendingNip46AuthUrl = useCallback(() => {
    setPendingNip46AuthUrl(null);
  }, []);

  useEffect(() => {
    if (!socket) {
      return;
    }
    const onSession = (payload: unknown) => {
      applySessionPayload(payload);
    };
    socket.on('resAppNostrSession', onSession);
    socket.emit('getAppNostrSession');
    return () => {
      socket.off('resAppNostrSession', onSession);
    };
  }, [socket, applySessionPayload]);

  const refresh = useCallback(() => {
    socket?.emit('getAppNostrSession');
  }, [socket]);

  const signOut = useCallback(() => {
    clearSignerSession();
    socket?.emit('clearAppNostrSession');
    setState({
      signedIn: false,
      pubkey: null,
      npub: null,
      displayName: null,
      picture: null,
      nip05: null,
      lud16: null,
      lud06: null,
      signerMode: null,
      expiresAt: null,
      linking: false,
      linkError: null,
    });
  }, [socket]);

  const applyLocalSigner = useCallback((pubkey: string, mode: StoredSignerMode) => {
    setState((prev) => ({
      ...prev,
      pubkey: pubkey.toLowerCase(),
      signerMode: mode,
      linking: false,
      linkError: null,
    }));
  }, []);

  const linkToServer = useCallback(
    async (signerMode: StoredSignerMode) => {
      if (!socket?.connected) {
        throw new Error('Not connected to game server.');
      }
      setState((prev) => ({ ...prev, linking: true, linkError: null }));
      try {
        await linkAppNostrSession(socket, signerMode);
        setState((prev) => ({ ...prev, linking: false, linkError: null }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Link failed';
        setState((prev) => ({ ...prev, linking: false, linkError: msg }));
        throw e;
      }
    },
    [socket]
  );

  const value = useMemo(
    () => ({
      ...state,
      refresh,
      signOut,
      linkToServer,
      applyLocalSigner,
      pendingNip46AuthUrl,
      clearPendingNip46AuthUrl,
    }),
    [state, refresh, signOut, linkToServer, applyLocalSigner, pendingNip46AuthUrl, clearPendingNip46AuthUrl]
  );

  return (
    <NostrSessionContext.Provider value={value}>{children}</NostrSessionContext.Provider>
  );
}

export function useNostrSession(): NostrSessionContextValue {
  const ctx = useContext(NostrSessionContext);
  if (!ctx) {
    throw new Error('useNostrSession must be used within NostrSessionProvider');
  }
  return ctx;
}
