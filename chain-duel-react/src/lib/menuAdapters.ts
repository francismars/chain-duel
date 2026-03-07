import type { LNURLP } from '@/types/socket';

export interface MenuParseResult {
  payLinks: LNURLP[];
  hasLnurlw: boolean;
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
    return { payLinks: [], hasLnurlw: true };
  }

  if (!Array.isArray(body)) {
    return { payLinks: [], hasLnurlw: false };
  }

  const payLinks = body.filter(
    (item): item is LNURLP =>
      item !== null &&
      typeof item === 'object' &&
      'lnurlp' in item &&
      typeof (item as LNURLP).lnurlp === 'string'
  );

  return { payLinks, hasLnurlw: false };
}
