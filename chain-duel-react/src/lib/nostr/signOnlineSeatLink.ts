import { getActiveNostrSigner, resolveSignerMode } from './signerSession';
import { withNip46SignFlow } from './nip46Trace';

/**
 * Signs events via the active Nostr signer (extension, Nostr Connect, or nsec session).
 * Relay reads and profile lookup are done on the backend.
 */
export type SignedSeatLinkEvent = {
  kind: number;
  tags: string[][];
  content: string;
  created_at: number;
  id: string;
  pubkey: string;
  sig: string;
};

/** How long to wait for a `signEvent` RPC before giving up. NIP-46 needs manual approval. */
const SIGN_TIMEOUT_MS = 45_000;
const NIP46_ZAP_SIGN_TIMEOUT_MS = 90_000;

function withSignTimeout<T>(label: string, p: Promise<T>, timeoutMs = SIGN_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      const mode = resolveSignerMode();
      const hint = mode === 'nip46'
        ? 'Open your signer app and approve the signing request.'
        : 'Signing request timed out.';
      reject(new Error(`${label} timed out. ${hint}`));
    }, timeoutMs);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

/** Sign any unsigned event (e.g. kind 9734 zap request). */
export async function signNostrEvent(unsigned: {
  kind: number;
  tags: string[][];
  content: string;
  created_at: number;
}): Promise<SignedSeatLinkEvent> {
  const n = await getActiveNostrSigner();
  if (!n) {
    throw new Error('no_nostr_signer');
  }
  const signed = await withSignTimeout(
    'signNostrEvent',
    n.signEvent(unsigned),
    resolveSignerMode() === 'nip46' ? NIP46_ZAP_SIGN_TIMEOUT_MS : SIGN_TIMEOUT_MS,
  );
  return signed as SignedSeatLinkEvent;
}

export async function signOnlineSeatLinkChallenge(params: {
  challenge: string;
}): Promise<SignedSeatLinkEvent> {
  const n = await getActiveNostrSigner();
  if (!n) {
    throw new Error('no_nostr_signer');
  }
  const unsigned = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [] as string[][],
    content: params.challenge,
  };
  const signed = await withNip46SignFlow('server-link/kind-1', () =>
    withSignTimeout(
      'signOnlineSeatLinkChallenge',
      n.signEvent(unsigned),
      resolveSignerMode() === 'nip46' ? NIP46_ZAP_SIGN_TIMEOUT_MS : SIGN_TIMEOUT_MS,
    ),
  );
  return signed as SignedSeatLinkEvent;
}
