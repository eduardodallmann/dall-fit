import type { AxiosResponse, GenericAbortSignal } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';

import {
  activateSession,
  endSession,
  resetSessionLifecycleForTests,
} from '~/auth/session-lifecycle';
import { apiClient, DEFAULT_REQUEST_TIMEOUT } from '~/core/http/api-client';

describe('API client transport policy', () => {
  afterEach(() => resetSessionLifecycleForTests());

  it('uses the finite default timeout and combines query and session signals', async () => {
    await activateSession('person-1', 'admin');
    const queryController = new AbortController();
    let transportSignal: GenericAbortSignal | undefined;

    await apiClient.get('/transport-policy', {
      adapter: (config) => {
        transportSignal = config.signal;
        return Promise.resolve({
          config,
          data: {},
          headers: {},
          status: 200,
          statusText: 'OK',
        } as AxiosResponse);
      },
      signal: queryController.signal,
    });

    expect(apiClient.defaults.timeout).toBe(DEFAULT_REQUEST_TIMEOUT);
    expect(transportSignal).toBeDefined();
    expect(transportSignal).not.toBe(queryController.signal);
    queryController.abort();
    expect(transportSignal?.aborted).toBe(true);
  });

  it('aborts authenticated transport when its session generation ends', async () => {
    await activateSession('person-1', 'admin');
    let transportSignal: GenericAbortSignal | undefined;

    await apiClient.get('/session-transport', {
      adapter: (config) => {
        transportSignal = config.signal;
        return Promise.resolve({
          config,
          data: {},
          headers: {},
          status: 200,
          statusText: 'OK',
        } as AxiosResponse);
      },
    });
    await endSession('logout');

    expect(transportSignal?.aborted).toBe(true);
  });
});
