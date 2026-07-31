import { delay, http, HttpResponse } from 'msw';

import {
  adminPersonFixture,
  authenticatedPersonFixture,
} from '~/mocks/fixtures/person';

export const authHandlers = [
  http.post('*/auth/google', ({ request }) => {
    const authorizationUrl = new URL('/me', request.url).toString();
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

    if (scenario === 'admin') {
      const result = HttpResponse.json({ data: adminPersonFixture });

      return result;
    }

    const result = HttpResponse.json({ data: authenticatedPersonFixture });

    return result;
  }),
];
