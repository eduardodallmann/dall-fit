import { describe, expect, it } from 'vitest';

import {
  createMockApiError,
  createMockResponseInit,
  MOCK_REQUEST_ID,
} from '~/mocks/mock-response';

describe('mock API responses', () => {
  it('adds correlation without discarding existing headers', () => {
    const init = createMockResponseInit({
      headers: { 'Cache-Control': 'no-store' },
      status: 204,
    });
    const headers = new Headers(init.headers);

    expect(init.status).toBe(204);
    expect(headers.get('cache-control')).toBe('no-store');
    expect(headers.get('x-request-id')).toBe(MOCK_REQUEST_ID);
  });

  it('creates the complete shared ApiError contract', () => {
    expect(
      createMockApiError('SERVICE_UNAVAILABLE', 'Service unavailable.'),
    ).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      details: {},
      message: 'Service unavailable.',
      requestId: MOCK_REQUEST_ID,
    });
  });
});
