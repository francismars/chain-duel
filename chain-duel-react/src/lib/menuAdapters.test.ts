import { describe, expect, it } from 'vitest';
import { parseMenuResponse } from './menuAdapters';

describe('parseMenuResponse', () => {
  it('detects lnurlw object payload', () => {
    const result = parseMenuResponse({ lnurlw: 'lnurlw://abc' });
    expect(result.hasLnurlw).toBe(true);
    expect(result.payLinks).toEqual([]);
  });

  it('filters only lnurlp entries from mixed arrays', () => {
    const result = parseMenuResponse([
      { mode: 'P2P' },
      { id: 'p1', lnurlp: 'lnurlp://p1', description: 'Player 1', min: 10000 },
      { id: 'p2', lnurlp: 'lnurlp://p2', description: 'Player 2', min: 10000 },
      { foo: 'bar' },
    ]);

    expect(result.hasLnurlw).toBe(false);
    expect(result.payLinks).toHaveLength(2);
    expect(result.payLinks[0].description).toBe('Player 1');
    expect(result.payLinks[1].description).toBe('Player 2');
  });

  it('returns empty for unknown shapes', () => {
    expect(parseMenuResponse(null)).toEqual({ hasLnurlw: false, payLinks: [] });
    expect(parseMenuResponse('x')).toEqual({ hasLnurlw: false, payLinks: [] });
    expect(parseMenuResponse({})).toEqual({ hasLnurlw: false, payLinks: [] });
  });
});
