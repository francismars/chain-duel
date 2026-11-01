import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const PORT = 4187;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ABOUT_HEADING = '<h1>About</h1>';

function viteBuild(outDir: string): Promise<void> {
  const vite = path.join(repoRoot, 'node_modules', '.bin', 'vite');
  return new Promise((resolve, reject) => {
    const child = spawn(vite, ['build', '--outDir', outDir], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`vite build exited ${code}`));
    });
  });
}

function startServe(dir: string): ChildProcess {
  const serve = path.join(repoRoot, 'node_modules', '.bin', 'serve');
  return spawn(serve, ['-n', '-L', '-l', `tcp://127.0.0.1:${PORT}`, dir], {
    cwd: repoRoot,
    stdio: 'pipe',
    env: { ...process.env, CI: '1' },
  });
}

async function waitForServe(): Promise<void> {
  const deadline = Date.now() + 20_000;
  let last = 'not up';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(ORIGIN + '/');
      if (response.ok) return;
      last = `status ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`serve did not start: ${last}`);
}

function replaceContents(target: string, source: string): void {
  for (const entry of fs.readdirSync(target)) {
    fs.rmSync(path.join(target, entry), { recursive: true, force: true });
  }
  fs.cpSync(source, target, { recursive: true });
}

function aboutChunk(dir: string): string {
  const names = fs
    .readdirSync(path.join(dir, 'assets'))
    .filter((name) => name.startsWith('About-') && name.endsWith('.js'));
  if (names.length !== 1) {
    throw new Error(
      `expected one About chunk in ${dir}, got ${names.join(', ')}`
    );
  }
  return names[0];
}

/**
 * A stuck blank document used to sit until the heading timeout. Fail when the
 * boot reload already ran and the app is still empty, or when nothing mounts
 * for longer than that guard.
 */
async function waitForAboutOrBlank(page: Page): Promise<void> {
  const deadline = Date.now() + 30_000;
  let blankSince = 0;
  while (Date.now() < deadline) {
    const state = await page
      .evaluate(() => {
        const heading = document.querySelector('h1');
        const about =
          heading != null && (heading.textContent || '').trim() === 'About';
        const root = document.getElementById('root');
        const mounted = Boolean(root && root.childElementCount > 0);
        let boot = false;
        try {
          boot = sessionStorage.getItem('chainduel_bootReload') === '1';
        } catch {
          /* ignore */
        }
        return { about, mounted, boot };
      })
      .catch(() => ({ about: false, mounted: false, boot: false }));
    if (state.about) return;
    if (!state.mounted) {
      if (blankSince === 0) blankSince = Date.now();
      const blankFor = Date.now() - blankSince;
      const bootGaveUp = state.boot && blankFor > 3_000;
      const neverMounted = blankFor > 12_000;
      if (bootGaveUp || neverMounted) {
        throw new Error(
          'blank page: stale-chunk recovery reloaded once and the app did not mount'
        );
      }
    } else {
      blankSince = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await expect(
    page.getByRole('heading', { name: 'About', level: 1 })
  ).toBeVisible({ timeout: 1_000 });
}

async function htmlInRuntimeCaches(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const keys = await caches.keys();
    const found: string[] = [];
    for (const key of keys) {
      if (key.includes('precache')) continue;
      const cache = await caches.open(key);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        if (!response) continue;
        const type = (response.headers.get('content-type') || '').toLowerCase();
        const body = await response.text();
        const html =
          type.includes('text/html') ||
          /^\s*<!doctype html/i.test(body) ||
          /^\s*<html/i.test(body);
        if (html) found.push(`${key} ${request.url}`);
      }
    }
    return found;
  });
}

test('a changed About chunk still renders under the old service worker', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const work = path.join(repoRoot, 'test-results', 'pwa-stale-chunk');
  const buildA = path.join(work, 'a');
  const buildB = path.join(work, 'b');
  const served = path.join(work, 'serve');
  const aboutPath = path.join(repoRoot, 'src', 'pages', 'About.tsx');
  const original = fs.readFileSync(aboutPath, 'utf8');
  if (!original.includes(ABOUT_HEADING)) {
    throw new Error('About heading marker missing');
  }

  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  let server: ChildProcess | undefined;
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await viteBuild(buildA);
    const chunkA = aboutChunk(buildA);
    const workerA = fs.readFileSync(path.join(buildA, 'sw.js'), 'utf8');
    expect(
      workerA,
      'About must be fetched at runtime, not precached'
    ).not.toContain(chunkA);
    expect(workerA).toContain('chain-duel-assets-v2');

    fs.cpSync(buildA, served, { recursive: true });
    server = startServe(served);
    const serveLog: string[] = [];
    server.stderr?.on('data', (chunk: Buffer) => {
      serveLog.push(chunk.toString());
    });
    server.stdout?.on('data', (chunk: Buffer) => {
      serveLog.push(chunk.toString());
    });
    try {
      await waitForServe();
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : error}\n${serveLog.join('')}`
      );
    }

    const missing = await fetch(`${ORIGIN}/assets/does-not-exist.js`);
    expect(missing.status).toBe(404);
    const aboutRoute = await fetch(`${ORIGIN}/about`);
    expect(aboutRoute.status).toBe(200);
    expect(aboutRoute.headers.get('content-type') || '').toContain('text/html');

    await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
      route.fulfill({ status: 200, contentType: 'text/css', body: '' })
    );
    page.setDefaultNavigationTimeout(20_000);
    await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded' });
    // A promise returned from waitForFunction is not bounded by its timeout.
    await page.evaluate(() => {
      const mark = () => {
        void navigator.serviceWorker.getRegistration().then((registration) => {
          (window as Window & { __swActive?: boolean }).__swActive = Boolean(
            registration?.active
          );
        });
      };
      mark();
      window.setInterval(mark, 250);
    });
    await page.waitForFunction(
      () => (window as Window & { __swActive?: boolean }).__swActive === true,
      undefined,
      { timeout: 20_000 }
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
      undefined,
      { timeout: 15_000 }
    );

    fs.writeFileSync(
      aboutPath,
      original.replace(ABOUT_HEADING, '<h1 data-build="b">About</h1>')
    );
    try {
      await viteBuild(buildB);
    } finally {
      fs.writeFileSync(aboutPath, original);
    }
    const chunkB = aboutChunk(buildB);
    expect(chunkB).not.toBe(chunkA);
    replaceContents(served, buildB);
    expect(fs.existsSync(path.join(served, 'assets', chunkA))).toBe(false);

    await page.goto(ORIGIN + '/about', { waitUntil: 'commit' });
    await waitForAboutOrBlank(page);
    expect(await htmlInRuntimeCaches(page)).toEqual([]);
  } finally {
    fs.writeFileSync(aboutPath, original);
    server?.kill();
    await context.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
});
