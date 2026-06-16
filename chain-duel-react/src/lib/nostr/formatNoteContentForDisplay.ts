import { useEffect, useState } from 'react';
import { nip19 } from 'nostr-tools';
import {
  fetchLatestKind0Profile,
  type Kind0Profile,
} from '@/lib/nostr/fetchKind0Profile';

/** @chainduel — matches marspay victory note mention. */
export const CHAINDUEL_NPUB =
  'npub1kd3nlw09ufkgmts2kaf0x8m4mq57exn6l8rz50v5ngyr2h3j5cfswdsdth';

const NOSTR_URI_RE = /nostr:(npub1[a-z0-9]+|nprofile1[a-z0-9]+)/gi;

const KNOWN_MENTION_LABELS: Record<string, string> = {
  [`nostr:${CHAINDUEL_NPUB}`]: '@chainduel',
};

function profileDisplayLabel(profile: Kind0Profile): string {
  if (profile.nip05) {
    const handle = profile.nip05.split('@')[0]?.trim();
    if (handle) return `@${handle}`;
  }
  return profile.displayTitle;
}

function pubkeyFromNostrUri(uri: string): string | null {
  const bech32 = uri.replace(/^nostr:/i, '');
  try {
    const decoded = nip19.decode(bech32);
    if (decoded.type === 'npub') return decoded.data as string;
    if (decoded.type === 'nprofile') return decoded.data.pubkey;
  } catch {
    // ignore invalid bech32
  }
  return null;
}

function applyKnownLabels(content: string): string {
  let out = content;
  for (const [uri, label] of Object.entries(KNOWN_MENTION_LABELS)) {
    out = out.replaceAll(uri, label);
  }
  return out;
}

/** Replace NIP-27 `nostr:` URIs with human-readable @handles for UI preview only. */
export async function formatNoteContentForDisplay(
  content: string
): Promise<string> {
  let out = applyKnownLabels(content);
  const uris = [...content.matchAll(NOSTR_URI_RE)].map((m) => m[0]);
  const unique = [...new Set(uris)];

  await Promise.all(
    unique.map(async (uri) => {
      if (KNOWN_MENTION_LABELS[uri]) return;
      const hex = pubkeyFromNostrUri(uri);
      if (!hex) return;
      const profile = await fetchLatestKind0Profile(hex);
      const label = profile ? profileDisplayLabel(profile) : '@user';
      out = out.replaceAll(uri, label);
    })
  );

  return out;
}

/** Preview text for challenge bounty notes (signed content stays unchanged). */
export function useNoteContentDisplay(content: string | undefined): string {
  const [display, setDisplay] = useState('');

  useEffect(() => {
    if (!content) {
      setDisplay('');
      return;
    }

    let cancelled = false;
    setDisplay(applyKnownLabels(content));

    void formatNoteContentForDisplay(content).then((formatted) => {
      if (!cancelled) setDisplay(formatted);
    });

    return () => {
      cancelled = true;
    };
  }, [content]);

  return display;
}
