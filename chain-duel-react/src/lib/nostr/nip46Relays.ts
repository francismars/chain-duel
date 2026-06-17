/**
 * NIP-46 relay selection — signer-first, with marspay-aligned fallbacks.
 *
 * QR advertisement uses a broad default set; stored sessions and RPC honor
 * the bunker's relay list (via switch_relays / bunker pointer).
 */

/** Aligned with marspay/src/consts/nostrRelays.ts */
export const NIP46_FALLBACK_RELAYS: readonly string[] = [
  'wss://relay.damus.io',
  'wss://relay.nos.social',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.nostr.net',
  'wss://nostr.mom',
  'wss://nostr.bitcoiner.social',
];

/** Common bunker / remote-signer relays (not all in marspay list). */
export const NIP46_BUNKER_RELAYS: readonly string[] = [
  'wss://premium.primal.net',
  'wss://relay.nsec.app',
];

/** Relays advertised in nostrconnect:// QR — keep small; pool opens every URL. */
export const DEFAULT_NOSTR_CONNECT_RELAYS: string[] = dedupeRelays([
  ...NIP46_FALLBACK_RELAYS.slice(0, 4),
  'wss://relay.nsec.app',
  'wss://premium.primal.net',
]).slice(0, 6);

/** Often unreachable in Firefox/WSL — drop from client relay lists. */
const BLOCKED_RELAY_HOSTS = new Set([
  'relay.nostr.band',
  'relay.nsecbunker.com',
  'relay.snort.social',
  'purplepag.es',
]);

const MAX_STORED_SIGNER_RELAYS = 6;
const MAX_NIP46_RPC_RELAYS = 3;

function normalizeRelayUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function relayHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isAllowedRelay(url: string): boolean {
  const host = relayHostname(url);
  return host !== null && !BLOCKED_RELAY_HOSTS.has(host);
}

/** Dedupe while preserving first-seen order. */
export function dedupeRelays(relays: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of relays) {
    const url = normalizeRelayUrl(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function filterAllowedRelays(relays: readonly string[]): string[] {
  return dedupeRelays(relays).filter(isAllowedRelay);
}

/**
 * Relays for nostrconnect:// QR — merge caller hints with defaults (cap 6).
 */
export function relaysForNostrConnectQr(relays?: readonly string[]): string[] {
  const merged = dedupeRelays([
    ...(relays ?? []),
    ...DEFAULT_NOSTR_CONNECT_RELAYS,
  ]).filter(isAllowedRelay);
  return merged.slice(0, 6);
}

/**
 * Normalize relays returned by the bunker (switch_relays / bunker pointer).
 * Does not inject client defaults — signer list wins.
 */
export function normalizeSignerRelays(signerRelays: readonly string[]): string[] {
  const cleaned = filterAllowedRelays(signerRelays);
  if (cleaned.length > 0) {
    return cleaned.slice(0, MAX_STORED_SIGNER_RELAYS);
  }
  return DEFAULT_NOSTR_CONNECT_RELAYS.slice(0, 4);
}

/**
 * Parse switch_relays RPC result (JSON array of relay URLs, or null).
 */
export function parseSwitchRelaysResult(result: string): string[] | null {
  try {
    const parsed = JSON.parse(result) as unknown;
    if (parsed === null) return null;
    if (!Array.isArray(parsed)) return null;
    const urls = parsed.filter((v): v is string => typeof v === 'string');
    const normalized = normalizeSignerRelays(urls);
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
}

/**
 * Relays for NIP-46 RPC — signer relays first (2–3 parallel), fallbacks only
 * when the bunker returned a thin list.
 */
export function relaysForNip46Rpc(signerRelays: readonly string[]): string[] {
  const signer = normalizeSignerRelays(signerRelays);
  const primary = signer.slice(0, MAX_NIP46_RPC_RELAYS);

  if (primary.length >= 2) {
    return primary;
  }

  const extras = filterAllowedRelays([
    ...NIP46_FALLBACK_RELAYS,
    ...NIP46_BUNKER_RELAYS,
  ]).filter((url) => !primary.includes(url));

  return dedupeRelays([...primary, ...extras]).slice(0, MAX_NIP46_RPC_RELAYS);
}

/** @deprecated Use relaysForNostrConnectQr for QR or normalizeSignerRelays for sessions. */
export function sanitizeNip46Relays(relays: string[]): string[] {
  return relaysForNostrConnectQr(relays);
}
