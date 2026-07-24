import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/integration',
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 3100',
    env: {
      VITE_API_URL: 'http://127.0.0.1:3100/api',
      VITE_ENABLE_API_MOCKS: 'true',
    },
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === 'true',
    timeout: 120_000,
    url: 'http://127.0.0.1:3100',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
