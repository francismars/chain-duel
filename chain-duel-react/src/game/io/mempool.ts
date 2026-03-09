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

interface FeedCallbacks {
  onInit: (details: BitcoinDetails) => void;
  onNewBlock: (block: BlockInfo, details: BitcoinDetails) => void;
}

export function startMempoolFeed(callbacks: FeedCallbacks): () => void {
  let disposed = false;
  let latestHeight = -1;
  let latestTimestamp = 0;

  const update = async () => {
    try {
      const tipHash = await fetchText('https://mempool.space/api/blocks/tip/hash');
      const block = (await fetchJson(`https://mempool.space/api/v1/block/${tipHash}`)) as BlockInfo;
      if (disposed) return;
      latestTimestamp = block.timestamp;
      const details = toDetails(block, latestTimestamp);
      if (latestHeight === -1) {
        latestHeight = block.height;
        callbacks.onInit(details);
      } else if (block.height > latestHeight) {
        latestHeight = block.height;
        callbacks.onNewBlock(block, details);
      } else {
        callbacks.onInit(details);
      }
    } catch {
      // ignore transient mempool failures
    }
  };

  const timer = window.setInterval(() => {
    void update();
  }, 5000);

  const timeAgoTimer = window.setInterval(() => {
    if (latestTimestamp === 0) return;
    callbacks.onInit({
      height: '',
      timeAgo: formatTimeAgo(latestTimestamp),
      size: '',
      txCount: '',
      miner: '',
      medianFee: '',
    });
  }, 1000);

  void update();

  return () => {
    disposed = true;
    window.clearInterval(timer);
    window.clearInterval(timeAgoTimer);
  };
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed ${response.status}`);
  }
  return response.text();
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed ${response.status}`);
  }
  return response.json();
}

function toDetails(block: BlockInfo, timestamp: number): BitcoinDetails {
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

function formatTimeAgo(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const hours = Math.floor(seconds / 3600);
  if (hours > 1) return `${hours} hours ago`;
  const mins = Math.floor(seconds / 60);
  if (mins > 1) return `${mins} mins ago`;
  if (mins === 1) return `${mins} min ago`;
  return 'just now';
}
