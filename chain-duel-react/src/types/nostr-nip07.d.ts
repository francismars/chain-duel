/**
 * Minimal signing surface (NIP-07-shaped). Satisfied by `window.nostr`, Nostr Connect (NIP-46), or local nsec.
 * @see https://github.com/nostr-protocol/nips/blob/master/07.md
 */
export type NostrUnsignedEvent = {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
};

export type NostrSignedEvent = NostrUnsignedEvent & {
  id: string;
  pubkey: string;
  sig: string;
};

export type NostrNip07Provider = {
  getPublicKey(): Promise<string>;
  signEvent(event: NostrUnsignedEvent): Promise<NostrSignedEvent>;
};

declare global {
  interface Window {
    nostr?: NostrNip07Provider;
  }
}

export {};
