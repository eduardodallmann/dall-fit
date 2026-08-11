import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

import { MOCK_REQUEST_ID } from './src/mocks/mock-constants.js';

const applicationBackgroundColor = '#f7f7f7';

const mockOAuthNavigationPlugin: Plugin = {
  name: 'dall-fit-mock-oauth-navigation',
  configureServer(server) {
    server.middlewares.use('/api/auth/google', (request, response, next) => {
      if (
        process.env.VITE_ENABLE_API_MOCKS !== 'true' ||
        request.method !== 'GET'
      ) {
        next();
        return;
      }

      response.statusCode = 302;
      response.setHeader('Location', '/dash');
      response.setHeader('x-request-id', MOCK_REQUEST_ID);
      response.end();
    });
  },
};

// https://vite.dev/config/
export default defineConfig({
  optimizeDeps: {
    include: ['@dall-fit/types'],
  },
  plugins: [
    react(),
    mockOAuthNavigationPlugin,
    tailwindcss(),
    VitePWA({
      devOptions: {
        enabled: false,
      },
      includeAssets: [
        'apple-touch-icon-180x180.png',
        'favicon.ico',
        'favicon.svg',
      ],
      injectRegister: false,
      manifest: {
        background_color: applicationBackgroundColor,
        description: 'Acesse o Dall Fit pelo seu dispositivo.',
        display: 'standalone',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        id: '/',
        lang: 'pt-BR',
        name: 'Dall Fit',
        prefer_related_applications: false,
        scope: '/',
        short_name: 'Dall Fit',
        start_url: '/dash',
        theme_color: applicationBackgroundColor,
      },
      registerType: 'prompt',
      workbox: {
        cleanupOutdatedCaches: true,
        globIgnores: ['**/mockServiceWorker.js'],
        globPatterns: ['**/*.{js,css,html,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/auth(?:\/|$)/],
      },
    }),
  ],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx'],
    },
  },
});
