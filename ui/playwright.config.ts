import { defineConfig } from '@playwright/test';

import {
  playwrightBaseUrl,
  playwrightChromiumProject,
  playwrightWebServer,
} from './playwright-shared-config.js';

export default defineConfig({
  testDir: './tests/integration',
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: playwrightBaseUrl,
    trace: 'on-first-retry',
  },
  webServer: playwrightWebServer,
  projects: [playwrightChromiumProject],
});
