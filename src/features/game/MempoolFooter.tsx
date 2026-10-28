import type { BlockInfo } from '@/game/io/mempool';
import { useMempoolFeed } from '@/features/game/hooks/useMempoolFeed';

interface MempoolFooterProps {
  /** Fired for a new block height, not the once-a-second "time ago" tick. */
  onNewBlock?: (block: BlockInfo) => void;
  /**
   * Extra flash from the match (online block, replay). The live tip flash
   * stays inside the footer so the clock does not re-render the page.
   */
  highlight?: boolean;
  /** Game page uses element ids for highlight CSS animations. */
  withGameElementIds?: boolean;
  showMiner?: boolean;
}

export function MempoolFooter({
  onNewBlock,
  highlight = false,
  withGameElementIds = false,
  showMiner = false,
}: MempoolFooterProps) {
  const feed = useMempoolFeed({ onNewBlock });
  const lit = highlight || feed.footerHighlight;

  return (
    <div id="bitcoinDetails" className={lit ? 'highlight' : ''}>
      <div className="detail">
        <div className="label">Latest Block</div>
        <div
          className="value"
          id={withGameElementIds ? 'bitcoinblockHeight' : undefined}
        >
          {feed.bitcoin.height}
        </div>
      </div>
      <div className="detail">
        <div className="label">Found</div>
        <div
          className="value"
          id={withGameElementIds ? 'bitcoinblockTimeAgo' : undefined}
        >
          {feed.bitcoin.timeAgo}
        </div>
      </div>
      <div className="detail">
        <div className="label">Size</div>
        <div
          className="value"
          id={withGameElementIds ? 'bitcoinblockSize' : undefined}
        >
          {feed.bitcoin.size}
        </div>
      </div>
      <div className="detail">
        <div className="label">TX count</div>
        <div
          className="value"
          id={withGameElementIds ? 'bitcoinblockTXcount' : undefined}
        >
          {feed.bitcoin.txCount}
        </div>
      </div>
      <div className={`detail${showMiner ? '' : ' hide'}`}>
        <div className="label">Found by</div>
        <div
          className="value"
          id={withGameElementIds ? 'bitcoinblockMiner' : undefined}
        >
          {feed.bitcoin.miner}
        </div>
      </div>
      <div className="detail">
        <div className="label">Median fee</div>
        <div
          className="value"
          id={withGameElementIds ? 'bitcoinAvgFee' : undefined}
        >
          {feed.bitcoin.medianFee}
        </div>
      </div>
    </div>
  );
}
