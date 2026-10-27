/** Normalize a BOLT11 / LNURL string for a tappable `lightning:` wallet link. */
export function lightningUriHref(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) {
    return '';
  }
  return /^lightning:/i.test(trimmed) ? trimmed : `lightning:${trimmed}`;
}
