import { defineConfig } from '@playwright/test';

/**
 * Chromium smoke against `vite preview` (the production bundle).
 * CI builds first; this server only serves `dist/`.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    reducedMotion: 'reduce',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
