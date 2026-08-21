import { defineNitroConfig } from 'nitropack/config';

export default defineNitroConfig({
  compatibilityDate: '2026-08-21',
  modules: ['workflow/nitro'],
  preset: 'vercel',
  srcDir: 'src',
});
