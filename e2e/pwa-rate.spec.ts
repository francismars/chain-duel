import { devices, expect, test, type Page } from '@playwright/test';

const ORIGIN = 'http://127.0.0.1:4173';

type Received = {
  response: {
    url: string;
    fromDiskCache?: boolean;
    fromServiceWorker?: boolean;
    fromPrefetchCache?: boolean;
  };
};

/** Largest number of timestamps inside any window of `windowMs`. */
function maxBurst(times: number[], windowMs: number): number {
  const sorted = [...times].sort((a, b) => a - b);
  let max = 0;
  let start = 0;
  for (let end = 0; end < sorted.length; end += 1) {
    while (sorted[end] - sorted[start] > windowMs) start += 1;
    max = Math.max(max, end - start + 1);
  }
  return max;
}

async function countServerHits(page: Page): Promise<number[]> {
  const hits: number[] = [];
  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  session.on('Network.responseReceived', (payload: Received) => {
    const { response } = payload;
    if (
      response.fromDiskCache ||
      response.fromServiceWorker ||
      response.fromPrefetchCache
    ) {
      return;
    }
    if (!response.url.startsWith(ORIGIN)) return;
    hits.push(Date.now());
  });
  return hits;
}

test.use({ ...devices['Pixel 7'] });

test.describe('phone cold visit', () => {
  for (const route of [
    {
      path: '/',
      ready: (page: Page) =>
        page.getByRole('heading', { name: 'CHAIN DUEL', level: 1 }),
    },
    {
      path: '/practice',
      ready: (page: Page) => page.getByRole('main', { name: 'Practice play' }),
    },
  ]) {
    test(`${route.path} stays within 40 server requests in any 2s`, async ({
      page,
    }) => {
      const hits = await countServerHits(page);
      const started = Date.now();
      await page.goto(route.path);
      await expect(route.ready(page)).toBeVisible();
      const remaining = 10_000 - (Date.now() - started);
      if (remaining > 0) await page.waitForTimeout(remaining);
      const firstTenSeconds = hits.filter((time) => time <= started + 10_000);
      const burst = maxBurst(firstTenSeconds, 2_000);
      expect(
        burst,
        `${route.path} sent ${burst} requests in one 2s window (${firstTenSeconds.length} in 10s)`
      ).toBeLessThanOrEqual(40);
    });
  }
});
