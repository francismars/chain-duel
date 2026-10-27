import { decode, type NEvent, type Note } from 'nostr-tools/nip19';
import { SimplePool } from 'nostr-tools/pool';

/** Relays checked when showing where a kind-1 game note is visible. */
export const NOSTR_NOTE_PROBE_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nos.social',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.nostr.net',
  'wss://nostr.mom',
  'wss://nostr.bitcoiner.social',
] as const;

const DEFAULT_PROBE_TIMEOUT_MS = 8000;

export function relayUrlToDisplayHost(relayUrl: string): string {
  try {
    return new URL(relayUrl).hostname;
  } catch {
    return relayUrl;
  }
}

export function eventIdFromNote1(note1: string): string | null {
  try {
    const decoded = decode(note1 as Note);
    if (decoded.type !== 'note') return null;
    return decoded.data.toLowerCase();
  } catch {
    return null;
  }
}

export function relayHintsFromNevent(nevent: string): string[] {
  try {
    const decoded = decode(nevent as NEvent);
    if (decoded.type !== 'nevent') return [];
    return decoded.data.relays ?? [];
  } catch {
    return [];
  }
}

/** Probe each relay with REQ { ids: [eventId] }; return URLs that returned the event. */
export async function probeRelaysForEvent(
  note1: string,
  relayUrls: readonly string[],
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS
): Promise<string[]> {
  const eventId = eventIdFromNote1(note1);
  if (!eventId) return [];

  const uniqueRelays = [
    ...new Set(relayUrls.map((u) => u.trim()).filter(Boolean)),
  ];
  if (uniqueRelays.length === 0) return [];

  const pool = new SimplePool();
  try {
    const hits = await Promise.all(
      uniqueRelays.map(async (relayUrl) => {
        try {
          const event = await pool.get(
            [relayUrl],
            { ids: [eventId] },
            { maxWait: timeoutMs }
          );
          return event ? relayUrl : null;
        } catch {
          return null;
        }
      })
    );
    return hits.filter((url): url is string => url !== null);
  } finally {
    pool.destroy();
  }
}
