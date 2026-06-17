/**
 * Unified Nostr signing: NIP-07 extension, Nostr Connect (NIP-46 / "bunker"), or nsec (session-only).
 *
 * Architecture (NIP-46):
 * - BunkerSigner.fromURI for QR handshake only, then close
 * - Signer relay list from switch_relays / bunker pointer (signer-first)
 * - All RPC (get_public_key, sign_event, ping) via raw WebSocket to relays
 * - Pubkey placeholder until first sign_event corrects it
 */

import {
  BunkerSigner,
  createNostrConnectURI,
  parseBunkerInput,
  type BunkerPointer,
} from 'nostr-tools/nip46';
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from 'nostr-tools/pure';
import { PlainKeySigner } from 'nostr-tools/signer';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import { decode as nip19Decode } from 'nostr-tools/nip19';
import { SimplePool } from 'nostr-tools/pool';
import { decrypt as nip04Decrypt } from 'nostr-tools/nip04';
import {
  getConversationKey,
  encrypt as nip44Encrypt,
  decrypt as nip44Decrypt,
} from 'nostr-tools/nip44';

import type { NostrNip07Provider } from '@/types/nostr-nip07';
import {
  consumePendingSignFlow,
  createFlowTrace,
  relayHost,
} from '@/lib/nostr/nip46Trace';
import {
  normalizeSignerRelays,
  parseSwitchRelaysResult,
  relaysForNip46Rpc,
  relaysForNostrConnectQr,
} from '@/lib/nostr/nip46Relays';

export {
  DEFAULT_NOSTR_CONNECT_RELAYS,
  sanitizeNip46Relays,
} from '@/lib/nostr/nip46Relays';

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

const NOSTR_CONNECT_PAIR_WAIT_MS = 8 * 60 * 1000;
const DBG = '[NIP-46]';

function withTimeout<T>(label: string, p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
        ms
      );
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Raw WebSocket NIP-46 RPC
// ---------------------------------------------------------------------------

async function rawNip46Rpc(
  method: string,
  params: string[],
  opts: {
    clientSk: Uint8Array;
    signerPubkey: string;
    relays: string[];
    timeoutMs?: number;
    traceFlow?: string;
  }
): Promise<{ id: string; result: string; error?: string }> {
  const {
    clientSk,
    signerPubkey,
    relays,
    timeoutMs = 60_000,
    traceFlow,
  } = opts;
  const skHex = bytesToHex(clientSk);
  const clientPubkey = getPublicKey(clientSk);
  const relayList = relaysForNip46Rpc(relays);

  const reqId = crypto.randomUUID();
  const requestPayload = JSON.stringify({ id: reqId, method, params });
  const convKey = getConversationKey(clientSk, signerPubkey);
  const encryptedContent = nip44Encrypt(requestPayload, convKey);

  const requestEvent = finalizeEvent(
    {
      kind: 24133,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', signerPubkey]],
      content: encryptedContent,
    },
    clientSk
  );

  const filter = {
    kinds: [24133],
    '#p': [clientPubkey],
    since: Math.floor(Date.now() / 1000) - 300,
  };

  const flow = traceFlow ?? method;
  const trace = createFlowTrace('relay', flow);
  trace.step(
    'rpc start',
    `id=${reqId.slice(0, 8)}… bunker=${signerPubkey.slice(0, 12)}… → ${relayList.map(relayHost).join(', ')}`
  );

  return new Promise((resolve, reject) => {
    let settled = false;
    let requestPublished = false;
    let publishReason = '';
    const sockets: WebSocket[] = [];
    const wsHost = new WeakMap<WebSocket, string>();
    const subId = `rpc${reqId.slice(0, 8)}`;

    const publishRequest = (reason: string) => {
      if (requestPublished || settled) return;
      requestPublished = true;
      publishReason = reason;
      let count = 0;
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify(['EVENT', requestEvent]));
            count += 1;
          } catch {
            /* ignore */
          }
        }
      }
      trace.step('EVENT published', `${reason} → ${count} open relay(s)`);
    };

    const finish = (
      result: { id: string; result: string; error?: string } | null,
      err?: Error
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(publishFallback);
      for (const ws of sockets) {
        try {
          ws.send(JSON.stringify(['CLOSE', subId]));
          ws.close();
        } catch {
          /* ignore */
        }
      }
      if (err) {
        trace.fail('rpc', err);
        reject(err);
      } else {
        trace.done(publishReason ? `via ${publishReason}` : undefined);
        resolve(result!);
      }
    };

    const handlePlain = (plain: string, fromHost: string) => {
      let parsed: { id?: string; result?: string; error?: string };
      try {
        parsed = JSON.parse(plain) as {
          id?: string;
          result?: string;
          error?: string;
        };
      } catch {
        return;
      }
      if (parsed.id !== reqId) return;

      if (parsed.result === 'auth_url' && parsed.error) {
        trace.step('auth_url', `${fromHost} — open signer app to approve`);
        authUrlHandler?.(parsed.error);
        return;
      }
      if (parsed.error) {
        finish(null, new Error(String(parsed.error)));
        return;
      }
      if (parsed.result !== undefined) {
        trace.step('RPC response', fromHost);
        finish(parsed as { id: string; result: string; error?: string });
      }
    };

    const timer = setTimeout(
      () =>
        finish(
          null,
          new Error(`${method} timed out after ${timeoutMs / 1000}s`)
        ),
      timeoutMs
    );

    const publishFallback = setTimeout(
      () => publishRequest('3s fallback (no EOSE)'),
      3_000
    );

    for (const relayUrl of relayList) {
      const host = relayHost(relayUrl);
      let ws: WebSocket;
      try {
        ws = new WebSocket(relayUrl);
      } catch {
        continue;
      }
      sockets.push(ws);
      wsHost.set(ws, host);

      ws.onopen = () => {
        trace.step(`${host} connected`, 'subscription REQ sent');
        try {
          ws.send(JSON.stringify(['REQ', subId, filter]));
        } catch {
          /* ignore */
        }
      };

      ws.onmessage = (msgEv) => {
        if (settled) return;
        void (async () => {
          try {
            const msg = JSON.parse(msgEv.data as string) as unknown[];
            const fromHost = wsHost.get(ws) ?? host;
            if (msg[0] === 'EOSE' && msg[1] === subId) {
              publishRequest(`${fromHost} EOSE`);
              return;
            }
            if (msg[0] !== 'EVENT' || msg[1] !== subId) return;
            const ev = msg[2] as {
              pubkey?: string;
              content?: string;
              kind?: number;
            };
            if (!ev || ev.kind !== 24133 || !ev.content || !ev.pubkey) return;

            let plain: string | null = null;
            const storedUserPk = localStorage
              .getItem(STORED_NOSTR_PUBKEY_KEY)
              ?.toLowerCase();
            const authorCandidates = [ev.pubkey, signerPubkey.toLowerCase()];
            if (
              storedUserPk &&
              /^[0-9a-f]{64}$/.test(storedUserPk) &&
              !authorCandidates.includes(storedUserPk)
            ) {
              authorCandidates.push(storedUserPk);
            }
            for (const author of authorCandidates) {
              try {
                plain = nip44Decrypt(
                  ev.content,
                  getConversationKey(clientSk, author)
                );
                if (plain) break;
              } catch {
                /* try next */
              }
            }
            if (!plain) {
              try {
                plain = await nip04Decrypt(skHex, ev.pubkey, ev.content);
              } catch {
                try {
                  plain = await nip04Decrypt(skHex, signerPubkey, ev.content);
                } catch {
                  return;
                }
              }
            }
            if (!plain) return;
            handlePlain(plain, fromHost);
          } catch {
            /* ignore malformed */
          }
        })();
      };

      ws.onerror = () => {
        trace.step(`${host} error`, 'WebSocket error (other relays may work)');
      };
    }
  });
}

async function nip46GetPublicKey(timeoutMs: number): Promise<string> {
  const sess = ensureSession();
  if (!sess) throw new Error('no_nostr_signer');
  return rawNip46GetPublicKey(sess, timeoutMs);
}

async function rawNip46GetPublicKey(
  sess: { clientSk: Uint8Array; bp: BunkerPointer },
  timeoutMs: number
): Promise<string> {
  const resp = await rawNip46Rpc('get_public_key', [], {
    clientSk: sess.clientSk,
    signerPubkey: sess.bp.pubkey,
    relays: sess.bp.relays,
    timeoutMs,
  });
  return normalizeNostrPubkeyHex(resp.result);
}

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let nip46Session: { clientSk: Uint8Array; bp: BunkerPointer } | null = null;

/** Shared pool for QR handshake only — destroyed before raw RPC. */
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
  try {
    bp = JSON.parse(bpRaw) as BunkerPointer;
  } catch {
    return null;
  }
  if (!bp.pubkey || !Array.isArray(bp.relays) || bp.relays.length === 0)
    return null;

  bp = { ...bp, relays: normalizeSignerRelays(bp.relays) };
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
  disposeNip46Pool();
}

function persistNip46BunkerPointer(bp: BunkerPointer): void {
  const normalized = { ...bp, relays: normalizeSignerRelays(bp.relays) };
  if (nip46Session) {
    nip46Session = { ...nip46Session, bp: normalized };
  }
  localStorage.setItem(NIP46_BP_KEY, JSON.stringify(normalized));
}

function finishNip46Handshake(
  signer: BunkerSigner,
  clientSk: Uint8Array
): BunkerPointer {
  const bp = { ...signer.bp, relays: normalizeSignerRelays(signer.bp.relays) };
  nip46Session = { clientSk, bp };
  void signer.close();
  disposeNip46Pool();
  localStorage.setItem(NIP46_BP_KEY, JSON.stringify(bp));
  return bp;
}

/** NIP-46: ask the bunker for its preferred relay set and persist if changed. */
async function refreshSignerRelaysFromBunker(
  sess: { clientSk: Uint8Array; bp: BunkerPointer },
  timeoutMs = 10_000
): Promise<boolean> {
  try {
    const resp = await rawNip46Rpc('switch_relays', [], {
      clientSk: sess.clientSk,
      signerPubkey: sess.bp.pubkey,
      relays: sess.bp.relays,
      timeoutMs,
      traceFlow: 'switch_relays',
    });
    const updated = parseSwitchRelaysResult(resp.result);
    if (!updated) return false;
    const prev = normalizeSignerRelays(sess.bp.relays);
    if (JSON.stringify(updated) === JSON.stringify(prev)) return false;
    persistNip46BunkerPointer({ ...sess.bp, relays: updated });
    console.log(
      DBG,
      '[switch_relays] updated:',
      updated.map(relayHost).join(', ')
    );
    return true;
  } catch {
    return false;
  }
}

function persistPubkeyFromSigned(signed: Record<string, unknown>): void {
  const signedPk =
    typeof signed.pubkey === 'string'
      ? (signed.pubkey as string).toLowerCase()
      : null;
  const currentPk = localStorage
    .getItem(STORED_NOSTR_PUBKEY_KEY)
    ?.toLowerCase();
  if (signedPk && /^[0-9a-f]{64}$/.test(signedPk) && signedPk !== currentPk) {
    console.log(
      DBG,
      '[sign] ✓ correcting pubkey:',
      currentPk?.slice(0, 12),
      '→',
      signedPk.slice(0, 12)
    );
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
  if (
    localStorage.getItem(STORED_NOSTR_PUBKEY_KEY) &&
    typeof window !== 'undefined' &&
    window.nostr
  ) {
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
  return new SimplePool({
    maxWaitForConnection: 8_000,
  } as ConstructorParameters<typeof SimplePool>[0]);
}

async function signEventViaNip46(
  ev:
    | import('@/types/nostr-nip07').NostrUnsignedEvent
    | import('nostr-tools').EventTemplate,
  timeoutMs: number
): Promise<import('@/types/nostr-nip07').NostrSignedEvent> {
  const kind = (ev as { kind?: number }).kind;
  const sess = ensureSession();
  if (!sess) throw new Error('no_nostr_signer');

  const traceFlow = consumePendingSignFlow(`sign_event/kind-${kind ?? '?'}`);
  const resp = await rawNip46Rpc('sign_event', [JSON.stringify(ev)], {
    clientSk: sess.clientSk,
    signerPubkey: sess.bp.pubkey,
    relays: sess.bp.relays,
    timeoutMs,
    traceFlow,
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

  const relays = relaysForNostrConnectQr(
    opts.relays?.length ? opts.relays : undefined
  );

  const connectionURI = createNostrConnectURI({
    clientPubkey,
    relays,
    secret,
    name: opts.appName ?? 'Chain Duel',
    url: resolveNostrConnectAppUrl(opts.appUrl),
  });

  const trace = createFlowTrace('pairing', 'qr-connect');
  trace.step(
    'start',
    `client=${clientPubkey.slice(0, 12)}… relays=${relays.map(relayHost).join(', ')}`
  );

  const finished = (async (): Promise<string> => {
    const signal = opts.signal;
    if (signal?.aborted)
      throw new DOMException('Pairing aborted.', 'AbortError');

    const onAbort = () => {
      disposeNip46();
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      trace.step('waiting for handshake', 'BunkerSigner.fromURI + pool');
      const signer = await BunkerSigner.fromURI(
        clientSk,
        connectionURI,
        {
          pool,
          onauth: (url) => {
            authUrlHandler?.(url);
            trace.step('auth_url', url.slice(0, 60));
          },
        },
        NOSTR_CONNECT_PAIR_WAIT_MS
      );
      trace.step('handshake ok', `bunker=${signer.bp.pubkey.slice(0, 12)}…`);
      opts.onHandshake?.();

      signer.bp = {
        ...signer.bp,
        relays: normalizeSignerRelays(signer.bp.relays),
      };
      const bp = finishNip46Handshake(signer, clientSk);
      await refreshSignerRelaysFromBunker({ clientSk, bp }, 8_000);
      const pubkey = normalizeNostrPubkeyHex(bp.pubkey);

      localStorage.setItem(STORED_NOSTR_PUBKEY_KEY, pubkey);
      localStorage.setItem(SIGNER_MODE_KEY, 'nip46');
      localStorage.setItem(NIP46_CLIENT_SK_KEY, bytesToHex(clientSk));
      localStorage.setItem(
        NIP46_BP_KEY,
        JSON.stringify(ensureSession()?.bp ?? bp)
      );

      trace.done('session saved — user pubkey resolves on server-link sign');
      return pubkey;
    } catch (err) {
      trace.fail('pairing', err);
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

export async function connectNostrConnect(
  bunkerInput: string
): Promise<string> {
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
    const pool = getNip46Pool();
    const signer = BunkerSigner.fromBunker(clientSk, bp, {
      pool,
      onauth: (url) => {
        authUrlHandler?.(url);
      },
    });
    if (bp.secret) {
      try {
        await withTimeout('connect', signer.connect(), 12_000);
      } catch {
        /* optional */
      }
    }

    const finishedBp = finishNip46Handshake(signer, clientSk);
    await refreshSignerRelaysFromBunker({ clientSk, bp: finishedBp }, 8_000);
    const bpForRpc = ensureSession()?.bp ?? finishedBp;

    let pubkey: string;
    try {
      pubkey = await rawNip46GetPublicKey(
        { clientSk, bp: bpForRpc },
        10_000
      );
    } catch {
      pubkey = normalizeNostrPubkeyHex(finishedBp.pubkey);
    }

    localStorage.setItem(STORED_NOSTR_PUBKEY_KEY, pubkey);
    localStorage.setItem(SIGNER_MODE_KEY, 'nip46');
    localStorage.setItem(NIP46_CLIENT_SK_KEY, bytesToHex(clientSk));
    localStorage.setItem(NIP46_BP_KEY, JSON.stringify(ensureSession()?.bp ?? finishedBp));

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
      if (decoded.type !== 'nsec')
        throw new Error('Expected an nsec1… bech32 key.');
      return decoded.data;
    } catch {
      throw new Error('Invalid nsec encoding.');
    }
  }
  const hex = t.replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(hex))
    throw new Error('Expected nsec1… or a 64-character hex private key.');
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
        const stored = localStorage.getItem(STORED_NOSTR_PUBKEY_KEY);
        if (stored) return stored;
        try {
          return await nip46GetPublicKey(8_000);
        } catch {
          return '';
        }
      },
      signEvent: async (ev) => {
        const kind = (ev as { kind?: number }).kind;
        const timeoutMs = kind === 9734 ? 90_000 : 90_000;
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
    } catch {
      return null;
    }
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
  return (
    getStoredSignerMode() === 'nsec' &&
    !sessionStorage.getItem(NSEC_SESSION_SK_KEY)
  );
}

export function recordExtensionSignIn(pubkey: string): void {
  sessionStorage.removeItem(NSEC_SESSION_SK_KEY);
  disposeNip46();
  localStorage.setItem(
    STORED_NOSTR_PUBKEY_KEY,
    normalizeNostrPubkeyHex(pubkey)
  );
  localStorage.setItem(SIGNER_MODE_KEY, 'extension');
}

export type Nip46PingResult = {
  status: 'ok' | 'timeout' | 'unavailable';
  recoveredPubkey?: string;
};

export async function pingNip46Signer(): Promise<Nip46PingResult> {
  console.log(DBG, '[ping] verifying session…');
  const sess = ensureSession();
  if (!sess) return { status: 'unavailable' };

  const PING_MS = 8_000;
  try {
    const resp = await rawNip46Rpc('ping', [], {
      clientSk: sess.clientSk,
      signerPubkey: sess.bp.pubkey,
      relays: sess.bp.relays,
      timeoutMs: PING_MS,
    });
    if (resp.result !== 'pong') {
      throw new Error(`expected pong, got ${resp.result}`);
    }

    const storedPk = localStorage
      .getItem(STORED_NOSTR_PUBKEY_KEY)
      ?.toLowerCase();
    if (storedPk && storedPk === sess.bp.pubkey.toLowerCase()) {
      try {
        const recovered = await nip46GetPublicKey(PING_MS);
        if (recovered !== storedPk) {
          console.log(
            DBG,
            '[ping] ✓ correcting pubkey:',
            storedPk.slice(0, 12),
            '→',
            recovered.slice(0, 12)
          );
          localStorage.setItem(STORED_NOSTR_PUBKEY_KEY, recovered);
          return { status: 'ok', recoveredPubkey: recovered };
        }
      } catch {
        /* keep stored */
      }
    }

    console.log(DBG, '[ping] ✓ signer live');
    return { status: 'ok' };
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('timed out')) {
      console.log(
        DBG,
        '[ping] optional check timed out (sign-in may still be valid)'
      );
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

  const sess = ensureSession();
  if (!sess) return null;

  // Already resolved to the user key (not the bunker service key).
  if (storedPk.toLowerCase() !== sess.bp.pubkey.toLowerCase()) return null;

  try {
    const recovered = await nip46GetPublicKey(10_000);
    if (recovered === storedPk.toLowerCase()) return null;
    console.log(
      DBG,
      '[recover] ✓ corrected:',
      storedPk.slice(0, 12),
      '→',
      recovered.slice(0, 12)
    );
    localStorage.setItem(STORED_NOSTR_PUBKEY_KEY, recovered);
    return recovered;
  } catch {
    return null;
  }
}
