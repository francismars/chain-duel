import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_PROXY_TARGET ?? 'http://localhost:3000';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      allowedHosts: [
        '.ngrok-free.app',
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
