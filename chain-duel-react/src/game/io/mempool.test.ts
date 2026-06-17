import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchLatestMempoolBlock,
  toDetails,
  type BlockInfo,
} from './mempool';

const SAMPLE_BLOCK: BlockInfo = {
  height: 954135,
  timestamp: 1_700_000_000,
  size: 1_650_403,
  tx_count: 5197,
  extras: {
    medianFee: 1.1,
    pool: { name: 'MARA Pool' },
  },
};

describe('fetchLatestMempoolBlock', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to the next host when the first request fails', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('https://down.example')) {
        throw new Error('network down');
      }
      if (url.endsWith('/api/blocks/tip/hash')) {
        return {
          ok: true,
          text: async () => 'abc123',
        };
      }
      return {
        ok: true,
        json: async () => SAMPLE_BLOCK,
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const block = await fetchLatestMempoolBlock([
      'https://down.example',
      'https://mirror.example',
    ]);

    expect(block).toEqual(SAMPLE_BLOCK);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://mirror.example/api/blocks/tip/hash'
    );
  });

  it('trims whitespace from the tip hash before loading block data', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/blocks/tip/hash')) {
        return {
          ok: true,
          text: async () => 'abc123\n',
        };
      }
      expect(url).toBe('https://mirror.example/api/v1/block/abc123');
      return {
        ok: true,
        json: async () => SAMPLE_BLOCK,
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchLatestMempoolBlock(['https://mirror.example']);
  });
});

describe('toDetails', () => {
  it('maps block fields into footer display values', () => {
    expect(toDetails(SAMPLE_BLOCK, SAMPLE_BLOCK.timestamp)).toEqual({
      height: '954135',
      timeAgo: expect.any(String),
      size: '1.65 Mb',
      txCount: '5197',
      miner: 'MARA Pool',
      medianFee: '1 sat/vb',
    });
  });
});
