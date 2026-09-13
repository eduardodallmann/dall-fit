import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import {
  createNativeSession,
  ensureCsrfToken,
  getCurrentPerson,
  getGoogleLoginUrl,
  updateCurrentPersonConfigs,
} from '~/auth/auth-service';
import { authenticatedPersonFixture } from '~/mocks/fixtures/person';
import { mockServer } from '~/mocks/server';

describe('authService', () => {
  it('loads the current person through the API client and MSW', async () => {
    await expect(getCurrentPerson()).resolves.toEqual(
      authenticatedPersonFixture,
    );
  });

  it('builds the top-level Google login endpoint', () => {
    expect(getGoogleLoginUrl()).toBe('http://localhost:4000/auth/google');
  });

  it('updates the current person theme through the API client and MSW', async () => {
    await ensureCsrfToken();
    const result = await updateCurrentPersonConfigs('light');

    expect(result.configs).toEqual({ theme: 'light' });
  });

  it('shares one CSRF request between concurrent consumers', async () => {
    let requests = 0;
    mockServer.use(
      http.get('*/auth/csrf', () => {
        requests += 1;
        return HttpResponse.json({ data: { token: 'single-flight-token' } });
      }),
    );

    await expect(
      Promise.all([ensureCsrfToken(), ensureCsrfToken(), ensureCsrfToken()]),
    ).resolves.toEqual([
      'single-flight-token',
      'single-flight-token',
      'single-flight-token',
    ]);
    expect(requests).toBe(1);
  });

  it('forwards an AbortSignal while loading the person', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      getCurrentPerson('authenticated', controller.signal),
    ).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  });

  it('exchanges only the native Google identity token through MSW', async () => {
    await expect(
      createNativeSession('fixture-google-id-token'),
    ).resolves.toMatchObject({
      data: {
        person: authenticatedPersonFixture,
        tokenType: 'Bearer',
      },
    });
  });
});
