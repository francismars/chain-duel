import type { LNURLP } from '@/types/socket';

interface MenuModeMeta {
  mode?: string;
  winnersCount?: number;
}

interface NostrMeta {
  note1: string;
  emojis: string;
  min: number;
  mode?: string;
}

export interface MenuParseResult {
  payLinks: LNURLP[];
  hasLnurlw: boolean;
  modeMeta: MenuModeMeta | null;
  nostrMeta: NostrMeta | null;
}

/**
 * Normalize variable menu response payloads from backend into a stable shape.
 * Backend may include mode metadata items in arrays; we keep only LNURLP entries.
 */
export function parseMenuResponse(body: unknown): MenuParseResult {
  if (
    body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    'lnurlw' in body
  ) {
    return { payLinks: [], hasLnurlw: true, modeMeta: null, nostrMeta: null };
  }

  let items: unknown[] = [];
  if (Array.isArray(body)) {
    items = body;
  } else if (body && typeof body === 'object') {
    const candidate = body as Record<string, unknown>;
    if (Array.isArray(candidate.data)) {
      items = candidate.data;
    } else if (Array.isArray(candidate.payLinks)) {
      items = candidate.payLinks;
    } else {
      const objectValues = Object.values(candidate);
      if (objectValues.length > 0 && objectValues.every((v) => v && typeof v === 'object')) {
        items = objectValues;
      }
    }
  }

  if (items.length === 0) {
    return { payLinks: [], hasLnurlw: false, modeMeta: null, nostrMeta: null };
  }

  const payLinks: LNURLP[] = items
    .map((item): LNURLP | null => {
      if (!item || typeof item !== 'object') return null;
      const src = item as Record<string, unknown>;
      const lnurlp =
        typeof src.lnurlp === 'string'
          ? src.lnurlp
          : typeof src.lnurl === 'string'
            ? src.lnurl
            : '';
      if (!lnurlp) return null;
      return {
        id: String(src.id ?? ''),
        lnurlp,
        description: String(src.description ?? ''),
        min: Number(src.min ?? 0),
        mode: typeof src.mode === 'string' ? (src.mode as LNURLP['mode']) : undefined,
        hostLNAddress:
          typeof src.hostLNAddress === 'string' ? src.hostLNAddress : undefined,
      };
    })
    .filter((entry): entry is LNURLP => entry !== null);

  const modeMetaItem = items.find(
    (item) =>
      item !== null &&
      typeof item === 'object' &&
      'mode' in item &&
      typeof (item as { mode?: unknown }).mode === 'string'
  ) as { mode?: string; winners?: unknown[] } | undefined;

  const nostrMetaItem = items.find(
    (item) =>
      item !== null &&
      typeof item === 'object' &&
      'note1' in item &&
      'emojis' in item
  ) as { note1?: string; emojis?: string; min?: number; mode?: string } | undefined;

  return {
    payLinks,
    hasLnurlw: false,
    modeMeta: modeMetaItem
      ? {
          mode: modeMetaItem.mode,
          winnersCount: Array.isArray(modeMetaItem.winners) ? modeMetaItem.winners.length : undefined,
        }
      : null,
    nostrMeta:
      nostrMetaItem && nostrMetaItem.note1 && nostrMetaItem.emojis
        ? {
            note1: nostrMetaItem.note1,
            emojis: nostrMetaItem.emojis,
            min: Number.isFinite(nostrMetaItem.min) ? Number(nostrMetaItem.min) : 1,
            mode: nostrMetaItem.mode,
          }
        : null,
  };
}
