import { describe, expect, it } from 'vitest';
import {
  isTimeAgoOnlyUpdate,
  mergeBitcoinDetails,
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

describe('mergeBitcoinDetails', () => {
  it('updates only timeAgo for ticker refreshes', () => {
    const prev = toDetails(SAMPLE_BLOCK, SAMPLE_BLOCK.timestamp);
    const next = { timeAgo: '2 mins ago' };
    expect(isTimeAgoOnlyUpdate(next)).toBe(true);
    expect(mergeBitcoinDetails(prev, next)).toEqual({
      ...prev,
      timeAgo: '2 mins ago',
    });
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
