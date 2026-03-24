/**
 * Signs the ONLINE seat-link challenge (kind 1, content = server challenge) via NIP-07 browser extension.
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

export async function signOnlineSeatLinkChallenge(params: {
  challenge: string;
}): Promise<SignedSeatLinkEvent> {
  if (!window.nostr) {
    throw new Error('no_nostr_extension');
  }
  await window.nostr.getPublicKey();
  const unsigned = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [] as string[][],
    content: params.challenge,
  };
  const signed = await window.nostr.signEvent(unsigned);
  return signed as SignedSeatLinkEvent;
}
