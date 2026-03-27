/**
 * Fetch Nostr kind 0 (metadata) from public relays and parse NIP-01 profile fields.
 */

import { SimplePool } from 'nostr-tools/pool';

export type NostrRawEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};

export type Kind0Profile = {
  displayTitle: string;
  name: string | null;
  displayName: string | null;
  picture: string | null;
  banner: string | null;
  nip05: string | null;
  lud16: string | null;
  lud06: string | null;
  about: string | null;
  eventCreatedAt: number;
};

/** Public relays for kind-0 reads. Standard NIP-01 WebSocket relays only — no proprietary cache endpoints. */
export const KIND0_DEFAULT_RELAYS = [
  'wss://purplepag.es',         // purpose-built metadata relay — most reliable for kind 0
  'wss://relay.damus.io',       // high-availability; stores metadata for almost every user
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://premium.primal.net',
] as const;

export type Kind0FetchProgress =
  | { step: 'started'; relayTotal: number }
  | {
      step: 'relay_finished';
      relayUrl: string;
      kind0Events: number;
      finishedCount: number;
      relayTotal: number;
    }
  | { step: 'merging' };

function normalizeMediaUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim();
  if (!u) return null;
  if (u.startsWith('https://') || u.startsWith('http://')) return u;
  if (u.startsWith('//')) return `https:${u}`;
  return null;
}

function parseKind0Event(ev: NostrRawEvent): Kind0Profile {
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(ev.content || '{}') as Record<string, unknown>;
  } catch {
    meta = {};
  }

  const name = typeof meta.name === 'string' ? meta.name.trim() || null : null;
  const displayName =
    typeof meta.display_name === 'string' ? meta.display_name.trim() || null : null;
  const displayTitle = displayName || name || 'Nostr user';
  const picture = normalizeMediaUrl(typeof meta.picture === 'string' ? meta.picture : null);
  const banner = normalizeMediaUrl(typeof meta.banner === 'string' ? meta.banner : null);
  const nip05 = typeof meta.nip05 === 'string' ? meta.nip05.trim() || null : null;
  const lud16 = typeof meta.lud16 === 'string' ? meta.lud16.trim() || null : null;
  const lud06 = typeof meta.lud06 === 'string' ? meta.lud06.trim() || null : null;
  const about = typeof meta.about === 'string' ? meta.about.trim() || null : null;

  return {
    displayTitle,
    name,
    displayName,
    picture,
    banner,
    nip05,
    lud16,
    lud06,
    about,
    eventCreatedAt: ev.created_at,
  };
}

/** Merge kind-0 events and keep the newest by `created_at`. */
function pickBest(events: NostrRawEvent[], hex: string): NostrRawEvent | null {
  let best: NostrRawEvent | null = null;
  for (const ev of events) {
    if (ev.pubkey?.toLowerCase() !== hex) continue;
    if (!best || ev.created_at > best.created_at) best = ev;
  }
  return best;
}

/** Fetch kind 0 via Primal's HTTP API — returns null on any error. */
async function fetchKind0FromPrimalApi(hex: string): Promise<NostrRawEvent | null> {
  try {
    const res = await fetch('https://api.primal.net/v1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(["user_profile", { pubkey: hex }]),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn('[kind0] Primal API HTTP error', res.status);
      return null;
    }
    const text = await res.text();
    console.log('[kind0] Primal API raw response (first 400 chars):', text.slice(0, 400));
    // Response may be NDJSON (one event per line) or a JSON array
    const candidates: NostrRawEvent[] = [];
    // Try NDJSON first
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        const item = JSON.parse(t) as NostrRawEvent | unknown[];
        if (Array.isArray(item)) {
          // Could be ["EVENT", sub, event] or just [event]
          const ev = item.find((x): x is NostrRawEvent =>
            x !== null && typeof x === 'object' && (x as NostrRawEvent).kind === 0
          );
          if (ev) candidates.push(ev);
        } else if ((item as NostrRawEvent).kind === 0) {
          candidates.push(item as NostrRawEvent);
        }
      } catch { /* skip malformed line */ }
    }
    // Try JSON array as fallback
    if (candidates.length === 0) {
      try {
        const arr = JSON.parse(text) as unknown[];
        for (const x of arr) {
          if (x !== null && typeof x === 'object' && (x as NostrRawEvent).kind === 0) {
            candidates.push(x as NostrRawEvent);
          }
        }
      } catch { /* ignore */ }
    }
    const best = pickBest(candidates, hex);
    console.log('[kind0] Primal API →', candidates.length, 'kind-0 events, best:', best ? 'found' : 'none');
    return best;
  } catch (err) {
    console.warn('[kind0] Primal API fetch failed:', err);
    return null;
  }
}

/** Fetch kind 0 events from multiple relays using nostr-tools SimplePool. */
async function fetchKind0FromRelays(
  hex: string,
  relayUrls: readonly string[],
  timeoutMs: number
): Promise<NostrRawEvent[]> {
  return new Promise((resolve) => {
    const pool = new SimplePool();
    const events: NostrRawEvent[] = [];
    let finished = false;

    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { sub.close(); } catch { /* ignore */ }
      // Defer pool destruction slightly so close() can flush
      setTimeout(() => pool.destroy(), 100);
      console.log('[kind0] subscribeMany returned', events.length, 'events from', relayUrls.length, 'relays');
      resolve(events);
    };

    const timer = setTimeout(done, timeoutMs);

    const sub = pool.subscribeMany(
      [...relayUrls],
      { kinds: [0], authors: [hex] },
      {
        onevent: (event) => {
          if (!finished) events.push(event as unknown as NostrRawEvent);
        },
        // nostr-tools calls oneose exactly once when ALL connected relays have sent EOSE
        // (failed relays are counted too). Call done() immediately — no per-relay counting needed.
        oneose: () => {
          done();
        },
      }
    );
  });
}

/** Fetch the most recent kind 0 metadata for a pubkey. Tries Primal HTTP API first, then relays. */
export async function fetchLatestKind0Profile(
  pubkeyHex: string,
  options?: {
    relayUrls?: readonly string[];
    perRelayTimeoutMs?: number;
    onProgress?: (p: Kind0FetchProgress) => void;
  }
): Promise<Kind0Profile | null> {
  const relays = options?.relayUrls?.length ? options.relayUrls : KIND0_DEFAULT_RELAYS;
  const timeout = options?.perRelayTimeoutMs ?? 10000;
  const onProgress = options?.onProgress;
  const hex = pubkeyHex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;

  console.log('[kind0] fetching profile for', hex);
  console.log('[kind0] relays:', [...relays]);
  onProgress?.({ step: 'started', relayTotal: relays.length });

  // Race: Primal HTTP API vs relay pool — whichever returns a valid event first wins.
  const [apiResult, relayEvents] = await Promise.all([
    fetchKind0FromPrimalApi(hex),
    fetchKind0FromRelays(hex, relays, timeout).then((evs) => {
      onProgress?.({ step: 'merging' });
      return evs;
    }),
  ]);

  const allEvents: NostrRawEvent[] = [];
  if (apiResult) allEvents.push(apiResult);
  allEvents.push(...relayEvents);

  const best = pickBest(allEvents, hex);

  if (!best) {
    console.warn('[kind0] no kind-0 event found for', hex);
    return null;
  }
  console.log('[kind0] ✓ best event created_at', best.created_at, '— parsing…');
  return parseKind0Event(best);
}

/**
 * NIP-05: verify that the identifier maps to this pubkey via the domain's well-known URL.
 * May fail in the browser when the domain does not send CORS headers.
 */
export async function verifyNip05(pubkeyHex: string, nip05Raw: string): Promise<boolean> {
  const trimmed = nip05Raw.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at < 1) return false;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (!local || !domain) return false;

  const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(local)}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return false;
    const j = (await r.json()) as { names?: Record<string, string> };
    const names = j.names;
    if (!names || typeof names !== 'object') return false;
    let mapped = names[local];
    if (typeof mapped !== 'string') {
      const key = Object.keys(names).find((k) => k.toLowerCase() === local);
      mapped = key ? names[key] : '';
    }
    if (typeof mapped !== 'string') return false;
    return mapped.replace(/^0x/i, '').toLowerCase() === pubkeyHex.toLowerCase();
  } catch {
    return false;
  }
}

export function formatPubkeyHex(hex: string): string {
  const h = hex.toLowerCase();
  if (h.length < 20) return h;
  return `${h.slice(0, 12)}…${h.slice(-8)}`;
}
