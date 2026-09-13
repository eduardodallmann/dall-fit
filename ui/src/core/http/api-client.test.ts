import type { AxiosHeaders, AxiosResponse, GenericAbortSignal } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';

import {
  configureSessionChannel,
  resetSessionChannelForTests,
} from '~/auth/session-channel';
import {
  activateSession,
  endSession,
  resetSessionLifecycleForTests,
} from '~/auth/session-lifecycle';
import { apiClient, DEFAULT_REQUEST_TIMEOUT } from '~/core/http/api-client';

describe('API client transport policy', () => {
  afterEach(() => {
    resetSessionLifecycleForTests();
    resetSessionChannelForTests();
  });

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

  it('identifies the originating document on mutations', async () => {
    let clientInstanceId: unknown;

    await apiClient.patch(
      '/mutation-origin',
      {},
      {
        adapter: (config) => {
          clientInstanceId = config.headers.get('X-Client-Instance-Id');
          return Promise.resolve({
            config,
            data: {},
            headers: {},
            status: 200,
            statusText: 'OK',
          } as AxiosResponse);
        },
      },
    );

    expect(clientInstanceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('uses Bearer without cookies or CSRF on the native channel', async () => {
    configureSessionChannel('native', {
      getAccessToken: () => Promise.resolve('native-test-token'),
      handleUnauthorized: () => Promise.resolve(),
    });
    await activateSession('person-1', 'authenticated');
    let headers: AxiosHeaders | undefined;
    let withCredentials: unknown;

    await apiClient.patch(
      '/native-mutation',
      {},
      {
        adapter: (config) => {
          headers = config.headers;
          withCredentials = config.withCredentials;
          return Promise.resolve({
            config,
            data: {},
            headers: {},
            status: 200,
            statusText: 'OK',
          } as AxiosResponse);
        },
      },
    );

    expect(withCredentials).toBe(false);
    expect(headers?.get('Authorization')).toBe('Bearer native-test-token');
    expect(headers?.has('X-CSRF-Token')).toBe(false);
  });
});
