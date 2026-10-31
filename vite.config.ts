import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_PROXY_TARGET ?? 'http://localhost:3001';

  return {
    plugins: [
      react(),
      VitePWA({
        // Registration lives in AppUpdatePrompt so a match is never reloaded.
        injectRegister: false,
        registerType: 'prompt',
        // index.html already links site.webmanifest.
        manifest: false,
        includeAssets: [
          'images/favicon_package/favicon.ico',
          'images/favicon_package/apple-touch-icon.png',
          'images/favicon_package/android-chrome-192x192.png',
          'images/favicon_package/android-chrome-512x512.png',
          'fonts/BureauGrotesque/BureauGrotesque.woff2',
          'sound/button-select.mp3',
          'sound/button-focus.mp3',
          'sound/powerup.mp3',
          'sound/chain_duel_warn.wav',
          'sound/chain_duel_shrink.wav',
          'sound/chain_duel_end.wav',
        ],
        workbox: {
          // Hashed JS/CSS/HTML only. Images, fonts, and music fill in on use.
          globPatterns: ['**/*.{js,css,html}'],
          globIgnores: ['**/*.map'],
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
