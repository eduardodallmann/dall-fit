import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: false,
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['test/**/*.e2e-spec.ts'],
    maxConcurrency: 1,
  },
});
