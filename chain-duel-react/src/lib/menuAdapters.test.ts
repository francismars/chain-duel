import { describe, expect, it } from 'vitest';
import { parseMenuResponse } from './menuAdapters';

describe('parseMenuResponse', () => {
  it('detects lnurlw object payload', () => {
    const result = parseMenuResponse({ lnurlw: 'lnurlw://abc' });
    expect(result.hasLnurlw).toBe(true);
    expect(result.payLinks).toEqual([]);
    expect(result.modeMeta).toBeNull();
    expect(result.nostrMeta).toBeNull();
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
    expect(result.modeMeta?.mode).toBe('P2P');
    expect(result.modeMeta?.winnersCount).toBeUndefined();
  });

  it('reads double-or-nothing winners and stacks from lightning pay links', () => {
    const result = parseMenuResponse([
      {
        id: 'p1',
        lnurlp: 'lnurlp://p1',
        description: 'Player 1',
        min: 100,
        mode: 'P2P',
        winners: ['Player 1'],
        players: {
          'Player 1': { name: 'Alice', value: 5700 },
          'Player 2': { name: 'Bob', value: 0 },
        },
      },
      {
        id: 'p2',
        lnurlp: 'lnurlp://p2',
        description: 'Player 2',
        min: 5700,
        mode: 'P2P',
        winners: ['Player 1'],
        players: {
          'Player 1': { name: 'Alice', value: 5700 },
          'Player 2': { name: 'Bob', value: 0 },
        },
      },
    ]);

    expect(result.payLinks).toHaveLength(2);
    expect(result.payLinks[0].min).toBe(100);
    expect(result.payLinks[1].min).toBe(5700);
    expect(result.modeMeta?.mode).toBe('P2P');
    expect(result.modeMeta?.winnersCount).toBe(1);
    expect(result.modeMeta?.winners).toEqual(['Player 1']);
    expect(result.modeMeta?.players?.['Player 1']?.value).toBe(5700);
    expect(result.modeMeta?.players?.['Player 2']?.value).toBe(0);
  });

  it('uses the latest nostr note for rematch metadata', () => {
    const result = parseMenuResponse([
      {
        id: 'first',
        note1: 'note1original',
        emojis: 'AAAA',
        min: 3000,
        mode: 'P2PNOSTR',
      },
      {
        id: 'rematch',
        note1: 'note1rematch',
        emojis: 'AAAA',
        min: 5700,
        mode: 'P2PNOSTR',
      },
    ]);

    expect(result.nostrMeta?.note1).toBe('note1rematch');
    expect(result.nostrMeta?.min).toBe(5700);
    expect(result.modeMeta?.mode).toBe('P2PNOSTR');
  });

  it('returns empty for unknown shapes', () => {
    expect(parseMenuResponse(null)).toEqual({
      hasLnurlw: false,
      payLinks: [],
      modeMeta: null,
      nostrMeta: null,
    });
    expect(parseMenuResponse('x')).toEqual({
      hasLnurlw: false,
      payLinks: [],
      modeMeta: null,
      nostrMeta: null,
    });
    expect(parseMenuResponse({})).toEqual({
      hasLnurlw: false,
      payLinks: [],
      modeMeta: null,
      nostrMeta: null,
    });
  });
});
