import { delay, http, HttpResponse } from 'msw';

import type { Person, Theme } from '@dall-fit/types';

import { resetCsrfTokenForTests } from '~/auth/csrf-token';
import {
  adminPersonFixture,
  authenticatedPersonFixture,
  lightThemePersonFixture,
  personWithoutThemeFixture,
} from '~/mocks/fixtures/person';
import { MOCK_REQUEST_ID } from '~/mocks/mock-constants';
import {
  createMockApiError,
  createMockResponseInit,
} from '~/mocks/mock-response';

const personState = new Map<string, Person>();
const authRequestCount = new Map<string, number>();
const revokedSessions = new Set<string>();
const mockCsrfToken = 'mock-csrf-token';
const staleCsrfToken = 'mock-stale-csrf-token';
export const refreshedMockCsrfToken = 'mock-refreshed-csrf-token';

function isSessionRevoked(scenario: string | null): boolean {
  const key = scenario ?? 'authenticated';
  return revokedSessions.has(key);
}

async function isSessionRevokedPersisted(
  scenario: string | null,
): Promise<boolean> {
  const key = scenario ?? 'authenticated';

  try {
    const store = (
      globalThis as {
        cookieStore?: {
          get: (name: string) => Promise<{ value: string } | null>;
        };
      }
    ).cookieStore;
    if (store !== undefined) {
      const entry = await store.get('dall-fit-revoked');
      if (entry !== null && decodeURIComponent(entry.value) === key)
        return true;
    }
  } catch {
    // Cookie Store API not available
  }

  return false;
}

function nextRequestCount(key: string): number {
  const count = (authRequestCount.get(key) ?? 0) + 1;
  authRequestCount.set(key, count);
  return count;
}

function getInitialPerson(scenario: string | null): Person {
  if (
    scenario === 'admin' ||
    scenario === 'admin-revoked' ||
    scenario === 'csrf-refresh' ||
    scenario === 'session-expired'
  ) {
    return adminPersonFixture;
  }

  if (scenario === 'theme-light') {
    return lightThemePersonFixture;
  }

  if (scenario === 'theme-unset' || scenario === 'theme-save-error-unset') {
    return personWithoutThemeFixture;
  }

  return authenticatedPersonFixture;
}

function getScenarioPerson(scenario: string | null): Person {
  const key = scenario ?? 'authenticated';
  const existingPerson = personState.get(key);

  if (existingPerson !== undefined) {
    return existingPerson;
  }

  const initialPerson = structuredClone(getInitialPerson(scenario));
  personState.set(key, initialPerson);

  return initialPerson;
}

function isThemeBody(value: unknown): value is { theme: Theme } {
  const result =
    typeof value === 'object' &&
    value !== null &&
    Object.keys(value).length === 1 &&
    'theme' in value &&
    (value.theme === 'light' || value.theme === 'dark');

  return result;
}

export function resetAuthScenarioStates(): void {
  personState.clear();
  authRequestCount.clear();
  revokedSessions.clear();
  resetCsrfTokenForTests();
}

export const authHandlers = [
  http.get('*/auth/google', ({ request }) => {
    const destination = new URL('/dash', request.url).toString();
    const result = new HttpResponse(
      null,
      createMockResponseInit({
        headers: { Location: destination },
        status: 302,
      }),
    );

    return result;
  }),
  http.get('*/auth/csrf', async ({ request }) => {
    const scenario = request.headers.get('x-dall-fit-mock-auth');
    await delay(75);
    if (scenario === 'unauthenticated') {
      return HttpResponse.json(
        createMockApiError(
          'AUTHENTICATION_REQUIRED',
          'Authentication is required.',
        ),
        createMockResponseInit({ status: 401 }),
      );
    }
    if (scenario === 'csrf-error') {
      return HttpResponse.json(
        createMockApiError(
          'AUTHENTICATION_UNAVAILABLE',
          'Authentication is temporarily unavailable.',
        ),
        createMockResponseInit({ status: 503 }),
      );
    }
    if (scenario === 'csrf-refresh') {
      const count = nextRequestCount('csrf-refresh:csrf');
      return HttpResponse.json(
        {
          data: {
            token: count === 1 ? staleCsrfToken : refreshedMockCsrfToken,
          },
        },
        createMockResponseInit({ headers: { 'Cache-Control': 'no-store' } }),
      );
    }
    return HttpResponse.json(
      { data: { token: mockCsrfToken } },
      createMockResponseInit({ headers: { 'Cache-Control': 'no-store' } }),
    );
  }),
  http.post('*/auth/logout', async ({ request }) => {
    const scenario = request.headers.get('x-dall-fit-mock-auth');
    await delay(75);
    if (scenario === 'logout-error') {
      return HttpResponse.json(
        createMockApiError('SERVICE_UNAVAILABLE', 'Service unavailable.'),
        createMockResponseInit({ status: 503 }),
      );
    }
    if (request.headers.get('x-csrf-token') !== mockCsrfToken) {
      return HttpResponse.json(
        createMockApiError('CSRF_VALIDATION_FAILED', 'CSRF token is invalid.'),
        createMockResponseInit({ status: 403 }),
      );
    }
    revokedSessions.add(scenario ?? 'authenticated');
    return new HttpResponse(null, {
      headers: {
        'Set-Cookie': `dall-fit-revoked=${encodeURIComponent(scenario ?? 'authenticated')}; Path=/; SameSite=Lax`,
        'x-request-id': MOCK_REQUEST_ID,
      },
      status: 204,
    });
  }),
  http.get('*/auth/me', async ({ request }) => {
    const scenario = request.headers.get('x-dall-fit-mock-auth');
    await delay(75);

    if (scenario === 'unauthenticated') {
      const result = HttpResponse.json(
        createMockApiError(
          'AUTHENTICATION_REQUIRED',
          'Authentication is required.',
        ),
        createMockResponseInit({ status: 401 }),
      );

      return result;
    }

    if (scenario === 'error') {
      const result = HttpResponse.json(
        createMockApiError('SERVICE_UNAVAILABLE', 'Service unavailable.'),
        createMockResponseInit({ status: 503 }),
      );

      return result;
    }

    const sessionRevocationStatus = await isSessionRevokedPersisted(scenario);
    if (isSessionRevoked(scenario) || sessionRevocationStatus) {
      const result = HttpResponse.json(
        createMockApiError(
          'AUTHENTICATION_REQUIRED',
          'Authentication is required.',
        ),
        createMockResponseInit({ status: 401 }),
      );

      return result;
    }

    const requestCount = nextRequestCount(`${scenario ?? 'authenticated'}:me`);
    if (scenario === 'session-expired' && requestCount > 1) {
      return HttpResponse.json(
        createMockApiError(
          'AUTHENTICATION_REQUIRED',
          'Authentication is required.',
        ),
        createMockResponseInit({ status: 401 }),
      );
    }
    if (scenario === 'admin-revoked' && requestCount > 1) {
      return HttpResponse.json(
        { data: authenticatedPersonFixture },
        createMockResponseInit(),
      );
    }

    const result = HttpResponse.json(
      { data: getScenarioPerson(scenario) },
      createMockResponseInit(),
    );

    return result;
  }),
  http.patch('*/auth/me/configs', async ({ request }) => {
    const scenario = request.headers.get('x-dall-fit-mock-auth');
    await delay(75);

    if (request.headers.get('x-csrf-token') !== mockCsrfToken) {
      return HttpResponse.json(
        createMockApiError('CSRF_VALIDATION_FAILED', 'CSRF token is invalid.'),
        createMockResponseInit({ status: 403 }),
      );
    }

    if (scenario === 'unauthenticated') {
      const result = HttpResponse.json(
        createMockApiError(
          'AUTHENTICATION_REQUIRED',
          'Authentication is required.',
        ),
        createMockResponseInit({ status: 401 }),
      );

      return result;
    }

    if (
      scenario === 'theme-save-error' ||
      scenario === 'theme-save-error-unset'
    ) {
      const result = HttpResponse.json(
        createMockApiError('SERVICE_UNAVAILABLE', 'Service unavailable.'),
        createMockResponseInit({ status: 503 }),
      );

      return result;
    }

    const body: unknown = await request.json();

    if (!isThemeBody(body)) {
      const result = HttpResponse.json(
        createMockApiError('VALIDATION_ERROR', 'Request validation failed.'),
        createMockResponseInit({ status: 400 }),
      );

      return result;
    }

    const currentPerson = getScenarioPerson(scenario);
    const updatedPerson: Person = {
      ...currentPerson,
      configs: { theme: body.theme },
      updatedAt: '2026-08-08T12:00:00.000Z',
    };
    personState.set(scenario ?? 'authenticated', updatedPerson);
    const result = HttpResponse.json(
      { data: updatedPerson },
      createMockResponseInit(),
    );

    return result;
  }),
];
