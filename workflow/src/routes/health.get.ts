import { defineEventHandler } from 'h3';

export default defineEventHandler(() => {
  const result = { status: 'ok' } as const;

  return result;
});
