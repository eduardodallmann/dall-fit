import { delay, http, HttpResponse } from 'msw';

import type { Person, Theme } from '@dall-fit/types';

import {
  adminPersonFixture,
  authenticatedPersonFixture,
  lightThemePersonFixture,
  personWithoutThemeFixture,
} from '~/mocks/fixtures/person';

const personState = new Map<string, Person>();

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
}

export const authHandlers = [
  http.post('*/auth/google', ({ request }) => {
    const authorizationUrl = new URL('/dash', request.url).toString();
    const result = HttpResponse.json({ data: { authorizationUrl } });

    return result;
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
