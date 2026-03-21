/**
 * Signs the ONLINE seat-link challenge (kind 1, content = server challenge).
 * - NIP-07: browser extension (`window.nostr`)
 * - NIP-46: remote bunker / Nostr Connect URI (`bunker://…` or NIP-05 from `parseBunkerInput`)
 */
import { generateSecretKey } from 'nostr-tools/pure';
import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';
import { SimplePool } from 'nostr-tools/pool';
import type { EventTemplate, VerifiedEvent } from 'nostr-tools/core';

export type OnlineSeatLinkSigner = 'nip07' | 'bunker';

export async function signOnlineSeatLinkChallenge(params: {
  challenge: string;
  signer: OnlineSeatLinkSigner;
  /** Required when `signer === 'bunker'` */
  bunkerUri?: string;
}): Promise<VerifiedEvent> {
  const unsigned: EventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: params.challenge,
  };

  if (params.signer === 'nip07') {
    if (!window.nostr) {
      throw new Error('no_nostr_extension');
    }
    await window.nostr.getPublicKey();
    const signed = await window.nostr.signEvent(unsigned);
    return signed as VerifiedEvent;
  }

  const input = params.bunkerUri?.trim() ?? '';
  if (!input) {
    throw new Error('bunker_uri_required');
  }

  const bp = await parseBunkerInput(input);
  if (!bp || bp.relays.length === 0) {
    throw new Error('invalid_bunker_uri');
  }

  const sk = generateSecretKey();
  const pool = new SimplePool();
  const bunkerSigner = BunkerSigner.fromBunker(sk, bp, {
    pool,
    onauth: (url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer');
    },
  });

  try {
    await bunkerSigner.connect();
    await bunkerSigner.getPublicKey();
    return await bunkerSigner.signEvent(unsigned);
  } finally {
    await bunkerSigner.close();
    pool.close(bp.relays);
  }
}
