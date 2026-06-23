export interface BlockInfo {
  height: number;
  timestamp: number;
  size: number;
  tx_count: number;
  extras?: {
    medianFee?: number;
    pool?: {
      name?: string;
    };
  };
}

export interface BitcoinDetails {
  height: string;
  timeAgo: string;
  size: string;
  txCount: string;
  miner: string;
  medianFee: string;
}

export const DEFAULT_BITCOIN_DETAILS: BitcoinDetails = {
  height: '000000',
  timeAgo: '0 secs ago',
  size: '0.00 Mb',
  txCount: '0000',
  miner: 'Miner',
  medianFee: '00 sat/vb',
};

export function mergeBitcoinDetails(
  prev: BitcoinDetails,
  details: Partial<BitcoinDetails>
): BitcoinDetails {
  if (isTimeAgoOnlyUpdate(details)) {
    return { ...prev, timeAgo: details.timeAgo! };
  }
  return {
    height: details.height || prev.height,
    timeAgo: details.timeAgo || prev.timeAgo,
    size: details.size || prev.size,
    txCount: details.txCount || prev.txCount,
    miner: details.miner || prev.miner,
    medianFee: details.medianFee || prev.medianFee,
  };
}

export function isTimeAgoOnlyUpdate(details: Partial<BitcoinDetails>): boolean {
  return (
    !details.height &&
    !details.size &&
    !details.txCount &&
    !details.miner &&
    !details.medianFee &&
    !!details.timeAgo
  );
}

export function blockFromMempoolTip(data: {
  height: number;
  timestamp: number;
  size: number;
  tx_count: number;
  extras?: BlockInfo['extras'];
}): BlockInfo {
  return {
    height: data.height,
    timestamp: data.timestamp,
    size: data.size,
    tx_count: data.tx_count,
    extras: data.extras,
  };
}

export function toDetails(block: BlockInfo, timestamp: number): BitcoinDetails {
  return {
    height: String(block.height),
    timeAgo: formatTimeAgo(timestamp),
    size: formatSize(block.size),
    txCount: String(block.tx_count),
    miner: block.extras?.pool?.name ?? 'Miner',
    medianFee: `${Math.round(block.extras?.medianFee ?? 0)} sat/vb`,
  };
}

function formatSize(bytes: number): string {
  const units = ['bytes', 'Kb', 'Mb'];
  let size = Number.parseInt(String(bytes), 10) || 0;
  let idx = 0;
  while (size >= 1000 && idx < units.length - 1) {
    size /= 1000;
    idx += 1;
  }
  return `${size.toFixed(size < 10 && idx > 0 ? 2 : 0)} ${units[idx]}`;
}

export function formatTimeAgo(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const hours = Math.floor(seconds / 3600);
  if (hours > 1) return `${hours} hours ago`;
  const mins = Math.floor(seconds / 60);
  if (mins > 1) return `${mins} mins ago`;
  if (mins === 1) return `${mins} min ago`;
  return 'just now';
}
