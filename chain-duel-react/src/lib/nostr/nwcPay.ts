/**
 * Nostr Wallet Connect (NIP-47) — pay_invoice helper.
 *
 * Flow:
 *  1. Parse nostr+walletconnect:// URI → wallet pubkey, relay, client secret.
 *  2. Build a kind-23194 NIP-47 request event, NIP-04 encrypted, signed with the client key.
 *  3. Publish it to the relay and subscribe to the kind-23195 response.
 *  4. Decrypt and parse the response; resolve with { preimage } or reject with an Error.
 *
 * @see https://github.com/nostr-protocol/nips/blob/master/47.md
 */

import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { encrypt as nip04Encrypt, decrypt as nip04Decrypt } from 'nostr-tools/nip04';
import { hexToBytes } from 'nostr-tools/utils';

// ─── Storage ─────────────────────────────────────────────────────────────────

export const NWC_URI_KEY = 'arcadeNwcUri';

export function getNwcUri(): string | null {
  return localStorage.getItem(NWC_URI_KEY);
}

export function setNwcUri(uri: string): void {
  localStorage.setItem(NWC_URI_KEY, uri.trim());
}

export function clearNwcUri(): void {
  localStorage.removeItem(NWC_URI_KEY);
}

export function hasNwcUri(): boolean {
  return Boolean(localStorage.getItem(NWC_URI_KEY));
}

// ─── URI parsing ─────────────────────────────────────────────────────────────

export interface NwcConfig {
  walletPubkey: string;
  relay: string;
  /** Hex-encoded client private key (the "secret" from the URI). */
  secretHex: string;
}

export function parseNwcUri(uri: string): NwcConfig {
  const PREFIX = 'nostr+walletconnect://';
  if (!uri.startsWith(PREFIX)) {
    throw new Error('Invalid NWC URI — must start with nostr+walletconnect://');
  }
  const rest = uri.slice(PREFIX.length);
  const qIdx = rest.indexOf('?');
  if (qIdx === -1) throw new Error('Invalid NWC URI — missing query parameters');

  const walletPubkey = rest.slice(0, qIdx);
  if (!/^[0-9a-f]{64}$/i.test(walletPubkey)) {
    throw new Error('Invalid NWC URI — wallet pubkey must be 64 hex characters');
  }

  const params = new URLSearchParams(rest.slice(qIdx + 1));
  const relay = params.get('relay');
  const secretHex = params.get('secret');

  if (!relay) throw new Error('Invalid NWC URI — missing relay parameter');
  if (!secretHex || !/^[0-9a-f]{64}$/i.test(secretHex)) {
    throw new Error('Invalid NWC URI — missing or malformed secret parameter');
  }

  return { walletPubkey: walletPubkey.toLowerCase(), relay, secretHex: secretHex.toLowerCase() };
}

// ─── NIP-47 pay_invoice ───────────────────────────────────────────────────────

export interface NwcPayResult {
  preimage: string;
}

const DBG = '[NWC]';

/**
 * Pay a bolt11 invoice via NWC.
 *
 * @param bolt11     The bolt11 payment request string.
 * @param timeoutMs  How long to wait for the wallet's response (default 60 s).
 */
export async function nwcPay(bolt11: string, timeoutMs = 60_000): Promise<NwcPayResult> {
  const rawUri = getNwcUri();
  if (!rawUri) throw new Error('No NWC URI configured. Add one in Settings.');

  const { walletPubkey, relay, secretHex } = parseNwcUri(rawUri);
  const clientSk = hexToBytes(secretHex);
  const clientPubkey = getPublicKey(clientSk);

  // Build the request payload
  const requestPayload = JSON.stringify({
    method: 'pay_invoice',
    params: { invoice: bolt11 },
  });

  const encryptedContent = await nip04Encrypt(secretHex, walletPubkey, requestPayload);

  const requestEventTemplate = {
    kind: 23194,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', walletPubkey]],
    content: encryptedContent,
  };

  const requestEvent = finalizeEvent(requestEventTemplate, clientSk);
  console.log(DBG, 'sending pay_invoice request', requestEvent.id, '→', relay);

  return new Promise<NwcPayResult>((resolve, reject) => {
    let settled = false;
    const subId = `nwc-${Date.now()}`;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: NwcPayResult | null, err?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        ws?.send(JSON.stringify(['CLOSE', subId]));
        ws?.close();
      } catch {
        /* ignore close errors */
      }
      if (err) {
        console.warn(DBG, 'payment failed:', err.message);
        reject(err);
      } else {
        console.log(DBG, '✓ preimage received');
        resolve(result!);
      }
    };

    timer = setTimeout(() => {
      finish(null, new Error('NWC payment timed out — wallet did not respond in time.'));
    }, timeoutMs);

    ws = new WebSocket(relay);

    ws.onerror = () => {
      finish(null, new Error(`Could not connect to NWC relay: ${relay}`));
    };

    ws.onopen = () => {
      // Subscribe to the response before publishing the request
      const filter = {
        kinds: [23195],
        authors: [walletPubkey],
        '#e': [requestEvent.id],
        '#p': [clientPubkey],
        since: Math.floor(Date.now() / 1000) - 5,
      };
      ws!.send(JSON.stringify(['REQ', subId, filter]));
      ws!.send(JSON.stringify(['EVENT', requestEvent]));
    };

    ws.onmessage = (msg) => {
      let parsed: unknown;
      try { parsed = JSON.parse(msg.data as string); } catch { return; }
      if (!Array.isArray(parsed)) return;

      const [type, , event] = parsed as [string, string, Record<string, unknown>];
      if (type !== 'EVENT') return;
      if (!event || event.kind !== 23195) return;

      void (async () => {
        let plaintext: string;
        try {
          plaintext = await nip04Decrypt(secretHex, walletPubkey, event.content as string);
        } catch (e) {
          console.warn(DBG, 'failed to decrypt response:', e);
          return;
        }

        let response: { result_type?: string; result?: { preimage?: string }; error?: { code?: string; message?: string } };
        try { response = JSON.parse(plaintext); } catch { return; }

        if (response.error) {
          finish(null, new Error(response.error.message ?? response.error.code ?? 'Payment failed'));
          return;
        }

        const preimage = response.result?.preimage;
        if (preimage) {
          finish({ preimage });
        }
      })();
    };
  });
}
