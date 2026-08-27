import { devices } from '@playwright/test';

export const playwrightBaseUrl = 'http://127.0.0.1:3100';

export const playwrightChromiumProject = {
  name: 'chromium',
  use: { ...devices['Desktop Chrome'] },
};

export const playwrightWebServer = {
  command: 'pnpm dev --host 127.0.0.1 --port 3100',
  env: {
    VITE_API_URL: 'http://127.0.0.1:3100/api',
    VITE_ENABLE_API_MOCKS: 'true',
  },
  reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === 'true',
  timeout: 120_000,
  url: playwrightBaseUrl,
};
