import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '@/hooks/useSocket';
import {
  blockFromMempoolTip,
  DEFAULT_BITCOIN_DETAILS,
  formatTimeAgo,
  mergeBitcoinDetails,
  toDetails,
  type BitcoinDetails,
  type BlockInfo,
} from '@/game/io/mempool';

export interface UseMempoolFeedOptions {
  /** When false, no socket listener runs. */
  enabled?: boolean;
  /** Called on a new block height (not on initial tip sync). */
  onNewBlock?: (block: BlockInfo) => void;
}

export interface UseMempoolFeedResult {
  bitcoin: BitcoinDetails;
  footerHighlight: boolean;
  setFooterHighlight: (highlight: boolean) => void;
}

/** Mempool footer feed via server `mempoolTip` socket events only. */
export function useMempoolFeed(
  options: UseMempoolFeedOptions = {}
): UseMempoolFeedResult {
  const { enabled = true, onNewBlock } = options;
  const { socket } = useSocket();
  const [bitcoin, setBitcoin] = useState<BitcoinDetails>(DEFAULT_BITCOIN_DETAILS);
  const [footerHighlight, setFooterHighlight] = useState(false);
  const latestTimestampRef = useRef(0);
  const onNewBlockRef = useRef(onNewBlock);
  onNewBlockRef.current = onNewBlock;

  const applyTip = useCallback((block: BlockInfo, isNewBlock: boolean) => {
    latestTimestampRef.current = block.timestamp;
    setBitcoin(toDetails(block, block.timestamp));
    if (!isNewBlock) return;
    setFooterHighlight(true);
    window.setTimeout(() => setFooterHighlight(false), 2000);
    onNewBlockRef.current?.(block);
  }, []);

  useEffect(() => {
    if (!socket || !enabled) return;

    const onMempoolTip = (data: {
      height: number;
      timestamp: number;
      size: number;
      tx_count: number;
      extras?: BlockInfo['extras'];
      isNewBlock: boolean;
    }) => {
      applyTip(blockFromMempoolTip(data), data.isNewBlock);
    };

    socket.on('mempoolTip', onMempoolTip);
    return () => {
      socket.off('mempoolTip', onMempoolTip);
    };
  }, [socket, enabled, applyTip]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      if (latestTimestampRef.current === 0) return;
      setBitcoin((prev) =>
        mergeBitcoinDetails(prev, {
          timeAgo: formatTimeAgo(latestTimestampRef.current),
        })
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  return { bitcoin, footerHighlight, setFooterHighlight };
}
