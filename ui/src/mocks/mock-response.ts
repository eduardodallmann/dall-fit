import type { ApiError } from '@dall-fit/types';

export const MOCK_REQUEST_ID = 'mock-request-id';

export function createMockResponseInit(init: ResponseInit = {}): ResponseInit {
  const headers = new Headers(init.headers);
  headers.set('x-request-id', MOCK_REQUEST_ID);
  const result = { ...init, headers };

  return result;
}

export function createMockApiError(code: string, message: string): ApiError {
  const result = {
    code,
    details: {},
    message,
    requestId: MOCK_REQUEST_ID,
  };

  return result;
}
