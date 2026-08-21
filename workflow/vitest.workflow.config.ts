import { fileURLToPath } from 'node:url';

import { workflow } from '@workflow/vitest';
import { defineConfig } from 'vitest/config';

const workflowProjectDirectory = fileURLToPath(new URL('.', import.meta.url));
const workflowSourceDirectory = fileURLToPath(
  new URL('./src', import.meta.url),
);

export default defineConfig({
  root: workflowSourceDirectory,
  plugins: [
    workflow({
      cwd: workflowSourceDirectory,
      rootDir: workflowProjectDirectory,
    }),
  ],
  test: {
    environment: 'node',
    include: ['**/*.workflow.spec.ts'],
    testTimeout: 60_000,
  },
});
