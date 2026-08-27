import { http, HttpResponse } from 'msw';

import { authHandlers } from '~/mocks/handlers/auth';
import { realtimeHandlers } from '~/mocks/handlers/realtime';
import { trainingHandlers } from '~/mocks/handlers/training';
import { trainingPlanHandlers } from '~/mocks/handlers/training-plans';
import {
  createMockApiError,
  createMockResponseInit,
} from '~/mocks/mock-response';

const apiBaseUrl = import.meta.env.VITE_API_URL.replace(/\/$/, '');

export const handlers = [
  ...authHandlers,
  ...realtimeHandlers,
  ...trainingPlanHandlers,
  ...trainingHandlers,
  http.all(`${apiBaseUrl}/*`, () => {
    const result = HttpResponse.json(
      createMockApiError(
        'MOCK_NOT_IMPLEMENTED',
        'No mock scenario exists for this operation.',
      ),
      createMockResponseInit({ status: 501 }),
    );

    return result;
  }),
];
