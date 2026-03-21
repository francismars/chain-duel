/**
 * Minimal NIP-07 (`window.nostr`) for ONLINE seat linking.
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
