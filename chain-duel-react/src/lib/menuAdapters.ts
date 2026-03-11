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

  if (!Array.isArray(body)) {
    return { payLinks: [], hasLnurlw: false, modeMeta: null, nostrMeta: null };
  }

  const payLinks = body.filter(
    (item): item is LNURLP =>
      item !== null &&
      typeof item === 'object' &&
      'lnurlp' in item &&
      typeof (item as LNURLP).lnurlp === 'string'
  );

  const modeMetaItem = body.find(
    (item) =>
      item !== null &&
      typeof item === 'object' &&
      'mode' in item &&
      typeof (item as { mode?: unknown }).mode === 'string'
  ) as { mode?: string; winners?: unknown[] } | undefined;

  const nostrMetaItem = body.find(
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
