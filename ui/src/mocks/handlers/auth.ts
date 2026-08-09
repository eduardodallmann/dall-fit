import { delay, http, HttpResponse } from 'msw';

import type { Person, Theme } from '@dall-fit/types';

import { clearCsrfToken } from '~/auth/csrf-token';
import {
  adminPersonFixture,
  authenticatedPersonFixture,
  lightThemePersonFixture,
  personWithoutThemeFixture,
} from '~/mocks/fixtures/person';

const personState = new Map<string, Person>();
const mockCsrfToken = 'mock-csrf-token';

function getInitialPerson(scenario: string | null): Person {
  if (scenario === 'admin') {
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
  clearCsrfToken();
}

export const authHandlers = [
  http.get('*/auth/google', ({ request }) => {
    const destination = new URL('/dash', request.url).toString();
    const result = HttpResponse.redirect(destination);

    return result;
  }),
  http.get('*/auth/csrf', async ({ request }) => {
    const scenario = request.headers.get('x-dall-fit-mock-auth');
    await delay(75);
    if (scenario === 'unauthenticated') {
      return HttpResponse.json(
        {
          code: 'AUTHENTICATION_REQUIRED',
          details: {},
          message: 'Authentication is required.',
        },
        { status: 401 },
      );
    }
    if (scenario === 'csrf-error') {
      return HttpResponse.json(
        {
          code: 'AUTHENTICATION_UNAVAILABLE',
          details: {},
          message: 'Authentication is temporarily unavailable.',
        },
        { status: 503 },
      );
    }
    return HttpResponse.json(
      { data: { token: mockCsrfToken } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }),
  http.post('*/auth/logout', async ({ request }) => {
    const scenario = request.headers.get('x-dall-fit-mock-auth');
    await delay(75);
    if (scenario === 'logout-error') {
      return HttpResponse.json(
        {
          code: 'SERVICE_UNAVAILABLE',
          details: {},
          message: 'Service unavailable.',
        },
        { status: 503 },
      );
    }
    if (request.headers.get('x-csrf-token') !== mockCsrfToken) {
      return HttpResponse.json(
        {
          code: 'CSRF_VALIDATION_FAILED',
          details: {},
          message: 'CSRF token is invalid.',
        },
        { status: 403 },
      );
    }
    return new HttpResponse(null, { status: 204 });
  }),
  http.get('*/auth/me', async ({ request }) => {
    const scenario = request.headers.get('x-dall-fit-mock-auth');
    await delay(75);

    if (scenario === 'unauthenticated') {
      const result = HttpResponse.json(
        {
          code: 'AUTHENTICATION_REQUIRED',
          details: {},
          message: 'Authentication is required.',
        },
        { status: 401 },
      );

      return result;
    }

    if (scenario === 'error') {
      const result = HttpResponse.json(
        {
          code: 'SERVICE_UNAVAILABLE',
          details: {},
          message: 'Service unavailable.',
        },
        { status: 503 },
      );

      return result;
    }

    const result = HttpResponse.json({ data: getScenarioPerson(scenario) });

    return result;
  }),
  http.patch('*/auth/me/configs', async ({ request }) => {
    const scenario = request.headers.get('x-dall-fit-mock-auth');
    await delay(75);

    if (request.headers.get('x-csrf-token') !== mockCsrfToken) {
      return HttpResponse.json(
        {
          code: 'CSRF_VALIDATION_FAILED',
          details: {},
          message: 'CSRF token is invalid.',
        },
        { status: 403 },
      );
    }

    if (scenario === 'unauthenticated') {
      const result = HttpResponse.json(
        {
          code: 'AUTHENTICATION_REQUIRED',
          details: {},
          message: 'Authentication is required.',
        },
        { status: 401 },
      );

      return result;
    }

    if (
      scenario === 'theme-save-error' ||
      scenario === 'theme-save-error-unset'
    ) {
      const result = HttpResponse.json(
        {
          code: 'SERVICE_UNAVAILABLE',
          details: {},
          message: 'Service unavailable.',
        },
        { status: 503 },
      );

      return result;
    }

    const body: unknown = await request.json();

    if (!isThemeBody(body)) {
      const result = HttpResponse.json(
        {
          code: 'VALIDATION_ERROR',
          details: {},
          message: 'Request validation failed.',
        },
        { status: 400 },
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
    const result = HttpResponse.json({ data: updatedPerson });

    return result;
  }),
];
