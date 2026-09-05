import { createMemoryHistory } from '@tanstack/react-router';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authReturnTo } from '~/auth/auth-return-to';
import { currentPersonQueryOptions } from '~/auth/current-person-query';
import { queryClient } from '~/context/query-client';
import { authenticatedPersonFixture } from '~/mocks/fixtures/person';
import { createMockApiError } from '~/mocks/mock-response';
import { mockServer } from '~/mocks/server';
import { router } from '~/routes/routes';

const key = 'dall-fit:auth-return-to';
function prepareDestination(href: string, capturedAt = Date.now()) {
  window.sessionStorage.setItem(key, JSON.stringify({ href, capturedAt }));
}

beforeEach(async () => {
  vi.stubEnv('VITE_ENABLE_API_MOCKS', 'true');
  queryClient.clear();
  router.update({
    context: { queryClient },
    history: createMemoryHistory({
      initialEntries: ['/?mockAuth=unauthenticated'],
    }),
  });
  await router.load();
});
afterEach(() => {
  router.cancelMatches();
  queryClient.clear();
  vi.unstubAllEnvs();
});

describe('return navigation through the real route tree', () => {
  it('captures a blocked location and filters unknown search and auth fixtures', async () => {
    await router.navigate({
      href: '/training-plan?mockAuth=unauthenticated&page=2&privatePayload=discard#plans',
    });
    expect(router.state.location.pathname).toBe('/');
    expect(authReturnTo.read((href) => href)).toBe(
      '/training-plan?page=2#plans',
    );
  });

  it('resumes from the root probe with the fresh person and CSRF bootstrap', async () => {
    prepareDestination('/training');
    let requests = 0;
    mockServer.use(
      http.get('*/auth/me', () => {
        requests += 1;
        return HttpResponse.json({ data: authenticatedPersonFixture });
      }),
    );
    await router.navigate({ to: '/', search: {} });
    expect(router.state.location.pathname).toBe('/training');
    expect(requests).toBe(1);
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it.each([
    '/',
    '/unknown',
    '/training/unknown',
    '//example.test',
    'https://example.test/training',
    '/callback',
    '/index.html',
  ])(
    'ignores an unrecognized or unsafe stored destination %s',
    async (href) => {
      prepareDestination(href);
      await router.navigate({ to: '/dash' });
      expect(router.state.location.pathname).toBe('/dash');
      expect(window.sessionStorage.getItem(key)).toBeNull();
    },
  );

  it('discards expired destinations and does not redirect to itself', async () => {
    prepareDestination('/training', Date.now() - 30 * 60_000);
    await router.navigate({ to: '/dash' });
    expect(router.state.location.pathname).toBe('/dash');
    prepareDestination('/dash');
    await router.navigate({ to: '/dash' });
    expect(router.state.location.pathname).toBe('/dash');
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it('does not overwrite the original intent when the callback bootstrap receives 401', async () => {
    prepareDestination('/training');
    await router.navigate({
      to: '/dash',
      search: { mockAuth: 'unauthenticated' },
    });
    expect(router.state.location.pathname).toBe('/');
    expect(authReturnTo.read((href) => href)).toBe('/training');
  });

  it('keeps the destination on a technical CSRF failure', async () => {
    prepareDestination('/training');
    mockServer.use(
      http.get('*/auth/csrf', () =>
        HttpResponse.json(
          createMockApiError('AUTHENTICATION_UNAVAILABLE', 'Unavailable'),
          { status: 503 },
        ),
      ),
    );
    await router.navigate({ to: '/dash' });
    expect(router.state.location.pathname).toBe('/dash');
    expect(authReturnTo.read((href) => href)).toBe('/training');
  });

  it('allows an explicit authenticated destination to discard an older intent', async () => {
    prepareDestination('/training');
    await router.navigate({ to: '/training-plan' });
    expect(router.state.location.pathname).toBe('/training-plan');
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it('does not consume or change an intention while preloading', async () => {
    prepareDestination('/training');
    const before = window.sessionStorage.getItem(key);
    await router.preloadRoute({ to: '/dash' });
    queryClient.setQueryData(
      currentPersonQueryOptions().queryKey,
      authenticatedPersonFixture,
    );
    await router.preloadRoute({ to: '/training-plan' });
    expect(window.sessionStorage.getItem(key)).toBe(before);
    expect(router.state.location.pathname).toBe('/');
  });

  it('does not let a superseded 401 restore an old destination', async () => {
    let requestStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    mockServer.use(
      http.get('*/auth/me', async ({ request }) => {
        if (request.headers.get('x-dall-fit-mock-auth') === 'unauthenticated') {
          requestStarted();
          await delay(100);
        }
        return HttpResponse.json(
          createMockApiError('AUTHENTICATION_REQUIRED', 'Sign in'),
          { status: 401 },
        );
      }),
    );
    const first = router.navigate({
      href: '/training-plan?mockAuth=unauthenticated',
    });
    await started;
    const second = router.navigate({ href: '/training' });
    await Promise.all([first, second]);
    expect(authReturnTo.read((href) => href)).toBe('/training');
  });
});
