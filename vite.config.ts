import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnv, type Plugin } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** nginx allows 20 r/s with a burst of 40. The install precache must stay under that. */
const PRECACHE_FILE_CAP = 15;

const SHELL_ASSET = /^(?:\.?\/)?(assets\/[^"?#]+\.(?:js|css))$/;

/**
 * index.html plus the entry JS/CSS and the chunks that file modulepreloads.
 * Everything else under /assets is cached when a page actually asks for it.
 */
function shellPrecacheUrls(html: string): Set<string> {
  const keep = new Set<string>(['index.html']);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const asset = SHELL_ASSET.exec(match[1]);
    if (asset) keep.add(asset[1]);
  }
  return keep;
}

type PrecacheEntry = { url: string; revision: string | null; size: number };

function shellPrecacheManifest(entries: PrecacheEntry[]) {
  const html = fs.readFileSync(
    path.join(rootDir, 'dist', 'index.html'),
    'utf8'
  );
  const keep = shellPrecacheUrls(html);
  const manifest = entries.filter((entry) => keep.has(entry.url));
  const missing = [...keep].filter(
    (url) => !manifest.some((entry) => entry.url === url)
  );
  if (missing.length > 0) {
    throw new Error(`PWA shell missing from the build: ${missing.join(', ')}`);
  }
  if (manifest.length > PRECACHE_FILE_CAP) {
    throw new Error(
      `PWA precache is ${manifest.length} files (max ${PRECACHE_FILE_CAP}): ${manifest
        .map((entry) => entry.url)
        .join(', ')}`
    );
  }
  return { manifest };
}

/** Replaces a previously installed worker. Clears caches, then unregisters, then reloads open windows. */
const KILL_SWITCH_SW = `self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      const clients = await self.clients.matchAll({ type: 'window' });
      await self.registration.unregister();
      await Promise.all(
        clients.map((client) =>
          client instanceof WindowClient ? client.navigate(client.url) : undefined
        )
      );
    })()
  );
});
`;

function pwaKillSwitch(disabled: boolean): Plugin {
  return {
    name: 'pwa-kill-switch',
    apply: 'build',
    closeBundle: {
      sequential: true,
      order: 'post',
      handler() {
        if (!disabled) return;
        fs.writeFileSync(path.join(rootDir, 'dist', 'sw.js'), KILL_SWITCH_SW);
      },
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_PROXY_TARGET ?? 'http://localhost:3001';
  const pwaDisabled = process.env.VITE_PWA_DISABLED === 'true';

  return {
    plugins: [
      react(),
      VitePWA({
        // Registration lives in AppUpdatePrompt so it waits until after first paint.
        injectRegister: false,
        registerType: 'prompt',
        // index.html already links site.webmanifest.
        manifest: false,
        selfDestroying: pwaDisabled,
        integration: { closeBundleOrder: 'pre' },
        workbox: {
          globPatterns: ['index.html', 'assets/*.{js,css}'],
          globIgnores: ['**/*.map'],
          manifestTransforms: [shellPrecacheManifest],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/loadconfig/, /^\/socket\.io/],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /\/socket\.io\//,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /\/loadconfig(?:\?|$)/,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: ({ request, sameOrigin, url }) =>
                sameOrigin &&
                request.method === 'GET' &&
                url.pathname.startsWith('/assets/') &&
                /\.(?:js|css)$/.test(url.pathname),
              handler: 'CacheFirst',
              options: {
                cacheName: 'chain-duel-assets',
                expiration: {
                  maxEntries: 150,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [200],
                },
              },
            },
            {
              urlPattern: ({ request, sameOrigin, url }) =>
                sameOrigin &&
                request.method === 'GET' &&
                /\.(?:png|jpe?g|webp|gif|svg|ico|woff2?|ttf|eot|wav|mp3|ogg|m4a|aac)$/i.test(
                  url.pathname
                ),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'chain-duel-static',
                expiration: {
                  maxEntries: 80,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
      pwaKillSwitch(pwaDisabled),
    ],
    build: {
      sourcemap: true,
    },
    resolve: {
      alias: {
        '@': path.resolve(rootDir, './src'),
      },
    },
    test: {
      exclude: [...configDefaults.exclude, 'e2e/**'],
    },
    // legacy/ is the retired Express app. Its HTML is not a Vite entry.
    optimizeDeps: {
      entries: ['index.html'],
    },
    server: {
      port: 5173,
      watch: {
        ignored: ['**/legacy/**'],
      },
      allowedHosts: [
        '.ngrok-free.app',
        '.ngrok-free.dev',
        'purplish-isaac-unimperative.ngrok-free.dev',
      ],
      proxy: {
        // Backend (marspayTS); target from .env VITE_PROXY_TARGET
        '/loadconfig': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
