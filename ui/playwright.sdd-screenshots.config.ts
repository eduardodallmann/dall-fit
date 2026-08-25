import { defineConfig } from '@playwright/test';

import {
  playwrightBaseUrl,
  playwrightChromiumProject,
  playwrightWebServer,
} from './playwright-shared-config.js';

export default defineConfig({
  testDir: './tests/sdd-screenshots',
  fullyParallel: true,
  outputDir: './test-results/sdd-screenshots',
  reporter: 'list',
  use: {
    baseURL: playwrightBaseUrl,
    trace: 'off',
  },
  webServer: {
    ...playwrightWebServer,
    reuseExistingServer: false,
    url: undefined,
    wait: { stdout: /Local:\s+http:\/\/127\.0\.0\.1:3100\// },
  },
  projects: [playwrightChromiumProject],
});
