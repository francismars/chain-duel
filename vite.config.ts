import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_PROXY_TARGET ?? 'http://localhost:3001';

  return {
    plugins: [react()],
    build: {
      sourcemap: true,
    },
    resolve: {
      alias: {
        '@': path.resolve(rootDir, './src'),
      },
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
