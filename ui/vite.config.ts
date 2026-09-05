import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

import { MOCK_REQUEST_ID } from './src/mocks/mock-constants.js';

const applicationBackgroundColor = '#f7f7f7';

const pwaUpdateTestBuildMarker: Plugin = {
  name: 'dall-fit-pwa-update-test-build-marker',
  transformIndexHtml() {
    const build = process.env.VITE_PWA_TEST_BUILD;
    if (build === undefined) return;

    return [
      {
        attrs: { content: build, name: 'dall-fit-pwa-test-build' },
        injectTo: 'head',
        tag: 'meta',
      },
    ];
  },
};

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

      const cookies = Object.fromEntries(
        (request.headers.cookie ?? '').split(';').map((entry) => {
          const [name, value] = entry.trim().split('=');
          return [name, value];
        }),
      );
      const outcome = cookies['dall-fit-mock-login'];
      response.statusCode = 302;
      response.setHeader(
        'Location',
        outcome === 'oauth-failed' ? '/?authError=oauth_failed' : '/dash',
      );
      response.setHeader('x-request-id', MOCK_REQUEST_ID);
      if (outcome !== 'oauth-failed')
        response.setHeader('Set-Cookie', [
          'dall-fit-revoked=; Path=/; Max-Age=0',
          `dall-fit-mock-session=${outcome === 'admin' ? 'admin' : 'authenticated'}; Path=/; SameSite=Lax`,
        ]);
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
    pwaUpdateTestBuildMarker,
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
    env: {
      VITE_API_URL: 'http://localhost:4000',
      VITE_ENABLE_API_MOCKS: 'true',
    },
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
