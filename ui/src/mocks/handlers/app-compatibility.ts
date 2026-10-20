import { http, HttpResponse } from 'msw/http';
import { delay } from 'msw/utils/delay';

import { androidAppCompatibilityFixture } from '~/mocks/fixtures/app-compatibility';
import {
  createMockApiError,
  createMockResponseInit,
} from '~/mocks/mock-response';

const apiBaseUrl = import.meta.env.VITE_API_URL.replace(/\/$/, '');

export const appCompatibilityHandlers = [
  http.get(`${apiBaseUrl}/app-compatibility/android`, async ({ request }) => {
    const scenario = request.headers.get('x-dall-fit-mock-app-compatibility');
    if (scenario === 'latency') await delay(500);
    if (scenario === 'failure')
      return HttpResponse.json(
        createMockApiError(
          'SERVICE_UNAVAILABLE',
          'Application compatibility is temporarily unavailable.',
        ),
        createMockResponseInit({ status: 503 }),
      );
    const minimumVersionCode = scenario === 'update-required' ? 2 : 1;
    return HttpResponse.json(
      {
        data: { ...androidAppCompatibilityFixture, minimumVersionCode },
      },
      createMockResponseInit({ headers: { 'Cache-Control': 'no-store' } }),
    );
  }),
];
