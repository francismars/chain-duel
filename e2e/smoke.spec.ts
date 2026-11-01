import {
  devices,
  expect,
  test,
  type Locator,
  type Page,
} from '@playwright/test';

const pixel7 = devices['Pixel 7'];

/** Landscape phone. Coarse pointer comes from Playwright's mobile emulation. */
const phoneLandscape = {
  userAgent: pixel7.userAgent,
  viewport: { width: 915, height: 412 },
  screen: { width: 915, height: 412 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
};

/** Same phone, held upright. */
const phonePortrait = {
  userAgent: pixel7.userAgent,
  viewport: { width: 412, height: 915 },
  screen: { width: 412, height: 915 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
};

/** 1v1 quick match: one human, so the landscape stick has a seat to drive. */
const PRACTICE_GAME_CONFIG = {
  mode: 'PRACTICE',
  sessionOrigin: 'practice',
  practiceHudLabel: 'PRACTICE · 1v1 · CVG',
  teamMode: 'solo',
  practiceMode: true,
  p1Human: true,
  p2Human: false,
  p3Human: false,
  p4Human: false,
  p1Name: 'Player 1',
  p2Name: 'BigToshi',
  aiTier: 'stacker',
  convergenceMode: true,
  powerupMode: false,
};

const routes: { path: string; ready: (page: Page) => Locator }[] = [
  {
    path: '/',
    ready: (page) =>
      page.getByRole('heading', { name: 'CHAIN DUEL', level: 1 }),
  },
  {
    path: '/practice',
    ready: (page) =>
      page.getByRole('heading', { name: 'QUICK MATCH', level: 2 }),
  },
  {
    path: '/about',
    ready: (page) => page.getByRole('heading', { name: 'About', level: 1 }),
  },
  {
    path: '/config',
    ready: (page) => page.locator('.page-title', { hasText: /^Config$/ }),
  },
];

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
}

async function openPracticeMatch(page: Page): Promise<void> {
  await page.addInitScript((config) => {
    sessionStorage.setItem('gameConfig', JSON.stringify(config));
  }, PRACTICE_GAME_CONFIG);
  await page.goto('/game');
}

async function installKeyCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as Window & { __chainDuelKeys?: string[] };
    target.__chainDuelKeys = [];
    window.addEventListener('keydown', (event) => {
      target.__chainDuelKeys?.push(event.code);
    });
  });
}

async function capturedKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const target = window as Window & { __chainDuelKeys?: string[] };
    return [...(target.__chainDuelKeys ?? [])];
  });
}

async function clearCapturedKeys(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as Window & { __chainDuelKeys?: string[] };
    target.__chainDuelKeys = [];
  });
}

/** Real touch stream. The stick ignores mouse pointers. */
async function touchSwipe(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number }
): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: to.x, y: to.y }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await session.detach();
}

test.describe('desktop 1440x900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const route of routes) {
    test(`${route.path} renders without sideways scroll`, async ({ page }) => {
      await page.goto(route.path);
      await expect(route.ready(page)).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  }

  test('home on a practice match asks before leaving', async ({ page }) => {
    await openPracticeMatch(page);
    await expect(
      page.locator('.match-start__word', { hasText: /^TAP$/ })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Home' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Leave practice game' })
    ).toBeVisible();
  });
});

test.describe('phone landscape 915x412', () => {
  test.use(phoneLandscape);

  for (const route of routes) {
    test(`${route.path} renders without sideways scroll`, async ({ page }) => {
      await page.goto(route.path);
      await expect(route.ready(page)).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  }

  test('a tap confirms and swipes send the bound keys', async ({ page }) => {
    await openPracticeMatch(page);
    const media = await page.evaluate(() => ({
      coarse: window.matchMedia('(pointer: coarse)').matches,
      landscape: window.matchMedia('(orientation: landscape)').matches,
    }));
    expect(media).toEqual({ coarse: true, landscape: true });

    await expect(
      page.locator('.match-start__word', { hasText: /^TAP$/ })
    ).toBeVisible();
    await installKeyCapture(page);

    const center = { x: 460, y: 210 };
    await page.touchscreen.tap(center.x, center.y);
    await expect.poll(() => capturedKeys(page)).toContain('Space');

    const swipes: { to: { x: number; y: number }; code: string }[] = [
      { to: { x: center.x, y: center.y - 120 }, code: 'KeyW' },
      { to: { x: center.x + 120, y: center.y }, code: 'KeyD' },
      { to: { x: center.x, y: center.y + 120 }, code: 'KeyS' },
    ];
    for (const swipe of swipes) {
      await clearCapturedKeys(page);
      await touchSwipe(page, center, swipe.to);
      await expect.poll(() => capturedKeys(page)).toContain(swipe.code);
    }
  });
});

test.describe('phone portrait', () => {
  test.use(phonePortrait);

  test('a practice match shows the steer pad', async ({ page }) => {
    await openPracticeMatch(page);
    const media = await page.evaluate(() => ({
      coarse: window.matchMedia('(pointer: coarse)').matches,
      portrait: window.matchMedia('(orientation: portrait)').matches,
    }));
    expect(media).toEqual({ coarse: true, portrait: true });
    await expect(page.locator('.touch-pad__label')).toHaveText(
      'Drag to steer · tap to start'
    );
    await expect(
      page.locator('.match-start__word', { hasText: /^TAP$/ })
    ).toBeVisible();
  });
});
