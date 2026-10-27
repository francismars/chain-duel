import { decode, neventEncode, type Note } from 'nostr-tools/nip19';

/** Middle-ellipsis for long NIP-19 identifiers (note1, nevent, etc.). */
export function trimNip19Identifier(value: string, head = 8, tail = 5): string {
  if (!value) return '';
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Derive nevent from note1 for display / njump-style links (nostr.wine relay hint). */
export function neventFromNote1(
  note1: string,
  relays: string[] = ['wss://nostr.wine']
): string | null {
  try {
    const decoded = decode(note1 as Note);
    if (decoded.type !== 'note') return null;
    return neventEncode({ id: decoded.data, relays });
  } catch {
    return null;
  }
}
