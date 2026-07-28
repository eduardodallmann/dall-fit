import { http, HttpResponse } from 'msw';

import { authHandlers } from '~/mocks/handlers/auth';

const apiBaseUrl = import.meta.env.VITE_API_URL.replace(/\/$/, '');

export const handlers = [
  ...authHandlers,
  http.all(`${apiBaseUrl}/*`, () => {
    const result = HttpResponse.json(
      {
        code: 'MOCK_NOT_IMPLEMENTED',
        details: {},
        message: 'No mock scenario exists for this operation.',
      },
      { status: 501 },
    );

    return result;
  }),
];
