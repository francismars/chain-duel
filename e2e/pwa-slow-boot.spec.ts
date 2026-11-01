import { expect, test } from '@playwright/test';

const ORIGIN = 'http://127.0.0.1:4173';
/** 400 kilobits per second. */
const SLOW_BYTES_PER_SEC = (400 * 1000) / 8;

test('a slow cold visit to /practice does not boot-reload', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const documents: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() !== 'document') return;
    if (!request.url().startsWith(ORIGIN)) return;
    documents.push(request.url());
  });
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' })
  );
  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 20,
    downloadThroughput: SLOW_BYTES_PER_SEC,
    uploadThroughput: SLOW_BYTES_PER_SEC,
  });

  await page.goto('/practice');
  await expect(page.getByRole('main', { name: 'Practice play' })).toBeVisible();
  expect(
    documents,
    `boot reload fetched the document ${documents.length} times`
  ).toHaveLength(1);
});
