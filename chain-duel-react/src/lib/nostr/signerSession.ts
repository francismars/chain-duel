/**
 * Unified Nostr signing: NIP-07 extension, Nostr Connect (NIP-46 / "bunker"), or nsec (session-only).
 * @see https://nostrconnect.org/
 *
 * Architecture:
 * - BunkerSigner + SimplePool for pairing and all post-handshake RPC (sign_event, etc.)
 * - Raw WebSockets kept only as a last-resort fallback if BunkerSigner cannot be opened
 * - Dual NIP-44/NIP-04 decrypt on the raw path (some signers may use NIP-04)
 */

import {
  BunkerSigner,
  createNostrConnectURI,
  parseBunkerInput,
  type BunkerPointer,
} from 'nostr-tools/nip46';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { PlainKeySigner } from 'nostr-tools/signer';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import { decode as nip19Decode, npubEncode } from 'nostr-tools/nip19';
import { SimplePool } from 'nostr-tools/pool';
import { decrypt as nip04Decrypt } from 'nostr-tools/nip04';
import {
  getConversationKey,
  encrypt as nip44Encrypt,
  decrypt as nip44Decrypt,
} from 'nostr-tools/nip44';

import type { NostrNip07Provider } from '@/types/nostr-nip07';

export const STORED_NOSTR_PUBKEY_KEY = 'arcadeNostrPubkey';

/** Lowercase 64-char hex; NIP-46 / extensions sometimes return mixed case. */
export function normalizeNostrPubkeyHex(raw: string): string {
  const h = raw.trim().replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(h)) {
    throw new Error('Invalid Nostr public key (expected 64 hex characters).');
  }
  return h;
}

/** How the user signed in — drives reconnect + signing backend. */
export const SIGNER_MODE_KEY = 'arcadeNostrSignerMode';

const NIP46_CLIENT_SK_KEY = 'arcadeNostrNip46ClientSkHex';
const NIP46_BP_KEY = 'arcadeNostrNip46BunkerPointerJson';

/** Raw hex nsec — session only (cleared when the tab closes). */
export const NSEC_SESSION_SK_KEY = 'arcadeNostrNsecSkHex';

export type StoredSignerMode = 'extension' | 'nip46' | 'nsec';

/** Relays advertised in nostrconnect:// QR — keep small; pool opens every URL. */
export const DEFAULT_NOSTR_CONNECT_RELAYS: string[] = [
  'wss://relay.primal.net',
  'wss://premium.primal.net',
  'wss://relay.damus.io',
  'wss://nos.lol',
];

/** Often unreachable in Firefox/WSL — drop from stored bunker pointers. */
const BLOCKED_RELAY_HOSTS = new Set([
  'relay.nostr.band',
  'relay.nsecbunker.com',
  'relay.snort.social',
  'purplepag.es',
]);

function normalizeRelayUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** Prefer Primal relays; strip hosts that spam connection errors in the browser. */
export function sanitizeNip46Relays(relays: string[]): string[] {
  const filtered = relays.map(normalizeRelayUrl).filter((url) => {
    try {
      return !BLOCKED_RELAY_HOSTS.has(new URL(url).hostname);
    } catch {
      return false;
    }
  });
  const merged = [...new Set([...filtered, ...DEFAULT_NOSTR_CONNECT_RELAYS])];
  return merged.slice(0, 6);
}

function withTimeout<T>(label: string, p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    }),
  ]);
}

const NOSTR_CONNECT_PAIR_WAIT_MS = 8 * 60 * 1000;
const DBG = '[NIP-46]';

// ---------------------------------------------------------------------------
// Raw WebSocket NIP-46 RPC — proven to work with Primal
// ---------------------------------------------------------------------------

/** Send a NIP-46 RPC over raw WebSockets with NIP-44 encryption (per spec). */
async function rawNip46Rpc(
  method: string,
  params: string[],
  opts: {
    clientSk: Uint8Array;
    signerPubkey: string;
    relays: string[];
    timeoutMs?: number;
  },
): Promise<{ id: string; result: string; error?: string }> {
  const { clientSk, signerPubkey, relays, timeoutMs = 60_000 } = opts;
  const skHex = bytesToHex(clientSk);
  const clientPubkey = getPublicKey(clientSk);
  const relayList = sanitizeNip46Relays(relays);
  const signerPubkeyNorm = signerPubkey.toLowerCase();

  const reqId = crypto.randomUUID();
  const requestPayload = JSON.stringify({ id: reqId, method, params });
  // NIP-46 spec mandates NIP-44 encryption for all RPC traffic
  const convKey = getConversationKey(clientSk, signerPubkey);
  const encryptedContent = nip44Encrypt(requestPayload, convKey);

  const requestEvent = finalizeEvent(
    {
      kind: 24133,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', signerPubkey]],
      content: encryptedContent,
    },
    clientSk,
  );

  console.log(DBG, `[rpc] ${method} id=${reqId.slice(0, 8)}… → ${relayList.length} relays`);

  return new Promise((resolve, reject) => {
    let settled = false;
    const sockets: WebSocket[] = [];
    const subId = `rpc${reqId.slice(0, 8)}`;

    const finish = (result: { id: string; result: string; error?: string } | null, err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const ws of sockets) {
        try { ws.send(JSON.stringify(['CLOSE', subId])); ws.close(); } catch { /* ignore */ }
      }
      if (err) {
        console.warn(DBG, `[rpc] ${method} failed:`, err.message);
        reject(err);
      } else {
        console.log(DBG, `[rpc] ${method} ✓ response received`);
        resolve(result!);
      }
    };

    const timer = setTimeout(
      () => finish(null, new Error(`${method} timed out after ${timeoutMs / 1000}s`)),
      timeoutMs,
    );

    for (const relayUrl of relayList) {
      let ws: WebSocket;
      try { ws = new WebSocket(relayUrl); } catch { continue; }
      sockets.push(ws);

      ws.onopen = () => {
        try {
          // No `authors` filter — Primal may respond from user's key, not signerPubkey
          ws.send(JSON.stringify(['REQ', subId, {
            kinds: [24133],
            authors: [signerPubkeyNorm],
            '#p': [clientPubkey],
            since: Math.floor(Date.now() / 1000) - 30,
          }]));
          ws.send(JSON.stringify(['EVENT', requestEvent]));
        } catch { /* ignore */ }
      };

      ws.onmessage = (msgEv) => {
        if (settled) return;
        void (async () => {
          try {
            const msg = JSON.parse(msgEv.data as string) as unknown[];
            if (msg[0] !== 'EVENT' || msg[1] !== subId) return;
            const ev = msg[2] as { pubkey?: string; content?: string; kind?: number };
            if (!ev || ev.kind !== 24133 || !ev.content || !ev.pubkey) return;

            // Try NIP-44 first, then NIP-04 fallback
            let plain: string | null = null;
            try {
              const convKey = getConversationKey(clientSk, ev.pubkey);
              plain = nip44Decrypt(ev.content, convKey);
            } catch {
              try {
                plain = await nip04Decrypt(skHex, ev.pubkey, ev.content);
              } catch {
                return; // neither worked — skip
              }
            }
            if (!plain) return;

            const parsed = JSON.parse(plain) as { id?: string; result?: string; error?: string };
            if (parsed.id !== reqId) return;
            if (parsed.error) {
              finish(null, new Error(String(parsed.error)));
              return;
            }
            finish(parsed as { id: string; result: string; error?: string });
          } catch { /* ignore malformed */ }
        })();
      };

      ws.onerror = () => { /* ignore — other relays may work */ };
    }
  });
}

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let nip46Session: { clientSk: Uint8Array; bp: BunkerPointer } | null = null;

/** Live NIP-46 signer (same transport that completed the QR handshake). */
let activeBunkerSigner: BunkerSigner | null = null;

/** Shared pool for BunkerSigner — destroyed on disposeNip46. */
let nip46Pool: SimplePool | null = null;

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

function ensureSession(): { clientSk: Uint8Array; bp: BunkerPointer } | null {
  if (nip46Session) return nip46Session;

  const skHex = localStorage.getItem(NIP46_CLIENT_SK_KEY);
  const bpRaw = localStorage.getItem(NIP46_BP_KEY);
  if (!skHex || !bpRaw) return null;

  let bp: BunkerPointer;
  try { bp = JSON.parse(bpRaw) as BunkerPointer; } catch { return null; }
  if (!bp.pubkey || !Array.isArray(bp.relays) || bp.relays.length === 0) return null;

  bp = { ...bp, relays: sanitizeNip46Relays(bp.relays) };
  localStorage.setItem(NIP46_BP_KEY, JSON.stringify(bp));

  nip46Session = { clientSk: hexToBytes(skHex), bp };
  return nip46Session;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

function getNip46Pool(): SimplePool {
  if (!nip46Pool) {
    nip46Pool = createHandshakePool();
  }
  return nip46Pool;
}

function disposeNip46Pool(): void {
  if (nip46Pool) {
    nip46Pool.destroy();
    nip46Pool = null;
  }
}

function disposeNip46(): void {
  nip46Session = null;
  if (activeBunkerSigner) {
    void activeBunkerSigner.close().catch(() => {});
    activeBunkerSigner = null;
  }
  disposeNip46Pool();
}

/** Open or restore the live BunkerSigner (SimplePool subscription — same path as QR pairing). */
async function ensureBunkerSigner(): Promise<BunkerSigner | null> {
  if (activeBunkerSigner) {
    console.log(DBG, 'ensureBunkerSigner: reuse active connection');
    return activeBunkerSigner;
  }

  const sess = ensureSession();
  if (!sess) {
    console.warn(DBG, 'ensureBunkerSigner: no stored session');
    return null;
  }

  console.log(DBG, 'ensureBunkerSigner: opening bunker', sess.bp.pubkey.slice(0, 12) + '…', sess.bp.relays);

  const signer = BunkerSigner.fromBunker(sess.clientSk, sess.bp, {
    pool: getNip46Pool(),
    onauth: (url) => {
      authUrlHandler?.(url);
    },
  });

  // Nostr Connect QR already completed the handshake — do not call connect() again
  // (Primal often ignores it on restore and it blocks sign_event for ~12s+).
  activeBunkerSigner = signer;
  sess.bp = signer.bp;
  nip46Session = sess;
  localStorage.setItem(NIP46_BP_KEY, JSON.stringify(signer.bp));
  console.log(DBG, 'ensureBunkerSigner: ready on', signer.bp.relays.join(', '));
  return signer;
}

function persistPubkeyFromSigned(signed: Record<string, unknown>): void {
  const signedPk = typeof signed.pubkey === 'string' ? (signed.pubkey as string).toLowerCase() : null;
  const currentPk = localStorage.getItem(STORED_NOSTR_PUBKEY_KEY)?.toLowerCase();
  if (signedPk && /^[0-9a-f]{64}$/.test(signedPk) && signedPk !== currentPk) {
    console.log(DBG, '[sign] ✓ correcting pubkey:', currentPk?.slice(0, 12), '→', signedPk.slice(0, 12));
    localStorage.setItem(STORED_NOSTR_PUBKEY_KEY, signedPk);
  }
}

export function disposeNostrConnectPairingAttempt(): void {
  disposeNip46();
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export type NostrConnectPairing = {
  connectionURI: string;
  finished: Promise<string>;
};

type AuthUrlHandler = (url: string) => void;
let authUrlHandler: AuthUrlHandler | null = null;

export function setNip46AuthUrlHandler(handler: AuthUrlHandler | null): void {
  authUrlHandler = handler;
}

export function getStoredSignerMode(): StoredSignerMode | null {
  const m = localStorage.getItem(SIGNER_MODE_KEY);
  if (m === 'extension' || m === 'nip46' || m === 'nsec') return m;
  return null;
}

/** True when a NIP-46 bunker session is persisted (paired, not necessarily server-linked). */
export function hasStoredNip46Session(): boolean {
  return Boolean(
    getStoredSignerMode() === 'nip46' &&
      localStorage.getItem(NIP46_CLIENT_SK_KEY) &&
      localStorage.getItem(NIP46_BP_KEY)
  );
}

export function resolveSignerMode(): StoredSignerMode | null {
  const explicit = getStoredSignerMode();
  if (explicit) return explicit;
  if (localStorage.getItem(STORED_NOSTR_PUBKEY_KEY) && typeof window !== 'undefined' && window.nostr) {
    return 'extension';
  }
  return null;
}

function resolveNostrConnectAppUrl(explicit?: string): string | undefined {
  const t = explicit?.trim();
  if (t) return t;
  if (typeof window !== 'undefined') return window.location.origin;
  return undefined;
}

function createHandshakePool(): SimplePool {
  return new SimplePool({ maxWaitForConnection: 8_000 } as ConstructorParameters<typeof SimplePool>[0]);
}

async function signEventViaNip46(
  ev: import('@/types/nostr-nip07').NostrUnsignedEvent | import('nostr-tools').EventTemplate,
  timeoutMs: number,
): Promise<import('@/types/nostr-nip07').NostrSignedEvent> {
  const bunker = await ensureBunkerSigner();
  if (bunker) {
    const kind = (ev as { kind?: number }).kind;
    console.log(DBG, '[sign] BunkerSigner.signEvent kind:', kind, '(open Primal if nothing happens)');
    const signed = await Promise.race([
      bunker.signEvent(ev as import('nostr-tools').EventTemplate),
      new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                `sign_event timed out after ${timeoutMs / 1000}s. Open Primal and approve the sign request.`,
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
    console.log(DBG, '[sign] ✓ BunkerSigner signed kind:', kind);
    persistPubkeyFromSigned(signed as unknown as Record<string, unknown>);
    return signed as unknown as import('@/types/nostr-nip07').NostrSignedEvent;
  }

  const sess = ensureSession();
  if (!sess) {
    throw new Error('no_nostr_signer');
  }
  console.log(DBG, '[sign] rawNip46Rpc fallback kind:', (ev as { kind?: number }).kind);
  const resp = await rawNip46Rpc('sign_event', [JSON.stringify(ev)], {
    clientSk: sess.clientSk,
    signerPubkey: sess.bp.pubkey,
    relays: sess.bp.relays,
    timeoutMs,
  });
  const parsed = JSON.parse(resp.result) as Record<string, unknown>;
  persistPubkeyFromSigned(parsed);
  return parsed as unknown as import('@/types/nostr-nip07').NostrSignedEvent;
}

// ---------------------------------------------------------------------------
// beginNostrConnectPairing — QR flow
// ---------------------------------------------------------------------------

export function beginNostrConnectPairing(opts: {
  signal?: AbortSignal;
  appName?: string;
  appUrl?: string;
  relays?: string[];
  onHandshake?: () => void;
}): NostrConnectPairing {
  sessionStorage.removeItem(NSEC_SESSION_SK_KEY);
  disposeNip46();
  const pool = getNip46Pool();

  const clientSk = generateSecretKey();
  const clientPubkey = getPublicKey(clientSk);
  const secretBytes = new Uint8Array(16);
  crypto.getRandomValues(secretBytes);
  const secret = bytesToHex(secretBytes);

  const relays = sanitizeNip46Relays(
    opts.relays?.length ? opts.relays : [...DEFAULT_NOSTR_CONNECT_RELAYS],
  );

  const connectionURI = createNostrConnectURI({
    clientPubkey,
    relays,
    secret,
    name: opts.appName ?? 'Chain Duel',
    url: resolveNostrConnectAppUrl(opts.appUrl),
  });

  console.log(DBG, 'pairing started — client:', clientPubkey.slice(0, 12) + '…', 'relays:', relays);

  const finished = (async (): Promise<string> => {
    const signal = opts.signal;
    if (signal?.aborted) throw new DOMException('Pairing aborted.', 'AbortError');

    const onAbort = () => { disposeNip46(); };
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      console.log(DBG, 'waiting for signer handshake…');
      const signer = await BunkerSigner.fromURI(
        clientSk, connectionURI,
        { pool, onauth: (url) => { authUrlHandler?.(url); } },
        NOSTR_CONNECT_PAIR_WAIT_MS,
      );
      console.log(DBG, '✓ handshake — signer:', signer.bp.pubkey.slice(0, 12) + '…');
      opts.onHandshake?.();

      try {
        const switched = await withTimeout('switch_relays', signer.switchRelays(), 12_000);
        if (switched) {
          console.log(DBG, 'switch_relays →', signer.bp.relays.join(', '));
        }
      } catch (e) {
        console.warn(DBG, 'switch_relays skipped —', (e as Error).message);
      }

      signer.bp = { ...signer.bp, relays: sanitizeNip46Relays(signer.bp.relays) };
      activeBunkerSigner = signer;
      nip46Session = { clientSk, bp: signer.bp };

      console.log(DBG, 'resolving user pubkey via BunkerSigner…');
      let remotePubkey = signer.bp.pubkey;
      try {
        remotePubkey = await signer.getPublicKey();
        console.log(DBG, '✓ get_public_key:', remotePubkey.slice(0, 12) + '…');
      } catch {
        console.log(DBG, 'get_public_key failed — using bunker pubkey as placeholder');
      }

      const pubkey = normalizeNostrPubkeyHex(remotePubkey);
      const isPlaceholder = pubkey === signer.bp.pubkey.toLowerCase();
      if (!isPlaceholder) console.log(DBG, '✓ user:', npubEncode(pubkey));

      localStorage.setItem(STORED_NOSTR_PUBKEY_KEY, pubkey);
      localStorage.setItem(SIGNER_MODE_KEY, 'nip46');
      localStorage.setItem(NIP46_CLIENT_SK_KEY, bytesToHex(clientSk));
      localStorage.setItem(NIP46_BP_KEY, JSON.stringify(signer.bp));

      return pubkey;
    } catch (err) {
      console.error(DBG, 'pairing FAILED:', err);
      disposeNip46();
      throw err;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  })();

  return { connectionURI, finished };
}

// ---------------------------------------------------------------------------
// clearSignerSession
// ---------------------------------------------------------------------------

export function clearSignerSession(): void {
  disposeNip46();
  sessionStorage.removeItem(NSEC_SESSION_SK_KEY);
  localStorage.removeItem(STORED_NOSTR_PUBKEY_KEY);
  localStorage.removeItem(SIGNER_MODE_KEY);
  localStorage.removeItem(NIP46_CLIENT_SK_KEY);
  localStorage.removeItem(NIP46_BP_KEY);
}

// ---------------------------------------------------------------------------
// connectNostrConnect — bunker:// URL flow
// ---------------------------------------------------------------------------

export async function connectNostrConnect(bunkerInput: string): Promise<string> {
  const trimmed = bunkerInput.trim();
  if (!trimmed) throw new Error('Paste a bunker URL or a NIP-05 identifier.');

  const bp = await parseBunkerInput(trimmed);
  if (!bp || bp.relays.length === 0) {
    throw new Error('Could not resolve Nostr Connect relays.');
  }

  sessionStorage.removeItem(NSEC_SESSION_SK_KEY);
  disposeNip46();
  const clientSk = generateSecretKey();

  try {
    nip46Session = { clientSk, bp };
    const signer = BunkerSigner.fromBunker(clientSk, bp, {
      pool: getNip46Pool(),
      onauth: (url) => {
        authUrlHandler?.(url);
      },
    });
    if (bp.secret) {
      await signer.connect();
    }
    try {
      await withTimeout('switch_relays', signer.switchRelays(), 12_000);
    } catch {
      /* optional */
    }
    signer.bp = { ...signer.bp, relays: sanitizeNip46Relays(signer.bp.relays) };
    activeBunkerSigner = signer;
    nip46Session = { clientSk, bp: signer.bp };

    const pubkey = normalizeNostrPubkeyHex(await signer.getPublicKey());

    localStorage.setItem(STORED_NOSTR_PUBKEY_KEY, pubkey);
    localStorage.setItem(SIGNER_MODE_KEY, 'nip46');
    localStorage.setItem(NIP46_CLIENT_SK_KEY, bytesToHex(clientSk));
    localStorage.setItem(NIP46_BP_KEY, JSON.stringify(signer.bp));

    return pubkey;
  } catch (err) {
    disposeNip46();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// nsec helpers
// ---------------------------------------------------------------------------

function parseNsecInput(input: string): Uint8Array {
  const t = input.trim();
  if (!t) throw new Error('Empty key.');
  if (t.toLowerCase().startsWith('nsec')) {
    try {
      const decoded = nip19Decode(t);
      if (decoded.type !== 'nsec') throw new Error('Expected an nsec1… bech32 key.');
      return decoded.data;
    } catch { throw new Error('Invalid nsec encoding.'); }
  }
  const hex = t.replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('Expected nsec1… or a 64-character hex private key.');
  return hexToBytes(hex.toLowerCase());
}

export async function connectNsecFromInput(nsecOrHex: string): Promise<string> {
  const sk = parseNsecInput(nsecOrHex);
  const signer = new PlainKeySigner(sk);
  const pubkey = normalizeNostrPubkeyHex(await signer.getPublicKey());

  sessionStorage.setItem(NSEC_SESSION_SK_KEY, bytesToHex(sk));
  localStorage.setItem(STORED_NOSTR_PUBKEY_KEY, pubkey);
  localStorage.setItem(SIGNER_MODE_KEY, 'nsec');
  disposeNip46();
  return pubkey;
}

// ---------------------------------------------------------------------------
// getActiveNostrSigner
// ---------------------------------------------------------------------------

export async function getActiveNostrSigner(): Promise<NostrNip07Provider | null> {
  const mode = resolveSignerMode();
  const storedPk = localStorage.getItem(STORED_NOSTR_PUBKEY_KEY);

  if (mode === 'nip46') {
    if (!ensureSession()) return null;

    return {
      getPublicKey: async () => {
        const bunker = await ensureBunkerSigner();
        if (bunker) {
          try {
            const pk = await bunker.getPublicKey();
            localStorage.setItem(STORED_NOSTR_PUBKEY_KEY, normalizeNostrPubkeyHex(pk));
            return pk;
          } catch {
            /* fall through */
          }
        }
        return localStorage.getItem(STORED_NOSTR_PUBKEY_KEY) ?? '';
      },
      signEvent: async (ev) => {
        const kind = (ev as { kind?: number }).kind;
        const timeoutMs = kind === 9734 ? 90_000 : 60_000;
        return signEventViaNip46(ev, timeoutMs);
      },
    };
  }

  if (mode === 'nsec') {
    const skHex = sessionStorage.getItem(NSEC_SESSION_SK_KEY);
    if (!skHex || !storedPk) return null;
    try {
      const signer = new PlainKeySigner(hexToBytes(skHex));
      const pk = await signer.getPublicKey();
      if (pk.toLowerCase() !== storedPk.toLowerCase()) return null;
      return {
        getPublicKey: () => signer.getPublicKey(),
        signEvent: (ev) => signer.signEvent(ev),
      };
    } catch { return null; }
  }

  if (mode === 'extension' || (mode === null && storedPk && window.nostr)) {
    if (window.nostr) return window.nostr;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Ping & recovery
// ---------------------------------------------------------------------------

export function isNsecSessionMissing(): boolean {
  return getStoredSignerMode() === 'nsec' && !sessionStorage.getItem(NSEC_SESSION_SK_KEY);
}

export function recordExtensionSignIn(pubkey: string): void {
  sessionStorage.removeItem(NSEC_SESSION_SK_KEY);
  disposeNip46();
  localStorage.setItem(STORED_NOSTR_PUBKEY_KEY, normalizeNostrPubkeyHex(pubkey));
  localStorage.setItem(SIGNER_MODE_KEY, 'extension');
}

export type Nip46PingResult = {
  status: 'ok' | 'timeout' | 'unavailable';
  recoveredPubkey?: string;
};

export async function pingNip46Signer(): Promise<Nip46PingResult> {
  console.log(DBG, '[ping] verifying session…');
  if (!ensureSession()) return { status: 'unavailable' };

  try {
    const signed = await signEventViaNip46(
      {
        kind: 27235,
        content: '',
        tags: [['u', 'https://chainduel.app'], ['method', 'GET']],
        created_at: Math.floor(Date.now() / 1000),
      },
      30_000,
    );
    const userPk = typeof signed.pubkey === 'string' ? signed.pubkey.toLowerCase() : null;
    if (userPk && /^[0-9a-f]{64}$/.test(userPk)) {
      const storedPk = localStorage.getItem(STORED_NOSTR_PUBKEY_KEY)?.toLowerCase();
      if (userPk !== storedPk) {
        console.log(DBG, '[ping] ✓ correcting pubkey:', storedPk?.slice(0, 12), '→', userPk.slice(0, 12));
        localStorage.setItem(STORED_NOSTR_PUBKEY_KEY, userPk);
        return { status: 'ok', recoveredPubkey: userPk };
      }
      console.log(DBG, '[ping] ✓ signer live');
      return { status: 'ok' };
    }
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('timed out')) {
      console.log(DBG, '[ping] timeout — signer sleeping');
      return { status: 'timeout' };
    }
    console.warn(DBG, '[ping] error:', msg);
  }
  return { status: 'timeout' };
}

export async function recoverNip46UserPubkey(): Promise<string | null> {
  if (getStoredSignerMode() !== 'nip46') return null;
  const storedPk = localStorage.getItem(STORED_NOSTR_PUBKEY_KEY);
  if (!storedPk) return null;

  if (!ensureSession()) return null;

  try {
    const signed = await signEventViaNip46(
      {
        kind: 27235,
        content: '',
        tags: [['u', 'https://chainduel.app'], ['method', 'GET']],
        created_at: Math.floor(Date.now() / 1000),
      },
      20_000,
    );
    const recovered = typeof signed.pubkey === 'string' ? signed.pubkey.toLowerCase() : null;
    if (!recovered || !/^[0-9a-f]{64}$/.test(recovered)) return null;
    if (recovered === storedPk.toLowerCase()) return null;
    console.log(DBG, '[recover] ✓ corrected:', storedPk.slice(0, 12), '→', recovered.slice(0, 12));
    localStorage.setItem(STORED_NOSTR_PUBKEY_KEY, recovered);
    return recovered;
  } catch {
    return null;
  }
}
