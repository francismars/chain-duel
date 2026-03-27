/**
 * Unified Nostr signing: NIP-07 extension, Nostr Connect (NIP-46 / "bunker"), or nsec (session-only).
 * @see https://nostrconnect.org/
 */

import { SimplePool } from 'nostr-tools/pool';
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
import { getConversationKey, decrypt as nip44Decrypt } from 'nostr-tools/nip44';
import { decrypt as nip04Decrypt, encrypt as nip04Encrypt } from 'nostr-tools/nip04';
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

/**
 * Relays embedded in the `nostrconnect://` URI; the signer publishes the handshake to these.
 * Order: generally reachable relays first (see pool connect timeout). Slow relays are still listed
 * for signer compatibility but may log WebSocket errors in the console without breaking pairing.
 */
export const DEFAULT_NOSTR_CONNECT_RELAYS: string[] = [
  // Primal's remote-signer relay (premium.primal.net is where their mobile signer publishes NIP-46 events)
  'wss://relay.primal.net',
  'wss://premium.primal.net',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://purplepag.es',
  'wss://relay.nostr.band',
  'wss://relay.nsecbunker.com',
];

/** How long `BunkerSigner.fromURI` keeps subscriptions open (and per-relay TCP/WebSocket handshake budget). */
const NOSTR_CONNECT_PAIR_WAIT_MS = 8 * 60 * 1000;

const DBG = '[NIP-46]';

function createNip46Pool(): SimplePool {
  // nostr-tools `SimplePool` constructor typings only list enablePing/enableReconnect; runtime forwards
  // the rest to AbstractSimplePool (see pool.js `super({ verifyEvent, maxWaitForConnection: 3e3, ...options })`).
  const opts = {
    maxWaitForConnection: 20_000,
    onRelayConnectionFailure(url: string) {
      console.warn(DBG, 'relay FAILED to connect:', url);
    },
    onRelayConnectionSuccess(url: string) {
      console.log(DBG, 'relay connected ✓', url);
    },
  } as ConstructorParameters<typeof SimplePool>[0];
  return new SimplePool(opts);
}

/** Wraps a Promise with a ms deadline; rejects with a descriptive error on timeout. */
function withTimeout<T>(label: string, p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
      ms
    );
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

/**
 * Open a raw WebSocket subscription on a subset of relays with NO `authors` filter and
 * listen for any kind-24133 NIP-46 event tagged to our client pubkey.
 *
 * This catches cases where the signer (e.g. Primal) signs RPC responses with the **user's
 * actual key** rather than the dedicated signer / bunker key (`bp.pubkey`).  The nostr-tools
 * `BunkerSigner.setupSubscription` filters `authors:[bp.pubkey]`, so those responses are
 * silently dropped — this sniffer bypasses that filter.
 *
 * Returns `{ signerAuthor, userPubkey }` on success, or `null` on timeout / no valid response.
 */
async function rawNip46Sniff(
  clientSk: Uint8Array,
  clientPubkeyHex: string,
  relayUrls: string[],
  timeoutMs: number
): Promise<{ signerAuthor: string; userPubkey: string } | null> {
  return new Promise((resolve) => {
    let resolved = false;
    const sockets: WebSocket[] = [];

    const finish = (result: { signerAuthor: string; userPubkey: string } | null) => {
      if (resolved) return;
      resolved = true;
      for (const ws of sockets) {
        try { ws.close(); } catch { /* ignore */ }
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      console.warn(DBG, '[sniff] timed out after', timeoutMs / 1000, 's — no broad-filter response received');
      finish(null);
    }, timeoutMs);

    const subId = `sniff${Math.random().toString(36).slice(2, 10)}`;

    for (const relayUrl of relayUrls) {
      let ws: WebSocket;
      try {
        ws = new WebSocket(relayUrl);
      } catch {
        continue;
      }
      sockets.push(ws);

      ws.onopen = () => {
        try {
          ws.send(
            JSON.stringify(['REQ', subId, { kinds: [24133], '#p': [clientPubkeyHex], limit: 0 }])
          );
          console.log(DBG, '[sniff] subscribed (no authors filter) on', relayUrl);
        } catch { /* ignore */ }
      };

      ws.onmessage = (msgEv) => {
        if (resolved) return;
        void (async () => {
          try {
            const msg = JSON.parse(msgEv.data as string) as unknown[];
            if (msg[0] !== 'EVENT' || msg[1] !== subId) return;
            const ev = msg[2] as { pubkey?: string; content?: string; kind?: number };
            if (!ev || ev.kind !== 24133 || !ev.pubkey || !ev.content) return;

            const authorPubkey = ev.pubkey.toLowerCase();
            console.log(DBG, '[sniff] kind-24133 event from', authorPubkey, '(client bp.pubkey may differ)');

            // Try NIP-44 first, then NIP-04 as fallback (Primal historically used NIP-04).
            let plain: string | null = null;
            try {
              const convKey = getConversationKey(clientSk, ev.pubkey);
              plain = nip44Decrypt(ev.content, convKey);
              console.log(DBG, '[sniff] NIP-44 decrypt succeeded');
            } catch {
              try {
                plain = await nip04Decrypt(clientSk, ev.pubkey, ev.content);
                console.log(DBG, '[sniff] NIP-04 decrypt succeeded (signer uses older encryption)');
              } catch (decErr) {
                console.warn(DBG, '[sniff] both NIP-44 and NIP-04 decrypt failed for author', authorPubkey, decErr);
              }
            }
            if (plain) {
              try {
                const parsed = JSON.parse(plain) as { id?: string; result?: string; error?: string | null };
                console.log(DBG, '[sniff] decrypted payload:', JSON.stringify(parsed));
                const result = parsed.result;
                if (typeof result === 'string' && /^[0-9a-f]{64}$/.test(result.trim().toLowerCase())) {
                  const userPubkey = result.trim().toLowerCase();
                  console.log(DBG, '[sniff] ✓ valid pubkey in result from author', authorPubkey, '→', userPubkey);
                  clearTimeout(timer);
                  finish({ signerAuthor: authorPubkey, userPubkey });
                }
              } catch (parseErr) {
                console.warn(DBG, '[sniff] JSON parse failed:', parseErr);
              }
            }
          } catch { /* ignore malformed */ }
        })();
      };

      ws.onerror = () => console.warn(DBG, '[sniff] WS error on', relayUrl);
    }
  });
}

/**
 * Sends a NIP-46 `sign_event` RPC directly over raw WebSockets, encrypted with NIP-04.
 *
 * Why: Primal's signer uses NIP-04 for all NIP-46 RPC traffic. nostr-tools `BunkerSigner`
 * expects NIP-44 responses, so it never recognises Primal's replies and hangs indefinitely.
 * This function mirrors the rawNip46Sniff pattern but for outbound requests.
 */
async function rawNip46SignEvent(
  unsigned: { kind: number; tags: string[][]; content: string; created_at: number },
  timeoutMs = 30_000,
  /**
   * Pass session inline to avoid the localStorage dependency.
   * Required during `beginNostrConnectPairing` — localStorage is only written
   * after pubkey resolution, so this function would otherwise always throw
   * "NIP-46 session data missing" when called from the pairing flow.
   */
  inlineSession?: { clientSk: Uint8Array; bp: BunkerPointer }
): Promise<Record<string, unknown>> {
  let skHex: string;
  let bp: BunkerPointer;
  let clientSk: Uint8Array;

  if (inlineSession) {
    clientSk = inlineSession.clientSk;
    skHex = bytesToHex(clientSk);
    bp = inlineSession.bp;
  } else {
    const storedSkHex = localStorage.getItem(NIP46_CLIENT_SK_KEY);
    const bpRaw = localStorage.getItem(NIP46_BP_KEY);
    if (!storedSkHex || !bpRaw) throw new Error('NIP-46 session data missing');
    skHex = storedSkHex;
    bp = JSON.parse(bpRaw) as BunkerPointer;
    clientSk = hexToBytes(skHex);
  }

  const clientPubkey = getPublicKey(clientSk);
  const walletPubkey = bp.pubkey;
  const relays: string[] = bp.relays ?? [];

  const reqId = Math.random().toString(36).slice(2, 12);
  // NIP-46 spec: all params/results are strings — event must be JSON-stringified
  const requestPayload = JSON.stringify({
    id: reqId,
    method: 'sign_event',
    params: [JSON.stringify(unsigned)],
  });

  // Encrypt with NIP-04 — Primal's signer speaks NIP-04 for all RPC traffic.
  const encryptedContent = await nip04Encrypt(skHex, walletPubkey, requestPayload);

  const requestEvent = finalizeEvent(
    {
      kind: 24133,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', walletPubkey]],
      content: encryptedContent,
    },
    clientSk
  );

  console.log(DBG, '[rawSign] sending sign_event RPC', reqId, 'kind:', unsigned.kind, '→', relays.length, 'relays');

  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let settled = false;
    const sockets: WebSocket[] = [];
    const subId = `sign${reqId}`;

    const finish = (result: Record<string, unknown> | null, err?: Error) => {
      if (settled) return;
      settled = true;
      for (const ws of sockets) {
        try { ws.send(JSON.stringify(['CLOSE', subId])); ws.close(); } catch { /* ignore */ }
      }
      if (err) { console.warn(DBG, '[rawSign] failed:', err.message); reject(err); }
      else { console.log(DBG, '[rawSign] ✓ signed event received'); resolve(result!); }
    };

    const timer = setTimeout(
      () => finish(null, new Error('sign_event RPC timed out — signer did not respond')),
      timeoutMs
    );

    for (const relayUrl of relays) {
      let ws: WebSocket;
      try { ws = new WebSocket(relayUrl); } catch { continue; }
      sockets.push(ws);

      ws.onopen = () => {
        try {
          // No `authors` filter — Primal's signer may respond from a different key
          // than bp.pubkey (same issue seen in rawNip46Sniff). Use `#p` to limit to
          // events addressed to the client, and correlate by reqId after decryption.
          ws.send(JSON.stringify(['REQ', subId, {
            kinds: [24133],
            '#p': [clientPubkey],
            since: Math.floor(Date.now() / 1000) - 5,
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

            // Try NIP-44 first, then NIP-04 (Primal uses NIP-04).
            let plain: string | null = null;
            try {
              plain = nip44Decrypt(ev.content, getConversationKey(clientSk, ev.pubkey));
            } catch {
              try {
                plain = await nip04Decrypt(skHex, ev.pubkey, ev.content);
              } catch { /* ignore */ }
            }
            if (!plain) return;

            const parsed = JSON.parse(plain) as { id?: string; result?: unknown; error?: string | null };
            if (parsed.id !== reqId) return;
            if (parsed.error) { finish(null, new Error(String(parsed.error))); return; }
            if (parsed.result) {
              clearTimeout(timer);
              // Per NIP-46 spec result is a JSON string; handle both string and object
              const signed: Record<string, unknown> =
                typeof parsed.result === 'string'
                  ? JSON.parse(parsed.result) as Record<string, unknown>
                  : parsed.result as Record<string, unknown>;
              finish(signed);
            }
          } catch { /* ignore malformed */ }
        })();
      };

      ws.onerror = () => console.warn(DBG, '[rawSign] WS error on', relayUrl);
    }
  });
}

/**
 * Sends a NIP-46 `get_public_key` RPC directly over raw WebSockets using NIP-04 encryption.
 *
 * Why: BunkerSigner.getPublicKey() encrypts with NIP-44; Primal's signer uses NIP-04 and never
 * responds to NIP-44 requests, causing a timeout of up to 50 seconds. This function sends the
 * same RPC with NIP-04 so Primal can decrypt, sign, and reply within a few seconds.
 *
 * @param clientSk     The client private key (Uint8Array)
 * @param signerPubkey The remote-signer pubkey (bp.pubkey) to p-tag and encrypt to
 * @param relays       Relay URLs to connect to
 * @param timeoutMs    Max wait for response (default 15 s)
 */
async function rawNip46GetPublicKey(
  clientSk: Uint8Array,
  signerPubkey: string,
  relays: string[],
  timeoutMs = 15_000
): Promise<string | null> {
  const skHex = bytesToHex(clientSk);
  const clientPubkey = getPublicKey(clientSk);

  const reqId = Math.random().toString(36).slice(2, 12);
  const requestPayload = JSON.stringify({ id: reqId, method: 'get_public_key', params: [] });

  const encryptedContent = await nip04Encrypt(skHex, signerPubkey, requestPayload);
  const requestEvent = finalizeEvent(
    {
      kind: 24133,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', signerPubkey]],
      content: encryptedContent,
    },
    clientSk
  );

  console.log(DBG, '[rawGPK] sending get_public_key RPC', reqId, '→', relays.length, 'relays');

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const sockets: WebSocket[] = [];
    const subId = `gpk${reqId}`;

    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      for (const ws of sockets) {
        try { ws.send(JSON.stringify(['CLOSE', subId])); ws.close(); } catch { /* ignore */ }
      }
      if (result) console.log(DBG, '[rawGPK] ✓ user pubkey:', result);
      else console.warn(DBG, '[rawGPK] timed out — no response from signer');
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    for (const relayUrl of relays) {
      let ws: WebSocket;
      try { ws = new WebSocket(relayUrl); } catch { continue; }
      sockets.push(ws);

      ws.onopen = () => {
        try {
          ws.send(JSON.stringify(['REQ', subId, {
            kinds: [24133],
            '#p': [clientPubkey],
            since: Math.floor(Date.now() / 1000) - 5,
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

            // Try NIP-44 first, then NIP-04 (Primal uses NIP-04)
            let plain: string | null = null;
            try {
              plain = nip44Decrypt(ev.content, getConversationKey(clientSk, ev.pubkey));
            } catch {
              try {
                plain = await nip04Decrypt(skHex, ev.pubkey, ev.content);
              } catch { /* ignore */ }
            }
            if (!plain) return;

            const parsed = JSON.parse(plain) as { id?: string; result?: string; error?: string | null };
            if (parsed.id !== reqId) return;
            if (parsed.error) { finish(null); return; }
            // result is a 64-char hex pubkey string
            if (parsed.result && /^[0-9a-f]{64}$/i.test(parsed.result)) {
              clearTimeout(timer);
              finish(parsed.result.toLowerCase());
            }
          } catch { /* ignore malformed */ }
        })();
      };

      ws.onerror = () => console.warn(DBG, '[rawGPK] WS error on', relayUrl);
    }
  });
}

export type NostrConnectPairing = {
  connectionURI: string;
  /** Resolves with the user pubkey hex when the signer completes the scan / handshake. */
  finished: Promise<string>;
};

let bunkerSigner: BunkerSigner | null = null;
let nip46Pool: SimplePool | null = null;
let nip46EnsurePromise: Promise<boolean> | null = null;

type AuthUrlHandler = (url: string) => void;
let authUrlHandler: AuthUrlHandler | null = null;

/** Register UI handler for NIP-46 `auth_url` (e.g. open Primal / bunker in a new tab after a click). */
export function setNip46AuthUrlHandler(handler: AuthUrlHandler | null): void {
  authUrlHandler = handler;
}

export function getStoredSignerMode(): StoredSignerMode | null {
  const m = localStorage.getItem(SIGNER_MODE_KEY);
  if (m === 'extension' || m === 'nip46' || m === 'nsec') return m;
  return null;
}

export function resolveSignerMode(): StoredSignerMode | null {
  const explicit = getStoredSignerMode();
  if (explicit) return explicit;
  if (localStorage.getItem(STORED_NOSTR_PUBKEY_KEY) && typeof window !== 'undefined' && window.nostr) {
    return 'extension';
  }
  return null;
}

function disposeNip46(): void {
  if (bunkerSigner) {
    void bunkerSigner.close();
    bunkerSigner = null;
  }
  if (nip46Pool) {
    nip46Pool.destroy();
    nip46Pool = null;
  }
  nip46EnsurePromise = null;
}

/** Tear down an in‑flight Nostr Connect pairing (no localStorage). Safe after a failed or cancelled scan. */
export function disposeNostrConnectPairingAttempt(): void {
  disposeNip46();
}

/**
 * `url` query on `nostrconnect://…` (client metadata).
 */
function resolveNostrConnectAppUrl(explicit?: string): string | undefined {
  const t = explicit?.trim();
  if (t) return t;
  if (typeof window !== 'undefined') return window.location.origin;
  return undefined;
}

/**
 * Start client‑initiated Nostr Connect (NIP‑46): build a `nostrconnect://…` URI for Primal / Amber / etc. to scan,
 * and listen on the listed relays for the signer’s reply (`BunkerSigner.fromURI`).
 */
export function beginNostrConnectPairing(opts: {
  signal?: AbortSignal;
  appName?: string;
  appUrl?: string;
  relays?: string[];
  /** Called immediately after the signer's handshake event arrives (fromURI resolves) — before getPublicKey. */
  onHandshake?: () => void;
}): NostrConnectPairing {
  sessionStorage.removeItem(NSEC_SESSION_SK_KEY);
  disposeNip46();
  nip46Pool = createNip46Pool();

  const clientSk = generateSecretKey();
  const clientPubkey = getPublicKey(clientSk);
  const secretBytes = new Uint8Array(16);
  crypto.getRandomValues(secretBytes);
  const secret = bytesToHex(secretBytes);

  const relays = opts.relays?.length ? opts.relays : [...DEFAULT_NOSTR_CONNECT_RELAYS];

  const connectionURI = createNostrConnectURI({
    clientPubkey,
    relays,
    secret,
    name: opts.appName ?? 'Chain Duel',
    url: resolveNostrConnectAppUrl(opts.appUrl),
  });

  console.log(DBG, '── beginNostrConnectPairing ──');
  console.log(DBG, 'clientPubkey:', clientPubkey);
  console.log(DBG, 'secret:', secret);
  console.log(DBG, 'relays:', relays);
  console.log(DBG, 'URI:', connectionURI);

  const finished = (async (): Promise<string> => {
    const signal = opts.signal;
    if (signal?.aborted) {
      throw new DOMException('Pairing aborted.', 'AbortError');
    }

    const onAbort = () => {
      console.log(DBG, 'AbortSignal fired → disposing pool');
      disposeNip46();
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      // IMPORTANT: nostr-tools `fromURI` treats a numeric arg as `maxWait` (long relay connect +
      // subscription lifetime) and a non-number as `AbortSignal` only — with a signal it omits
      // `maxWait`, so the pool falls back to ~3s per-relay handshake and pairing often fails.
      console.log(DBG, 'calling BunkerSigner.fromURI — waiting for Primal handshake event…');
      const signer = await BunkerSigner.fromURI(
        clientSk,
        connectionURI,
        {
          pool: nip46Pool!,
          onauth: (url) => {
            console.log(DBG, 'auth_url received from signer:', url);
            authUrlHandler?.(url);
          },
        },
        NOSTR_CONNECT_PAIR_WAIT_MS
      );
      console.log(DBG, '✓ fromURI resolved! signer.bp:', JSON.stringify(signer.bp));
      bunkerSigner = signer;
      opts.onHandshake?.();

      // In the nostrconnect:// (client-initiated) flow the secret echo IS the connection
      // confirmation. `connect()` is a follow-up RPC some signers (Primal) never respond to.
      // We skip it entirely and remain compatible — signing requests will still work.
      console.log(DBG, 'skipping connect() RPC (not required for nostrconnect:// flow)');

      // Resolve the user pubkey — race three strategies in parallel:
      //   1. rawNip46GetPublicKey: NIP-04 get_public_key RPC (retried 3× with delays because
      //      Primal's signer takes 2–5 s to re-subscribe after the connect handshake).
      //   2. rawNip46Sniff: passive listener for any kind-24133 with a 64-char hex result.
      //   3. sign_event fallback: sign a tiny dummy event — signed.pubkey IS the user key.
      //      This is the most reliable strategy since Primal definitely processes sign_event.
      console.log(DBG, 'starting user pubkey resolution (GPK retries + sniffer + sign fallback)…');
      const GPK_ATTEMPT_TIMEOUT_MS = 8_000;
      const GPK_RETRY_DELAY_MS     = 2_500;
      const GPK_MAX_ATTEMPTS       = 3;
      // Use signer.bp.relays (may have been updated by fromURI's switchRelays()) merged with ours.
      const gpkRelays = [...new Set([...signer.bp.relays, ...relays])];
      const SNIFF_RELAYS = gpkRelays.filter(r => r.includes('primal') || r.includes('damus') || r.includes('nos.lol'));

      // Strategy 1 — NIP-04 get_public_key with retries
      const rawGpkPromise = (async (): Promise<string | null> => {
        for (let attempt = 1; attempt <= GPK_MAX_ATTEMPTS; attempt++) {
          // Brief delay on first attempt; Primal's signer needs time to re-subscribe.
          const delay = attempt === 1 ? 1_500 : GPK_RETRY_DELAY_MS;
          if (attempt > 1) console.log(DBG, `[rawGPK] retry ${attempt}/${GPK_MAX_ATTEMPTS} (waiting ${delay / 1000}s)…`);
          await new Promise<void>(r => setTimeout(r, delay));
          const pk = await rawNip46GetPublicKey(clientSk, signer.bp.pubkey, gpkRelays, GPK_ATTEMPT_TIMEOUT_MS);
          if (pk) { console.log(DBG, `[rawGPK] ✓ attempt ${attempt}:`, pk); return pk; }
          console.warn(DBG, `[rawGPK] attempt ${attempt} — no response`);
        }
        return null;
      })();

      // Strategy 2 — passive sniffer (catches any kind-24133 with a hex pubkey result)
      const snifferPromise = rawNip46Sniff(
        clientSk, clientPubkey, SNIFF_RELAYS,
        GPK_MAX_ATTEMPTS * (GPK_ATTEMPT_TIMEOUT_MS + GPK_RETRY_DELAY_MS) + 5_000
      ).then(r => {
        if (r) { console.log(DBG, '[sniff] ✓ user pubkey from sniffer:', r.userPubkey); return r.userPubkey; }
        return null;
      });

      // Strategy 3 — sign a minimal dummy event; signed.pubkey == user's actual key.
      // Most reliable strategy: Primal always processes sign_event even when get_public_key is ignored.
      // Passes session inline because localStorage hasn't been written yet at this point in the pairing flow.
      const signFallbackPromise = (async (): Promise<string | null> => {
        await new Promise<void>(r => setTimeout(r, 1_000)); // brief pause for signer re-subscription
        console.log(DBG, '[sign-fallback] sending sign_event (inline session) to extract user pubkey…');
        try {
          const signed = await rawNip46SignEvent(
            { kind: 27235, content: '', tags: [['u', 'https://chainduel.app'], ['method', 'GET']], created_at: Math.floor(Date.now() / 1000) },
            GPK_MAX_ATTEMPTS * (GPK_ATTEMPT_TIMEOUT_MS + GPK_RETRY_DELAY_MS),
            { clientSk, bp: signer.bp }  // pass inline — localStorage not available yet
          );
          const pk = typeof signed.pubkey === 'string' ? signed.pubkey.trim().toLowerCase() : null;
          if (pk && /^[0-9a-f]{64}$/.test(pk)) {
            console.log(DBG, '[sign-fallback] ✓ user pubkey from signed event:', pk);
            return pk;
          }
        } catch (err) {
          console.warn(DBG, '[sign-fallback] sign_event failed:', (err as Error).message);
        }
        return null;
      })();

      // Race: first non-null pubkey wins
      const rawPubkeyMutable = await new Promise<string | null>((resolveRace) => {
        let resolved = false;
        let pending = 3;

        const onValue = (val: string | null, source: string) => {
          pending -= 1;
          if (!resolved && val) {
            resolved = true;
            console.log(DBG, `✓ user pubkey resolved via [${source}]:`, val);
            resolveRace(val);
          } else if (pending === 0 && !resolved) {
            console.log(DBG, 'all pubkey strategies exhausted — no user pubkey found');
            resolveRace(null);
          }
        };

        rawGpkPromise.then(v => onValue(v, 'raw-nip04-gpk')).catch(() => onValue(null, 'raw-nip04-gpk'));
        snifferPromise.then(v => onValue(v, 'raw-sniffer')).catch(() => onValue(null, 'raw-sniffer'));
        signFallbackPromise.then(v => onValue(v, 'sign-fallback')).catch(() => onValue(null, 'sign-fallback'));
      });

      const rawPubkey = rawPubkeyMutable ?? (() => {
        console.warn(
          DBG,
          'All user pubkey strategies failed (GPK + sniff + sign fallback). ' +
          'Falling back to signer.bp.pubkey:', signer.bp.pubkey,
          '— this is the SIGNER key, NOT the user identity. Kind-0 will not load.'
        );
        return signer.bp.pubkey;
      })();
      const pubkey = normalizeNostrPubkeyHex(rawPubkey);
      console.log(DBG, '✓ resolved user pubkey — hex:', pubkey, '| npub:', npubEncode(pubkey));

      localStorage.setItem(STORED_NOSTR_PUBKEY_KEY, pubkey);
      localStorage.setItem(SIGNER_MODE_KEY, 'nip46');
      localStorage.setItem(NIP46_CLIENT_SK_KEY, bytesToHex(clientSk));
      localStorage.setItem(NIP46_BP_KEY, JSON.stringify(signer.bp));
      console.log(DBG, '✓ session persisted → finished');

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

/** Clear pubkey, mode, NIP-46 keys, nsec session, and close remote signer connections. */
export function clearSignerSession(): void {
  disposeNip46();
  sessionStorage.removeItem(NSEC_SESSION_SK_KEY);
  localStorage.removeItem(STORED_NOSTR_PUBKEY_KEY);
  localStorage.removeItem(SIGNER_MODE_KEY);
  localStorage.removeItem(NIP46_CLIENT_SK_KEY);
  localStorage.removeItem(NIP46_BP_KEY);
}

/**
 * Connect with a bunker URL (`bunker://…`) or a NIP-05 that exposes NIP-46 relays in nostr.json.
 * Persists client keys + bunker pointer for reloads (same pattern as Nostr Connect clients).
 */
export async function connectNostrConnect(bunkerInput: string): Promise<string> {
  const trimmed = bunkerInput.trim();
  if (!trimmed) {
    throw new Error('Paste a bunker URL or a NIP-05 identifier (name@domain).');
  }

  const bp = await parseBunkerInput(trimmed);
  if (!bp || bp.relays.length === 0) {
    throw new Error(
      'Could not resolve Nostr Connect relays. Use a bunker:// link from Primal (or another NIP-46 app), or a NIP-05 with nip46 in nostr.json.'
    );
  }

  sessionStorage.removeItem(NSEC_SESSION_SK_KEY);
  disposeNip46();
  nip46Pool = createNip46Pool();
  const clientSk = generateSecretKey();

  try {
    bunkerSigner = BunkerSigner.fromBunker(clientSk, bp, {
      pool: nip46Pool,
      onauth: (url) => {
        if (authUrlHandler) {
          authUrlHandler(url);
        }
      },
    });

    await bunkerSigner.connect();
    const pubkey = normalizeNostrPubkeyHex(await bunkerSigner.getPublicKey());

    localStorage.setItem(STORED_NOSTR_PUBKEY_KEY, pubkey);
    localStorage.setItem(SIGNER_MODE_KEY, 'nip46');
    localStorage.setItem(NIP46_CLIENT_SK_KEY, bytesToHex(clientSk));
    localStorage.setItem(NIP46_BP_KEY, JSON.stringify(bp));

    return pubkey;
  } catch (err) {
    disposeNip46();
    throw err;
  }
}

async function ensureNip46SignerReady(): Promise<boolean> {
  if (bunkerSigner) {
    console.log(DBG, '[ensure] bunkerSigner already live — skipping reconnect');
    return true;
  }
  if (nip46EnsurePromise) {
    console.log(DBG, '[ensure] reconnect already in progress — awaiting existing promise');
    return nip46EnsurePromise;
  }

  nip46EnsurePromise = (async () => {
    try {
      const skHex = localStorage.getItem(NIP46_CLIENT_SK_KEY);
      const bpRaw = localStorage.getItem(NIP46_BP_KEY);
      if (!skHex || !bpRaw) {
        console.warn(DBG, '[ensure] no stored client sk or bunker pointer — cannot reconnect');
        return false;
      }
      let bp: BunkerPointer;
      try {
        bp = JSON.parse(bpRaw) as BunkerPointer;
      } catch {
        console.error(DBG, '[ensure] failed to parse stored bunker pointer JSON');
        return false;
      }
      if (!bp.pubkey || !Array.isArray(bp.relays) || bp.relays.length === 0) {
        console.warn(DBG, '[ensure] stored bunker pointer is incomplete:', bp);
        return false;
      }

      console.log(DBG, '[ensure] reconnecting to bunker —', bp.pubkey, 'relays:', bp.relays);
      disposeNip46();
      nip46Pool = createNip46Pool();
      const clientSk = hexToBytes(skHex);

      bunkerSigner = BunkerSigner.fromBunker(clientSk, bp, {
        pool: nip46Pool,
        onauth: (url) => {
          console.log(DBG, '[ensure] auth_url received from bunker:', url);
          if (authUrlHandler) authUrlHandler(url);
        },
      });
      console.log(DBG, '[ensure] fromBunker done — calling connect() with 10s timeout');

      // Primal (and other personal signers) do NOT respond to the explicit `connect` RPC
      // after a reload — the session is already established via the stored bp. We give it
      // a 10s window; a timeout is treated as "already connected" (non-fatal) so signing
      // can proceed. If Primal does respond, the promise resolves normally.
      try {
        await withTimeout('bunkerSigner.connect()', bunkerSigner.connect(), 10_000);
        console.log(DBG, '[ensure] ✓ connect() RPC acknowledged by signer');
      } catch (connectErr) {
        const msg = connectErr instanceof Error ? connectErr.message : String(connectErr);
        if (msg.includes('timed out')) {
          console.warn(DBG, '[ensure] connect() RPC timed out (Primal/personal signer — expected). Proceeding with stored session.');
        } else {
          console.warn(DBG, '[ensure] connect() RPC failed:', msg, '— proceeding anyway');
        }
      }

      console.log(DBG, '[ensure] ✓ NIP-46 signer ready for signing');
      return true;
    } catch (err) {
      console.error(DBG, '[ensure] fatal error during reconnect:', err);
      disposeNip46();
      return false;
    } finally {
      nip46EnsurePromise = null;
    }
  })();

  return nip46EnsurePromise;
}

function parseNsecInput(input: string): Uint8Array {
  const t = input.trim();
  if (!t) throw new Error('Empty key.');
  if (t.toLowerCase().startsWith('nsec')) {
    try {
      const decoded = nip19Decode(t);
      if (decoded.type !== 'nsec') throw new Error('Expected an nsec1… bech32 key.');
      return decoded.data;
    } catch {
      throw new Error('Invalid nsec encoding.');
    }
  }
  const hex = t.replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('Expected nsec1… or a 64-character hex private key.');
  }
  return hexToBytes(hex.toLowerCase());
}

/** Store nsec only in sessionStorage; pubkey in localStorage for display & game features. */
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

/**
 * Returns an object compatible with `window.nostr` for signing, or null.
 * NIP-46 is lazily reconnected after reload when mode is `nip46`.
 */
export async function getActiveNostrSigner(): Promise<NostrNip07Provider | null> {
  const mode = resolveSignerMode();
  const storedPk = localStorage.getItem(STORED_NOSTR_PUBKEY_KEY);
  console.log(DBG, '[getActiveSigner] mode:', mode, '| bunkerSigner live:', Boolean(bunkerSigner));

  if (mode === 'nip46') {
    const ok = await ensureNip46SignerReady();
    if (!ok) {
      console.error(DBG, '[getActiveSigner] NIP-46 reconnect failed — returning null');
      return null;
    }
    // Use stored pubkey directly — BunkerSigner.getPublicKey() times out with Primal.
    const storedPk = localStorage.getItem(STORED_NOSTR_PUBKEY_KEY) ?? '';
    console.log(DBG, '[getActiveSigner] ✓ returning NIP-46 signer (raw NIP-04 signEvent)');
    return {
      getPublicKey: async () => storedPk,
      signEvent: async (ev) => {
        const kind = (ev as { kind?: number }).kind;
        console.log(DBG, '[getActiveSigner] signEvent (raw NIP-04) — kind:', kind);
        const result = await rawNip46SignEvent(ev as { kind: number; tags: string[][]; content: string; created_at: number });
        return result as import('@/types/nostr-nip07').NostrSignedEvent;
      },
    };
  }

  if (mode === 'nsec') {
    const skHex = sessionStorage.getItem(NSEC_SESSION_SK_KEY);
    if (!skHex || !storedPk) return null;
    try {
      const signer = new PlainKeySigner(hexToBytes(skHex));
      const pk = await signer.getPublicKey();
      if (pk.toLowerCase() !== storedPk.toLowerCase()) {
        return null;
      }
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

/** True if nsec mode is selected but the tab session no longer has the key. */
export function isNsecSessionMissing(): boolean {
  return (
    getStoredSignerMode() === 'nsec' && !sessionStorage.getItem(NSEC_SESSION_SK_KEY)
  );
}

export function recordExtensionSignIn(pubkey: string): void {
  sessionStorage.removeItem(NSEC_SESSION_SK_KEY);
  disposeNip46();
  localStorage.setItem(STORED_NOSTR_PUBKEY_KEY, normalizeNostrPubkeyHex(pubkey));
  localStorage.setItem(SIGNER_MODE_KEY, 'extension');
}

/**
 * Checks whether the stored NIP-46 session is intact and the signer can be instantiated.
 *
 * NOTE: Primal (and most personal remote signers) do NOT respond to repeated `get_public_key`
 * RPCs after the initial pairing handshake — only the first one during `fromURI` is answered.
 * Firing another RPC here would always time out and produce a false negative. Instead we verify:
 *   1. Stored client sk + bunker pointer are present and parseable.
 *   2. `ensureNip46SignerReady()` can build the `BunkerSigner` without error.
 * This correctly distinguishes "session data wiped / corrupted" from "signer is live but quiet".
 */
/**
 * Ping result extended with an optionally recovered user pubkey.
 * If `recoveredPubkey` is set, the caller should update React state with it.
 */
export type Nip46PingResult = {
  status: 'ok' | 'timeout' | 'unavailable';
  recoveredPubkey?: string;
};

export async function pingNip46Signer(): Promise<Nip46PingResult> {
  console.log(DBG, '[ping] verifying NIP-46 session — local data + live signer check…');

  const skHex = localStorage.getItem(NIP46_CLIENT_SK_KEY);
  const bpRaw = localStorage.getItem(NIP46_BP_KEY);
  if (!skHex || !bpRaw) {
    console.warn(DBG, '[ping] session data missing — unavailable');
    return { status: 'unavailable' };
  }
  try { JSON.parse(bpRaw); } catch {
    console.warn(DBG, '[ping] stored bunker pointer is corrupt — unavailable');
    return { status: 'unavailable' };
  }

  const ok = await ensureNip46SignerReady();
  if (!ok || !bunkerSigner) {
    console.warn(DBG, '[ping] signer reconnect failed — unavailable');
    return { status: 'unavailable' };
  }

  // Verify the remote signer is actually live by asking it to sign a tiny event.
  // sign_event is the most reliable NIP-46 method — Primal responds to it even when
  // get_public_key is ignored. The signed event's pubkey is the user's actual identity.
  console.log(DBG, '[ping] testing live signer via sign_event (10s window)…');
  try {
    const signed = await rawNip46SignEvent(
      {
        kind: 27235,
        content: '',
        tags: [['u', 'https://chainduel.app'], ['method', 'GET']],
        created_at: Math.floor(Date.now() / 1000),
      },
      10_000
    );
    const userPk = typeof signed.pubkey === 'string' ? signed.pubkey.trim().toLowerCase() : null;
    if (userPk && /^[0-9a-f]{64}$/.test(userPk)) {
      const storedPk = localStorage.getItem(STORED_NOSTR_PUBKEY_KEY)?.toLowerCase();
      if (userPk !== storedPk) {
        console.log(DBG, '[ping] ✓ live — correcting stored pubkey:', storedPk, '→', userPk);
        localStorage.setItem(STORED_NOSTR_PUBKEY_KEY, userPk);
        return { status: 'ok', recoveredPubkey: userPk };
      }
      console.log(DBG, '[ping] ✓ live — stored pubkey is correct:', userPk);
      return { status: 'ok' };
    }
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('timed out')) {
      console.warn(DBG, '[ping] sign_event timed out — remote signer not responding');
      return { status: 'timeout' };
    }
    console.warn(DBG, '[ping] sign_event failed:', msg);
  }
  return { status: 'timeout' };
}

/**
 * When the stored NIP-46 pubkey turns out to be the remote-signer key (not the user's actual
 * Nostr identity), sign a tiny dummy event — the returned `signed.pubkey` is always the user's
 * real key. If we get a different (better) pubkey, update localStorage and return it so callers
 * can re-fetch kind-0.
 *
 * Returns the recovered pubkey hex, or null if signing fails / is already correct.
 */
export async function recoverNip46UserPubkey(): Promise<string | null> {
  if (getStoredSignerMode() !== 'nip46') return null;
  const storedPk = localStorage.getItem(STORED_NOSTR_PUBKEY_KEY);
  if (!storedPk) return null;

  console.log(DBG, '[recover] attempting to recover real user pubkey via sign_event…');
  try {
    const signed = await rawNip46SignEvent(
      {
        kind: 27235,
        content: '',
        tags: [['u', 'https://chainduel.app'], ['method', 'GET']],
        created_at: Math.floor(Date.now() / 1000),
      },
      20_000
    );
    const recovered = typeof signed.pubkey === 'string' ? signed.pubkey.trim().toLowerCase() : null;
    if (!recovered || !/^[0-9a-f]{64}$/.test(recovered)) {
      console.warn(DBG, '[recover] sign_event returned invalid pubkey');
      return null;
    }
    if (recovered === storedPk.toLowerCase()) {
      console.log(DBG, '[recover] stored pubkey is already correct:', recovered);
      return null;
    }
    console.log(DBG, '[recover] ✓ corrected pubkey:', storedPk, '→', recovered);
    localStorage.setItem(STORED_NOSTR_PUBKEY_KEY, recovered);
    return recovered;
  } catch (err) {
    console.warn(DBG, '[recover] sign_event failed:', (err as Error).message);
    return null;
  }
}
