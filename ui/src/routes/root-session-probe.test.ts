import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { probeRootSession } from '~/routes/root-session-probe';

describe('probeRootSession', () => {
  let queryClient: QueryClient;

  afterEach(() => {
    queryClient.clear();
    vi.unstubAllEnvs();
  });

  it('returns replace-with-dash when the session is authenticated', async () => {
    vi.stubEnv('VITE_ENABLE_API_MOCKS', 'true');
    queryClient = new QueryClient();

    const decision = await probeRootSession({
      mockAuth: 'authenticated',
      queryClient,
    });

    expect(decision).toBe('replace-with-dash');
  });

  it('returns public-entry when the session is unauthenticated', async () => {
    vi.stubEnv('VITE_ENABLE_API_MOCKS', 'true');
    queryClient = new QueryClient();

    const decision = await probeRootSession({
      mockAuth: 'unauthenticated',
      queryClient,
    });

    expect(decision).toBe('public-entry');
  });

  it('returns public-entry on technical errors', async () => {
    vi.stubEnv('VITE_ENABLE_API_MOCKS', 'true');
    queryClient = new QueryClient();

    const decision = await probeRootSession({
      mockAuth: 'error',
      queryClient,
    });

    expect(decision).toBe('public-entry');
  });

  it('uses cached data instead of issuing a duplicate request', async () => {
    vi.stubEnv('VITE_ENABLE_API_MOCKS', 'true');
    queryClient = new QueryClient();

    await probeRootSession({
      mockAuth: 'authenticated',
      queryClient,
    });

    const decision = await probeRootSession({
      mockAuth: 'authenticated',
      queryClient,
    });

    expect(decision).toBe('replace-with-dash');
  });
});
