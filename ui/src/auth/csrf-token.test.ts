import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  configureCsrfTokenFetcher,
  ensureConfiguredCsrfToken,
  getCsrfToken,
  resetCsrfTokenForTests,
} from './csrf-token';

describe('CSRF token state', () => {
  afterEach(() => {
    resetCsrfTokenForTests();
  });

  it('removes the configured fetcher when resetting test state', async () => {
    const fetcher = vi.fn().mockResolvedValue('token');
    configureCsrfTokenFetcher(fetcher);

    resetCsrfTokenForTests();

    await expect(ensureConfiguredCsrfToken()).rejects.toThrow(
      'CSRF token fetcher is unavailable.',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not let a request from before reset repopulate or clear current state', async () => {
    let resolvePrevious: ((token: string) => void) | undefined;
    let resolveCurrent: ((token: string) => void) | undefined;
    configureCsrfTokenFetcher(
      () =>
        new Promise<string>((resolve) => {
          resolvePrevious = resolve;
        }),
    );
    const previousRequest = ensureConfiguredCsrfToken();

    resetCsrfTokenForTests();
    const currentFetcher = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveCurrent = resolve;
        }),
    );
    configureCsrfTokenFetcher(currentFetcher);
    const currentRequest = ensureConfiguredCsrfToken();

    resolvePrevious?.('stale-token');
    await expect(previousRequest).resolves.toBe('stale-token');
    expect(getCsrfToken()).toBeUndefined();
    expect(ensureConfiguredCsrfToken()).toBe(currentRequest);
    expect(currentFetcher).toHaveBeenCalledTimes(1);

    resolveCurrent?.('current-token');
    await expect(currentRequest).resolves.toBe('current-token');
    expect(getCsrfToken()).toBe('current-token');
  });
});
