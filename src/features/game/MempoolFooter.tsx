import type { BitcoinDetails } from '@/game/io/mempool';

interface MempoolFooterProps {
  bitcoin: BitcoinDetails;
  highlight?: boolean;
  /** Game page uses element ids for highlight CSS animations. */
  withGameElementIds?: boolean;
  showMiner?: boolean;
}

export function MempoolFooter({
  bitcoin,
  highlight = false,
  withGameElementIds = false,
  showMiner = false,
}: MempoolFooterProps) {
  return (
    <div id="bitcoinDetails" className={highlight ? 'highlight' : ''}>
      <div className="detail">
        <div className="label">Latest Block</div>
        <div
          className="value"
          id={withGameElementIds ? 'bitcoinblockHeight' : undefined}
        >
          {bitcoin.height}
        </div>
      </div>
      <div className="detail">
        <div className="label">Found</div>
        <div
          className="value"
          id={withGameElementIds ? 'bitcoinblockTimeAgo' : undefined}
        >
          {bitcoin.timeAgo}
        </div>
      </div>
      <div className="detail">
        <div className="label">Size</div>
        <div
          className="value"
          id={withGameElementIds ? 'bitcoinblockSize' : undefined}
        >
          {bitcoin.size}
        </div>
      </div>
      <div className="detail">
        <div className="label">TX count</div>
        <div
          className="value"
          id={withGameElementIds ? 'bitcoinblockTXcount' : undefined}
        >
          {bitcoin.txCount}
        </div>
      </div>
      <div className={`detail${showMiner ? '' : ' hide'}`}>
        <div className="label">Found by</div>
        <div
          className="value"
          id={withGameElementIds ? 'bitcoinblockMiner' : undefined}
        >
          {bitcoin.miner}
        </div>
      </div>
      <div className="detail">
        <div className="label">Median fee</div>
        <div
          className="value"
          id={withGameElementIds ? 'bitcoinAvgFee' : undefined}
        >
          {bitcoin.medianFee}
        </div>
      </div>
    </div>
  );
}
